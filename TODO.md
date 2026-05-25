# TODO - WebSocket-first Farmer Upgrade (Milestones)

## Milestone 0 — Baseline Fixes
- [ ] Verify current WS token auth flow works end-to-end (dashboard).
- [ ] Ensure `/farmer-weather` remains role-protected.

## Milestone 1 — WebSocket Channel Architecture (separate endpoints)
- [ ] Update backend WS router to add:
  - [ ] `/ws/live-monitor`
  - [ ] `/ws/weather`
  - [ ] `/ws/notifications`
  - [ ] `/ws/analysis/{analysis_id}`
- [ ] Implement backend channel-aware connection manager (per-endpoint lists).
- [ ] Add role validation for farmer-only channels.

## Milestone 2 — Frontend Realtime State (Zustand)
- [ ] Add Zustand realtime stores:
  - [ ] `useLiveMonitorStore`
  - [ ] `useWeatherRealtimeStore`
  - [ ] `useNotificationStore`
  - [ ] `useAnalysisRealtimeStore`
  - [ ] `useDashboardRealtimeStore`
- [ ] Implement WS client hooks per channel.
- [ ] Refactor `/live` (LiveMonitor.tsx) to remove MOCK_ZONES and timers.

## Milestone 3 — Dashboard Integrations
- [ ] Integrate weather cards directly into `/live`.
- [ ] Add weather icons/visual indicators.
- [ ] Add KPI charts (Recharts) based on live WS data.

## Milestone 4 — Drone Safety Alerts + Recommendations (frontend computed)
- [ ] Implement safety evaluator in frontend (based on streamed weather).
- [ ] Severity levels: info/warning/critical.
- [ ] Show alerts on dashboard + toast + alert cards.
- [ ] Add flight recommendations section (optimal time windows).

## Milestone 5 — AI Dual-Model Streaming + Visualization (backend + frontend)
- [ ] Extend backend pipeline to stream stage updates via `/ws/analysis/{analysis_id}`.
- [ ] Add dual-model inference endpoints (patch classification + SegFormer segmentation).
- [ ] Update frontend visualization to support both models:
  - [ ] patch-based classification visualization
  - [ ] segmentation masks overlay + stats
  - [ ] NDVI + false-color comparisons

## Milestone 6 — Upload/Select Image Workflow
- [ ] Add image upload/select UI on dashboard.
- [ ] Send processing job to backend; stream progress.
- [ ] Persist analysis archive on Supabase.

## Milestone 7 — Archive + Field Management + Reports
- [ ] Implement archive/history module with search/filter/compare/delete/restore.
- [ ] Implement field CRUD.
- [ ] Generate PDF reports and enable download.

## Milestone 8 — Performance & Hardening
- [ ] WS reconnect strategy + heartbeat.
- [ ] Throttling/batching of events.
- [ ] Add lazy loading for heavy visualization assets.

