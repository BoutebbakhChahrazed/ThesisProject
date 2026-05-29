import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Leaf,
  Sprout,
  Microscope,
  ArrowRight,
  Shield,
  Activity,
  Menu,
  X,
  Layers,
  Compass,
  LineChart,
  ChevronRight,
  Database,
  Cloud,
  CheckCircle2,
  Users,
  Eye
} from "lucide-react";

export default function Landing() {
  const { user, role, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ndvi" | "stress" | "rgb">("ndvi");

  if (!loading && user && role) {
    return <Navigate to={role === "agronomist" ? "/expert-desk" : "/live"} replace />;
  }


  // Sample farm grid for mock premium visualizer
  const mockFarmCells = [
    { id: 1, stress: "healthy", ndvi: 0.85, type: "Corn" },
    { id: 2, stress: "healthy", ndvi: 0.82, type: "Corn" },
    { id: 3, stress: "mild", ndvi: 0.65, type: "Wheat" },
    { id: 4, stress: "healthy", ndvi: 0.79, type: "Corn" },
    { id: 5, stress: "severe", ndvi: 0.31, type: "Wheat" },
    { id: 6, stress: "moderate", ndvi: 0.48, type: "Wheat" },
    { id: 7, stress: "healthy", ndvi: 0.88, type: "Soy" },
    { id: 8, stress: "healthy", ndvi: 0.81, type: "Soy" },
    { id: 9, stress: "mild", ndvi: 0.62, type: "Soy" },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Dynamic Background Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[45%] h-[45%] bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Floating Leaves Backdrop */}
      <Leaf className="absolute top-24 left-8 h-16 w-16 text-primary/5 rotate-12 animate-float-leaf pointer-events-none hidden md:block" />
      <Leaf className="absolute top-[60%] right-12 h-20 w-20 text-primary/5 -rotate-45 animate-float-leaf pointer-events-none hidden md:block" style={{ animationDelay: "2s" }} />

      {/* Top Floating Glassmorphic Header */}
      <header className="sticky top-0 z-50 w-full px-4 sm:px-6 lg:px-8 pt-4">
        <nav className="mx-auto max-w-7xl h-16 rounded-2xl border border-border/40 bg-card/75 backdrop-blur-md px-6 flex items-center justify-between shadow-soft transition-smooth">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 items-center justify-center rounded-xl bg-primary flex text-primary-foreground shadow-glow animate-pulse-live">
              <Leaf className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              Phytospectra
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">Features</a>
            <a href="#demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">Live Demo</a>
            <a href="#workflow" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">Workflow</a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth">Community</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-sm font-semibold rounded-xl text-foreground hover:bg-muted">
                Sign In
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button className="text-sm font-semibold bg-primary text-primary-foreground rounded-xl shadow-soft hover:shadow-glow transition-smooth">
                Sign Up
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-foreground rounded-xl hover:bg-muted transition-smooth"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden mx-auto max-w-7xl mt-2 rounded-2xl border border-border/40 bg-card p-6 shadow-card animate-fade-slide-down">
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-smooth py-1"
              >
                Features
              </a>
              <a
                href="#demo"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-smooth py-1"
              >
                Live Demo
              </a>
              <a
                href="#workflow"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-smooth py-1"
              >
                Workflow
              </a>
              <a
                href="#testimonials"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-smooth py-1"
              >
                Community
              </a>
              <hr className="border-border/40 my-2" />
              <div className="grid grid-cols-2 gap-3">
                <Link to="/auth?mode=signin" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full font-semibold rounded-xl text-foreground">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth?mode=signup" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full font-semibold bg-primary text-primary-foreground rounded-xl shadow-soft">
                    Sign Up
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 md:pt-20 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Hero Left Content */}
          <div className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary animate-fade-slide-down">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse-live" />
              Revolutionizing Drone Agriculture
            </div>
            
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1] animate-fade-slide-down">
              Crop Intelligence, <br />
              <span className="bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
                From the Sky
              </span>
            </h1>

            <p className="text-muted-foreground text-base sm:text-lg max-w-xl leading-relaxed">
              Unlock the secrets of your fields with multispectral drone intelligence. 
              Detect nitrogen stress, identify early water deficiencies, and connect directly with agronomy experts to preserve yield.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link to="/auth?mode=signup" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto h-12 px-8 text-base font-semibold bg-primary text-primary-foreground rounded-2xl shadow-soft hover:shadow-glow transition-smooth flex items-center justify-center gap-2 group">
                  Start Free Trial 
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#demo" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto h-12 px-8 text-base font-semibold rounded-2xl hover:bg-muted flex items-center justify-center gap-2">
                  <Eye className="h-4 w-4" /> Try Interactive Demo
                </Button>
              </a>
            </div>

            {/* Quick integrations metrics */}
            <div className="pt-6 grid grid-cols-3 gap-6 sm:gap-8 border-t border-border/40 w-full">
              <div className="flex flex-col items-center lg:items-start">
                <span className="font-display text-2xl font-bold text-foreground">98%</span>
                <span className="text-xs text-muted-foreground text-center lg:text-left">Detection Accuracy</span>
              </div>
              <div className="flex flex-col items-center lg:items-start">
                <span className="font-display text-2xl font-bold text-foreground">30%</span>
                <span className="text-xs text-muted-foreground text-center lg:text-left">Fertilizer Saved</span>
              </div>
              <div className="flex flex-col items-center lg:items-start">
                <span className="font-display text-2xl font-bold text-foreground">24/7</span>
                <span className="text-xs text-muted-foreground text-center lg:text-left">Expert Consultation</span>
              </div>
            </div>
          </div>

          {/* Hero Right Content - Interactive Crop Mockup */}
          <div className="lg:col-span-6 relative w-full flex justify-center">
            <div className="relative w-full max-w-[500px] rounded-3xl border border-border/50 bg-card p-4 shadow-card hover:shadow-glow transition-smooth">
              
              {/* Glassmorphic overlay badge representing drone height */}
              <div className="absolute top-8 left-8 z-10 flex items-center gap-2 rounded-xl bg-sidebar/85 backdrop-blur-sm text-sidebar-foreground border border-sidebar-border px-3 py-1.5 text-xs font-mono shadow-soft">
                <Activity className="h-3.5 w-3.5 text-primary animate-pulse-live" />
                ALTITUDE: 120M | HD MULTISPECTRAL
              </div>

              {/* Crop visualizer area */}
              <div className="aspect-[4/3] w-full rounded-2xl bg-muted relative overflow-hidden flex items-center justify-center border border-border/30">
                {/* Active views */}
                
                {/* 1. NDVI View */}
                {activeTab === "ndvi" && (
                  <div className="absolute inset-0 grid grid-cols-3 gap-1 p-2 bg-[#f0f9f0] transition-opacity duration-300">
                    {mockFarmCells.map((cell) => {
                      const colorClass =
                        cell.stress === "healthy"
                          ? "bg-emerald-500/80 hover:bg-emerald-500"
                          : cell.stress === "mild"
                          ? "bg-amber-400/80 hover:bg-amber-400"
                          : cell.stress === "moderate"
                          ? "bg-orange-400/90 hover:bg-orange-400"
                          : "bg-rose-500/85 hover:bg-rose-500";
                      return (
                        <div
                          key={cell.id}
                          className={`rounded-lg ${colorClass} flex flex-col items-center justify-center p-2 text-white font-mono text-[10px] font-bold shadow-soft transition-smooth cursor-pointer group`}
                        >
                          <span>Z-{cell.id}</span>
                          <span className="text-xs text-white/95">{(cell.ndvi).toFixed(2)}</span>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bg-sidebar text-[8px] px-2 py-0.5 rounded border border-border/20 text-center top-1 shadow-card">
                            {cell.type}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Water Stress View */}
                {activeTab === "stress" && (
                  <div className="absolute inset-0 grid grid-cols-3 gap-1 p-2 bg-blue-50/50 transition-opacity duration-300">
                    {mockFarmCells.map((cell) => {
                      const isHighStress = cell.stress === "severe" || cell.stress === "moderate";
                      const colorClass = isHighStress 
                        ? "bg-sky-500/95 hover:bg-sky-500" 
                        : "bg-emerald-600/80 hover:bg-emerald-600";
                      return (
                        <div
                          key={cell.id}
                          className={`rounded-lg ${colorClass} flex flex-col items-center justify-center p-2 text-white font-mono text-[10px] font-bold shadow-soft transition-smooth cursor-pointer group`}
                        >
                          <span>Z-{cell.id}</span>
                          <span className="text-xs text-white/95">{isHighStress ? "Hydrated" : "High NDVI"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. RGB Visible View */}
                {activeTab === "rgb" && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800 to-emerald-950 p-2 transition-opacity duration-300">
                    {/* Simulated aerial crop rows */}
                    <div className="w-full h-full flex flex-col justify-between gap-1">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-3 w-full bg-emerald-600/90 rounded-full flex gap-3 relative overflow-hidden animate-pulse" style={{ animationDuration: `${3 + i}s` }}>
                          <div className="h-full bg-emerald-400 w-1/4 rounded-full" />
                          <div className="h-full bg-amber-500 w-12 rounded-full opacity-60" />
                          <div className="h-full bg-emerald-500 w-1/3 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulated drone scope reticle */}
                <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none flex items-center justify-center">
                  <div className="h-32 w-32 rounded-full border border-dashed border-primary/45 flex items-center justify-center animate-spin" style={{ animationDuration: "12s" }}>
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                </div>
              </div>

              {/* View spectrum switcher */}
              <div className="mt-4 flex items-center justify-between gap-2 p-1.5 bg-muted rounded-xl">
                <button
                  onClick={() => setActiveTab("ndvi")}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-smooth flex items-center justify-center gap-1.5 ${
                    activeTab === "ndvi" ? "bg-card shadow-soft text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" /> NDVI
                </button>
                <button
                  onClick={() => setActiveTab("stress")}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-smooth flex items-center justify-center gap-1.5 ${
                    activeTab === "stress" ? "bg-card shadow-soft text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" /> Stress Index
                </button>
                <button
                  onClick={() => setActiveTab("rgb")}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-smooth flex items-center justify-center gap-1.5 ${
                    activeTab === "rgb" ? "bg-card shadow-soft text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" /> Visible
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-20 bg-muted/30 border-y border-border/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Powerful Smart Agronomy Tools
            </h2>
            <p className="text-muted-foreground text-base">
              A comprehensive toolset that translates drone multispectral imagery into instant, operational insights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-card rounded-2xl border border-border/40 p-6 hover:-translate-y-1.5 hover:shadow-card transition-smooth group">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold mb-2">Multispectral Layering</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Render highly precise crop layer arrays including NDVI, Chlorophyll level indices, and soil dryness indices, direct from standard TIFF uploads.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-card rounded-2xl border border-border/40 p-6 hover:-translate-y-1.5 hover:shadow-card transition-smooth group">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary mb-4 group-hover:scale-110 transition-transform">
                <Activity className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold mb-2">Live Stress Diagnostics</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                AI powered threat warning systems alert you immediately to insect encroachment, water stress zones, or disease hotspots before they propagate.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-card rounded-2xl border border-border/40 p-6 hover:-translate-y-1.5 hover:shadow-card transition-smooth group">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber mb-4 group-hover:scale-110 transition-transform">
                <Microscope className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold mb-2">Expert Collaboration</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Instantly consult with registered specialized agronomists. Share high resolution crop health reports, field maps, and get customized threat remedy guidelines.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* Interactive Demonstration Section */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl border border-border/40 bg-gradient-card shadow-card p-8 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center overflow-hidden relative">
          
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
              Interactive Dashboard Preview
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              Monitor Crop Health In Real-Time
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Experience the power of Phytospectra's farmer dashboard. Inspect individual zones, toggle multispectral drone imagery, and review real-time alerts.
            </p>

            <ul className="space-y-3">
              {[
                "Instant TIFF / JPG aerial imagery alignment",
                "Automated zoning by crop vigor score",
                "Seamless export of agronomist diagnostic reports",
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <Link to="/auth?mode=signup">
                <Button className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-xl hover:shadow-glow transition-smooth">
                  Explore The App <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 relative w-full flex justify-center">
            {/* Interactive Mock Dashboard Mockup */}
            <div className="w-full bg-sidebar/95 text-sidebar-foreground border border-sidebar-border rounded-2xl shadow-card p-4 overflow-hidden relative font-sans">
              <div className="flex items-center justify-between border-b border-sidebar-border pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse-live" />
                  <span className="text-xs font-mono tracking-wider font-semibold opacity-90">LIVE FIELDS OVERVIEW</span>
                </div>
                <div className="flex items-center gap-1.5 bg-sidebar-accent px-2 py-0.5 rounded text-[10px] opacity-80">
                  <Cloud className="h-3 w-3 text-secondary" /> CONNECTED
                </div>
              </div>

              <div className="grid grid-cols-12 gap-3">
                {/* Sidebar mock inside the app preview */}
                <div className="col-span-4 bg-sidebar-accent/50 rounded-xl p-2.5 space-y-2 border border-sidebar-border">
                  <div className="text-[10px] font-bold opacity-60 tracking-wider">MAP FILTERS</div>
                  <div className="space-y-1">
                    {[
                      { name: "NDVI Index", val: "0.78", status: "Healthy" },
                      { name: "Soil Water", val: "68%", status: "Mild Dryness" },
                      { name: "Nitrogen", val: "Good", status: "Healthy" }
                    ].map((filt, index) => (
                      <div key={index} className="p-1.5 rounded bg-sidebar/40 border border-sidebar-border/30 text-[9px] hover:bg-sidebar-accent/80 transition-smooth cursor-pointer">
                        <div className="flex justify-between font-semibold">
                          <span>{filt.name}</span>
                          <span className="text-primary">{filt.val}</span>
                        </div>
                        <div className="opacity-60 text-[8px]">{filt.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Map simulator in app preview */}
                <div className="col-span-8 bg-sidebar rounded-xl border border-sidebar-border aspect-video relative overflow-hidden flex flex-col justify-between p-2.5">
                  <div className="flex justify-between items-start">
                    <span className="text-[8px] font-mono opacity-60">GRID STATUS: ACTIVE</span>
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/35 px-1.5 py-0.5 rounded font-mono">HEALTHY</span>
                  </div>

                  {/* Heatmap rings simulated */}
                  <div className="w-full flex justify-center py-2">
                    <div className="relative h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center animate-ping pointer-events-none" style={{ animationDuration: "3s" }}>
                      <div className="h-8 w-8 bg-emerald-400/40 rounded-full flex items-center justify-center">
                        <div className="h-3 w-3 bg-primary rounded-full shadow-glow" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[8px] font-mono opacity-80 pt-1.5 border-t border-sidebar-border/50">
                    <span>COORDS: -24.453, 50.112</span>
                    <span>ZONE 4A</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3-Step Workflow Section */}
      <section id="workflow" className="py-20 bg-muted/20 border-t border-border/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-semibold tracking-wider text-primary uppercase">Simplified Intelligence</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              How Phytospectra Works
            </h2>
            <p className="text-muted-foreground text-sm">
              From the sky directly to clinical agronomy recommendations in three seamless steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            
            {/* Timeline Line Connector (Desktop) */}
            <div className="hidden md:block absolute top-[50px] left-[15%] right-[15%] h-[1px] bg-border border-dashed border-b border-border pointer-events-none z-0" />

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="h-16 w-16 bg-card border border-border/40 rounded-2xl flex items-center justify-center font-display text-xl font-bold text-primary shadow-soft group hover:scale-110 transition-transform">
                01
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Upload Aerial Imagery</h3>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
                Upload raw multi-spectral geotagged TIFF or high resolution orthomosaic images captured with your drone.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="h-16 w-16 bg-card border border-border/40 rounded-2xl flex items-center justify-center font-display text-xl font-bold text-primary shadow-soft group hover:scale-110 transition-transform">
                02
              </div>
              <h3 className="font-display text-base font-bold text-foreground">View AI Heatmaps</h3>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
                Our dashboard automatically aligns grid coordinates to render instant crop vigor NDVI heatmaps and dry spot warnings.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="h-16 w-16 bg-card border border-border/40 rounded-2xl flex items-center justify-center font-display text-xl font-bold text-primary shadow-soft group hover:scale-110 transition-transform">
                03
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Consult Agronomist</h3>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
                Directly share anomalous regions with agronomists in the expert panel to acquire prescription advice and prevent yield failure.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Trusted By Elite Agronomists & Farmers
          </h2>
          <p className="text-muted-foreground text-sm">
            Discover how precision growers leverage drone intelligence to improve yield and sustainability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-card border border-border/40 p-8 rounded-3xl shadow-soft space-y-6 flex flex-col justify-between">
            <blockquote className="text-sm text-foreground leading-relaxed font-medium italic opacity-95">
              "Phytospectra has totally changed how we deliver expert advice to regional farms. The capacity to inspect high resolution multispectral heatmaps alongside coordinates saves hundreds of field hours."
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center text-primary font-bold font-display text-sm border border-primary/20">
                DR
              </div>
              <div>
                <div className="font-bold text-xs">Dr. Raymond Vance</div>
                <div className="text-[10px] text-muted-foreground">Chief Agronomist, GreenHorizon Ltd</div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/40 p-8 rounded-3xl shadow-soft space-y-6 flex flex-col justify-between">
            <blockquote className="text-sm text-foreground leading-relaxed font-medium italic opacity-95">
              "We caught a nitrogen deficiency in zone 4B exactly five days before physical symptoms emerged. We addressed it immediately and restored our maize yield capacity to full value."
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold font-display text-sm border border-secondary/20">
                JM
              </div>
              <div>
                <div className="font-bold text-xs">Julian Mercer</div>
                <div className="text-[10px] text-muted-foreground">Organic Crop Cultivator, Mercer Fields</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Wrapper */}
      <section className="pt-12 pb-0 px-4 bg-sidebar text-sidebar-foreground text-center relative overflow-hidden border-t border-sidebar-border">

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-primary/10 to-transparent pointer-events-none" />
        
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          <Sprout className="h-12 w-12 text-primary mx-auto animate-bounce" />
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Ready to Accelerate Your Yield?
          </h2>
          <p className="text-sidebar-foreground/75 text-sm sm:text-base max-w-xl mx-auto">
            Join thousands of modern growers and expert crop consultants leveraging deep drone analytics. Set up your dashboard in minutes.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/auth?mode=signup">
              <Button className="w-full sm:w-auto h-11 px-8 bg-primary hover:bg-primary-foreground hover:text-primary text-white font-semibold rounded-xl shadow-glow transition-smooth">
                Create Free Account
              </Button>
            </Link>
            <Link to="/auth?mode=signin">
              <Button variant="outline" className="w-full sm:w-auto h-11 px-8 border-sidebar-border bg-transparent text-white hover:bg-sidebar-accent rounded-xl">
                Access Panel
              </Button>
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-sidebar-border flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-sidebar-foreground/60">
          <div>© {new Date().getFullYear()} Phytospectra Inc. Crop intelligence, from the sky.</div>
          <div className="flex gap-4">
            <span className="hover:text-white transition-smooth cursor-pointer">Terms of Service</span>
            <span className="hover:text-white transition-smooth cursor-pointer">Privacy Policy</span>
            <span className="hover:text-white transition-smooth cursor-pointer">API Support</span>
          </div>
        </div>
      </section>
    </div>
  );
}
