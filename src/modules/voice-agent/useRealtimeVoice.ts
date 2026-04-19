"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/services/api";
import type {
  RealtimeConnectionState,
  VoiceTimelineKind,
  VoiceTimelineMessage,
} from "@/store";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
const WORKLET_PATH = "/audio-worklets/realtime-pcm16-worklet.js";
const PCM_SAMPLE_RATE = 24000;
const PCM_CHUNK_SAMPLES = 1440;
const PCM_MIN_CHUNK_SAMPLES = 480;
const SESSION_INSTRUCTIONS =
  "You are a helpful voice assistant connected to backend data.";
const SESSION_READY_TIMEOUT_MS = 10000;
const PLAYBACK_QUEUE_CHUNK_SAMPLES = 1200;
const PLAYBACK_START_LEAD_SECONDS = 0.03;
const PLAYBACK_MAX_SCHEDULE_AHEAD_SECONDS = 0.35;
const PLAYBACK_MAX_QUEUE_SECONDS = 4;
const PLAYBACK_DRIFT_RESET_SECONDS = 0.1;
const PLAYBACK_FORCE_SCHEDULE_RATIO = 0.5;
const WS_BUFFERED_AMOUNT_HIGH_WATERMARK = 512 * 1024;
const WS_BUFFERED_AMOUNT_LOW_WATERMARK = 128 * 1024;
const BACKPRESSURE_RECOVERY_INTERVAL_MS = 250;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 5000;
const RESPONSE_TIMEOUT_MS = 15000;
const SILENCE_TIMEOUT_MS = 12000;
const SPEECH_PEAK_THRESHOLD = 0.02;
const DECODE_CONCURRENCY = 1;
const DECODE_REORDER_WINDOW = 6;
const DEBUG_REALTIME = process.env.NODE_ENV === "development";
const REALTIME_TOOLS = [
  {
    type: "function",
    name: "query_backend",
    description: "Query backend system data",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
] as const;

interface RealtimeTokenResponse {
  value: string;
  expires_at: number;
  session: Record<string, unknown>;
}

interface RealtimeToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

interface RealtimeToolResponse {
  tool_name: string;
  result: Record<string, unknown>;
}

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

interface AudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `[${error.status}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const floats = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true);
    floats[index] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }

  return floats;
}

function extractNumericField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDeltaSequenceKey(event: RealtimeEvent): string | null {
  const outputIndex = extractNumericField(event.output_index) ?? 0;
  const contentIndex = extractNumericField(event.content_index) ?? 0;
  const deltaIndex =
    extractNumericField(event.delta_index) ??
    extractNumericField(event.chunk_index) ??
    extractNumericField(event.sequence) ??
    extractNumericField(event.sequence_number) ??
    extractNumericField(event.audio_start_ms);

  if (deltaIndex == null) {
    return null;
  }

  // Keep ordering as a structured string key so we never compose a large
  // integer that can overflow the JS safe-integer range.
  return `${outputIndex}:${contentIndex}:${deltaIndex}`;
}

function compareSequenceKeys(left: string, right: string): number {
  const leftParts = left.split(":");
  const rightParts = right.split(":");
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = Number.parseInt(leftParts[index] ?? "0", 10);
    const rightValue = Number.parseInt(rightParts[index] ?? "0", 10);

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function getNextSequenceKey(key: string): string | null {
  const parts = key.split(":");
  const lastIndex = parts.length - 1;
  const lastValue = Number.parseInt(parts[lastIndex] ?? "", 10);

  if (!Number.isFinite(lastValue)) {
    return null;
  }

  parts[lastIndex] = String(lastValue + 1);
  return parts.join(":");
}

export function useRealtimeVoice() {
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceTimelineMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const sessionReadyResolveRef = useRef<(() => void) | null>(null);
  const sessionReadyRejectRef = useRef<((reason?: unknown) => void) | null>(
    null
  );
  const isUnmountingRef = useRef(false);
  const isListeningRef = useRef(false);
  const shouldReconnectRef = useRef(false);
  const shouldResumeListeningRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const inputBackpressureActiveRef = useRef(false);
  const backpressureRecoveryIntervalRef = useRef<number | null>(null);
  const connectionCounterRef = useRef(0);
  const activeConnectionIdRef = useRef(0);
  const inactivityTimerRef = useRef<number | null>(null);
  const isResponseRequestedRef = useRef(false);
  const isResponseStreamingRef = useRef(false);
  const responseTimeoutRef = useRef<number | null>(null);
  const backpressureNotifiedRef = useRef(false);
  const handledToolCallsRef = useRef<Set<string>>(new Set());

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletLoadedRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const microphoneWorkletRef = useRef<AudioWorkletNode | null>(null);
  const mutedGainRef = useRef<GainNode | null>(null);

  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackGenerationRef = useRef(0);
  const playbackCursorRef = useRef(0);
  const playbackRemainderRef = useRef<Uint8Array>(new Uint8Array());
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const playbackQueuedSamplesRef = useRef(0);
  const decodeQueueRef = useRef<
    Array<{
      connectionId: number;
      generation: number;
      sequenceKey: string;
      delta: string;
    }>
  >([]);
  const activeDecodeCountRef = useRef(0);
  const decodeGenerationRef = useRef(0);
  const pendingDecodedChunksRef = useRef<Map<string, Float32Array[]>>(new Map());
  const nextPlaybackSequenceRef = useRef<string | null>(null);
  const fallbackDeltaSequenceRef = useRef(0);
  const assistantTranscriptRef = useRef("");

  function debugLog(...args: unknown[]) {
    if (DEBUG_REALTIME) {
      console.debug("[realtime-voice]", ...args);
    }
  }

  function appendMessage(kind: VoiceTimelineKind, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    setMessages((current) => [
      ...current.slice(-19),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind,
        role: kind === "assistant" ? "assistant" : "system",
        content: trimmed,
        timestamp: new Date(),
      },
    ]);
  }

  function clearPendingSessionPromise(reason?: unknown) {
    if (reason && sessionReadyRejectRef.current) {
      sessionReadyRejectRef.current(reason);
    }

    sessionReadyResolveRef.current = null;
    sessionReadyRejectRef.current = null;
    connectPromiseRef.current = null;
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function ensureBackpressureRecoveryMonitor() {
    if (backpressureRecoveryIntervalRef.current != null) {
      return;
    }

    backpressureRecoveryIntervalRef.current = window.setInterval(() => {
      const socket = wsRef.current;
      if (
        socket == null ||
        socket.readyState !== WebSocket.OPEN ||
        !inputBackpressureActiveRef.current
      ) {
        return;
      }

      if (socket.bufferedAmount <= WS_BUFFERED_AMOUNT_LOW_WATERMARK) {
        clearBackpressureState();
        debugLog("input backpressure cleared", {
          bufferedAmount: socket.bufferedAmount,
        });
      }
    }, BACKPRESSURE_RECOVERY_INTERVAL_MS);
  }

  function clearBackpressureRecoveryMonitor() {
    if (backpressureRecoveryIntervalRef.current != null) {
      window.clearInterval(backpressureRecoveryIntervalRef.current);
      backpressureRecoveryIntervalRef.current = null;
    }
  }

  function clearResponseTimeout() {
    if (responseTimeoutRef.current != null) {
      window.clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  }

  function armResponseTimeout() {
    clearResponseTimeout();

    responseTimeoutRef.current = window.setTimeout(() => {
      responseTimeoutRef.current = null;
      isResponseRequestedRef.current = false;
      isResponseStreamingRef.current = false;
      setIsAwaitingResponse(false);
      debugLog("response timeout reached; clearing awaiting state");
    }, RESPONSE_TIMEOUT_MS);
  }

  function clearBackpressureState() {
    inputBackpressureActiveRef.current = false;
    backpressureNotifiedRef.current = false;
  }

  function getToolCallIdentifier(event: RealtimeEvent): string {
    const directCallId =
      typeof event.call_id === "string"
        ? event.call_id
        : typeof event.item_id === "string"
          ? event.item_id
          : typeof event.id === "string"
            ? event.id
            : null;

    if (directCallId != null && directCallId.trim()) {
      return directCallId;
    }

    const item =
      typeof event.item === "object" && event.item != null
        ? (event.item as Record<string, unknown>)
        : null;
    const itemCallId =
      typeof item?.call_id === "string"
        ? item.call_id
        : typeof item?.id === "string"
          ? item.id
          : null;

    if (itemCallId != null && itemCallId.trim()) {
      return itemCallId;
    }

    return JSON.stringify({
      name: event.name,
      arguments: event.arguments,
      item,
    });
  }

  function getToolCallName(event: RealtimeEvent): string | null {
    if (typeof event.name === "string" && event.name.trim()) {
      return event.name;
    }

    const item =
      typeof event.item === "object" && event.item != null
        ? (event.item as Record<string, unknown>)
        : null;

    return typeof item?.name === "string" && item.name.trim()
      ? item.name
      : null;
  }

  function parseToolArguments(event: RealtimeEvent): Record<string, unknown> {
    const item =
      typeof event.item === "object" && event.item != null
        ? (event.item as Record<string, unknown>)
        : null;
    const rawArguments = event.arguments ?? item?.arguments ?? {};

    if (typeof rawArguments === "string") {
      const parsed = JSON.parse(rawArguments) as unknown;
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error("Realtime tool arguments must be a JSON object.");
    }

    if (rawArguments != null && typeof rawArguments === "object" && !Array.isArray(rawArguments)) {
      return rawArguments as Record<string, unknown>;
    }

    throw new Error("Realtime tool arguments must be an object.");
  }

  async function executeRealtimeTool(event: RealtimeEvent) {
    const toolCallId = getToolCallIdentifier(event);
    if (handledToolCallsRef.current.has(toolCallId)) {
      return;
    }
    handledToolCallsRef.current.add(toolCallId);

    const toolName = getToolCallName(event);
    const callId =
      typeof event.call_id === "string"
        ? event.call_id
        : typeof event.item === "object" &&
            event.item != null &&
            typeof (event.item as Record<string, unknown>).call_id === "string"
          ? ((event.item as Record<string, unknown>).call_id as string)
          : null;

    let toolResult: Record<string, unknown>;

    try {
      if (toolName == null) {
        throw new Error("Realtime tool call is missing a tool name.");
      }

      const argumentsPayload = parseToolArguments(event);
      const backendResult = await api.authPost<RealtimeToolResponse>(
        "/api/realtime/tool",
        {
          name: toolName,
          arguments: argumentsPayload,
        } satisfies RealtimeToolRequest
      );

      toolResult = backendResult.result;
    } catch (toolError) {
      toolResult = {
        error: formatErrorMessage(toolError),
      };
      appendMessage("error", formatErrorMessage(toolError));
    }

    sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "tool_result",
        tool_name: toolName ?? "unknown_tool",
        ...(callId != null ? { call_id: callId } : {}),
        content: JSON.stringify(toolResult),
      },
    });

    isResponseRequestedRef.current = true;
    setIsAwaitingResponse(true);
    sendClientEvent({ type: "response.create" });
  }

  function clearInactivityTimer() {
    if (inactivityTimerRef.current != null) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function armInactivityTimer() {
    clearInactivityTimer();

    inactivityTimerRef.current = window.setTimeout(() => {
      inactivityTimerRef.current = null;

      // Silence should not leave the turn hanging indefinitely.
      if (isListeningRef.current) {
        debugLog("silence timeout reached; finalizing current turn");
        void stopListening();
      }
    }, SILENCE_TIMEOUT_MS);
  }

  async function ensureAudioContext(): Promise<AudioContext> {
    const existingContext = audioContextRef.current;
    if (existingContext != null) {
      if (existingContext.state === "suspended") {
        await existingContext.resume();
      }
      return existingContext;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as AudioContextWindow).webkitAudioContext;

    if (AudioContextCtor == null) {
      throw new Error("This browser does not support the Web Audio API.");
    }

    const audioContext = new AudioContextCtor({ latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule(WORKLET_PATH);
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    audioContextRef.current = audioContext;
    workletLoadedRef.current = true;
    playbackCursorRef.current = audioContext.currentTime;

    return audioContext;
  }

  function sendClientEvent(payload: Record<string, unknown>) {
    const socket = wsRef.current;
    if (socket == null || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime session is not connected.");
    }

    socket.send(JSON.stringify(payload));
  }

  function resetPlaybackTiming() {
    const audioContext = audioContextRef.current;
    playbackCursorRef.current = audioContext?.currentTime ?? 0;
  }

  function clearDecodeState() {
    decodeGenerationRef.current += 1;
    decodeQueueRef.current = [];
    pendingDecodedChunksRef.current.clear();
    nextPlaybackSequenceRef.current = null;
    fallbackDeltaSequenceRef.current = 0;
    playbackRemainderRef.current = new Uint8Array();
  }

  function clearPlaybackQueue() {
    playbackRemainderRef.current = new Uint8Array();
    playbackQueueRef.current = [];
    playbackQueuedSamplesRef.current = 0;
  }

  function stopPlayback() {
    playbackGenerationRef.current += 1;
    clearResponseTimeout();

    const audioContext = audioContextRef.current;
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may already be finished when an interruption arrives.
      }
      source.onended = null;
      source.buffer = null;
      source.disconnect();
    }

    playbackSourcesRef.current.clear();
    clearDecodeState();
    clearPlaybackQueue();
    handledToolCallsRef.current.clear();
    isResponseRequestedRef.current = false;
    isResponseStreamingRef.current = false;
    setIsPlaying(false);
    playbackCursorRef.current = audioContext?.currentTime ?? 0;
  }

  async function cancelAssistantTurn() {
    stopPlayback();
    assistantTranscriptRef.current = "";
    setIsAwaitingResponse(false);

    const socket = wsRef.current;
    if (socket == null || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      sendClientEvent({ type: "response.cancel" });
    } catch {
      // A response may not exist yet, which is safe to ignore.
    }

    sendClientEvent({ type: "input_audio_buffer.clear" });
  }

  function trimPlaybackQueue() {
    const maxQueuedSamples = Math.floor(PCM_SAMPLE_RATE * PLAYBACK_MAX_QUEUE_SECONDS);

    // Bound queued assistant audio so a stalled device cannot grow memory
    // without limit during a long response.
    while (
      playbackQueuedSamplesRef.current > maxQueuedSamples &&
      playbackQueueRef.current.length > 0
    ) {
      const droppedChunk = playbackQueueRef.current.shift();
      if (droppedChunk != null) {
        playbackQueuedSamplesRef.current -= droppedChunk.length;
      }
    }
  }

  function flushDecodedChunksInOrder({ force }: { force: boolean }) {
    if (force) {
      const remainingKeys = [...pendingDecodedChunksRef.current.keys()].sort(
        compareSequenceKeys
      );

      for (const sequenceKey of remainingKeys) {
        const chunks = pendingDecodedChunksRef.current.get(sequenceKey);
        pendingDecodedChunksRef.current.delete(sequenceKey);

        if (chunks != null) {
          for (const chunk of chunks) {
            enqueuePlaybackChunk(chunk);
          }
        }
      }

      nextPlaybackSequenceRef.current = null;
      return;
    }

    let nextSequenceKey = nextPlaybackSequenceRef.current;
    if (nextSequenceKey == null) {
      const orderedKeys = [...pendingDecodedChunksRef.current.keys()].sort(
        compareSequenceKeys
      );
      nextSequenceKey = orderedKeys[0] ?? null;
      nextPlaybackSequenceRef.current = nextSequenceKey;
    }

    if (nextSequenceKey == null) {
      return;
    }

    let remainingIterations =
      pendingDecodedChunksRef.current.size + DECODE_REORDER_WINDOW + 1;

    while (remainingIterations > 0 && nextSequenceKey != null) {
      const chunks = pendingDecodedChunksRef.current.get(nextSequenceKey);

      if (chunks == null) {
        if (pendingDecodedChunksRef.current.size < DECODE_REORDER_WINDOW) {
          break;
        }

        const orderedKeys = [...pendingDecodedChunksRef.current.keys()].sort(
          compareSequenceKeys
        );
        const earliestSequenceKey = orderedKeys[0] ?? null;

        if (earliestSequenceKey == null) {
          nextSequenceKey = null;
          break;
        }

        if (compareSequenceKeys(earliestSequenceKey, nextSequenceKey) > 0) {
          // If a chunk never arrives, skip forward once the reorder window
          // fills so assistant playback cannot stall indefinitely.
          debugLog("playback sequence gap detected", {
            expected: nextSequenceKey,
            earliest: earliestSequenceKey,
            queued: pendingDecodedChunksRef.current.size,
          });
        }

        nextSequenceKey = earliestSequenceKey;
        nextPlaybackSequenceRef.current = nextSequenceKey;
        remainingIterations -= 1;
        continue;
      }

      pendingDecodedChunksRef.current.delete(nextSequenceKey);
      for (const chunk of chunks) {
        enqueuePlaybackChunk(chunk);
      }

      nextSequenceKey = getNextSequenceKey(nextSequenceKey);
      nextPlaybackSequenceRef.current = nextSequenceKey;
      remainingIterations -= 1;
    }
  }

  function schedulePlaybackQueue() {
    const audioContext = audioContextRef.current;
    if (audioContext == null) {
      return;
    }

    if (playbackCursorRef.current < audioContext.currentTime) {
      playbackCursorRef.current = audioContext.currentTime;
    }

    const playbackDrift = playbackCursorRef.current - audioContext.currentTime;
    if (Math.abs(playbackDrift) > PLAYBACK_DRIFT_RESET_SECONDS) {
      debugLog("playback drift reset", { drift: playbackDrift });
      playbackCursorRef.current = audioContext.currentTime;
    }

    while (playbackQueueRef.current.length > 0) {
      const queueSeconds = playbackQueuedSamplesRef.current / PCM_SAMPLE_RATE;
      const shouldForceScheduling =
        queueSeconds >= PLAYBACK_MAX_QUEUE_SECONDS * PLAYBACK_FORCE_SCHEDULE_RATIO;

      if (
        !shouldForceScheduling &&
        playbackCursorRef.current - audioContext.currentTime >
          PLAYBACK_MAX_SCHEDULE_AHEAD_SECONDS
      ) {
        break;
      }

      const nextChunk = playbackQueueRef.current.shift();
      if (nextChunk == null) {
        break;
      }

      playbackQueuedSamplesRef.current -= nextChunk.length;

      const audioBuffer = audioContext.createBuffer(
        1,
        nextChunk.length,
        PCM_SAMPLE_RATE
      );
      audioBuffer.copyToChannel(nextChunk, 0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const generation = playbackGenerationRef.current;
      // Drive every source from a shared cursor so playback stays ordered and
      // gapless even when websocket audio deltas arrive unevenly.
      const startAt = Math.max(
        audioContext.currentTime + PLAYBACK_START_LEAD_SECONDS,
        playbackCursorRef.current
      );

      playbackCursorRef.current = startAt + audioBuffer.duration;
      playbackSourcesRef.current.add(source);
      setIsPlaying(true);

      source.onended = () => {
        playbackSourcesRef.current.delete(source);
        source.onended = null;
        source.buffer = null;
        source.disconnect();

        if (generation !== playbackGenerationRef.current) {
          return;
        }

        if (
          playbackSourcesRef.current.size === 0 &&
          playbackQueueRef.current.length === 0
        ) {
          setIsPlaying(false);
          resetPlaybackTiming();
          return;
        }

        schedulePlaybackQueue();
      };

      source.start(startAt);
    }

    if (
      playbackSourcesRef.current.size === 0 &&
      playbackQueueRef.current.length === 0
    ) {
      setIsPlaying(false);
      resetPlaybackTiming();
    }
  }

  function enqueuePlaybackChunk(chunk: Float32Array) {
    if (chunk.length === 0) {
      return;
    }

    playbackQueueRef.current.push(chunk);
    playbackQueuedSamplesRef.current += chunk.length;
    debugLog("playback queue", {
      chunks: playbackQueueRef.current.length,
      queuedSamples: playbackQueuedSamplesRef.current,
    });
    trimPlaybackQueue();
    schedulePlaybackQueue();
  }

  function flushPlaybackRemainder({ force }: { force: boolean }) {
    if (playbackRemainderRef.current.length === 0) {
      return;
    }

    const minRemainderBytes = PCM_MIN_CHUNK_SAMPLES * 2;
    if (!force && playbackRemainderRef.current.length < minRemainderBytes) {
      return;
    }

    let pcmBytes = playbackRemainderRef.current;
    playbackRemainderRef.current = new Uint8Array();

    if (force && pcmBytes.length < minRemainderBytes) {
      const paddedBytes = new Uint8Array(minRemainderBytes);
      paddedBytes.set(pcmBytes);
      pcmBytes = paddedBytes;
    }

    enqueuePlaybackChunk(pcm16BytesToFloat32(pcmBytes));
  }

  async function processDecodeQueue() {
    if (activeDecodeCountRef.current >= DECODE_CONCURRENCY) {
      return;
    }

    while (
      activeDecodeCountRef.current < DECODE_CONCURRENCY &&
      decodeQueueRef.current.length > 0
    ) {
      const nextJob = decodeQueueRef.current.shift();
      if (nextJob == null) {
        return;
      }

      activeDecodeCountRef.current += 1;

      void (async () => {
        try {
          await ensureAudioContext();
          // Yield between PCM decode jobs so heavy responses do not monopolize
          // the main thread under CPU pressure.
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });

          if (
            nextJob.connectionId !== activeConnectionIdRef.current ||
            nextJob.generation !== decodeGenerationRef.current
          ) {
            return;
          }

          const nextBytes = base64ToBytes(nextJob.delta);
          const previousRemainder = playbackRemainderRef.current;
          const combinedBytes = new Uint8Array(
            previousRemainder.length + nextBytes.length
          );

          combinedBytes.set(previousRemainder);
          combinedBytes.set(nextBytes, previousRemainder.length);

          const alignedLength = combinedBytes.length - (combinedBytes.length % 2);
          const nextRemainder = combinedBytes.slice(alignedLength);

          if (alignedLength === 0) {
            if (
              nextJob.connectionId === activeConnectionIdRef.current &&
              nextJob.generation === decodeGenerationRef.current
            ) {
              playbackRemainderRef.current = nextRemainder;
            }
            return;
          }

          const alignedBytes = combinedBytes.subarray(0, alignedLength);
          const chunkByteSize = PLAYBACK_QUEUE_CHUNK_SAMPLES * 2;
          const decodedChunks: Float32Array[] = [];

          for (
            let offset = 0;
            offset + chunkByteSize <= alignedBytes.length;
            offset += chunkByteSize
          ) {
            const chunkBytes = alignedBytes.subarray(offset, offset + chunkByteSize);
            decodedChunks.push(pcm16BytesToFloat32(chunkBytes));
          }

          const leftoverOffset =
            alignedBytes.length - (alignedBytes.length % chunkByteSize);
          let finalRemainder = nextRemainder;
          if (leftoverOffset < alignedBytes.length) {
            const leftoverBytes = alignedBytes.subarray(leftoverOffset);
            const mergedRemainder = new Uint8Array(
              nextRemainder.length + leftoverBytes.length
            );

            mergedRemainder.set(leftoverBytes);
            mergedRemainder.set(nextRemainder, leftoverBytes.length);
            finalRemainder = mergedRemainder;
          }

          if (
            nextJob.connectionId !== activeConnectionIdRef.current ||
            nextJob.generation !== decodeGenerationRef.current
          ) {
            return;
          }

          playbackRemainderRef.current = finalRemainder;

          if (nextPlaybackSequenceRef.current == null) {
            nextPlaybackSequenceRef.current = nextJob.sequenceKey;
          }

          if (pendingDecodedChunksRef.current.has(nextJob.sequenceKey)) {
            debugLog("dropping duplicate decoded chunk", {
              sequence: nextJob.sequenceKey,
            });
            return;
          }

          pendingDecodedChunksRef.current.set(nextJob.sequenceKey, decodedChunks);
          flushDecodedChunksInOrder({ force: false });
          flushPlaybackRemainder({ force: false });
        } finally {
          activeDecodeCountRef.current -= 1;
          void processDecodeQueue();
        }
      })();
    }
  }

  function enqueueAssistantAudio(
    delta: string,
    sequenceKey: string,
    connectionId: number
  ) {
    if (!delta) {
      return;
    }

    debugLog("assistant audio delta", {
      bytes: Math.floor(delta.length * 0.75),
      decodeQueueLength: decodeQueueRef.current.length + 1,
      sequenceKey,
    });

    decodeQueueRef.current.push({
      connectionId,
      generation: decodeGenerationRef.current,
      sequenceKey,
      delta,
    });
    void processDecodeQueue();
  }

  function handleRealtimeEvent(event: RealtimeEvent, connectionId: number) {
    if (connectionId !== activeConnectionIdRef.current) {
      return;
    }

    switch (event.type) {
      case "session.created":
        break;

      case "session.updated":
        clearReconnectTimer();
        reconnectAttemptsRef.current = 0;
        clearBackpressureState();
        setConnectionState("connected");
        setError(null);
        appendMessage("status", "Realtime voice session connected.");
        sessionReadyResolveRef.current?.();
        clearPendingSessionPromise();
        break;

      case "response.created":
        assistantTranscriptRef.current = "";
        clearDecodeState();
        isResponseStreamingRef.current = true;
        setIsAwaitingResponse(true);
        armResponseTimeout();
        break;

      case "response.output_audio.delta":
      case "response.audio.delta": {
        const explicitSequenceKey = getDeltaSequenceKey(event);
        const sequenceKey =
          explicitSequenceKey ??
          (() => {
            fallbackDeltaSequenceRef.current += 1;
            return `0:0:${fallbackDeltaSequenceRef.current}`;
          })();

        enqueueAssistantAudio(
          String(event.delta ?? ""),
          sequenceKey,
          connectionId
        );
        break;
      }

      case "response.output_tool_call":
        void executeRealtimeTool(event);
        break;

      case "response.output_audio_transcript.delta":
        assistantTranscriptRef.current += String(event.delta ?? "");
        break;

      case "response.output_audio_transcript.done": {
        const transcript =
          typeof event.transcript === "string" && event.transcript.trim()
            ? event.transcript.trim()
            : assistantTranscriptRef.current.trim();

        if (transcript) {
          appendMessage("assistant", transcript);
        }

        assistantTranscriptRef.current = "";
        break;
      }

      case "response.output_audio.done":
      case "response.audio.done":
      case "response.done":
        clearResponseTimeout();
        flushDecodedChunksInOrder({ force: true });
        flushPlaybackRemainder({ force: true });
        handledToolCallsRef.current.clear();
        isResponseRequestedRef.current = false;
        isResponseStreamingRef.current = false;
        setIsAwaitingResponse(false);
        break;

      case "error": {
        const payload = event.error as
          | { message?: string; code?: string }
          | undefined;
        const nextError =
          payload?.message ??
          payload?.code ??
          "The realtime voice session failed.";

        setConnectionState("error");
        clearResponseTimeout();
        handledToolCallsRef.current.clear();
        isResponseRequestedRef.current = false;
        isResponseStreamingRef.current = false;
        setIsAwaitingResponse(false);
        setError(nextError);
        appendMessage("error", nextError);
        clearPendingSessionPromise(new Error(nextError));
        break;
      }

      default:
        break;
    }
  }

  function scheduleReconnect() {
    if (
      isUnmountingRef.current ||
      !shouldReconnectRef.current ||
      reconnectTimerRef.current != null
    ) {
      return;
    }

    const delayMs = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current,
      RECONNECT_MAX_DELAY_MS
    );
    reconnectAttemptsRef.current += 1;
    debugLog("schedule reconnect", {
      attempt: reconnectAttemptsRef.current,
      delayMs,
    });

    setConnectionState("connecting");
    appendMessage(
      "status",
      `Realtime connection lost. Reconnecting in ${Math.round(delayMs / 100) / 10}s.`
    );

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;

      void (async () => {
        try {
          // Every reconnect performs a fresh token fetch and sends a fresh
          // session.update as part of connectSocket.
          await connectSocket();

          if (shouldResumeListeningRef.current) {
            await startMicrophoneCapture();
            sendClientEvent({ type: "input_audio_buffer.clear" });
            setIsListening(true);
            isListeningRef.current = true;
            armInactivityTimer();
            appendMessage("status", "Microphone stream resumed.");
          }

          shouldResumeListeningRef.current = false;
        } catch (reconnectError) {
          setError(formatErrorMessage(reconnectError));
          scheduleReconnect();
        }
      })();
    }, delayMs);
  }

  async function connectSocket() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (connectPromiseRef.current != null) {
      return connectPromiseRef.current;
    }

    clearReconnectTimer();
    ensureBackpressureRecoveryMonitor();
    setConnectionState("connecting");
    setError(null);

    let connectionId = 0;

    const connectPromise = (async () => {
      const tokenResponse = await api.authGet<RealtimeTokenResponse>(
        "/api/realtime/token"
      );
      connectionId = connectionCounterRef.current + 1;
      connectionCounterRef.current = connectionId;
      activeConnectionIdRef.current = connectionId;
      let timeoutId: number | null = null;

      const sessionReadyPromise = new Promise<void>((resolve, reject) => {
        sessionReadyResolveRef.current = resolve;
        sessionReadyRejectRef.current = reject;
      });

      const socket = new WebSocket(REALTIME_URL, [
        "realtime",
        `openai-insecure-api-key.${tokenResponse.value}`,
        "openai-beta.realtime-v1",
      ]);

      wsRef.current = socket;

      socket.onopen = () => {
        if (connectionId !== activeConnectionIdRef.current) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: SESSION_INSTRUCTIONS,
              output_modalities: ["audio"],
              tools: REALTIME_TOOLS,
              audio: {
                input: {
                  format: {
                    type: "audio/pcm",
                    rate: PCM_SAMPLE_RATE,
                  },
                  turn_detection: null,
                },
                output: {
                  format: {
                    type: "audio/pcm",
                    rate: PCM_SAMPLE_RATE,
                  },
                  voice: "alloy",
                },
              },
            },
          })
        );
      };

      socket.onmessage = (messageEvent) => {
        if (connectionId !== activeConnectionIdRef.current) {
          return;
        }

        try {
          const event = JSON.parse(messageEvent.data) as RealtimeEvent;
          handleRealtimeEvent(event, connectionId);
        } catch {
          setError("Received an unreadable realtime event payload.");
        }
      };

      socket.onerror = () => {
        if (connectionId !== activeConnectionIdRef.current) {
          return;
        }

        setConnectionState("error");
        clearResponseTimeout();
        setError("The realtime voice socket encountered an error.");
      };

      socket.onclose = (closeEvent) => {
        if (connectionId !== activeConnectionIdRef.current) {
          return;
        }

        const shouldResumeListening = isListeningRef.current;

        wsRef.current = null;
        stopPlayback();
        stopMicrophoneCapture();
        setIsListening(false);
        isListeningRef.current = false;
        clearResponseTimeout();
        isResponseRequestedRef.current = false;
        isResponseStreamingRef.current = false;
        setIsAwaitingResponse(false);
        shouldResumeListeningRef.current = shouldResumeListening;

        if (!isUnmountingRef.current) {
          const reason =
            closeEvent.reason ||
            `Realtime voice disconnected (${closeEvent.code}).`;
          setConnectionState("error");
          setError(reason);
          appendMessage("error", reason);
        }

        clearPendingSessionPromise(
          new Error(
            closeEvent.reason ||
              `Realtime voice socket closed (${closeEvent.code}).`
          )
        );

        scheduleReconnect();
      };

      try {
        await Promise.race([
          sessionReadyPromise,
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(
                new Error("Timed out while establishing the realtime session.")
              );
            }, SESSION_READY_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
      }
    })()
      .catch((connectError) => {
        clearPendingSessionPromise(connectError);

        if (connectionId === activeConnectionIdRef.current) {
          wsRef.current?.close();
          wsRef.current = null;
        }

        setConnectionState("error");
        setError(formatErrorMessage(connectError));
        scheduleReconnect();
        throw connectError;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise;
    return connectPromise;
  }

  function stopMicrophoneCapture() {
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;

    if (microphoneWorkletRef.current != null) {
      microphoneWorkletRef.current.port.onmessage = null;
    }
    microphoneWorkletRef.current?.disconnect();
    microphoneWorkletRef.current = null;

    mutedGainRef.current?.disconnect();
    mutedGainRef.current = null;

    if (mediaStreamRef.current != null) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }

  function sendInputAudioChunk(buffer: ArrayBuffer) {
    const socket = wsRef.current;
    if (socket == null || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime session is not connected.");
    }

    // Drop live microphone chunks while the browser websocket send buffer is
    // saturated so we do not build an unbounded client-side queue.
    if (inputBackpressureActiveRef.current) {
      if (socket.bufferedAmount <= WS_BUFFERED_AMOUNT_LOW_WATERMARK) {
        clearBackpressureState();
      } else {
        return;
      }
    }

    if (socket.bufferedAmount > WS_BUFFERED_AMOUNT_HIGH_WATERMARK) {
      inputBackpressureActiveRef.current = true;
      if (!backpressureNotifiedRef.current) {
        backpressureNotifiedRef.current = true;
        appendMessage(
          "status",
          "Network backpressure detected. Dropping microphone audio until the socket drains."
        );
      }
      return;
    }

    sendClientEvent({
      type: "input_audio_buffer.append",
      audio: arrayBufferToBase64(buffer),
    });

    debugLog("input chunk", {
      bytes: buffer.byteLength,
      bufferedAmount: socket.bufferedAmount,
    });
  }

  function finalizeInputTurn() {
    if (isResponseRequestedRef.current) {
      return;
    }

    isResponseRequestedRef.current = true;
    setIsAwaitingResponse(true);
    // Realtime turn completion must always commit first, then request the response.
    sendClientEvent({ type: "input_audio_buffer.commit" });
    sendClientEvent({ type: "response.create" });
  }

  async function flushMicrophoneAudio() {
    const worklet = microphoneWorkletRef.current;
    if (worklet == null) {
      return;
    }

    await new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve();
      };

      const handleMessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === "flush-complete") {
          worklet.port.removeEventListener("message", handleMessage);
          finish();
        }
      };

      worklet.port.addEventListener("message", handleMessage);
      worklet.port.postMessage({ type: "flush" });

      window.setTimeout(() => {
        worklet.port.removeEventListener("message", handleMessage);
        finish();
      }, 100);
    });
  }

  async function startMicrophoneCapture() {
    const audioContext = await ensureAudioContext();

    if (!workletLoadedRef.current) {
      throw new Error("The realtime microphone worklet could not be loaded.");
    }

    stopMicrophoneCapture();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const source = audioContext.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioContext, "realtime-pcm16-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: {
        targetSampleRate: PCM_SAMPLE_RATE,
        chunkSamples: PCM_CHUNK_SAMPLES,
        minChunkSamples: PCM_MIN_CHUNK_SAMPLES,
      },
    });
    const mutedGain = audioContext.createGain();

    mutedGain.gain.value = 0;
    source.connect(worklet);
    worklet.connect(mutedGain);
    mutedGain.connect(audioContext.destination);

    worklet.port.onmessage = (
      event: MessageEvent<{ type?: string; buffer?: ArrayBuffer; peak?: number }>
    ) => {
      if (event.data?.type !== "chunk" || event.data.buffer == null) {
        return;
      }

      if (!isListeningRef.current) {
        return;
      }

      if ((event.data.peak ?? 0) >= SPEECH_PEAK_THRESHOLD) {
        armInactivityTimer();
      }

      try {
        sendInputAudioChunk(event.data.buffer);
      } catch (appendError) {
        setConnectionState("error");
        setError(formatErrorMessage(appendError));
        appendMessage("error", formatErrorMessage(appendError));
      }
    };

    mediaStreamRef.current = stream;
    mediaStreamSourceRef.current = source;
    microphoneWorkletRef.current = worklet;
    mutedGainRef.current = mutedGain;
  }

  async function startListening() {
    if (isListeningRef.current) {
      return;
    }

    try {
      clearReconnectTimer();
      shouldReconnectRef.current = true;
      shouldResumeListeningRef.current = false;
      clearBackpressureState();
      await connectSocket();
      await ensureAudioContext();
      await cancelAssistantTurn();
      await startMicrophoneCapture();

      microphoneWorkletRef.current?.port.postMessage({ type: "reset" });
      sendClientEvent({ type: "input_audio_buffer.clear" });
      armInactivityTimer();

      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
      appendMessage("status", "Listening for microphone input.");
    } catch (startError) {
      setConnectionState("error");
      setError(formatErrorMessage(startError));
      appendMessage("error", formatErrorMessage(startError));
      stopMicrophoneCapture();
      setIsListening(false);
      isListeningRef.current = false;
    }
  }

  async function stopListening() {
    if (!isListeningRef.current) {
      return;
    }

    try {
      clearInactivityTimer();
      shouldResumeListeningRef.current = false;
      await flushMicrophoneAudio();
      stopMicrophoneCapture();

      setIsListening(false);
      isListeningRef.current = false;

      finalizeInputTurn();
      appendMessage("status", "Waiting for the assistant voice response.");
    } catch (stopError) {
      setConnectionState("error");
      setError(formatErrorMessage(stopError));
      appendMessage("error", formatErrorMessage(stopError));
      stopMicrophoneCapture();
      setIsListening(false);
      isListeningRef.current = false;
      isResponseRequestedRef.current = false;
      isResponseStreamingRef.current = false;
      setIsAwaitingResponse(false);
    }
  }

  async function toggleListening() {
    if (isListeningRef.current) {
      await stopListening();
      return;
    }

    await startListening();
  }

  // This cleanup intentionally runs only once on unmount and operates on refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const playbackSources = playbackSourcesRef.current;

    return () => {
      isUnmountingRef.current = true;
      shouldReconnectRef.current = false;
      shouldResumeListeningRef.current = false;
      clearReconnectTimer();
      clearBackpressureRecoveryMonitor();
      clearInactivityTimer();
      clearResponseTimeout();
      stopMicrophoneCapture();

      playbackGenerationRef.current += 1;
      for (const source of playbackSources) {
        try {
          source.stop();
        } catch {
          // The source may already be stopped during teardown.
        }
        source.onended = null;
        source.buffer = null;
        source.disconnect();
      }
      playbackSources.clear();
      clearDecodeState();
      clearPlaybackQueue();

      if (wsRef.current != null) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const audioContext = audioContextRef.current;
      if (audioContext != null && audioContext.state !== "closed") {
        void audioContext.close();
      }
    };
  }, []);

  return {
    connectionState,
    error,
    isAwaitingResponse,
    isListening,
    isPlaying,
    messages,
    startListening,
    stopListening,
    toggleListening,
  };
}
