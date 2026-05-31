export function getBackendBaseUrl() {
  // Prefer explicit VITE var
  const v = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (v && v.trim()) return v.trim().replace(/\/$/, "");

  // Fallbacks for local dev
  return "http://10.0.31.38:8000";
}

