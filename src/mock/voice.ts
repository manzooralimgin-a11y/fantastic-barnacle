// Type definitions only — voice responses are produced by the live AI backend.
export type VoiceDataType = "stat" | "list" | "confirmation";

export interface VoiceResponse {
  query: string;
  response: string;
  dataType: VoiceDataType;
  data: unknown;
}
