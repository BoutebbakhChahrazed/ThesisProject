import { ReactNode } from "react";

export function KpiCard({
  title, value, icon, tone,
}: { title: string; value: ReactNode; icon: string; tone: "green" | "red" | "blue" | "purple" }) {
  const tones = {
    green: "from-stress-healthy/20 to-stress-healthy/5 text-stress-healthy",
    red: "from-stress-severe/20 to-stress-moderate/5 text-stress-severe",
    blue: "from-secondary/20 to-secondary/5 text-secondary",
    purple: "from-[hsl(258_90%_66%)]/20 to-[hsl(258_90%_66%)]/5 text-[hsl(258_90%_56%)]",
  } as const;
  return (
    <div className={`rounded-2xl p-4 bg-gradient-to-br ${tones[tone]} bg-card border border-border/40 shadow-soft hover:shadow-card transition-smooth hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-display font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{title}</div>
    </div>
  );
}