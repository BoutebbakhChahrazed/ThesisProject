export function getBackendBaseUrl() {
  // Prefer explicit VITE var
  const v = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (v && v.trim()) return v.trim().replace(/\/$/, "");

  // Dynamically use whatever host the frontend is served from
  return `http://${window.location.hostname}:8000`;
}