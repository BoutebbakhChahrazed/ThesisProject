import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { ZoneData, healthLabel } from "@/lib/mockData";

const droneIcon = L.divIcon({
  className: "",
  html: `<div style="font-size:24px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));">🚁</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

function MapLegend() {
  const items = [
    { c: "hsl(142 71% 45%)", l: "Healthy" },
    { c: "hsl(48 96% 53%)", l: "Mild Stress" },
    { c: "hsl(25 95% 53%)", l: "Moderate" },
    { c: "hsl(0 84% 60%)", l: "Severe" },
  ];
  return (
    <div className="absolute bottom-3 right-3 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-card p-3 text-xs space-y-1.5">
      <div className="font-semibold mb-1">🌱 Health Legend</div>
      {items.map(i => (
        <div key={i.l} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded" style={{ background: i.c }} /> {i.l}
        </div>
      ))}
    </div>
  );
}

function Resize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function FieldMap({
  zones, onZoneClick, dronePos,
}: { zones: ZoneData[]; onZoneClick: (z: ZoneData) => void; dronePos: [number, number] }) {
  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden shadow-card border border-border/40">
      <MapContainer center={[36.48, 2.95]} zoom={14} className="h-full w-full" zoomControl={false}>
        <Resize />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles © Esri"
          maxZoom={19}
        />
        {zones.map(z => {
          const h = healthLabel(z.health_score);
          return (
            <Polygon
              key={z.id}
              positions={z.polygon}
              pathOptions={{ color: h.color, fillColor: h.color, fillOpacity: 0.35, weight: 2 }}
              eventHandlers={{ click: () => onZoneClick(z) }}
            >
              <Tooltip sticky>
                <strong>{z.name}</strong> — {h.label} ({z.health_score}/100)
              </Tooltip>
            </Polygon>
          );
        })}
        <Marker position={dronePos} icon={droneIcon} />
      </MapContainer>
      <MapLegend />
    </div>
  );
}