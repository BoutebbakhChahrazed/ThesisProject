// src/lib/backend.ts

export function getBackendBaseUrl() {
  const v = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (v && v.trim()) return v.trim().replace(/\/$/, "");

  return `http://${window.location.hostname}:8000`;
}

export function getBackendWsBaseUrl() {
  const v = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;
  if (v && v.trim()) return v.trim().replace(/\/$/, "");

  return `ws://${window.location.hostname}:8000`;
}