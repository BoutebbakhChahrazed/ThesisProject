import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SegmentationRow } from "@/types/backend";
import { getBackendBaseUrl } from "@/lib/backend";

function getTokenFromSession() {
  return supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (!token) throw new Error("Missing session access token");
    return token;
  });
}

export default function Segmentations() {
  const { user, loading } = useAuth();
  const { flight_id } = useParams();
  const backendBaseUrl = getBackendBaseUrl();

  const [items, setItems] = useState<SegmentationRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!flight_id) return;
    setPending(true);
    setError(null);
    try {
      const token = await getTokenFromSession();
      const res = await fetch(`${backendBaseUrl}/api/flights/${flight_id}/segmentations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SegmentationRow[];
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load segmentations");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, flight_id]);

  return (
    <div className="space-y-4">
      <PageHeader title=" Segmentations" subtitle={flight_id ? `Flight: ${flight_id}` : "Select a flight"} gradient="gradient-analytics" />

      {error ? (
        <div className="rounded-xl border border-stress-severe/30 bg-stress-severe/10 text-stress-severe px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">{pending ? "Loading…" : `${items.length} result(s)`}</div>
        <Button onClick={() => refresh()} disabled={pending || !flight_id}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((s) => (
          <Card key={s.id ?? `${s.image_id}-${s.processed_at ?? ""}`}
            className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Image: {s.image_id}</div>
                <div className="text-xs text-muted-foreground">Stress: {s.stress_class || "—"}</div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                Confidence: {s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "—"}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Health score: {s.health_score != null ? `${Math.round(s.health_score * 10) / 10}/100` : "—"}
            </div>

            {s.heatmap_url ? (
              <img src={s.heatmap_url} alt="heatmap" className="w-full rounded-xl border border-border/40" />
            ) : (
              <div className="h-[160px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                No heatmap URL
              </div>
            )}
          </Card>
        ))}

        {!items.length && !pending ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No segmentations yet.</Card>
        ) : null}
      </div>
    </div>
  );
}

