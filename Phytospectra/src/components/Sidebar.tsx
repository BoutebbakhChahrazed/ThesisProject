import { NavLink } from "react-router-dom";
import { Map, BarChart3, Image, MessageCircle, Settings, Leaf, LogOut, Inbox, Plus } from "lucide-react";
import logo from "@/assets/phytospectra-logo.png";
import { useAuth } from "@/hooks/useAuth";

const farmerLinks = [
  // { to: "/live", label: "Live Monitor", icon: Map, emoji: "🗺️" },
  // { to: "/farmer-weather", label: "Weather (next week)", icon: Leaf, emoji: "🌦️" },
  { to: "/analytics", label: "Field Analytics", icon: BarChart3, emoji: "📊" },
  
  { to: "/fields", label: "Fields", icon: Leaf, emoji: "🌿" },
  { to: "/drones", label: "Drones", icon: Map, emoji: "📡" },
  { to: "/flights", label: "Flights", icon: Map, emoji: "🛰️" },
  
  { to: "/gallery", label: "Image Gallery", icon: Image, emoji: "🖼️" },
  // { to: "/detections/latest", label: "Detections", icon: BarChart3, emoji: "📡" },
  { to: "/expert", label: "Ask an Expert", icon: MessageCircle, emoji: "💬", dot: true },
  { to: "/settings", label: "Settings", icon: Settings, emoji: "⚙️" },
];


const agronomistLinks = [
  { to: "/expert-desk", label: "Farmer Requests", icon: Inbox, emoji: "📥", dot: true },
  { to: "/analytics", label: "Field Analytics", icon: BarChart3, emoji: "📊" },
  { to: "/gallery", label: "Image Gallery", icon: Image, emoji: "🖼️" },
  { to: "/settings", label: "Settings", icon: Settings, emoji: "⚙️" },
];

export function Sidebar({ wsConnected, dbConnected }: { wsConnected: boolean; dbConnected: boolean }) {
  const { role, profile, signOut } = useAuth();
  const links = role === "agronomist" ? agronomistLinks : farmerLinks;
  return (
    <aside className="relative hidden lg:flex w-74 shrink-0 flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] overflow-hidden">
      <Leaf className="absolute -top-6 -right-6 h-32 w-32 text-white/5 animate-float-leaf" />
      <Leaf className="absolute bottom-32 -left-4 h-20 w-20 text-white/5 animate-float-leaf" style={{ animationDelay: "2s" }} />

      <div className="px-6 py-6 flex items-center gap-3 relative z-10">
        <img src={logo} alt="Phytospectra" className="h-10 w-10 rounded-xl bg-white p-1 shadow-soft" />

        

        <div>
          <div className="font-display text-xl font-bold leading-none flex items-baseline gap-2">
            <span>Phytospectra</span>
            {/* <span className="text-xs opacity-70 font-normal">Crop intelligence</span> */}
            {role === "farmer" ? (
          <NavLink
            to="/farmer-analyze"
            className="ml-[-2px] h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-smooth"
            aria-label="Upload & Analyze"
            title="Upload & Analyze"
          >
            <Plus className="h-4 w-4 text-white" />
          </NavLink>
        ) : null}
          </div>
          <div className="text-xs opacity-70 mt-1">{role === "agronomist" ? "Agronomist desk" : ""}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2 relative z-10">
        {links.map(({ to, label, emoji, dot }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-smooth text-sm font-medium ${
                isActive ? "bg-white/15 text-white shadow-soft" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="flex items-center gap-3">
              <span className="text-base">{emoji}</span>
              {label}
            </span>
            {dot && <span className="h-2 w-2 rounded-full bg-amber animate-pulse-live" />}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-5 border-t border-white/10 space-y-2 text-xs relative z-10">
        {profile && (
          <div className="pb-3 mb-1 border-b border-white/10">
            <div className="text-sm font-semibold truncate">{profile.display_name}</div>
            <div className="opacity-60 truncate">{profile.farm_name || profile.specialty || (role === "agronomist" ? "Agronomist" : "Farmer")}</div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="opacity-70">WebSocket</span>
          <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-stress-healthy animate-pulse-live" : "bg-stress-severe"}`} />
        </div>
        <div className="flex items-center justify-between">
          <span className="opacity-70">Cloud DB</span>
          <span className={`h-2.5 w-2.5 rounded-full ${dbConnected ? "bg-stress-healthy animate-pulse-live" : "bg-stress-severe"}`} />
        </div>
        <button onClick={signOut} className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition-smooth">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}