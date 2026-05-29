import { PageHeader } from "@/components/PageHeader";

export default function Settings({
  wsUrl, setWsUrl, threshold, setThreshold,
}: { wsUrl: string; setWsUrl: (v: string) => void; threshold: number; setThreshold: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <PageHeader title="⚙️ Settings" subtitle="Configure your data streams and alerts" gradient="gradient-card" />
      <div className="bg-card rounded-2xl shadow-soft border border-border/40 p-6 space-y-5 max-w-2xl">
        <div>
          <label className="text-sm font-semibold">WebSocket URL</label>
          <input value={wsUrl} onChange={e => setWsUrl(e.target.value)}
            className="mt-1 w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            placeholder="wss://your-fastapi.example.com/ws" />
          <p className="text-xs text-muted-foreground mt-1">Live detection stream from your FastAPI backend.</p>
        </div>
        <div>
          <label className="text-sm font-semibold flex justify-between">
            <span>Alert threshold (health below)</span><span className="text-primary">{threshold}/100</span>
          </label>
          <input type="range" min={0} max={100} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))} className="w-full mt-2 accent-primary" />
        </div>
        <div className="text-xs text-muted-foreground border-t border-border/40 pt-4">
          🌱 Phytospectra · keys are kept in memory only.
        </div>
      </div>
    </div>
  );
}