# Lazy Timeline Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip timelines from search results to prevent OOM, load them on demand when the user opens Route Planner.

**Architecture:** Worker deletes `timeline`/`trip_summary` from results before storing. A new `GET /routes/:companyId/timeline` endpoint runs `evaluateChain()` for a single route and returns the timeline. Frontend fetches lazily when the Route Planner section is opened.

**Tech Stack:** TypeScript, NestJS, React, `@mwbhtx/haulvisor-core`

**Spec:** `docs/superpowers/specs/2026-04-06-lazy-timeline-design.md`

---

## File Map

### Backend (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend`)

| File | Action | Responsibility |
|------|--------|----------------|
| `api/src/routes/search-job.worker.ts` | Modify | Strip timeline/trip_summary after evaluateChain |
| `api/src/routes/route-search.service.ts` | Modify | Add `getTimeline()` method |
| `api/src/routes/routes.controller.ts` | Modify | Add `GET :companyId/timeline` endpoint |
| `api/src/routes/routes.module.ts` | Modify | Add PostgresModule to imports |
| `api/src/auth/acl.ts` | Modify | Add timeline route to user/demo ACL |

### Frontend (`/Users/matthewbennett/Documents/GitHub/haulvisor`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-timeline.ts` | Create | Hook to fetch timeline on demand |
| `src/features/routes/components/route-inspector.tsx` | Modify | Use hook instead of chain.timeline |
| `src/features/routes/views/desktop/route-detail-panel.tsx` | Modify | Pass search context to inspector |

---

## Task 1: Worker — strip timelines

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.worker.ts`

- [ ] **Step 1: Strip timeline and trip_summary after evaluateChain**

There are two `insertChain` calls — one for single-order (around line 207) and one for 2-order (around line 260). Before each, add timeline stripping.

For the single-order block, change:

```typescript
        insertChain({
          ...result,
          rank: 0,
          legs: [orderToLeg(c, 1, originDh)],
        });
```

to:

```typescript
        delete result.timeline;
        delete result.trip_summary;
        insertChain({
          ...result,
          rank: 0,
          legs: [orderToLeg(c, 1, originDh)],
        });
```

For the 2-order block, change:

```typescript
          insertChain({
            ...result,
            rank: 0,
            legs: [orderToLeg(a, 1, originDh), orderToLeg(b, 2, interlegDh)],
          });
```

to:

```typescript
          delete result.timeline;
          delete result.trip_summary;
          insertChain({
            ...result,
            rank: 0,
            legs: [orderToLeg(a, 1, originDh), orderToLeg(b, 2, interlegDh)],
          });
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/search-job.worker.ts
git commit -m "perf: strip timeline/trip_summary from search results to prevent OOM"
```

---

## Task 2: Backend — timeline service method

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.service.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.module.ts`

- [ ] **Step 1: Add PostgresService to the module and service**

In `routes.module.ts`, add PostgresModule:

```typescript
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RouteSearchService } from './route-search.service';
import { SettingsModule } from '../settings/settings.module';
import { CompaniesModule } from '../companies/companies.module';
import { PostgresModule } from '../postgres/postgres.module';

@Module({
  imports: [SettingsModule, CompaniesModule, PostgresModule],
  controllers: [RoutesController],
  providers: [RouteSearchService],
})
export class RoutesModule {}
```

- [ ] **Step 2: Add getTimeline method to route-search.service.ts**

Add these imports at the top:

```typescript
import { PostgresService } from '../postgres/postgres.service';
import {
  evaluateChain,
  type OrderRow,
} from './route-search.engine';
import { haversine } from '@mwbhtx/haulvisor-core';
```

Add `PostgresService` to the constructor:

```typescript
  constructor(
    private readonly settingsService: SettingsService,
    private readonly companiesService: CompaniesService,
    private readonly postgres: PostgresService,
  ) {}
```

Add the `getTimeline` method at the end of the class:

