# TODO - Frontend coverage for backend endpoints

## Step 1: Understand backend endpoints
- [x] Inspect FastAPI routers for /api/fields, /api/flights, /api/drones, /api/images, /api/analyze/from-storage, /api/detections/latest
- [x] Inspect websocket endpoints for dashboard feed

## Step 2: Implement frontend API helpers
- [x] Added helper plumbing (`Phytospectra/src/lib/api.ts`) and basic backend types.




## Step 3: Implement missing pages
- [x] Add a page to create/list Fields (POST/GET /api/fields)
- [x] Add a page to create/list Flights (GET/POST /api/flights)
- [x] Add a page to create/list Drones (GET/POST /api/drones)
- [x] Add a page to list Images and show image details (GET /api/images, GET /api/images/:id)
- [x] Add a page to list Segmentations for a flight (GET /api/flights/:flight_id/segmentations)
- [x] Add a page section/list for Latest Detections (GET /api/detections/latest)


## Step 4: Wire navigation
- [x] Update `Phytospectra/src/App.tsx` / sidebar navigation so users can access the new pages.


## Step 5: Websocket dashboard (optional but requested)
- [ ] Implement a dashboard view subscribing to WS `/api/ws/dashboard?token=...`.
- [ ] Render the incoming segmentation/broadcast payloads.

## Step 6: Align existing Analyze page
- [x] Verify `FarmerAnalyze.tsx` request body keys match backend schema (`object_path`, `bucket`, `flight_id`, `field_id`, `drone_id`).


## Step 7: Testing
- [ ] Run `npm test` and `npm run build` in `Phytospectra/`
- [ ] Smoke test key flows manually: sign-in, create field/flight/drone, upload+analyze, view segmentations.

