import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { getBackendBaseUrl } from "@/lib/backend";
import { X, ChevronDown, ChevronRight, ImageOff, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Flight } from "@/types/backend";

// ── Types ──────────────────────────────────────────────────────────────────

type ImageRow = {
  id: string;
  storage_path: string;
  bucket_name: string;
  flight_id: string | null;
  field_id: string | null;
  gps: { lat: number; lng: number } | null;
  upload_source: string;
  uploaded_at: string;
  publicUrl?: string;
};

type SelectedImage = ImageRow & { fieldName: string; flightLabel: string };

// ── Helpers ────────────────────────────────────────────────────────────────

function getTokenFromSession() {
  return supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (!token) throw new Error("Missing session access token");
    return token;
  });
}

async function resolveSignedUrls(imgs: ImageRow[]): Promise<ImageRow[]> {
  if (imgs.length === 0) return imgs;

  const byBucket: Record<string, ImageRow[]> = {};
  for (const img of imgs) {
    if (!img.storage_path || !img.bucket_name) continue;
    byBucket[img.bucket_name] = byBucket[img.bucket_name] || [];
    byBucket[img.bucket_name].push(img);
  }

  const urlMap: Record<string, string> = {};

  for (const [bucket, bucketImgs] of Object.entries(byBucket)) {
    const paths = bucketImgs.map((img) => img.storage_path);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, 60 * 60); // 1-hour expiry

    if (error) {
      console.error(`Signed URL error for bucket "${bucket}":`, error);
      continue;
    }

    for (const entry of data ?? []) {
      if (entry.signedUrl) urlMap[entry.path] = entry.signedUrl;
    }
  }

  return imgs.map((img) => ({
    ...img,
    publicUrl: urlMap[img.storage_path],
  }));
}

// ── Section (collapsible) ──────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="font-semibold">{title}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {count} image{count !== 1 ? "s" : ""}
        </span>
      </button>
      {open && <div className="pl-6">{children}</div>}
    </div>
  );
}

// ── Image grid (masonry) ───────────────────────────────────────────────────

const HEIGHTS = ["h-40", "h-52", "h-44", "h-60", "h-48"];