```typescript
  private static readonly ROAD_CORRECTION_FACTOR = 1.3;

  async getTimeline(
    companyId: string,
    userId: string,
    orderIds: string[],
    query: RouteSearchDto,
  ) {
    const userSettings = await this.settingsService.getSettings(userId);
    const config = resolveSearchConfig(query as unknown as Record<string, unknown>, userSettings);

    const departureTs = computeDepartureTimestamp(
      query.departure_date,
      config.work_start_hour,
      config.work_end_hour,
      query.origin_lat,
      query.origin_lng,
    );

    const destination = query.destination_lat != null && query.destination_lng != null
      ? { lat: query.destination_lat, lng: query.destination_lng, city: query.destination_city }
      : undefined;

    // Fetch orders by ID from Postgres
    const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(', ');
    const orders = await this.postgres.query<OrderRow>(
      `SELECT
        order_id, origin_city, origin_state, dest_city, dest_state,
        ST_Y(origin_point::geometry) AS origin_lat, ST_X(origin_point::geometry) AS origin_lng,
        ST_Y(dest_point::geometry) AS dest_lat, ST_X(dest_point::geometry) AS dest_lng,
        pay::real, miles::real, rate_per_mile::real, trailer_type, weight::real,
        stopoffs, tarp_height, hazmat, twic, team_load,
        pickup_date_early_utc, pickup_date_late_utc, delivery_date_early_utc, delivery_date_late_utc,
        pickup_date_early_local, pickup_date_late_local, delivery_date_early_local, delivery_date_late_local
      FROM orders
      WHERE company_id = $1 AND order_id IN (${placeholders})`,
      [companyId, ...orderIds],
    );

    // Sort orders to match the requested sequence
    const orderMap = new Map(orders.map(o => [o.order_id, o]));
    const sorted = orderIds.map(id => orderMap.get(id)).filter((o): o is OrderRow => o != null);
    if (sorted.length === 0) return null;

    // Compute deadheads
    const deadheads = sorted.map((order, i) => {
      const fromLat = i === 0 ? query.origin_lat : sorted[i - 1].dest_lat;
      const fromLng = i === 0 ? query.origin_lng : sorted[i - 1].dest_lng;
      return haversine(fromLat, fromLng, order.origin_lat, order.origin_lng) * RouteSearchService.ROAD_CORRECTION_FACTOR;
    });

    const lastOrder = sorted[sorted.length - 1];
    const destMiles = destination
      ? haversine(lastOrder.dest_lat, lastOrder.dest_lng, destination.lat, destination.lng) * RouteSearchService.ROAD_CORRECTION_FACTOR
      : undefined;

    const result = evaluateChain(
      sorted, deadheads, destination,
      config.cost_settings, config.work_start_hour, config.work_end_hour,
      departureTs, destMiles,
    );

    if (!result) return null;

    return {
      timeline: result.timeline,
      trip_summary: result.trip_summary,
      suggested_departure: result.suggested_departure,
    };
  }
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/route-search.service.ts api/src/routes/routes.module.ts
git commit -m "feat: add getTimeline method for on-demand timeline generation"
```

---

## Task 3: Backend — timeline controller endpoint + ACL

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.controller.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/auth/acl.ts`

- [ ] **Step 1: Add timeline endpoint to controller**

Add this method to the `RoutesController` class:

```typescript
  @Get(':companyId/timeline')
  @Roles('admin', 'user', 'demo')
  async getTimeline(
    @Param('companyId') companyId: string,
    @Query() query: RouteSearchDto,
    @Query('order_ids') orderIdsParam: string,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    const orderIds = orderIdsParam?.split(',').filter(Boolean) ?? [];
    if (orderIds.length === 0) throw new NotFoundException('No order IDs provided');
    
    const result = await this.routeSearchService.getTimeline(
      companyId, req.user.userId, orderIds, query,
    );
    if (!result) throw new NotFoundException('Could not generate timeline');
    return result;
  }
