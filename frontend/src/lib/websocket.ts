type MessageHandler = (data: unknown) => void;

function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/ws";

  // Check for runtime override only in development
  const override = process.env.NODE_ENV === "development"
    ? localStorage.getItem("gestronomy_api_url")
    : null;
  const apiUrl = override || process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      const url = new URL(apiUrl);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${url.host}/ws`;
    } catch {
      // invalid URL, fall through
    }
  }

  // Default to same-origin WebSocket
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let connectUrl = this.url;
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) {
        const separator = connectUrl.includes("?") ? "&" : "?";
        connectUrl = `${connectUrl}${separator}token=${encodeURIComponent(token)}`;
      }
    }

    this.ws = new WebSocket(connectUrl);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { channel, data } = message;
        const channelHandlers = this.handlers.get(channel);
        if (channelHandlers) {
          channelHandlers.forEach((handler) => handler(data));
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  subscribe(channel: string, handler: MessageHandler) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
    return () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient(getWsUrl());
