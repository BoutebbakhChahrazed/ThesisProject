import { getBackendWsBaseUrl } from "@/lib/backend";

export type AnalyzeResult = {
  zone_id: string;
  timestamp: string;
  gps?: { lat: number; lng: number };
  health_score: number;
  stress_class: string;
  confidence: number;
  heatmap_url?: string;
  drone_image_url?: string;
  storage_path?: string;
  bucket?: string;
  image_id?: string;
};

type AnalyzeParams = {
  object_path: string;
  bucket: string;
  field_id?: string;
  image_id?: string;
  flight_id?: string | null;
  upload_source?: string;
};

export function analyzeFromStorageViaWebSocket(
  params: AnalyzeParams,
  token: string,
  onProgress?: (message: string) => void,
): Promise<AnalyzeResult> {
  return new Promise((resolve, reject) => {
    const wsUrl = `${getBackendWsBaseUrl()}/ws/analyze/from-storage?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        object_path: params.object_path,
        bucket: params.bucket,
        field_id: params.field_id ?? null,
        image_id: params.image_id ?? null,
        flight_id: params.flight_id ?? null,
        upload_source: params.upload_source ?? "manual",
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;

        if (data.type === "progress" && typeof data.message === "string") {
          onProgress?.(data.message);
          return;
        }

        if (data.type === "error") {
          ws.close();
          finish(() => reject(new Error(String(data.message ?? "Analysis failed"))));
          return;
        }

        if (data.type === "result" || data.stress_class) {
          ws.close();
          finish(() => resolve({
            zone_id: String(data.zone_id ?? "unknown"),
            timestamp: String(data.timestamp ?? new Date().toISOString()),
            gps: data.gps as AnalyzeResult["gps"],
            health_score: Number(data.health_score ?? 0),
            stress_class: String(data.stress_class ?? "unknown"),
            confidence: Number(data.confidence ?? 0),
            heatmap_url: data.heatmap_url as string | undefined,
            drone_image_url: data.drone_image_url as string | undefined,
            storage_path: data.storage_path as string | undefined,
            bucket: data.bucket as string | undefined,
            image_id: data.image_id as string | undefined,
          }));
        }
      } catch (e) {
        ws.close();
        finish(() => reject(e instanceof Error ? e : new Error("Invalid WebSocket response")));
      }
    };

    ws.onerror = () => {
      finish(() => reject(new Error("WebSocket connection failed")));
      ws.close();
    };

    ws.onclose = () => {
      finish(() => reject(new Error("Analysis connection closed before result")));
    };
  });
}
