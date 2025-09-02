export type TelemetryError = {
  timestamp: number;
  message: string;
};

export type TelemetryMessage = {
  timestamp: number;
  role: 'agent' | 'system' | 'user';
  text: string;
};

export type TelemetrySummary = {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  retryAttempts: number;
  // 1. Latency & turn‑taking
  bargeInLatencyMs: number | null;
  overlapSegments: number;
  totalAgentSpeakingMs: number;
  // 2. ASR quality & robustness (placeholders)
  asrDetectedLanguage: string | null;
  asrCodeSwitchingDetected: boolean | null;
  asrNumericExtractionIssues: number | null;
  // 3. TTS quality proxies
  ttsInterruptions: number; // times user overlapped while agent speaking
  // 4. Tool/Webhook (placeholders)
  webhookErrors: number;
  webhookTimeouts: number | null;
  webhookSchemaErrors: number | null;
  // 5. RAG (placeholders)
  ragGroundingCoverage: string | null;
  ragAmbiguityHandled: boolean | null;
  ragStaleAvoidanceIncidents: number | null;
  // 6. Multilingual & accessibility (placeholders)
  multilingualPairsObserved: string[];
  disfluencyCount: number | null;
  // 7. Network impairments (placeholders)
  networkLossPct: number | null;
  networkJitterMs: number | null;
  networkBandwidthKbps: number | null;
  // 8. Scale & reliability
  reconnects: number;
  errorsTotal: number;
  // 9. Security & compliance
  piiHits: number;
  // 10. Observability & ops (ids for correlation)
  agentId: string | null;
  userAgent: string;
  // 11. UX & handoff (placeholders)
  handoffOccurred: boolean | null;
};

export class TelemetryRecorder {
  private sessionId: string;
  private startedAt: number;
  private endedAt: number | null = null;
  private retryAttempts = 0;
  private reconnects = 0;
  private errors: TelemetryError[] = [];
  private messages: TelemetryMessage[] = [];
  private overlapSegments = 0;
  private ttsInterruptions = 0;
  private bargeInLatencyMs: number | null = null;
  private agentSpeakingStartedAt: number | null = null;
  private totalAgentSpeakingMs = 0;
  private piiHits = 0;
  private agentId: string | null = null;
  private elevenConversationId: string | null = null;

  constructor(init?: { agentId?: string | null }) {
    this.sessionId = crypto.randomUUID();
    this.startedAt = Date.now();
    this.agentId = init?.agentId ?? null;
  }

  startSession() {
    this.startedAt = Date.now();
  }

  endSession() {
    this.endedAt = Date.now();
    if (this.agentSpeakingStartedAt) {
      this.totalAgentSpeakingMs += Date.now() - this.agentSpeakingStartedAt;
      this.agentSpeakingStartedAt = null;
    }
  }

  setAgentId(agentId: string) {
    this.agentId = agentId;
  }

  setElevenConversationId(conversationId: string) {
    this.elevenConversationId = conversationId;
  }

  getElevenConversationId() {
    return this.elevenConversationId;
  }

  incrementRetryAttempt() {
    this.retryAttempts += 1;
  }

  incrementReconnects() {
    this.reconnects += 1;
  }

  recordError(message: string) {
    this.errors.push({ timestamp: Date.now(), message });
  }

  recordMessage(msg: TelemetryMessage) {
    this.messages.push(msg);
    this.scanForPII(msg.text);
  }

  recordAgentSpeakingStart() {
    if (this.agentSpeakingStartedAt == null) {
      this.agentSpeakingStartedAt = Date.now();
    }
  }

  recordAgentSpeakingStop() {
    if (this.agentSpeakingStartedAt != null) {
      this.totalAgentSpeakingMs += Date.now() - this.agentSpeakingStartedAt;
      this.agentSpeakingStartedAt = null;
    }
  }

  recordOverlapEvent() {
    this.overlapSegments += 1;
    this.ttsInterruptions += 1;
  }

  maybeRecordBargeInLatency(firstUserSpeechTimestamp: number) {
    if (this.bargeInLatencyMs != null) return;
    if (this.agentSpeakingStartedAt == null) return;
    this.bargeInLatencyMs = Math.max(0, firstUserSpeechTimestamp - this.agentSpeakingStartedAt);
  }

  private scanForPII(text: string) {
    const patterns: RegExp[] = [
      /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, // SSN (US)
      /\b\d{13,19}\b/g, // credit card-like numbers (rough)
      /\b\+?\d{1,3}?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, // phones
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // emails
    ];
    for (const re of patterns) {
      if (re.test(text)) {
        this.piiHits += 1;
      }
    }
  }

  getSummary(): TelemetrySummary {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      retryAttempts: this.retryAttempts,
      bargeInLatencyMs: this.bargeInLatencyMs,
      overlapSegments: this.overlapSegments,
      totalAgentSpeakingMs: this.totalAgentSpeakingMs,
      asrDetectedLanguage: null,
      asrCodeSwitchingDetected: null,
      asrNumericExtractionIssues: null,
      ttsInterruptions: this.ttsInterruptions,
      webhookErrors: this.errors.length,
      webhookTimeouts: null,
      webhookSchemaErrors: null,
      ragGroundingCoverage: null,
      ragAmbiguityHandled: null,
      ragStaleAvoidanceIncidents: null,
      multilingualPairsObserved: [],
      disfluencyCount: null,
      networkLossPct: null,
      networkJitterMs: null,
      networkBandwidthKbps: null,
      reconnects: this.reconnects,
      errorsTotal: this.errors.length,
      piiHits: this.piiHits,
      agentId: this.agentId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      handoffOccurred: null,
    };
  }

  getMessages() {
    return this.messages.slice();
  }

  getErrors() {
    return this.errors.slice();
  }
}


