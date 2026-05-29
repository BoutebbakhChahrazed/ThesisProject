import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { X, Send } from "lucide-react";

const EXPERTS = [
  { name: "Dr. Amina Belkacem", role: "Agronomist · Mitidja Univ.", emoji: "👩🏽‍🌾", online: true },
  { name: "Karim Haddad", role: "Crop Disease Specialist", emoji: "👨🏽‍🔬", online: true },
  { name: "Dr. Sofia Marin", role: "Soil & Irrigation Expert", emoji: "👩🏼‍🔬", online: false },
];

const TIPS = [
  { t: "Detect drought 4 days early", b: "Watch NDVI drop combined with NDWI to spot moisture stress before leaves wilt." },
  { t: "Disease pattern recognition", b: "Circular yellow patches typically signal early fungal infection — isolate the area fast." },
  { t: "Best flight time", b: "Fly between 10 AM and 2 PM for optimal multispectral reflectance." },
];

export default function Expert() {
  const [chat, setChat] = useState<typeof EXPERTS[0] | null>(null);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<{ from: "me" | "exp"; text: string }[]>([
    { from: "exp", text: "Hi 👋 I just looked at your Zone B data — it really does look like early Septoria. How long has it been like this?" },
  ]);

  const send = () => {
    if (!msg.trim()) return;
    setLog(l => [...l, { from: "me", text: msg }]);
    setMsg("");
    setTimeout(() => setLog(l => [...l, { from: "exp", text: "Got it! I'd recommend a targeted fungicide on B1 within 48h. Want me to draft a treatment plan?" }]), 1200);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="💬 Ask an Expert" subtitle="Real human agronomists, ready to help" gradient="gradient-expert" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-display font-semibold">Available Experts</h3>
          {EXPERTS.map(e => (
            <div key={e.name} className="bg-card rounded-2xl shadow-soft border border-border/40 p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-2xl relative">
                {e.emoji}
                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${e.online ? "bg-stress-healthy" : "bg-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{e.name}</div>
                <div className="text-xs text-muted-foreground">{e.role}</div>
              </div>
              <button disabled={!e.online} onClick={() => setChat(e)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:shadow-glow transition-smooth">
                Chat
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="font-display font-semibold">🌱 Community Tips</h3>
          {TIPS.map(t => (
            <div key={t.t} className="bg-card rounded-2xl shadow-soft border border-border/40 p-4">
              <div className="font-semibold text-sm">{t.t}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.b}</div>
            </div>
          ))}
        </div>
      </div>
      {chat && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setChat(null)}>
          <div className="bg-card rounded-2xl w-full max-w-md h-[560px] flex flex-col shadow-card animate-slide-in-right" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border/40 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xl">{chat.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{chat.name}</div>
                <div className="text-[10px] text-stress-healthy">● online</div>
              </div>
              <button onClick={() => setChat(null)} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {log.map((m, i) => (
                <div key={i} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.from === "me" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{m.text}</div>
              ))}
            </div>
            <div className="p-3 border-t border-border/40 flex gap-2">
              <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Type a message..." className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={send} className="p-2 rounded-xl bg-primary text-primary-foreground"><Send className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}