import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Leaf, Sprout, Microscope } from "lucide-react";
import { toast } from "sonner";

type Role = "farmer" | "agronomist";

export default function Auth() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<Role>("farmer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [farmName, setFarmName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && role) {
    return <Navigate to={role === "agronomist" ? "/expert-desk" : "/live"} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              display_name: displayName,
              role: selectedRole,
              farm_name: selectedRole === "farmer" ? farmName : null,
              specialty: selectedRole === "agronomist" ? specialty : null,
            },
          },
        });
        if (error) throw error;
        toast.success("Welcome aboard! 🌱");
        navigate(selectedRole === "agronomist" ? "/expert-desk" : "/live");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        // Don't force landing. Let ProtectedShell redirect based on role after AuthProvider loads metadata.
        navigate("/live", { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <Leaf className="absolute top-10 left-10 h-40 w-40 text-primary/5" />
      <Leaf className="absolute bottom-10 right-10 h-56 w-56 text-primary/5 rotate-45" />

      <div className="relative w-full max-w-md bg-card rounded-3xl shadow-card border border-border/40 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--sidebar))] mb-3">
            <Leaf className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold">Phytospectra</h1>
          <p className="text-sm text-muted-foreground">Crop intelligence, from the sky</p>
        </div>

        <div className="flex p-1 bg-muted rounded-xl mb-5">
          {(["signin", "signup"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-smooth ${mode === m ? "bg-card shadow-soft" : "text-muted-foreground"}`}>
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {([
              { v: "farmer", l: "Farmer", icon: Sprout, sub: "Monitor my fields" },
              { v: "agronomist", l: "Agronomist", icon: Microscope, sub: "Help farmers" },
            ] as const).map(r => {
              const Icon = r.icon;
              const active = selectedRole === r.v;
              return (
                <button key={r.v} type="button" onClick={() => setSelectedRole(r.v)}
                  className={`p-3 rounded-xl border-2 transition-smooth text-left ${active ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}>
                  <Icon className={`h-5 w-5 mb-1 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="font-semibold text-sm">{r.l}</div>
                  <div className="text-[10px] text-muted-foreground">{r.sub}</div>
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <>
              <input required value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              {selectedRole === "farmer" ? (
                <input value={farmName} onChange={e => setFarmName(e.target.value)}
                  placeholder="Farm name (optional)" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              ) : (
                <input value={specialty} onChange={e => setSpecialty(e.target.value)}
                  placeholder="Specialty (e.g. Crop disease)" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              )}
            </>
          )}
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          <input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />

          <button disabled={submitting} type="submit"
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:shadow-glow transition-smooth disabled:opacity-50">
            {submitting ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-5">
          🌱 Growing smarter, together
        </p>
      </div>
    </div>
  );
}