```

IMPORTANT: Place this method BEFORE the `getSearch` method (the one with `':companyId/search/:searchId'`). NestJS matches routes in order, and `':companyId/timeline'` must not be confused with `':companyId/search/:searchId'`.

- [ ] **Step 2: Add to ACL**

In `api/src/auth/acl.ts`, add this line to both the `user` and `demo` role objects:

```typescript
    'GET /api/routes/:companyId/timeline': true,
```

Add it near the other routes entries.

- [ ] **Step 3: Verify compile**

```bash
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/routes.controller.ts api/src/auth/acl.ts
git commit -m "feat: add GET /routes/:companyId/timeline endpoint"
```

---

## Task 4: Frontend — useTimeline hook

**Files:**
- Create: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/core/hooks/use-timeline.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/core/services/api";
import type { TripPhase, TripSimulationSummary } from "@mwbhtx/haulvisor-core";
import type { RouteChain } from "@/core/types";

interface TimelineResponse {
  timeline: TripPhase[];
  trip_summary: TripSimulationSummary;
  suggested_departure?: string;
}

interface SearchContext {
  origin_lat: number;
  origin_lng: number;
  departure_date: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_city?: string;
  cost_per_mile?: number;
  avg_driving_hours_per_day?: number;
  work_start_hour?: number;
  work_end_hour?: number;
}

export function useTimeline(
  companyId: string,
  chain: RouteChain | null,
  searchContext: SearchContext | null,
  enabled: boolean,
) {
  const orderIds = chain?.legs.map(l => l.order_id).filter(Boolean).join(",") ?? "";

  return useQuery<TimelineResponse>({
    queryKey: ["timeline", companyId, orderIds],
    queryFn: () => {
      if (!searchContext || !orderIds) throw new Error("Missing context");
      const qs = new URLSearchParams();
      qs.set("order_ids", orderIds);
      qs.set("origin_lat", String(searchContext.origin_lat));
      qs.set("origin_lng", String(searchContext.origin_lng));
      qs.set("departure_date", searchContext.departure_date);
      if (searchContext.destination_lat != null) qs.set("destination_lat", String(searchContext.destination_lat));
      if (searchContext.destination_lng != null) qs.set("destination_lng", String(searchContext.destination_lng));
      if (searchContext.destination_city) qs.set("destination_city", searchContext.destination_city);
      if (searchContext.cost_per_mile != null) qs.set("cost_per_mile", String(searchContext.cost_per_mile));
      if (searchContext.avg_driving_hours_per_day != null) qs.set("avg_driving_hours_per_day", String(searchContext.avg_driving_hours_per_day));
      if (searchContext.work_start_hour != null) qs.set("work_start_hour", String(searchContext.work_start_hour));
      if (searchContext.work_end_hour != null) qs.set("work_end_hour", String(searchContext.work_end_hour));
      return fetchApi<TimelineResponse>(`routes/${companyId}/timeline?${qs.toString()}`);
    },
    enabled: enabled && !!companyId && !!orderIds && !!searchContext,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/core/hooks/use-timeline.ts
git commit -m "feat: add useTimeline hook for on-demand timeline fetching"
```

---

## Task 5: Frontend — update route-inspector and detail panel

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/components/route-inspector.tsx`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/views/desktop/route-detail-panel.tsx`

- [ ] **Step 1: Update RouteInspector to accept timeline as a prop**

In `route-inspector.tsx`, change the props interface and component:

Replace the existing `RouteInspectorProps` interface:

```typescript
interface RouteInspectorProps {
  chain: RouteChain;
  originCity: string;
  returnCity?: string;
  onClose: () => void;
  departureTime?: Date;
  returnByTime?: Date;
}
```

with:

```typescript
interface RouteInspectorProps {
  chain: RouteChain;
  originCity: string;
  returnCity?: string;
  onClose: () => void;
  departureTime?: Date;
  returnByTime?: Date;
  /** Externally loaded timeline (lazy) — overrides chain.timeline */
  timelineData?: {
    timeline: TripPhase[];
    trip_summary: TripSimulationSummary;
    suggested_departure?: string;
  } | null;
  /** Whether the timeline is loading */
  timelineLoading?: boolean;
}
```

