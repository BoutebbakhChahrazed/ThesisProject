import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FieldMap } from "@/components/FieldMap";
import { KpiCard } from "@/components/KpiCard";
import { AlertFeed, AlertItem } from "@/components/AlertFeed";
import { NotificationBell } from "@/components/NotificationBell";

import { NdviHeatmap } from "@/components/NdviHeatmap";
import { ZoneDetailPanel } from "@/components/ZoneDetailPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_ZONES, ZoneData } from "@/lib/mockData";

import { FarmerWeatherForecast } from "@/components/FarmerWeatherForecast";
import { LiveNotificationFeed } from "@/components/LiveNotificationFeed";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { fetch7DayWeather } from "@/lib/weather";

const PATH: [number, number][] = [
  [36.4830, 2.945], [36.4830, 2.955], [36.4805, 2.962], [36.4780, 2.955], [36.4780, 2.945], [36.4805, 2.940],
];

export default function LiveMonitor({ live }: { live: boolean }) {
  const [zones] = useState<ZoneData[]>(MOCK_ZONES);
  const [selected, setSelected] = useState<ZoneData | null>(null);
  const [pathIdx, setPathIdx] = useState(0);
  const [flightSeconds, setFlightSeconds] = useState(842);

  const [weatherDays, setWeatherDays] = useState<Awaited<ReturnType<typeof fetch7DayWeather>>>([]);
  const [weatherPending, setWeatherPending] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setPathIdx((i) => (i + 1) % PATH.length), 2500);
    const tt = setInterval(() => setFlightSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tt);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setWeatherPending(true);
      setWeatherError(null);

      try {
        const days = await fetch7DayWeather({ latitude: 36.75, longitude: 3.05 });
        if (active) setWeatherDays(days);
      } catch (e) {
        if (active) {
          setWeatherError(e instanceof Error ? e.message : "Failed to load weather");
        }
      } finally {
        if (active) setWeatherPending(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  useWeatherAlerts(weatherDays);

  const alerts = useMemo<AlertItem[]>(() =>
    zones.map(z => ({ id: z.id, zone: z.name, health: z.health_score, confidence: z.confidence, timestamp: z.timestamp }))
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
  [zones]);

  const avgHealth = Math.round(zones.reduce((s, z) => s + z.health_score, 0) / zones.length);
  const needCare = zones.filter(z => z.health_score < 55).length;
  const fmtTime = `${String(Math.floor(flightSeconds / 60)).padStart(2, "0")}:${String(flightSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <PageHeader title="🌿 Live Field Monitor" subtitle="Real-time crop health from your drone" gradient="gradient-live">
        <div className="flex w-full items-center">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <NotificationBell
              items={alerts}
              onOpenZone={(zone) => setSelected(zones.find((z) => z.name === zone) ?? null)}
            />
            <StatusBadge status={live ? "live" : "idle"} />
          </div>
        </div>

      </PageHeader>


      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-200px)] min-h-[600px]">
        <div className="lg:col-span-3 relative">
          <FieldMap zones={zones} onZoneClick={setSelected} dronePos={PATH[pathIdx]} />
          <div className="absolute top-3 left-3 z-[400]"><StatusBadge status={live ? "live" : "idle"} /></div>
          {selected && <ZoneDetailPanel zone={selected} onClose={() => setSelected(null)} />}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto">
          <NdviHeatmap zone={zones[0]} />

          {/* Weather + Safety alerts (dashboard inline) */}
          <FarmerWeatherForecast />
          {weatherPending ? (
            <div className="bg-card border border-border/40 text-sm rounded-2xl p-4">Loading weather…</div>
          ) : null}
          {weatherError ? (
            <div className="bg-card border border-stress-severe/40 text-sm text-stress-severe rounded-2xl p-4">
              {weatherError}
            </div>
          ) : null}

          <LiveNotificationFeed />

          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Field Health Score" value={`${avgHealth}/100`} icon="🌿" tone="green" />
            <KpiCard title="Zones Needing Care" value={needCare} icon="⚠️" tone="red" />
            <KpiCard title="Images Analyzed" value={128} icon="📷" tone="blue" />
            <KpiCard title="Flight Time" value={fmtTime} icon="⏱️" tone="purple" />
          </div>

          <AlertFeed
            items={alerts}
            onClick={(name) => setSelected(zones.find((z) => z.name === name) ?? null)}
          />
        </div>
      </div>
    </div>
  );
}