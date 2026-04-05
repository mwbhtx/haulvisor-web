# Lazy Timeline Loading — Design Spec

## Goal

Strip timelines from search results to prevent OOM on large searches. Generate timelines on demand when the user opens the Route Planner for a specific route.

## Why

The brute-force search finds 100K+ feasible routes. Each route's `timeline` field contains 30-50 `TripPhase` objects. Storing all of them in the worker's `chains[]` array uses ~1GB+ of memory, crashing the Lambda at 512MB (now 1024MB but still risky). We only return 50 routes to the frontend and the user only inspects 1-2 route timelines per session.

---

## Changes

### 1. Worker — Strip timelines after scoring

In `search-job.worker.ts`, after `evaluateChain()` returns a result, delete the heavy fields before inserting:

```typescript
delete result.timeline;
delete result.trip_summary;
```

The simulator still runs for feasibility and `estimated_days` — we just discard the phase array. Memory per chain drops from ~10KB to ~1KB.

### 2. New endpoint — lazy timeline generation

`GET /routes/:companyId/timeline`

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `order_ids` | string (comma-separated) | Order IDs for the route (1 or 2) |
| `origin_lat` | number | Driver origin latitude |
| `origin_lng` | number | Driver origin longitude |
| `departure_date` | string | YYYY-MM-DD |
| `destination_lat` | number (optional) | Destination latitude |
| `destination_lng` | number (optional) | Destination longitude |
| `cost_per_mile` | number (optional) | From user settings |
| `avg_driving_hours_per_day` | number (optional) | From user settings |
| `work_start_hour` | number (optional) | From user settings |
| `work_end_hour` | number (optional) | From user settings |

**Flow:**
1. Fetch the specified orders from Postgres by ID
2. Resolve config from query params + user settings (reuse `resolveSearchConfig`)
3. Compute deadheads with `haversine × ROAD_CORRECTION_FACTOR`
4. Compute departure timestamp (reuse `computeDepartureTimestamp`)
5. Call `evaluateChain()` — same function the worker uses
6. Return `{ timeline, trip_summary, suggested_departure }`

Runs in the API Lambda — fast synchronous request, <100ms for a single route.

**ACL:** Add `GET /api/routes/:companyId/timeline` to both `user` and `demo` roles.

### 3. Frontend — lazy load in Route Inspector

**New hook** `useTimeline(companyId, chain, searchContext)`:
- Fetches `GET /routes/:companyId/timeline?order_ids=...&origin_lat=...&...` when called
- Returns `{ timeline, tripSummary, suggestedDeparture, isLoading }`
- Uses React Query with the order IDs as cache key — reopening the same route doesn't re-fetch

**Route Inspector** changes:
- Receives search context (origin, departure date) as props instead of reading `chain.timeline`
- Calls `useTimeline` on mount
- Shows spinner while loading, renders phases when ready

---

## File Changes

### Backend

| File | Action | Change |
|------|--------|--------|
| `api/src/routes/search-job.worker.ts` | Modify | Delete `timeline` and `trip_summary` from results before insert |
| `api/src/routes/routes.controller.ts` | Modify | Add `GET :companyId/timeline` endpoint |
| `api/src/routes/route-search.service.ts` | Modify | Add `getTimeline()` method |
| `api/src/auth/acl.ts` | Modify | Add timeline endpoint to user/demo ACL |

### Frontend

| File | Action | Change |
|------|--------|--------|
| `src/core/hooks/use-timeline.ts` | Create | Hook that fetches timeline on demand |
| `src/features/routes/components/route-inspector.tsx` | Modify | Use hook instead of `chain.timeline` |
| `src/features/routes/views/desktop/route-detail-panel.tsx` | Modify | Pass search context to inspector |

### No haulvisor-core changes

---

## What This Spec Does NOT Cover

- Timeline caching in DynamoDB — React Query client-side cache is sufficient
- Mobile route inspector — same pattern, separate PR if needed
- Preloading timelines for visible routes — YAGNI, on-demand is fast enough
