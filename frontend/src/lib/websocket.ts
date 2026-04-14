import { useEffect } from "react";

type MessageHandler = (data: any) => void;

function getWsUrl(): string {
  // SSR: derive from NEXT_PUBLIC_API_URL when available; otherwise default to localhost
  if (typeof window === "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) {
      try {
        const url = new URL(process.env.NEXT_PUBLIC_API_URL);
        const protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${url.host}/ws`;
      } catch {
        // fall through
      }
    }
    return "ws://localhost:8000/ws";
  }

  // Allow a manual override (e.g. for the Tauri desktop app)
  const override = process.env.NODE_ENV === "development"
    ? localStorage.getItem("gestronomy_api_url")
    : null;

  if (override) {
    try {
      const url = new URL(override);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${url.host}/ws`;
    } catch {
      // fall through
    }
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_API_URL);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${url.host}/ws`;
    } catch {
      // fall through
    }
  }

  // Last resort: derive from the current page origin (assumes backend and frontend
  // share the same hostname, which is true behind a reverse proxy).
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: any = null;
  private url: string;
  private restaurantId: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  setRestaurantId(id: number) {
    if (this.restaurantId !== id) {
      this.restaurantId = id;
      this.disconnect();
      this.connect();
    }
  }

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const rid = this.restaurantId || 1;
    let connectUrl = `${this.url}/${rid}`;

    const token = localStorage.getItem("access_token");
    if (token) {
      connectUrl = `${connectUrl}?token=${encodeURIComponent(token)}`;
    }

    this.ws = new WebSocket(connectUrl);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type } = message;
        const typeHandlers = this.handlers.get(type);
        if (typeHandlers) {
          typeHandlers.forEach((handler) => handler(message));
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    this.ws.onclose = () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  subscribe(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient(getWsUrl());

export function useWebSocket(
  type: string,
  onMessage: MessageHandler,
  channelId?: number | null,
) {
  useEffect(() => {
    if (typeof channelId === "number" && Number.isFinite(channelId) && channelId > 0) {
      wsClient.setRestaurantId(channelId);
    } else {
      wsClient.connect();
    }
    return wsClient.subscribe(type, onMessage);
  }, [type, onMessage, channelId]);
}
