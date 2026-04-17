import { create } from "zustand";
import { api, ApiError } from "@/services/api";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  dataType?: "stat" | "list" | "confirmation" | "error";
  data?: unknown;
  meta?: {
    model?: string;
    route?: string;
    usedFallback?: boolean;
    latencyMs?: number | null;
  };
}

// Backend response shape from POST /api/ai/query
interface AIQueryResponse {
  question: string;
  answer: string;
  model: string;
  route: string;
  used_fallback: boolean;
  highlights: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
  latency_ms: number | null;
  snapshot_latency_ms: number | null;
  llm_latency_ms: number | null;
  snapshot_cache_status: string | null;
  error: string | null;
}

interface VoiceState {
  isListening: boolean;
  conversation: ConversationMessage[];
  isProcessing: boolean;
  lastError: string | null;
  startListening: () => void;
  stopListening: () => void;
  sendQuery: (text: string) => Promise<void>;
  clearConversation: () => void;
}

const HISTORY_LIMIT = 5;

function toHistory(conversation: ConversationMessage[]) {
  return conversation
    .filter((m) => m.dataType !== "error")
    .slice(-HISTORY_LIMIT * 2)
    .map((m) => ({ role: m.role, content: m.content }));
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  isListening: false,
  conversation: [],
  isProcessing: false,
  lastError: null,

  startListening: () => {
    set({ isListening: true });
  },

  stopListening: () => {
    set({ isListening: false });
  },

  clearConversation: () => {
    set({ conversation: [], lastError: null });
  },

  sendQuery: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ConversationMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const historyBefore = toHistory(get().conversation);

    set((state) => ({
      conversation: [...state.conversation, userMessage],
      isProcessing: true,
      isListening: false,
      lastError: null,
    }));

    try {
      const result = await api.authPost<AIQueryResponse>("/api/ai/query", {
        question: trimmed,
        history: historyBefore,
      });

      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: result.answer,
        timestamp: new Date(),
        data: result.highlights ?? undefined,
        meta: {
          model: result.model,
          route: result.route,
          usedFallback: result.used_fallback,
          latencyMs: result.latency_ms,
        },
      };

      set((state) => ({
        conversation: [...state.conversation, assistantMessage],
        isProcessing: false,
        lastError: result.used_fallback
          ? `AI fallback mode: ${result.error ?? "OpenAI unavailable"}`
          : null,
      }));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `[${err.status}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);

      console.error("[voiceStore] sendQuery failed:", err);

      const errorMessage: ConversationMessage = {
        role: "assistant",
        content: `Error: ${message}`,
        timestamp: new Date(),
        dataType: "error",
      };

      set((state) => ({
        conversation: [...state.conversation, errorMessage],
        isProcessing: false,
        lastError: message,
      }));
    }
  },
}));
