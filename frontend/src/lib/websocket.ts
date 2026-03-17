import { useEffect } from "react";

type MessageHandler = (data: any) => void;

function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8002/ws";

  const override = process.env.NODE_ENV === "development"
    ? localStorage.getItem("gestronomy_api_url")
    : null;
  const apiUrl = override || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";
  
  try {
    const url = new URL(apiUrl);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/ws`;
  } catch {
    return "ws://localhost:8002/ws";
  }
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

    const rid = this.restaurantId || 1; // Default to 1 if not set
    let connectUrl = `${this.url}/${rid}`;
    
    const token = localStorage.getItem("access_token");
    if (token) {
      connectUrl = `${connectUrl}?token=${encodeURIComponent(token)}`;
    }

    this.ws = new WebSocket(connectUrl);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type } = message; // Backend uses 'type'
        const typeHandlers = this.handlers.get(type);
        if (typeHandlers) {
          typeHandlers.forEach((handler) => handler(message));
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("WS Closed, reconnecting...");
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error("WS Error:", err);
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

export function useWebSocket(type: string, onMessage: MessageHandler) {
  useEffect(() => {
    wsClient.connect();
    return wsClient.subscribe(type, onMessage);
  }, [type, onMessage]);
}
