import { create } from "zustand";
import type { VoiceResponse } from "@/mock";
import { MOCK_VOICE_RESPONSES } from "@/mock";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  dataType?: "stat" | "list" | "confirmation";
  data?: unknown;
}

interface VoiceState {
  isListening: boolean;
  conversation: ConversationMessage[];
  isProcessing: boolean;
  startListening: () => void;
  stopListening: () => void;
  sendQuery: (text: string) => Promise<void>;
}

function findResponse(text: string): VoiceResponse {
  const normalized = text.toLowerCase().trim();

  const entries = Array.from(MOCK_VOICE_RESPONSES.entries());

  for (let i = 0; i < entries.length; i++) {
    const [key, response] = entries[i];
    if (key === "default") continue;
    if (normalized.includes(key)) return response;
  }

  return MOCK_VOICE_RESPONSES.get("default")!;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isListening: false,
  conversation: [],
  isProcessing: false,

  startListening: () => {
    set({ isListening: true });
  },

  stopListening: () => {
    set({ isListening: false });
  },

  sendQuery: async (text) => {
    const userMessage: ConversationMessage = {
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    set((state) => ({
      conversation: [...state.conversation, userMessage],
      isProcessing: true,
      isListening: false,
    }));

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const matched = findResponse(text);

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: matched.response,
      timestamp: new Date(),
      dataType: matched.dataType,
      data: matched.data,
    };

    set((state) => ({
      conversation: [...state.conversation, assistantMessage],
      isProcessing: false,
    }));
  },
}));
