import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import {
  AlertTriangle, Image as ImageIcon, UploadCloud, MapPin,
  Camera, Wifi, WifiOff, Plug, PlugZap, RefreshCw,
  FolderOpen, Play, Battery, HardDrive, Loader2,
} from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";
import { analyzeFromStorageViaWebSocket } from "@/lib/analyze";
import {
  CAMERA_HOST,
  CAMERA_PHOTO_DIR,
  cameraPhotoUrl,
  cameraProxyUrl,
  downloadCameraPhoto,
  fetchCameraFileList,
  probeCameraViaProxy,
  triggerCameraCapture,
} from "@/lib/camera";
import { Field } from "@/types/backend";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type CamStatus = {
  battery?: string;
  gps?: string;
  storage?: string;
  count?: number;
  firmware?: string;
};

type ConnState = "idle" | "connecting" | "connected" | "error";
type LogEntry = { t: string; m: string; k: "ok" | "err" | "info" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function classLabelToSeverity(label: string) {
  const l = label.toLowerCase();
  if (l.includes("severe") || l.includes("drought")) return { tone: "red", title: "Severe" };
  if (l.includes("moderate")) return { tone: "amber", title: "Moderate" };
  if (l.includes("mild") || l.includes("nutrient") || l.includes("disease")) return { tone: "amber", title: "Mild" };
  return { tone: "green", title: "Healthy" };
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Missing session access token");
  return token;
}

function nowStr() {
  return new Date().toLocaleTimeString();
}

function revokeIfBlobUrl(url: string | null | undefined) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

// ── CameraPanel ───────────────────────────────────────────────────────────────

interface CameraPanelProps {
  selectedFieldId: string;
  onFileReady: (file: File, previewUrl: string) => void;
  onStorageReady: (storagePath: string, bucket: string, imageId?: string) => void;
  onError: (msg: string) => void;
}

function CameraPanel({ selectedFieldId, onStorageReady, onError }: CameraPanelProps) {
  const [conn, setConn] = useState<ConnState>("idle");
  const [mock, setMock] = useState(false);
  const [status, setStatus] = useState<CamStatus>({});
  const [files, setFiles] = useState<string[]>([]);
  const [selFile, setSelFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingF, setLoadingF] = useState(false);
  const [working, setWorking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const B = getBackendBaseUrl();
  const connected = conn === "connected";

  const MOCK_FILES = ["IMG_0001.JPG", "IMG_0002.JPG", "IMG_0003.JPG", "IMG_0004.JPG", "IMG_0005.JPG", "IMG_0006.JPG"];

  const addLog = useCallback((m: string, k: LogEntry["k"] = "info") => {
    setLogs(p => [...p.slice(-49), { t: nowStr(), m, k }]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(preview);
    };
  }, [preview]);

  async function detectCamera() {
    setConn("connecting");
    setMock(false);
    addLog(`Checking camera at ${CAMERA_HOST} (join MAPIR WiFi in Windows first)…`);

    try {
      const probe = await probeCameraViaProxy();
      if (!probe.ok) {
        throw new Error(probe.error ?? "timeout");
      }

      setConn("connected");
      addLog(`Camera detected at ${CAMERA_HOST} (${probe.path}).`, "ok");

      try {
        const sr = await fetch(
          cameraProxyUrl("/get_params.cgi", "param=battery_level,storage_free,gps_status")
        );
        const st = await sr.text();
        const pairs: Record<string, string> = {};
        st.split("\n").forEach(line => {
          const [k, v] = line.split("=");
          if (k && v) pairs[k.trim()] = v.trim();
        });
        setStatus({
          battery: pairs["battery_level"] ? `${pairs["battery_level"]}%` : undefined,
          gps: pairs["gps_status"] ?? undefined,
          storage: pairs["storage_free"] ? `${pairs["storage_free"]} free` : undefined,
        });
      } catch {
        // status is non-critical
      }

      await listFiles(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConn("error");
      setMock(false);
      setStatus({});
      setFiles([]);
      addLog(
        `Camera not reachable (${msg}). Join the MAPIR hotspot in Windows Wi‑Fi, open http://${CAMERA_HOST} in your browser to verify, then try again.`,
        "err"
      );
    }
  }

  function enableDemoMode() {
    setMock(true);
    setConn("connected");
    setStatus({ battery: "82%", gps: "Fixed · 6 sats", storage: "14.2 GB free", count: 124 });
    setFiles(MOCK_FILES);
    addLog("Demo mode enabled (no real camera).", "info");
  }

  function clearCameraSession() {
    revokeIfBlobUrl(preview);
    setConn("idle");
    setMock(false);
    setStatus({});
    setFiles([]);
    setSelFile(null);
    setPreview(null);
    addLog("Camera session cleared.");
  }

  async function listFiles(forceMock = mock) {
    setLoadingF(true);
    addLog(`Listing ${CAMERA_PHOTO_DIR}/…`);

    if (forceMock) {
      setFiles(MOCK_FILES);
      addLog(`${MOCK_FILES.length} files (demo)`, "ok");
      setLoadingF(false);
      return;
    }

    try {
      const names = await fetchCameraFileList();
      if (names.length === 0) throw new Error("No photos found in /DCIM/PHOTO");

      setFiles(names);
      setStatus(s => ({ ...s, count: names.length }));
      addLog(`${names.length} files loaded.`, "ok");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`List failed: ${msg}`, "err");
      setFiles([]);
    } finally {
      setLoadingF(false);
    }
  }

  async function selectFile(fn: string) {
    setSelFile(fn);
    addLog(`Selected: ${fn}`);

    revokeIfBlobUrl(preview);
    setPreview(null);

    if (mock) return;

    try {
      const blob = await downloadCameraPhoto(fn);
      const objectUrl = URL.createObjectURL(blob);
      setPreview(objectUrl);
      addLog(`Preview loaded: ${fn}`, "ok");
    } catch (e: unknown) {
      addLog(`Preview failed: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
  }

  async function snapshot() {
    addLog("Triggering shutter…");

    if (mock) {
      addLog("Snapshot (demo).", "ok");
      return;
    }

    try {
      await triggerCameraCapture();
      await new Promise(resolve => setTimeout(resolve, 2500));
      await listFiles(false);
      addLog("Snapshot captured.", "ok");
    } catch (e: unknown) {
      addLog(`Snapshot failed: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
  }

  async function captureAndAnalyze() {
    if (!selectedFieldId) {
      onError("Please select a field first.");
      return;
    }

    if (mock) {
      addLog("Demo mode: use manual upload instead.", "err");
      return;
    }

    setWorking(true);
    addLog("Capture → upload → analyze…");

    try {
      await triggerCameraCapture();
      await new Promise(r => setTimeout(r, 2500));

      const names = await fetchCameraFileList();
      if (names.length === 0) throw new Error("No files found after capture");
      const latest = names[names.length - 1];

      addLog(`Downloading ${latest} from camera…`);
      const blob = await downloadCameraPhoto(latest);
      const file = new File([blob], latest, { type: blob.type || "image/jpeg" });

      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field_id", selectedFieldId);

      const uploadRes = await fetch(`${B}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
      const { storage_path, bucket, image_id } = await uploadRes.json();

      addLog("Captured, uploaded, analyzing…", "ok");
      onStorageReady(storage_path, bucket, image_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Failed: ${msg}`, "err");
      onError(msg);
    } finally {
      setWorking(false);
    }
  }

  async function analyzeSelected() {
    if (!selFile || !selectedFieldId) return;
    if (mock) {
      addLog("Demo mode: cannot fetch real file.", "err");
      return;
    }

    setWorking(true);
    addLog(`Downloading ${selFile} from camera…`);

    try {
      const blob = await downloadCameraPhoto(selFile);
      const file = new File([blob], selFile, { type: blob.type || "image/jpeg" });

      addLog(`Uploading ${selFile} to backend…`);
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field_id", selectedFieldId);

      const uploadRes = await fetch(`${B}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
      const { storage_path, bucket, image_id } = await uploadRes.json();

      addLog(`${selFile} uploaded.`, "ok");
      onStorageReady(storage_path, bucket, image_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Failed: ${msg}`, "err");
      onError(msg);
    } finally {
      setWorking(false);
    }
  }

  const connColor = {
    idle: "text-muted-foreground",
    connecting: "text-amber-500",
    connected: "text-green-600",
    error: "text-red-500",
  }[conn];

  const connLabel = {
    idle: "Not detected",
    connecting: "Checking…",
    connected: mock ? "Demo data" : "Camera ready",
    error: "Not reachable",
  }[conn];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Camera className="h-4 w-4" /> MAPIR Survey W3
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${connColor}`}>
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connLabel}
          {mock && <span className="ml-1 text-[10px] text-amber-500">(demo)</span>}
        </span>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs space-y-2">
        <p className="font-medium text-foreground">Step 1 — Connect in Windows (not in this app)</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Open <span className="font-medium text-foreground">Settings → Network &amp; internet → Wi‑Fi</span></li>
          <li>Join the camera hotspot: <span className="font-mono text-foreground">MAPIR-S3WRGN-dbddbe</span></li>
          <li>Return here and click <span className="font-medium text-foreground">Detect camera</span></li>
        </ol>
      </div>

      <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs font-mono space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground font-sans">Hotspot SSID</span>
          <span>MAPIR-S3WRGN-dbddbe</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground font-sans">Camera IP (after Wi‑Fi join)</span>
          <span>{CAMERA_HOST}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground font-sans">Photo folder</span>
          <span>{CAMERA_PHOTO_DIR}/</span>
        </div>
        <div className="pt-1 font-sans">
          <a
            href={`http://${CAMERA_HOST}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Test in browser: http://{CAMERA_HOST}
          </a>
        </div>
      </div>

      {conn === "error" && (
        <div className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber space-y-2">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Camera not found at {CAMERA_HOST}. Join the MAPIR hotspot in Windows Wi‑Fi, open{" "}
            <a href={`http://${CAMERA_HOST}`} target="_blank" rel="noreferrer" className="underline">
              http://{CAMERA_HOST}
            </a>{" "}
            in your browser — if that fails, the PC is not on the camera network yet.
          </p>
          <Button size="sm" variant="outline" onClick={enableDemoMode} className="h-7 text-xs">
            Use demo mode (no camera)
          </Button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={detectCamera} disabled={connected || conn === "connecting"} className="gap-1.5">
          <Plug className="h-3.5 w-3.5" />
          {conn === "connecting" ? "Checking…" : "Detect camera"}
        </Button>

        <Button size="sm" variant="outline" onClick={() => listFiles()} disabled={!connected} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={clearCameraSession}
          disabled={conn === "idle" || conn === "connecting"}
          className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <PlugZap className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      {connected && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: <Battery className="h-3 w-3" />, label: "Battery", val: status.battery },
            { icon: <MapPin className="h-3 w-3" />, label: "GPS", val: status.gps },
            { icon: <HardDrive className="h-3 w-3" />, label: "Storage", val: status.storage },
            { icon: <ImageIcon className="h-3 w-3" />, label: "Photos", val: status.count != null ? String(status.count) : undefined },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-border/40 bg-card px-3 py-2">
              <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
                {m.icon} {m.label}
              </div>
              <div className="text-sm font-semibold">{m.val ?? "—"}</div>
            </div>
          ))}
        </div>
      )}

      {connected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Preview</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={snapshot} disabled={working || mock} className="h-7 text-xs gap-1">
                <Camera className="h-3 w-3" /> Snapshot
              </Button>

              <Button size="sm" onClick={captureAndAnalyze} disabled={working || !selectedFieldId || mock} className="h-7 text-xs gap-1">
                {working ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" /> Capture + Analyze
                  </>
                )}
              </Button>
            </div>
          </div>

          {!selectedFieldId && (
            <p className="text-[11px] text-amber-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Select a field above before capturing.
            </p>
          )}

          <div className="rounded-xl border border-dashed border-border/50 bg-muted/40 overflow-hidden flex items-center justify-center min-h-[130px]">
            {preview ? (
              <img
                src={preview}
                alt="Camera preview"
                className="w-full max-h-[180px] object-contain"
                onError={() => setPreview(null)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {mock ? "Demo mode — no real preview" : "Select a file below or take a snapshot"}
              </span>
            )}
          </div>
        </div>
      )}

      {connected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1">
              <FolderOpen className="h-3.5 w-3.5" /> {CAMERA_PHOTO_DIR}/
            </span>

            <Button size="sm" variant="ghost" onClick={() => listFiles()} disabled={loadingF} className="h-6 text-xs gap-1 px-2">
              <RefreshCw className={`h-3 w-3 ${loadingF ? "animate-spin" : ""}`} />
              {loadingF ? "Loading…" : "Reload"}
            </Button>
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No files found. Click Reload.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {files.map(fn => {
                const thumbUrl = mock ? null : cameraPhotoUrl(fn);

                return (
                  <div
                    key={fn}
                    onClick={() => selectFile(fn)}
                    className={`aspect-[4/3] rounded-lg border cursor-pointer relative overflow-hidden flex items-center justify-center
                      ${selFile === fn ? "border-primary bg-primary/5" : "border-border/40 bg-muted/40 hover:border-border"}`}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={fn}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground/40">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-[8px] text-white px-1 py-0.5 truncate z-10">
                      {fn}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selFile && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-muted-foreground truncate flex-1 font-mono">{selFile}</span>

              <Button size="sm" onClick={analyzeSelected} disabled={working || !selectedFieldId || mock} className="h-7 text-xs gap-1 shrink-0">
                {working ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" /> Analyze selected
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div
          ref={logRef}
          className="rounded-lg bg-muted/50 border border-border/30 px-2.5 py-2 font-mono text-[10px] max-h-24 overflow-y-auto space-y-0.5"
        >
          {logs.map((l, i) => (
            <div
              key={i}
              className={
                l.k === "ok"
                  ? "text-green-600 dark:text-green-400"
                  : l.k === "err"
                    ? "text-red-500"
                    : "text-muted-foreground"
              }
            >
              [{l.t}] {l.m}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FarmerAnalyze() {
  const { role, loading, user } = useAuth() as {
    role: string;
    loading: boolean;
    user: { id: string } | null;
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [fieldsLoading, setFieldsLoading] = useState(false);

  const canShow = !loading && role === "farmer";

  const severity = useMemo(() => {
    if (!result) return null;
    return classLabelToSeverity(result.stress_class);
  }, [result]);

  useEffect(() => {
    if (!canShow) return;

    let active = true;

    (async () => {
      setFieldsLoading(true);
      try {
        const token = await getToken();
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
    })();

    return () => {
      active = false;
    };
  }, [canShow]);

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(previewUrl);
    };
  }, [previewUrl]);

  if (!canShow) return null;

  const runAnalyze = async (
    storagePath: string,
    bucket: string,
    imageId?: string,
    uploadSource: "manual" | "camera" = "camera",
  ) => {
    setProcessing(true);
    setProgressMessage("Connecting to AI pipeline…");
    setError(null);
    setResult(null);

    try {
      const token = await getToken();
      const analysis = await analyzeFromStorageViaWebSocket(
        {
          object_path: storagePath,
          bucket,
          field_id: selectedFieldId,
          image_id: imageId,
          flight_id: null,
          upload_source: uploadSource,
        },
        token,
        setProgressMessage,
      );

      setResult(analysis);

      if (analysis.drone_image_url) {
        revokeIfBlobUrl(previewUrl);
        setPreviewUrl(analysis.drone_image_url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze image");
    } finally {
      setProcessing(false);
      setProgressMessage(null);
    }
  };

  const onPickFile = (f: File | null) => {
    setError(null);
    setResult(null);

    revokeIfBlobUrl(previewUrl);

    if (!f) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setSelectedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!selectedFile || !selectedFieldId) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      if (!user?.id) throw new Error("User not found. Please sign in again.");
      const token = await getToken();

      if (!window.confirm("Upload this image and run analysis?")) {
        setProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("field_id", selectedFieldId);

      const uploadRes = await fetch(`${getBackendBaseUrl()}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
      }

      const { storage_path, bucket, image_id } = await uploadRes.json();
      await runAnalyze(storage_path, bucket, image_id, "manual");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze image");
      setProcessing(false);
    }
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);
  const canAnalyze = !!selectedFile && !!selectedFieldId && !processing;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Drone Image Analysis"
        subtitle="Join the MAPIR WiFi in Windows, then detect the camera — or upload images manually"
        gradient="gradient-analytics"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UploadCloud className="h-4 w-4" />
          Patch-based classification + heatmap workflow
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 space-y-3">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Select field
            </Label>

            {fieldsLoading ? (
              <div className="text-xs text-muted-foreground animate-pulse">Loading fields…</div>
            ) : fields.length === 0 ? (
              <div className="text-xs text-amber-500">No fields found. Please create a field first.</div>
            ) : (
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedFieldId}
                onChange={e => setSelectedFieldId(e.target.value)}
                disabled={processing}
              >
                <option value="">— Select a field —</option>
                {fields.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
            )}
          </Card>

          <CameraPanel
            selectedFieldId={selectedFieldId}
            onFileReady={(file, prev) => {
              setSelectedFile(file);
              setPreviewUrl(prev);
              setError(null);
              setResult(null);
            }}
            onStorageReady={runAnalyze}
            onError={setError}
          />

          <Card className="p-4 space-y-4">
            <div className="font-semibold text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Or upload manually
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Image file
              </Label>
              <input
                id="multispectral-upload"
                type="file"
                accept=".tif,.tiff,.png,.jpg,.jpeg"
                className="w-full text-sm"
                onChange={e => onPickFile(e.target.files?.[0] ?? null)}
                disabled={processing}
              />
            </div>

            {selectedFile && selectedFieldId && (
              <div className="rounded-xl border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium text-foreground">Field:</span> {selectedField?.field_name}
                </div>
                <div>
                  <span className="font-medium text-foreground">File:</span> {selectedFile.name}
                </div>
                <div>
                  <span className="font-medium text-foreground">Size:</span> {(selectedFile.size / 1024).toFixed(1)} KB
                </div>
              </div>
            )}

            <Button onClick={analyze} className="w-full" disabled={!canAnalyze}>
              {processing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </span>
              ) : (
                "Run AI classification"
              )}
            </Button>

            {error && (
              <div className="rounded-xl border border-amber/30 bg-amber/10 text-amber px-4 py-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Images are saved to Supabase storage first, then analyzed via WebSocket so your AI model always reads the stored file.
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Preview</h3>
            {previewUrl ? (
              <div className="rounded-xl border border-border/40 bg-muted overflow-hidden">
                <img src={previewUrl} alt="Selected" className="w-full max-h-[420px] object-contain" />
              </div>
            ) : (
              <div className="h-[220px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                Connect your MAPIR W3 or upload an image manually.
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold">Result</h3>

            {processing && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                {progressMessage ?? "Running classification pipeline…"}
              </div>
            )}

            {!result && !processing && (
              <div className="text-sm text-muted-foreground">
                Run classification to see stress label and confidence.
              </div>
            )}

            {result && !processing && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { label: "Stress class", val: result.stress_class },
                    { label: "Confidence", val: `${Math.round(result.confidence * 100)}%` },
                    { label: "Health score", val: `${Math.round(result.health_score)}/100` },
                    ...(severity ? [{ label: "Severity", val: severity.title }] : []),
                  ].map(m => (
                    <div key={m.label} className="rounded-2xl border border-border/40 bg-card px-4 py-3">
                      <div className="text-xs text-muted-foreground">{m.label}</div>
                      <div className="font-bold">{m.val}</div>
                    </div>
                  ))}
                </div>

                {result.gps && (
                  <div className="text-xs text-muted-foreground">
                    GPS: {result.gps.lat.toFixed(6)}, {result.gps.lng.toFixed(6)}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: "Heatmap", src: result.heatmap_url },
                    { label: "Drone image", src: result.drone_image_url },
                  ].map(img => (
                    <div key={img.label}>
                      <div className="text-xs text-muted-foreground mb-2">{img.label}</div>
                      {img.src ? (
                        <img src={img.src} alt={img.label} className="w-full rounded-xl border border-border/40" />
                      ) : (
                        <div className="h-[180px] rounded-xl border border-dashed border-border/50 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                          No {img.label.toLowerCase()} available.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
