import { create } from "zustand";
import { api } from "@/services";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  dataType?: "stat" | "list" | "confirmation";
  data?: unknown;
  status?: "pending" | "complete" | "error";
}

interface AIConversationTurnPayload {
  role: "user" | "assistant";
  content: string;
}

interface AIQueryResponse {
  question: string;
  answer: string;
  model: string;
  route: string;
  used_fallback: boolean;
  highlights?: Record<string, unknown> | null;
  snapshot?: {
    summary?: Record<string, unknown>;
  };
}

interface AIStreamStatusEvent {
  state: string;
  message: string;
}

interface VoiceState {
  isListening: boolean;
  conversation: ConversationMessage[];
  isProcessing: boolean;
  startListening: () => void;
  stopListening: () => void;
  sendQuery: (text: string) => Promise<void>;
}

const MAX_CONVERSATION_MESSAGES = 5;

function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimConversation(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.slice(-MAX_CONVERSATION_MESSAGES);
}

function toHistoryPayload(messages: ConversationMessage[]): AIConversationTurnPayload[] {
  return messages.slice(-MAX_CONVERSATION_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function replaceMessage(
  messages: ConversationMessage[],
  messageId: string,
  patch: Partial<ConversationMessage>
): ConversationMessage[] {
  return messages.map((message) =>
    message.id === messageId ? { ...message, ...patch } : message
  );
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
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
      id: createMessageId(),
      role: "user",
      content: text,
      timestamp: new Date(),
      status: "complete",
    };

    const placeholderId = createMessageId();
    const placeholderMessage: ConversationMessage = {
      id: placeholderId,
      role: "assistant",
      content: "Pulling the live hotel snapshot...",
      timestamp: new Date(),
      dataType: "confirmation",
      status: "pending",
    };

    const conversationWithoutPlaceholder = trimConversation([
      ...get().conversation,
      userMessage,
    ]);
    const nextConversation = trimConversation([
      ...conversationWithoutPlaceholder,
      placeholderMessage,
    ]);

    set({
      conversation: nextConversation,
      isProcessing: true,
      isListening: false,
    });

    try {
      let streamDeliveredResult = false;

      try {
        await api.streamPost<AIQueryResponse | AIStreamStatusEvent>(
          "/ai/query/stream",
          {
            question: text,
            history: toHistoryPayload(conversationWithoutPlaceholder),
          },
          ({ event, data }) => {
            if (event === "status") {
              const statusEvent = data as AIStreamStatusEvent;
              set((state) => ({
                conversation: replaceMessage(state.conversation, placeholderId, {
                  content: statusEvent.message,
                  timestamp: new Date(),
                }),
              }));
              return;
            }

            if (event === "result") {
              const response = data as AIQueryResponse;
              streamDeliveredResult = true;
              set((state) => ({
                conversation: trimConversation(
                  replaceMessage(state.conversation, placeholderId, {
                    content: response.answer,
                    timestamp: new Date(),
                    dataType: response.highlights ? "stat" : undefined,
                    data: response.highlights ?? response.snapshot?.summary,
                    status: "complete",
                  })
                ),
                isProcessing: false,
              }));
            }
          }
        );
      } catch {
        streamDeliveredResult = false;
      }

      if (streamDeliveredResult) {
        return;
      }

      const response = await api.post<AIQueryResponse>("/ai/query", {
        question: text,
        history: toHistoryPayload(conversationWithoutPlaceholder),
      });

      set((state) => ({
        conversation: trimConversation(
          replaceMessage(state.conversation, placeholderId, {
            content: response.answer,
            timestamp: new Date(),
            dataType: response.highlights ? "stat" : undefined,
            data: response.highlights ?? response.snapshot?.summary,
            status: "complete",
          })
        ),
        isProcessing: false,
      }));
    } catch (error) {
      set((state) => ({
        conversation: trimConversation(
          replaceMessage(state.conversation, placeholderId, {
            content:
              error instanceof Error
                ? error.message
                : "I couldn't reach the live hotel assistant just now.",
            timestamp: new Date(),
            dataType: "confirmation",
            status: "error",
          })
        ),
        isProcessing: false,
      }));
    }
  },
}));
