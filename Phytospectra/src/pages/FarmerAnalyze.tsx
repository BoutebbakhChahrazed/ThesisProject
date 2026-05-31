import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { AlertTriangle, Image as ImageIcon, UploadCloud, MapPin } from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";
import { Field } from "@/types/backend";

type ClassifyResponse = {
  zone_id: string;
  timestamp: string;
  gps: { lat: number; lng: number };
  health_score: number;
  stress_class: string;
  confidence: number;
  heatmap_url?: string;
  drone_image_url?: string;
};

function classLabelToSeverity(label: string) {
  const l = label.toLowerCase();
  if (l.includes("severe") || l.includes("drought")) return { tone: "red", title: "Severe" };
  if (l.includes("moderate")) return { tone: "amber", title: "Moderate" };
  if (l.includes("mild") || l.includes("nutrient") || l.includes("disease")) return { tone: "amber", title: "Mild" };
  return { tone: "green", title: "Healthy" };
}

function getTokenFromSession() {
  return supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (!token) throw new Error("Missing session access token");
    return token;
  });
}

export default function FarmerAnalyze() {
  const { role, loading, user } = useAuth() as {
    role: string;
    loading: boolean;
    user: { id: string } | null;
  };

  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [processing, setProcessing]         = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [result, setResult]                 = useState<ClassifyResponse | null>(null);

  // ── Fields ────────────────────────────────────────────────────────────
  const [fields, setFields]                 = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [fieldsLoading, setFieldsLoading]   = useState(false);

  const canShow = !loading && role === "farmer";

  const severity = useMemo(() => {
    if (!result) return null;
    return classLabelToSeverity(result.stress_class);
  }, [result]);

  // ── Fetch fields ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canShow) return;
    let active = true;

    const run = async () => {
      setFieldsLoading(true);
      try {
        const token = await getTokenFromSession();
        const res = await fetch(`${getBackendBaseUrl()}/api/fields`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Field[];
        if (!active) return;
        setFields(data);
        if (data.length > 0) setSelectedFieldId(data[0].id);
      } catch (e) {
        console.error("Fields fetch error:", e);
      } finally {
        if (active) setFieldsLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [canShow]);

  if (!canShow) return null;

  const onPickFile = (f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) { setSelectedFile(null); setPreviewUrl(null); return; }
    setSelectedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!selectedFile) return;
    if (!selectedFieldId) {
      setError("Please select a field before running analysis.");
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      if (!user?.id) { setError("User not found. Please sign in again."); return; }

      const token = await getTokenFromSession();

      if (!window.confirm("Upload this image and run analysis?")) return;

      const backendBaseUrl = getBackendBaseUrl();

      // ── Step 1: Upload via FastAPI ──────────────────────────────────
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("field_id", selectedFieldId);

      const uploadRes = await fetch(`${backendBaseUrl}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Upload failed (${uploadRes.status}): ${text}`);
      }

      const uploadData = await uploadRes.json();

      // ── Step 2: Analyze from storage ───────────────────────────────
      const analyzeRes = await fetch(`${backendBaseUrl}/api/analyze/from-storage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bucket: uploadData.bucket,
          object_path: uploadData.storage_path,
          flight_id: null,
        }),
      });

      if (!analyzeRes.ok) {
        const text = await analyzeRes.text();
        throw new Error(`Analysis failed (${analyzeRes.status}): ${text}`);
      }

      setResult((await analyzeRes.json()) as ClassifyResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze image");
    } finally {
      setProcessing(false);
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const canAnalyze = !!selectedFile && !!selectedFieldId && !processing;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Drone Image Analysis"
        subtitle="Upload multispectral images and run stress diagnostics"
        gradient="gradient-analytics"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UploadCloud className="h-4 w-4" />
          Patch-based classification + heatmap workflow
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left panel */}
        <Card className="p-5 lg:col-span-1 space-y-4">

          {/* Field selector — same design as Flights page */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Select field
            </Label>
            {fieldsLoading ? (
              <div className="text-xs text-muted-foreground animate-pulse">Loading fields…</div>
            ) : fields.length === 0 ? (
              <div className="text-xs text-amber-500">
                No fields found. Please create a field first.
              </div>
            ) : (
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedFieldId}
                onChange={(e) => setSelectedFieldId(e.target.value)}
                disabled={processing}
              >
                <option value="">— Select a field —</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File picker */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Upload image
            </Label>
            <input
              id="multispectral-upload"
              type="file"
              accept=".tif,.tiff,.png,.jpg,.jpeg"
              className="w-full text-sm"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              disabled={processing}
            />
          </div>

          {/* Summary card */}
          {selectedFile && selectedFieldId && (
            <div className="rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium text-foreground">Field:</span> {selectedField?.field_name}</div>
              <div><span className="font-medium text-foreground">File:</span> {selectedFile.name}</div>
              <div><span className="font-medium text-foreground">Size:</span> {(selectedFile.size / 1024).toFixed(1)} KB</div>
            </div>
          )}

          <Button onClick={analyze} className="w-full" disabled={!canAnalyze}>
            {processing ? "Processing…" : "Run AI classification"}
          </Button>

          {error && (
            <div className="rounded-xl border border-amber/30 bg-amber/10 text-amber px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Tip: the backend processes images via the{" "}
            <span className="font-semibold">WATCHED_FOLDER</span> pipeline.
          </div>
        </Card>

        {/* Right panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Preview</h3>
            {previewUrl ? (
              <div className="rounded-xl border border-border/40 bg-muted overflow-hidden">
                <img src={previewUrl} alt="Selected" className="w-full max-h-[420px] object-contain" />
              </div>
            ) : (
              <div className="h-[220px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                No file selected.
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Result</h3>
            {!result ? (
              <div className="text-sm text-muted-foreground">
                Run classification to see stress label and confidence.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Stress class</div>
                    <div className="font-bold">{result.stress_class}</div>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <div className="font-bold">{Math.round(result.confidence * 100)}%</div>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Health score</div>
                    <div className="font-bold">{Math.round(result.health_score)}/100</div>
                  </div>
                  {severity && (
                    <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                      <div className="text-xs text-muted-foreground">Severity</div>
                      <div className="font-bold">{severity.title}</div>
                    </div>
                  )}
                </div>

                {result.gps && (
                  <div className="text-xs text-muted-foreground">
                    GPS: {result.gps.lat.toFixed(6)}, {result.gps.lng.toFixed(6)}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Heatmap</div>
                    {result.heatmap_url ? (
                      <img src={result.heatmap_url} alt="Heatmap" className="w-full rounded-xl border border-border/40" />
                    ) : (
                      <div className="h-[180px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                        No heatmap available.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Drone image</div>
                    {result.drone_image_url ? (
                      <img src={result.drone_image_url} alt="Drone" className="w-full rounded-xl border border-border/40" />
                    ) : (
                      <div className="h-[180px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                        No drone image available.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}