import { ZoneData, healthLabel } from "@/lib/mockData";

export function NdviHeatmap({ zone }: { zone: ZoneData | null }) {
  if (!zone) return null;
  const h = healthLabel(zone.health_score);
  return (
    <div className="bg-card rounded-2xl shadow-soft border border-border/40 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
        <h3 className="font-display font-semibold">📸 Latest Capture</h3>
        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: h.color }}>{h.label}</span>
      </div>
      <div className="relative aspect-video bg-gradient-to-br from-[hsl(25_95%_53%)] via-[hsl(280_50%_40%)] to-[hsl(142_71%_45%)] overflow-hidden">
        <div className="absolute inset-0 opacity-60 mix-blend-overlay" style={{
          backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 2px, transparent 2px, transparent 12px)",
        }} />
        <div className="absolute bottom-3 left-3 text-white text-xs bg-black/40 px-2 py-1 rounded-md backdrop-blur">
          {zone.name} · {zone.gps.lat.toFixed(4)}, {zone.gps.lng.toFixed(4)}
        </div>
      </div>
    </div>
  );
}