export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

export type VoiceTimelineKind = "status" | "assistant" | "error";

export interface VoiceTimelineMessage {
  id: string;
  role: "system" | "assistant";
  content: string;
  timestamp: Date;
  kind: VoiceTimelineKind;
}
