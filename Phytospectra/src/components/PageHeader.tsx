import { ReactNode } from "react";

export function PageHeader({
  title, subtitle, gradient, children,
}: { title: string; subtitle?: string; gradient: string; children?: ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${gradient} p-6 md:p-8 text-white shadow-card mb-6`}>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">{title}</h1>
          {subtitle && <p className="opacity-90 mt-1 text-sm md:text-base">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}