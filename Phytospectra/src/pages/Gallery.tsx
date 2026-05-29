import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { MOCK_ZONES, ZoneData, healthLabel } from "@/lib/mockData";
import { X } from "lucide-react";

export default function Gallery() {
  const [selected, setSelected] = useState<ZoneData | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="🖼️ Image Gallery" subtitle="Drone captures across all flights" gradient="gradient-gallery" />
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {MOCK_ZONES.map((z, i) => {
          const h = healthLabel(z.health_score);
          const heights = ["h-48", "h-64", "h-56", "h-72"];
          return (
            <button key={z.id} onClick={() => setSelected(z)}
              className={`break-inside-avoid w-full ${heights[i % heights.length]} rounded-2xl overflow-hidden relative group shadow-soft hover:shadow-card transition-smooth`}>
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(25_95%_53%)] via-[hsl(280_50%_40%)] to-[hsl(142_71%_45%)] group-hover:scale-105 transition-smooth" />
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white text-left">
                <div className="text-sm font-semibold">{z.name}</div>
                <div className="text-[10px] opacity-80 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: h.color }} />
                  {h.label} · {z.health_score}/100
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card rounded-2xl max-w-3xl w-full overflow-hidden shadow-card animate-fade-slide-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <h3 className="font-display font-bold">{selected.name} · Comparison</h3>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              <div className="aspect-square rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-300" />
              <div className="aspect-square rounded-xl bg-gradient-to-br from-[hsl(25_95%_53%)] via-[hsl(280_50%_40%)] to-[hsl(142_71%_45%)]" />
            </div>
            <div className="px-4 pb-4 grid grid-cols-2 gap-2 text-xs text-center text-muted-foreground">
              <div>📷 RGB Drone Photo</div><div>🌡️ Multispectral Heatmap</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}