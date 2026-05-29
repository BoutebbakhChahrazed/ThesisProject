import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { AlertTriangle, Image as ImageIcon, UploadCloud } from "lucide-react";
import { uploadRawMultispectralImage } from "@/lib/uploadRawMultispectral";
import { getBackendBaseUrl } from "@/lib/backend";

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

export default function FarmerAnalyze() {
  const { role, loading, user } = useAuth() as {
    role: string;
    loading: boolean;
    user: { id: string } | null;
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResponse | null>(null);

  const canShow = !loading && role === "farmer";

  const severity = useMemo(() => {
    if (!result) return null;
    return classLabelToSeverity(result.stress_class);
  }, [result]);

  if (!canShow) return null;

  const onPickFile = (f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    setSelectedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!selectedFile) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Validate file type
      if (!selectedFile.type) {
        setError("File type is missing. Please upload a valid multispectral image file.");
        return;
      }

      // Validate user
      if (!user?.id) {
        setError("User not found. Please sign in again.");
        return;
      }

      // Validate session and get access token for backend
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError("Session expired. Please sign in again.");
        return;
      }

      if (!window.confirm("Upload this image to Supabase Storage and run manual analysis?")) {
        return;
      }

      const userId = user.id;
      const fieldId = "default-field";
      const flightId = "manual-camera";
      const bucket = "multispectral";

      // 1) Upload to Supabase Storage
      await uploadRawMultispectralImage({
        file: selectedFile,
        userId,
        fieldId,
        flightId,
        bucket,
      });

      // 2) Build the object path using the same sanitization as the upload util
      const sanitize = (s: string) =>
        s.replace(/\\/g, "_").replace(/\//g, "_").replace(/%/g, "_%");

      const objectPath = [
        sanitize(userId),
        sanitize(fieldId),
        sanitize(flightId),
        sanitize(selectedFile.name || ""),
      ].join("/");

      // 3) Call FastAPI — pass JWT as Bearer token
      const backendBaseUrl = getBackendBaseUrl();
      const res = await fetch(`${backendBaseUrl}/api/analyze/from-storage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          bucket,
          object_path: objectPath,
          flight_id: null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Analysis failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as ClassifyResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze image");
    } finally {
      setProcessing(false);
    }
  };

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
        {/* Left panel — upload controls */}
        <Card className="p-5 lg:col-span-1 space-y-4">
          <div>
            <div className="font-semibold mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Upload image
            </div>
            <label className="sr-only" htmlFor="multispectral-upload">
              Upload multispectral image
            </label>
            <input
              id="multispectral-upload"
              type="file"
              accept=".tif,.tiff,.png,.jpg,.jpeg"
              className="w-full"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              disabled={processing}
            />
          </div>

          <Button
            onClick={analyze}
            className="w-full"
            disabled={!selectedFile || processing}
          >
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

        {/* Right panel — preview + results */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Preview</h3>
            {previewUrl ? (
              <div className="rounded-xl border border-border/40 bg-muted overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Selected"
                  className="w-full max-h-[420px] object-contain"
                />
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
                {/* Metrics row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Stress class</div>
                    <div className="font-bold">{result.stress_class}</div>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <div className="font-bold">
                      {Math.round(result.confidence * 100)}%
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">Health score</div>
                    <div className="font-bold">
                      {Math.round(result.health_score)}/100
                    </div>
                  </div>
                  {severity && (
                    <div className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                      <div className="text-xs text-muted-foreground">Severity</div>
                      <div className="font-bold">{severity.title}</div>
                    </div>
                  )}
                </div>

                {/* GPS */}
                {result.gps && (
                  <div className="text-xs text-muted-foreground">
                    GPS: {result.gps.lat.toFixed(6)}, {result.gps.lng.toFixed(6)}
                  </div>
                )}

                {/* Images */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Heatmap</div>
                    {result.heatmap_url ? (
                      <img
                        src={result.heatmap_url}
                        alt="Heatmap"
                        className="w-full rounded-xl border border-border/40"
                      />
                    ) : (
                      <div className="h-[180px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                        No heatmap available.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Drone image</div>
                    {result.drone_image_url ? (
                      <img
                        src={result.drone_image_url}
                        alt="Drone"
                        className="w-full rounded-xl border border-border/40"
                      />
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