import { useEffect, useRef, useState } from "react";

export interface DetectionMessage {
  zone_id: string;
  timestamp: string;
  gps: { lat: number; lng: number };
  health_score: number;
  stress_class: string;
  confidence: number;
  heatmap_url?: string;
  drone_image_url?: string;
}

export function useWebSocket(url: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<DetectionMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const connect = () => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => !cancelled && setConnected(true);
        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
          timerRef.current = window.setTimeout(connect, 3000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try { setLastMessage(JSON.parse(e.data)); } catch {}
        };
      } catch {
        timerRef.current = window.setTimeout(connect, 3000);
      }
    };
    connect();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, lastMessage };
}