function ImageGrid({
  images,
  onSelect,
}: {
  images: ImageRow[];
  onSelect: (img: ImageRow) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <ImageOff className="h-4 w-4" /> No images
      </div>
    );
  }

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3 space-y-3">
      {images.map((img, i) => (
        <button
          key={img.id}
          onClick={() => onSelect(img)}
          className={`break-inside-avoid w-full ${HEIGHTS[i % HEIGHTS.length]} rounded-2xl overflow-hidden relative group shadow-soft hover:shadow-card transition-smooth`}
        >
          {img.publicUrl ? (
            <img
              src={img.publicUrl}
              alt="Field image"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-smooth"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 via-green-600 to-lime-400 group-hover:scale-105 transition-smooth" />
          )}
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white text-left">
            <div className="text-[10px] opacity-80">
              {img.upload_source === "manual" ? "📷 Manual" : "🛸 Drone"}{" "}
              · {new Date(img.uploaded_at).toLocaleDateString()}
            </div>
            {img.gps && (
              <div className="text-[9px] opacity-60">
                {img.gps.lat.toFixed(4)}, {img.gps.lng.toFixed(4)}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({ image, onClose }: { image: SelectedImage; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl max-w-3xl w-full overflow-hidden shadow-card animate-fade-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <div>
            <h3 className="font-display font-bold">{image.fieldName}</h3>
            <p className="text-xs text-muted-foreground">{image.flightLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image */}
        <div className="p-4">
          {image.publicUrl ? (
            <img
              src={image.publicUrl}
              alt="Full size"
              className="w-full rounded-xl object-contain max-h-[60vh]"
            />
          ) : (
            <div className="w-full h-64 rounded-xl bg-muted flex items-center justify-center text-sm text-muted-foreground">
              <ImageOff className="h-6 w-6 mr-2" /> No preview available
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="px-4 pb-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Source:</span>{" "}
            {image.upload_source}
          </div>
          <div>
            <span className="font-medium text-foreground">Uploaded:</span>{" "}
            {new Date(image.uploaded_at).toLocaleString()}
          </div>
          {image.gps && (
            <div className="col-span-2">
              <span className="font-medium text-foreground">GPS:</span>{" "}
              {image.gps.lat.toFixed(6)}, {image.gps.lng.toFixed(6)}
            </div>
          )}
          <div className="col-span-2 text-[10px] break-all opacity-50">
            {image.storage_path}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Gallery page ──────────────────────────────────────────────────────

export default function Gallery() {
  const [fields, setFields]   = useState<Field[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [images, setImages]   = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedImage | null>(null);

  const base = getBackendBaseUrl();

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenFromSession();
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch fields, flights, images in parallel
        const [fieldsRes, flightsRes, imagesRes] = await Promise.all([
          fetch(`${base}/api/fields`,          { headers }),
          fetch(`${base}/api/flights`,         { headers }),
          fetch(`${base}/api/images?limit=200`, { headers }),
        ]);

        if (!fieldsRes.ok)  throw new Error(`Fields: ${await fieldsRes.text()}`);
        if (!flightsRes.ok) throw new Error(`Flights: ${await flightsRes.text()}`);
        if (!imagesRes.ok)  throw new Error(`Images: ${await imagesRes.text()}`);

        const [fieldsData, flightsData, rawImages]: [Field[], Flight[], ImageRow[]] =
          await Promise.all([fieldsRes.json(), flightsRes.json(), imagesRes.json()]);

        if (!active) return;

        // Resolve signed URLs in one batch per bucket
        const withUrls = await resolveSignedUrls(rawImages);

        setFields(fieldsData);
        setFlights(flightsData);
        setImages(withUrls);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load gallery");
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [base]);

  // ── Group: field → flights + manual ─────────────────────────────────────
  const grouped = fields.map((field) => {
    const fieldImgs    = images.filter((img) => img.field_id === field.id);
    const fieldFlights = flights.filter((fl)  => fl.field_id === field.id);

    const byFlight = fieldFlights.map((fl) => ({
      flight: fl,
      imgs:   fieldImgs.filter((img) => img.flight_id === fl.id),
    }));

    const manual = fieldImgs.filter((img) => img.flight_id === null);

    return { field, byFlight, manual, total: fieldImgs.length };
  });

  const unlinked = images.filter((img) => img.field_id === null);

  const openLightbox = (img: ImageRow, fieldName: string, flightLabel: string) =>
    setSelected({ ...img, fieldName, flightLabel });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="🖼️ Image Gallery"
        subtitle="All field images grouped by field and flight"
        gradient="gradient-gallery"
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading images…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="p-4 text-sm text-red-600 border-red-200 bg-red-50">
          {error}
        </Card>
      )}

      {/* Content */}
      {!loading && !error && (
        <div className="space-y-4">

          {/* Per-field cards */}
          {grouped.map(({ field, byFlight, manual, total }) => (
            <Card key={field.id} className="p-5 space-y-4">
              <Section
                title={`📍 ${field.field_name}`}
                subtitle={field.crop_type ? `· ${field.crop_type}` : undefined}
                count={total}
                defaultOpen
              >
                <div className="space-y-5">

                  {/* Flight sub-sections */}
                  {byFlight.map(({ flight, imgs }) => (
                    <Section
                      key={flight.id}
                      title="🛸 Flight"
                      subtitle={`· ${new Date(
                        (flight as any).flight_date ?? (flight as any).created_at
                      ).toLocaleDateString()}`}
                      count={imgs.length}
                      defaultOpen={imgs.length > 0}
                    >
                      <ImageGrid
                        images={imgs}
                        onSelect={(img) =>
                          openLightbox(
                            img,
                            field.field_name,
                            `Flight · ${new Date(
                              (flight as any).flight_date ?? (flight as any).created_at
                            ).toLocaleDateString()}`
                          )
                        }
                      />
                    </Section>
                  ))}

                  {/* Manual / no-flight */}
                  {manual.length > 0 && (
                    <Section
                      title="📷 Manual uploads"
                      subtitle="· no flight"
                      count={manual.length}
                      defaultOpen
                    >
                      <ImageGrid
                        images={manual}
                        onSelect={(img) =>
                          openLightbox(img, field.field_name, "Manual upload")
                        }
                      />
                    </Section>
                  )}

                  {/* Empty field */}
                  {byFlight.length === 0 && manual.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                      <ImageOff className="h-4 w-4" /> No images for this field yet.
                    </div>
                  )}
                </div>
              </Section>
            </Card>
          ))}

          {/* Unlinked (no field) */}
          {unlinked.length > 0 && (
            <Card className="p-5">
              <Section
                title="🗂️ Unlinked images"
                subtitle="· no field assigned"
                count={unlinked.length}
              >
                <ImageGrid
                  images={unlinked}
                  onSelect={(img) => openLightbox(img, "Unknown field", "No flight")}
                />
              </Section>
            </Card>
          )}

          {/* Empty state */}
          {images.length === 0 && (
            <Card className="p-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
              <ImageOff className="h-10 w-10 opacity-30" />
              <div className="text-sm">
                No images yet. Upload from the{" "}
                <span className="font-semibold">Analyze</span> page or during a flight.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <Lightbox image={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}