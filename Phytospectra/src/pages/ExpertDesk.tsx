import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { Inbox, Leaf, AlertTriangle, MessageCircle, TrendingUp, CheckCircle2 } from "lucide-react";
import { useState } from "react";

const REQUESTS = [
  { id: "1", farmer: "Yacine Boudra", farm: "Mitidja East", zone: "B1", issue: "Suspected early Septoria", urgency: "high", time: "12 min ago", health: 42 },
  { id: "2", farmer: "Leila Cherif", farm: "Blida Vines", zone: "A3", issue: "Yellowing patches spreading", urgency: "medium", time: "1h ago", health: 58 },
  { id: "3", farmer: "Omar Khelifi", farm: "Sahel Citrus", zone: "C2", issue: "Drought stress check", urgency: "low", time: "3h ago", health: 71 },
  { id: "4", farmer: "Nadia Saidi", farm: "Tipaza Olives", zone: "D1", issue: "Irrigation question", urgency: "low", time: "yesterday", health: 84 },
];

const URGENCY = {
  high: "bg-stress-severe/15 text-stress-severe border-stress-severe/30",
  medium: "bg-amber/15 text-amber border-amber/30",
  low: "bg-stress-healthy/15 text-stress-healthy border-stress-healthy/30",
} as const;

export default function ExpertDesk() {
  const { profile } = useAuth();
  const [active, setActive] = useState<typeof REQUESTS[0] | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome, Dr. ${profile?.display_name || "Agronomist"} 👩🏽‍🔬`}
        subtitle={profile?.specialty ? `${profile.specialty} · 4 farmers waiting` : "4 farmers waiting for your insight"}
        gradient="gradient-expert"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Open requests", v: "4", icon: Inbox, c: "text-primary" },
          { l: "High urgency", v: "1", icon: AlertTriangle, c: "text-stress-severe" },
          { l: "Resolved this week", v: "12", icon: CheckCircle2, c: "text-stress-healthy" },
          { l: "Farmers helped", v: "37", icon: TrendingUp, c: "text-amber" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.l} className="bg-card rounded-2xl shadow-soft border border-border/40 p-4">
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${s.c}`} />
              </div>
              <div className="font-display text-2xl font-bold mt-2">{s.v}</div>
              <div className="text-xs text-muted-foreground">{s.l}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-display font-semibold flex items-center gap-2"><Inbox className="h-4 w-4" /> Farmer requests</h3>
          {REQUESTS.map(r => (
            <button key={r.id} onClick={() => setActive(r)}
              className="w-full text-left bg-card rounded-2xl shadow-soft border border-border/40 p-4 hover:shadow-card transition-smooth">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">🌾</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm truncate">{r.farmer}</div>
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${URGENCY[r.urgency as keyof typeof URGENCY]}`}>
                      {r.urgency}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.farm} · Zone {r.zone}</div>
                  <div className="text-sm mt-1.5">{r.issue}</div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>{r.time}</span>
                    <span>Health: <strong className={r.health < 50 ? "text-stress-severe" : r.health < 70 ? "text-amber" : "text-stress-healthy"}>{r.health}%</strong></span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="font-display font-semibold flex items-center gap-2"><Leaf className="h-4 w-4" /> Today's tips</h3>
          {[
            { t: "Check weather window", b: "Light rain forecast Thu — schedule fungicide before Wed evening." },
            { t: "Soil moisture trend", b: "NDWI dropped 8% across Mitidja farms this week." },
            { t: "Community alert", b: "3 farms reporting similar yellowing — possible regional issue." },
          ].map(t => (
            <div key={t.t} className="bg-card rounded-2xl shadow-soft border border-border/40 p-4">
              <div className="font-semibold text-sm">{t.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.b}</div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <div className="bg-card rounded-2xl w-full max-w-lg p-6 shadow-card animate-slide-in-right" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-2xl">🌾</div>
              <div className="flex-1">
                <div className="font-semibold">{active.farmer}</div>
                <div className="text-xs text-muted-foreground">{active.farm} · Zone {active.zone}</div>
              </div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-sm mb-4">{active.issue}</div>
            <div className="flex gap-2">
              <button onClick={() => setActive(null)} className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold">Close</button>
              <button className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2">
                <MessageCircle className="h-4 w-4" /> Reply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}