Add `TripSimulationSummary` to the import from `@/core/types` if not already there.

Update the component to use `timelineData` when available:

```typescript
export function RouteInspector({
  chain,
  originCity,
  returnCity,
  onClose,
  departureTime,
  returnByTime,
  timelineData,
  timelineLoading,
}: RouteInspectorProps) {
  // Use lazy-loaded timeline if available, fall back to chain.timeline
  const timeline = timelineData?.timeline ?? chain.timeline ?? [];

  // Show loading state
  if (timelineLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-muted-foreground mt-2">Generating route timeline...</p>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No timeline available</p>
      </div>
    );
  }

  const effectiveDeparture = departureTime
    ?? (timelineData?.suggested_departure ? new Date(timelineData.suggested_departure) : null)
    ?? (chain.suggested_departure ? new Date(chain.suggested_departure) : null)
    // ... rest of existing effectiveDeparture logic
```

Keep the rest of the component as-is — it already works with the `timeline` array.

- [ ] **Step 2: Update RouteDetailPanel to pass search context and use useTimeline**

In `route-detail-panel.tsx`:

Add the import:
```typescript
import { useTimeline } from "@/core/hooks/use-timeline";
import { useAuth } from "@/core/services/auth-provider";
```

Add `searchParams` to `RouteDetailPanelProps`:
```typescript
export interface RouteDetailPanelProps {
  chain: RouteChain | null;
  originCity?: string;
  destCity?: string;
  costPerMile: number;
  orderUrlTemplate?: string;
  onHoverLeg?: (legIndex: number | null) => void;
  onShowComments?: (orderId: string) => void;
  isWatchlisted?: boolean;
  onToggleWatchlist?: () => void;
  departureTime?: Date;
  returnByTime?: Date;
  searchParams?: {
    origin_lat: number;
    origin_lng: number;
    departure_date: string;
    destination_lat?: number;
    destination_lng?: number;
    destination_city?: string;
    cost_per_mile?: number;
    avg_driving_hours_per_day?: number;
    work_start_hour?: number;
    work_end_hour?: number;
  } | null;
}
```

Add `searchParams` to the destructure and pass to `RouteDetailContent`.

In `RouteDetailContent`, add the same `searchParams` prop, then use `useTimeline`:

```typescript
  const { activeCompanyId } = useAuth();
  const { data: timelineData, isLoading: timelineLoading } = useTimeline(
    activeCompanyId ?? "",
    chain,
    searchParams ?? null,
    showInspector,
  );
```

Pass `timelineData` and `timelineLoading` to `RouteInspector`:

```typescript
<RouteInspector
  chain={chain}
  originCity={origin}
  returnCity={returnCity}
  onClose={onToggleInspector}
  departureTime={departureTime}
  returnByTime={returnByTime}
  timelineData={timelineData}
  timelineLoading={timelineLoading}
/>
```

- [ ] **Step 3: Pass searchParams from desktop-routes-view to RouteDetailPanel**

In `desktop-routes-view.tsx`, add `searchParams` to the `RouteDetailPanel` call:

```typescript
<RouteDetailPanel
  chain={selectedChain}
  originCity={originFilter?.city}
  destCity={destFilter?.city}
  costPerMile={(settings?.cost_per_mile as number | undefined) ?? DEFAULT_COST_PER_MILE}
  orderUrlTemplate={orderUrlTemplate}
  // ... other props
  searchParams={searchParams}
/>
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/features/routes/components/route-inspector.tsx src/features/routes/views/desktop/route-detail-panel.tsx src/features/routes/views/desktop/desktop-routes-view.tsx
git commit -m "feat: lazy-load timeline in Route Inspector — fetch on demand when opened"
```

---

## Task 6: Push and deploy

- [ ] **Step 1: Push backend**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git push origin main
```

- [ ] **Step 2: Push frontend**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git push origin main
```
