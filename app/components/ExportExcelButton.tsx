'use client';
import { TelemetryRecorder } from '../lib/telemetry';

export default function ExportExcelButton({ recorder }: { recorder: TelemetryRecorder }) {
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const summary = recorder.getSummary();
    const messages = recorder.getMessages();
    const errors = recorder.getErrors();
    const convId = recorder.getElevenConversationId?.() as string | undefined;

    // Optionally fetch ElevenLabs conversation if we have the id and API route is available
    let elevenConversation: any | null = null;
    console.log('Export: conversation ID is', convId);
    if (convId) {
      try {
        console.log('Fetching EL conversation:', `/api/elevenlabs/conversations/${encodeURIComponent(convId)}`);
        const res = await fetch(`/api/elevenlabs/conversations/${encodeURIComponent(convId)}`, { cache: 'no-store' });
        console.log('API response status:', res.status);
        if (res.ok) {
          elevenConversation = await res.json();
          console.log('EL conversation data:', elevenConversation);
        } else {
          const errorText = await res.text();
          console.log('API error response:', errorText);
        }
      } catch (err) {
        console.log('Fetch error:', err);
      }
    }

    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([summary]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const messagesSheet = XLSX.utils.json_to_sheet(
      messages.map((m) => ({
        timestamp: new Date(m.timestamp).toISOString(),
        role: m.role,
        text: m.text,
      }))
    );
    XLSX.utils.book_append_sheet(wb, messagesSheet, 'Messages');

    const errorsSheet = XLSX.utils.json_to_sheet(
      errors.map((e) => ({ timestamp: new Date(e.timestamp).toISOString(), message: e.message }))
    );
    XLSX.utils.book_append_sheet(wb, errorsSheet, 'Errors');

    // KPI sheet aligned to requested evaluation areas
    const kpiRows = [
      { area: 'Latency & turn-taking', metric: 'Barge-in latency (ms)', value: summary.bargeInLatencyMs ?? '' },
      { area: 'Latency & turn-taking', metric: 'Overlap segments', value: summary.overlapSegments },
      { area: 'ASR quality & robustness', metric: 'Detected language', value: summary.asrDetectedLanguage ?? '' },
      { area: 'ASR quality & robustness', metric: 'Code-switching detected', value: summary.asrCodeSwitchingDetected ?? '' },
      { area: 'ASR quality & robustness', metric: 'Numeric extraction issues', value: summary.asrNumericExtractionIssues ?? '' },
      { area: 'TTS quality', metric: 'Interruptions (overlaps during TTS)', value: summary.ttsInterruptions },
      { area: 'Tool/Webhook', metric: 'Errors', value: summary.webhookErrors },
      { area: 'Tool/Webhook', metric: 'Timeouts', value: summary.webhookTimeouts ?? '' },
      { area: 'Tool/Webhook', metric: 'Schema errors', value: summary.webhookSchemaErrors ?? '' },
      { area: 'RAG', metric: 'Grounding coverage', value: summary.ragGroundingCoverage ?? '' },
      { area: 'RAG', metric: 'Ambiguity handled', value: summary.ragAmbiguityHandled ?? '' },
      { area: 'RAG', metric: 'Stale avoidance incidents', value: summary.ragStaleAvoidanceIncidents ?? '' },
      { area: 'Multilingual & accessibility', metric: 'Observed language pairs', value: summary.multilingualPairsObserved.join(', ') },
      { area: 'Multilingual & accessibility', metric: 'Disfluency count', value: summary.disfluencyCount ?? '' },
      { area: 'Network impairments', metric: 'Loss %', value: summary.networkLossPct ?? '' },
      { area: 'Network impairments', metric: 'Jitter (ms)', value: summary.networkJitterMs ?? '' },
      { area: 'Network impairments', metric: 'Bandwidth (kbps)', value: summary.networkBandwidthKbps ?? '' },
      { area: 'Scale & reliability', metric: 'Reconnects', value: summary.reconnects },
      { area: 'Scale & reliability', metric: 'Errors total', value: summary.errorsTotal },
      { area: 'Security & compliance', metric: 'PII hits', value: summary.piiHits },
      { area: 'Observability & ops', metric: 'Agent ID', value: summary.agentId ?? '' },
      { area: 'Observability & ops', metric: 'User agent', value: summary.userAgent },
      { area: 'UX & handoff', metric: 'Handoff occurred', value: summary.handoffOccurred ?? '' },
    ];
    const kpiSheet = XLSX.utils.json_to_sheet(kpiRows);
    XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPIs');

    // Append ElevenLabs sheets when available
    if (elevenConversation) {
      const metadata = elevenConversation.metadata || {};
      const analysis = elevenConversation.analysis || {};
      
      // Conversation overview with key metrics
      const charging = metadata.charging || {};
      const llmUsage = charging.llm_usage || {};
      const overallFeedback = metadata.feedback || {};
      
      const elOverview = XLSX.utils.json_to_sheet([
        {
          conversation_id: elevenConversation.conversation_id || convId,
          agent_id: elevenConversation.agent_id || '',
          status: elevenConversation.status || '',
          call_successful: analysis.call_successful || '',
          transcript_summary: analysis.transcript_summary || '',
          call_summary_title: analysis.call_summary_title || '',
          // Timing metrics
          start_time_unix_secs: metadata.start_time_unix_secs || '',
          start_time_readable: metadata.start_time_unix_secs ? new Date(metadata.start_time_unix_secs * 1000).toISOString() : '',
          accepted_time_unix_secs: metadata.accepted_time_unix_secs || '',
          call_duration_secs: metadata.call_duration_secs || '',
          // Cost breakdown
          total_cost_cents: metadata.cost || '',
          llm_charge_cents: charging.llm_charge || '',
          call_charge_cents: charging.call_charge || '',
          llm_price_dollars: charging.llm_price || '',
          billing_tier: charging.tier || '',
          is_burst_billing: charging.is_burst || false,
          dev_discount_applied: charging.dev_discount || false,
          // Language and audio
          main_language: metadata.main_language || '',
          has_audio: elevenConversation.has_audio || false,
          has_user_audio: elevenConversation.has_user_audio || false,
          has_response_audio: elevenConversation.has_response_audio || false,
          text_only_mode: metadata.text_only || false,
          // Session info
          termination_reason: metadata.termination_reason || '',
          authorization_method: metadata.authorization_method || '',
          user_id: elevenConversation.user_id || '',
          // Source tracking
          conversation_initiation_source: metadata.conversation_initiation_source || '',
          sdk_version: metadata.conversation_initiation_source_version || '',
          is_livekit: metadata.features_usage?.is_livekit || false,
          is_eleven_assistant: metadata.eleven_assistant?.is_eleven_assistant || false,
          // Feedback
          overall_feedback_score: overallFeedback.overall_score || '',
          feedback_likes: overallFeedback.likes || 0,
          feedback_dislikes: overallFeedback.dislikes || 0,
        },
      ]);
      XLSX.utils.book_append_sheet(wb, elOverview, 'EL Overview');

      // Detailed transcript with timing and performance metrics
      const elTranscriptArr = Array.isArray(elevenConversation.transcript) ? elevenConversation.transcript : [];
      if (elTranscriptArr.length) {
        const elTranscriptSheet = XLSX.utils.json_to_sheet(
          elTranscriptArr.map((m: any, index: number) => {
            const turnMetrics = m.conversation_turn_metrics?.metrics || {};
            const llmUsage = m.llm_usage?.model_usage || {};
            const geminiUsage = llmUsage['gemini-2.0-flash'] || {};
            
            return {
              turn_index: index + 1,
              role: m.role || '',
              time_in_call_secs: m.time_in_call_secs || '',
              message: m.message || '',
              message_length_chars: (m.message || '').length,
              interrupted: m.interrupted || false,
              original_message: m.original_message || '',
              source_medium: m.source_medium || '',
              llm_override: m.llm_override || '',
              // Performance metrics
              ttfb_ms: turnMetrics.convai_llm_service_ttfb?.elapsed_time ? Math.round(turnMetrics.convai_llm_service_ttfb.elapsed_time * 1000) : '',
              ttf_sentence_ms: turnMetrics.convai_llm_service_ttf_sentence?.elapsed_time ? Math.round(turnMetrics.convai_llm_service_ttf_sentence.elapsed_time * 1000) : '',
              // LLM usage per turn
              llm_input_tokens: geminiUsage.input?.tokens || '',
              llm_output_tokens: geminiUsage.output_total?.tokens || '',
              llm_input_cost: geminiUsage.input?.price || '',
              llm_output_cost: geminiUsage.output_total?.price || '',
              // Tool calls summary
              tool_calls_count: Array.isArray(m.tool_calls) ? m.tool_calls.length : 0,
              tool_results_count: Array.isArray(m.tool_results) ? m.tool_results.length : 0,
              // Feedback
              feedback_rating: m.feedback?.rating || '',
              feedback_comment: m.feedback?.comment || '',
              // RAG info if available
              rag_retrieval_count: m.rag_retrieval_info ? Object.keys(m.rag_retrieval_info).length : 0,
            };
          })
        );
        XLSX.utils.book_append_sheet(wb, elTranscriptSheet, 'EL Transcript');
      }

      // Tool calls with detailed metrics
      const allToolCalls: any[] = [];
      elTranscriptArr.forEach((turn: any) => {
        if (Array.isArray(turn.tool_calls)) {
          turn.tool_calls.forEach((tool: any) => {
            allToolCalls.push({
              turn_time_in_call_secs: turn.time_in_call_secs || '',
              tool_name: tool.name || '',
              tool_id: tool.id || '',
              status: tool.status || '',
              latency_ms: tool.latency_ms || '',
              error_message: tool.error?.message || '',
              error_type: tool.error?.type || '',
              input: typeof tool.input === 'object' ? JSON.stringify(tool.input) : tool.input || '',
              output: typeof tool.output === 'object' ? JSON.stringify(tool.output) : tool.output || '',
            });
          });
        }
      });
      
      if (allToolCalls.length) {
        const elToolsSheet = XLSX.utils.json_to_sheet(allToolCalls);
        XLSX.utils.book_append_sheet(wb, elToolsSheet, 'EL Tools');
      }

      // Analysis and evaluation results
      if (analysis && Object.keys(analysis).length > 0) {
        type AnalysisData = {
          call_successful: any;
          transcript_summary: any;
          call_summary_title: any;
          [key: string]: any;
        };
        const analysisData: AnalysisData[] = [
          {
            call_successful: analysis.call_successful || '',
            transcript_summary: analysis.transcript_summary || '',
            call_summary_title: analysis.call_summary_title || '',
          }
        ];
        
        // Add evaluation criteria results
        if (analysis.evaluation_criteria_results) {
          Object.entries(analysis.evaluation_criteria_results).forEach(([criteriaId, result]: [string, any]) => {
            analysisData[0][`eval_${criteriaId}_result`] = result?.result || '';
            analysisData[0][`eval_${criteriaId}_rationale`] = result?.rationale || '';
          });
        }
        
        // Add data collection results
        if (analysis.data_collection_results) {
          Object.entries(analysis.data_collection_results).forEach(([dataId, result]: [string, any]) => {
            analysisData[0][`data_${dataId}_value`] = result?.value || '';
            analysisData[0][`data_${dataId}_rationale`] = result?.rationale || '';
          });
        }
        
        const elAnalysisSheet = XLSX.utils.json_to_sheet(analysisData);
        XLSX.utils.book_append_sheet(wb, elAnalysisSheet, 'EL Analysis');
      }

      // Feature usage metrics
      const featuresUsage = metadata.features_usage || {};
      if (Object.keys(featuresUsage).length > 0) {
        const featureData = [
          {
            language_detection_enabled: featuresUsage.language_detection?.enabled || false,
            language_detection_used: featuresUsage.language_detection?.used || false,
            transfer_to_agent_enabled: featuresUsage.transfer_to_agent?.enabled || false,
            transfer_to_agent_used: featuresUsage.transfer_to_agent?.used || false,
            transfer_to_number_enabled: featuresUsage.transfer_to_number?.enabled || false,
            transfer_to_number_used: featuresUsage.transfer_to_number?.used || false,
            multivoice_enabled: featuresUsage.multivoice?.enabled || false,
            multivoice_used: featuresUsage.multivoice?.used || false,
            dtmf_tones_enabled: featuresUsage.dtmf_tones?.enabled || false,
            dtmf_tones_used: featuresUsage.dtmf_tones?.used || false,
            external_mcp_servers_enabled: featuresUsage.external_mcp_servers?.enabled || false,
            external_mcp_servers_used: featuresUsage.external_mcp_servers?.used || false,
            tool_dynamic_variable_updates_enabled: featuresUsage.tool_dynamic_variable_updates?.enabled || false,
            tool_dynamic_variable_updates_used: featuresUsage.tool_dynamic_variable_updates?.used || false,
            voicemail_detection_enabled: featuresUsage.voicemail_detection?.enabled || false,
            voicemail_detection_used: featuresUsage.voicemail_detection?.used || false,
            pii_zrm_workspace: featuresUsage.pii_zrm_workspace || false,
            pii_zrm_agent: featuresUsage.pii_zrm_agent || false,
            is_livekit: featuresUsage.is_livekit || false,
          }
        ];
        const elFeaturesSheet = XLSX.utils.json_to_sheet(featureData);
        XLSX.utils.book_append_sheet(wb, elFeaturesSheet, 'EL Features');
      }

      // LLM Performance Summary
      const totalLlmUsage = charging.llm_usage || {};
      const irreversibleGen = totalLlmUsage.irreversible_generation?.model_usage || {};
      const initiatedGen = totalLlmUsage.initiated_generation?.model_usage || {};
      const geminiIrreversible = irreversibleGen['gemini-2.0-flash'] || {};
      const geminiInitiated = initiatedGen['gemini-2.0-flash'] || {};
      
      const llmPerfData = [
        {
          model_name: 'gemini-2.0-flash',
          // Irreversible (final) generation
          irreversible_input_tokens: geminiIrreversible.input?.tokens || 0,
          irreversible_output_tokens: geminiIrreversible.output_total?.tokens || 0,
          irreversible_input_cost: geminiIrreversible.input?.price || 0,
          irreversible_output_cost: geminiIrreversible.output_total?.price || 0,
          // Initiated (all attempted) generation
          initiated_input_tokens: geminiInitiated.input?.tokens || 0,
          initiated_output_tokens: geminiInitiated.output_total?.tokens || 0,
          initiated_input_cost: geminiInitiated.input?.price || 0,
          initiated_output_cost: geminiInitiated.output_total?.price || 0,
          // Efficiency metrics
          token_efficiency_pct: geminiInitiated.input?.tokens ? 
            Math.round((geminiIrreversible.input?.tokens || 0) / geminiInitiated.input.tokens * 100) : 0,
          cost_efficiency_pct: (geminiInitiated.input?.price || 0) + (geminiInitiated.output_total?.price || 0) > 0 ? 
            Math.round(((geminiIrreversible.input?.price || 0) + (geminiIrreversible.output_total?.price || 0)) / 
            ((geminiInitiated.input?.price || 0) + (geminiInitiated.output_total?.price || 0)) * 100) : 0,
        }
      ];
      const elLlmPerfSheet = XLSX.utils.json_to_sheet(llmPerfData);
      XLSX.utils.book_append_sheet(wb, elLlmPerfSheet, 'EL LLM Performance');

      // Dynamic Variables (system context)
      const dynamicVars = elevenConversation.conversation_initiation_client_data?.dynamic_variables || {};
      if (Object.keys(dynamicVars).length > 0) {
        const varsData = Object.entries(dynamicVars).map(([key, value]) => ({
          variable_name: key,
          variable_value: String(value || ''),
          is_system_var: key.startsWith('system__'),
        }));
        const elVarsSheet = XLSX.utils.json_to_sheet(varsData);
        XLSX.utils.book_append_sheet(wb, elVarsSheet, 'EL Variables');
      }
    }

    XLSX.writeFile(wb, `telemetry-${summary.sessionId}.xlsx`);
  };

  return (
    <button onClick={handleExport} className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50">
      Export Excel
    </button>
  );
}


