'use client';
import { useConversation } from '@elevenlabs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TelemetryRecorder } from '../lib/telemetry';
import ExportExcelButton from './ExportExcelButton';

type HistoryItem = {
  id: string;
  role: 'agent' | 'system' | 'event';
  text: string;
  timestamp: number;
};

export function Conversation() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [inputLevel, setInputLevel] = useState(0); // 0..1
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const telemetryRef = useRef<TelemetryRecorder>(new TelemetryRecorder({ agentId: 'agent_5601k2frztsqeaht9m2tqzc2d08w' }));

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const speakingRef = useRef<boolean>(false);
  const overlapActiveRef = useRef<boolean>(false);
  const prevSpeakingRef = useRef<boolean>(false);

  const conversation = useConversation({
    onConnect: () => {
      setHistory((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'system', text: 'Connected', timestamp: Date.now() },
      ]);
      telemetryRef.current.startSession();
    },
    onDisconnect: () => {
      setHistory((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'system', text: 'Disconnected', timestamp: Date.now() },
      ]);
      telemetryRef.current.endSession();
    },
    onMessage: (message: unknown) => {
      let text = '';
      try {
        if (typeof message === 'string') {
          text = message;
        } else if (message && typeof message === 'object') {
          // Best effort extraction
          const anyMsg = message as Record<string, unknown>;
          text = (anyMsg.text as string) || (anyMsg.message as string) || JSON.stringify(anyMsg);
          
          // Try to extract conversation ID from messages
          const convId = (anyMsg as any)?.conversation_id || (anyMsg as any)?.conversationId;
          if (typeof convId === 'string' && !telemetryRef.current.getElevenConversationId()) {
            console.log('Found conversation ID in message:', convId);
            telemetryRef.current.setElevenConversationId(convId);
          }
        } else {
          text = String(message);
        }
      } catch {
        text = '[unparseable message]';
      }
      setHistory((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'agent', text, timestamp: Date.now() },
      ]);
      telemetryRef.current.recordMessage({ timestamp: Date.now(), role: 'agent', text });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setErrorMessage(msg);
      setHistory((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'system', text: `Error: ${msg}`, timestamp: Date.now() },
      ]);
      console.error('Error:', error);
      telemetryRef.current.recordError(msg);
    },
  });

  const startMicVisualizer = useCallback((stream: MediaStream) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      // Compute RMS of waveform and normalize to 0..1
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128; // -1..1
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length); // 0..~1
      // Smooth and clamp
      const smoothed = Math.min(1, Math.max(0, rms * 1.5));
      setInputLevel((prev) => prev * 0.7 + smoothed * 0.3);

      // Overlap detection while agent is speaking
      const threshold = 0.25;
      if (speakingRef.current && smoothed > threshold) {
        if (!overlapActiveRef.current) {
          overlapActiveRef.current = true;
          telemetryRef.current.recordOverlapEvent();
          telemetryRef.current.maybeRecordBargeInLatency(Date.now());
        }
      } else {
        overlapActiveRef.current = false;
      }
      rafIdRef.current = window.requestAnimationFrame(tick);
    };
    rafIdRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopMicVisualizer = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    setInputLevel(0);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const withRetry = useCallback(
    async (fn: () => Promise<void>, retries = 3, baseDelayMs = 500) => {
      setIsRetrying(true);
      setErrorMessage(null);
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await fn();
          setIsRetrying(false);
          return;
        } catch (err) {
          attempt++;
          if (attempt > retries) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMessage(`Failed to start after ${retries} retries: ${msg}`);
            setIsRetrying(false);
            throw err;
          }
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    },
    []
  );

  const startConversation = useCallback(async () => {
    await withRetry(async () => {
      // Request microphone permission and start visualizer
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      startMicVisualizer(stream);
      const result = await conversation.startSession({
        agentId: 'agent_5601k2frztsqeaht9m2tqzc2d08w',
        connectionType: 'webrtc',
        userId: telemetryRef.current.getSummary().sessionId,
      });
      console.log('StartSession result:', result);
      try {
        let elId: string | null = null;
        
        // Check if result is directly a string (conversation ID)
        if (typeof result === 'string') {
          elId = result;
        } else if (result && typeof result === 'object') {
          // Check if it's an object with conversation ID properties
          const maybeObj: any = result as any;
          elId = maybeObj?.conversationId || maybeObj?.id || maybeObj?.sessionId;
        }
        
        console.log('Extracted conversation ID:', elId);
        if (typeof elId === 'string' && elId.length > 0) {
          telemetryRef.current.setElevenConversationId(elId);
          console.log('Set EL conversation ID:', elId);
        }
      } catch (err) {
        console.log('Error extracting conversation ID:', err);
      }
    });
  }, [conversation, startMicVisualizer, withRetry]);

  const stopConversation = useCallback(async () => {
    stopMicVisualizer();
    await conversation.endSession();
  }, [conversation, stopMicVisualizer]);

  useEffect(() => {
    return () => {
      stopMicVisualizer();
    };
  }, [stopMicVisualizer]);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const levelPercent = useMemo(() => Math.round(inputLevel * 100), [inputLevel]);
  const speaking = conversation.isSpeaking;

  // Track speaking transitions for telemetry
  useEffect(() => {
    speakingRef.current = speaking;
    const wasSpeaking = prevSpeakingRef.current;
    if (!wasSpeaking && speaking) {
      telemetryRef.current.recordAgentSpeakingStart();
    } else if (wasSpeaking && !speaking) {
      telemetryRef.current.recordAgentSpeakingStop();
    }
    prevSpeakingRef.current = speaking;
  }, [speaking]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-stretch gap-6">
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 p-1 shadow-md">
        <div className="rounded-lg bg-white p-4 dark:bg-black">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Live Conversation</h2>
              <p className="text-sm text-gray-500">Status: {conversation.status}</p>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`relative h-10 w-10 rounded-full transition-colors duration-200 ${speaking ? 'bg-green-500' : 'bg-blue-500'}`}
                aria-label={speaking ? 'Agent speaking' : 'Listening'}
                title={speaking ? 'Agent speaking' : 'Listening'}
              >
                <div
                  className="absolute inset-0 rounded-full bg-white/30"
                  style={{
                    transform: `scale(${1 + inputLevel * 0.8})`,
                    transition: 'transform 50ms linear',
                  }}
                />
              </div>
              <div className="w-28">
                <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-800">
                  <div
                    className={`h-2 rounded ${speaking ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${levelPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-gray-500">Mic level</div>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={startConversation}
              disabled={conversation.status === 'connected' || isRetrying}
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-300"
            >
              {isRetrying ? 'Connecting…' : 'Start Conversation'}
            </button>
            <button
              onClick={stopConversation}
              disabled={conversation.status !== 'connected'}
              className="px-4 py-2 rounded bg-red-600 text-white disabled:bg-gray-300"
            >
              Stop Conversation
            </button>
            {errorMessage && (
              <button
                onClick={startConversation}
                className="px-3 py-2 rounded border border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                Retry
              </button>
            )}
            <ExportExcelButton recorder={telemetryRef.current} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="max-h-72 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="text-sm text-gray-500">
              Conversation events and messages will appear here.
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="text-sm">
                  <span
                    className={`mr-2 rounded px-2 py-0.5 text-xs ${
                      item.role === 'agent'
                        ? 'bg-green-100 text-green-700'
                        : item.role === 'system'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {item.role}
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 break-words">{item.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div ref={historyEndRef} />
        </div>
      </div>
    </div>
  );
}


