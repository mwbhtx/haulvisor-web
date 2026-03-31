# Unified Route Search Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two divergent route search services with a single, testable pipeline callable from HTTP or future background workers.

**Architecture:** Core-first type unification, then backend pipeline as pure functions + orchestrator, then frontend consolidation. Each phase produces working software.

**Tech Stack:** TypeScript, NestJS, PostgreSQL/PostGIS, @mwbhtx/haulvisor-core, React/TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-31-unified-route-search-design.md`

---

## Phase 1: Core Types (haulvisor-core)

### Task 1: Unify route types in haulvisor-core

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-core`
**Files:**
- Modify: `src/types/routes.ts`
- Delete: `src/types/round-trip.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update `src/types/routes.ts` with unified types**

Add `leg_number` and `rank` fields, add `rate_per_mile` to `RouteChain`, update `RouteSearchResult` to include origin:

```typescript
import type { RouteCostBreakdown } from './scoring.js';
import type { TripPhase, TripSimulationSummary } from '../trip-simulator.js';

export interface RouteLeg {
  leg_number: number;
  order_id: string;
  origin_city: string;
  origin_state: string;
  origin_lat: number;
  origin_lng: number;
  destination_city: string;
  destination_state: string;
  destination_lat: number;
  destination_lng: number;
  pay: number;
  miles: number;
  trailer_type?: string;
  deadhead_miles: number;
  weight?: number;
  pickup_date_early?: string;
  pickup_date_late?: string;
  delivery_date_early?: string;
  delivery_date_late?: string;
  /** Rank in top lanes (1 = most popular). Undefined if not a top lane. */
  lane_rank?: number;
  /** Tarp height in inches — present if order requires a tarp */
  tarp_height?: string;
}

export interface RouteChain {
  rank: number;
  total_pay: number;
  total_miles: number;
  total_deadhead_miles: number;
  estimated_deadhead_cost: number;
  profit: number;
  rate_per_mile: number;
  legs: RouteLeg[];

  // Metric fields
  deadhead_pct: number;
  effective_rpm: number;
  estimated_days: number;
  daily_net_profit: number;
  cost_breakdown: RouteCostBreakdown;
  /** Phase-level trip timeline from the simulator */
  timeline?: TripPhase[];
  /** Aggregated trip metrics from the simulator */
  trip_summary?: TripSimulationSummary;
  /** Optimal departure time (ISO) */
  suggested_departure?: string;
}

export interface RouteSearchResult {
  routes: RouteChain[];
  origin: {
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  order_url_template?: string;
}
```

- [ ] **Step 2: Delete `src/types/round-trip.ts`**

```bash
rm src/types/round-trip.ts
```

- [ ] **Step 3: Remove round-trip re-export from `src/types/index.ts`**

Remove the line `export * from './round-trip.js';` from `src/types/index.ts`.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat: unify RouteChain/RouteLeg types, remove RoundTripChain"
git push origin main
```

---

## Phase 2: Backend Pipeline (haulvisor-backend)

### Task 2: Create unified search DTO

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-backend`
**Files:**
- Create: `api/src/routes/dto/route-search.dto.ts` (overwrite existing)

- [ ] **Step 1: Update core package**

```bash
npm update @mwbhtx/haulvisor-core
```

- [ ] **Step 2: Write the unified DTO**

Overwrite `api/src/routes/dto/route-search.dto.ts`:

```typescript
import { IsNotEmpty, IsNumber, IsOptional, IsInt, IsString, IsDateString, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class RouteSearchDto {
  // ── Required ──────────────────────────────────────────────────────────────

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  origin_lat!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  origin_lng!: number;

  @IsNotEmpty()
  @IsString()
  departure_date!: string;

  // ── Optional: destination ─────────────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lng?: number;

  // ── Optional: search constraints ──────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  search_radius_miles?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  legs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  max_deadhead_pct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  max_layover_hours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  max_trip_days?: number;

  // ── Optional: driver profile ──────────────────────────────────────────────

  @IsOptional()
  trailer_types?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_weight?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  hazmat_certified?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  twic_card?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  team_driver?: boolean;

  // ── Optional: cost model overrides ────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(10)
  cost_per_mile?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  diesel_price_per_gallon?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maintenance_per_mile?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tires_per_mile?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  truck_payment_per_day?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  insurance_per_day?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  per_diem_per_day?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(12)
  avg_mpg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(6)
  @Max(11)
  avg_driving_hours_per_day?: number;

  // ── Optional: work hours ──────────────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  work_start_hour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  work_end_hour?: number;
}
```

- [ ] **Step 3: Delete old round-trip DTO**

```bash
rm api/src/routes/dto/round-trip-search.dto.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: unified route search DTO with departure_date"
```

---

### Task 3: Create route search engine (pure functions + tests)

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-backend`
**Files:**
- Create: `api/src/routes/route-search.engine.ts`
- Create: `api/src/routes/route-search.engine.spec.ts`

- [ ] **Step 1: Write the engine tests first**

Create `api/src/routes/route-search.engine.spec.ts`:

```typescript
import {
  resolveSearchConfig,
  computeDepartureTimestamp,
  buildTripLegs,
  evaluateChain,
  type SearchConfig,
  type OrderRow,
} from './route-search.engine';
import {
  DEFAULT_WORK_START_HOUR,
  DEFAULT_WORK_END_HOUR,
  DEFAULT_AVG_SPEED_MPH,
  DEFAULT_COST_PER_MILE,
  MS_PER_HOUR,
} from '@mwbhtx/haulvisor-core';

describe('resolveSearchConfig', () => {
  it('should use query params over user settings', () => {
    const config = resolveSearchConfig(
      { work_start_hour: 8, search_radius_miles: 300 },
      { work_start_hour: 6, search_radius_miles: 100 },
    );
    expect(config.work_start_hour).toBe(8);
    expect(config.search_radius_miles).toBe(300);
  });

  it('should fall back to user settings when query is empty', () => {
    const config = resolveSearchConfig(
      {},
      { work_start_hour: 7 },
    );
    expect(config.work_start_hour).toBe(7);
  });

  it('should fall back to defaults when both are empty', () => {
    const config = resolveSearchConfig({}, {});
    expect(config.work_start_hour).toBe(DEFAULT_WORK_START_HOUR);
    expect(config.work_end_hour).toBe(DEFAULT_WORK_END_HOUR);
    expect(config.search_radius_miles).toBe(150);
  });

  it('should cap search_radius_miles at 500', () => {
    const config = resolveSearchConfig({ search_radius_miles: 999 }, {});
    expect(config.search_radius_miles).toBe(500);
  });
});

describe('computeDepartureTimestamp', () => {
  it('should use work_start_hour on a future date', () => {
    const ts = computeDepartureTimestamp('2026-04-15', 6, 16);
    const d = new Date(ts);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3); // April = 3
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(6);
  });

  it('should bump to tomorrow if today and past work_end_hour', () => {
    // Simulate "today" by using a fixed now
    const now = new Date('2026-04-10T18:00:00Z'); // 6 PM, past work_end (16)
    const ts = computeDepartureTimestamp('2026-04-10', 6, 16, now);
    const d = new Date(ts);
    expect(d.getUTCDate()).toBe(11); // tomorrow
    expect(d.getUTCHours()).toBe(6);
  });

  it('should use max(now, work_start) if today and before work_end', () => {
    const now = new Date('2026-04-10T10:30:00Z'); // 10:30 AM, after work_start (6)
    const ts = computeDepartureTimestamp('2026-04-10', 6, 16, now);
    const d = new Date(ts);
    expect(d.getUTCDate()).toBe(10); // today
    expect(d.getUTCHours()).toBe(10); // now > work_start, so use now
    expect(d.getUTCMinutes()).toBe(30);
  });

  it('should clamp to work_start if today and before work_start', () => {
    const now = new Date('2026-04-10T04:00:00Z'); // 4 AM, before work_start (6)
    const ts = computeDepartureTimestamp('2026-04-10', 6, 16, now);
    const d = new Date(ts);
    expect(d.getUTCDate()).toBe(10);
    expect(d.getUTCHours()).toBe(6);
  });
});

describe('buildTripLegs', () => {
  const makeOrder = (overrides: Partial<OrderRow> = {}): OrderRow => ({
    order_id: 'ord-1',
    origin_city: 'Dallas',
    origin_state: 'TX',
    dest_city: 'Houston',
    dest_state: 'TX',
    origin_lat: 32.7,
    origin_lng: -96.8,
    dest_lat: 29.7,
    dest_lng: -95.4,
    pay: 2000,
    miles: 240,
    rate_per_mile: 8.33,
    trailer_type: 'flatbed',
    weight: 40000,
    pickup_date_early: '2026-04-15T06:00:00Z',
    pickup_date_late: '2026-04-15T18:00:00Z',
    delivery_date_early: '2026-04-16T06:00:00Z',
    delivery_date_late: '2026-04-16T18:00:00Z',
    tarp_height: null,
    hazmat: null,
    twic: null,
    team_load: null,
    deadhead_miles: 30,
    stopoffs: null,
    ...overrides,
  });

  it('should build load legs with deadhead for a single order', () => {
    const legs = buildTripLegs([makeOrder()], [30], undefined);
    expect(legs).toHaveLength(2); // deadhead + load
    expect(legs[0].kind).toBe('deadhead');
    expect(legs[0].miles).toBe(30);
    expect(legs[1].kind).toBe('load');
    expect(legs[1].miles).toBe(240);
  });

  it('should not append trailing deadhead when no destination', () => {
    const legs = buildTripLegs([makeOrder()], [30], undefined);
    expect(legs[legs.length - 1].kind).toBe('load');
  });

  it('should append trailing deadhead when destination differs from last delivery', () => {
    const dest = { lat: 30.0, lng: -97.0 }; // different from dest (29.7, -95.4)
    const legs = buildTripLegs([makeOrder()], [30], dest);
    expect(legs[legs.length - 1].kind).toBe('deadhead');
    expect(legs[legs.length - 1].miles).toBeGreaterThan(0);
  });

  it('should NOT append trailing deadhead when destination matches last delivery', () => {
    const dest = { lat: 29.7, lng: -95.4 }; // same as dest
    const legs = buildTripLegs([makeOrder()], [30], dest);
    expect(legs[legs.length - 1].kind).toBe('load');
  });

  it('should skip deadhead leg when deadhead is 0', () => {
    const legs = buildTripLegs([makeOrder()], [0], undefined);
    expect(legs).toHaveLength(1);
    expect(legs[0].kind).toBe('load');
  });

  it('should handle multi-leg chains', () => {
    const order1 = makeOrder({ order_id: 'ord-1' });
    const order2 = makeOrder({ order_id: 'ord-2', origin_city: 'Houston', dest_city: 'Austin' });
    const legs = buildTripLegs([order1, order2], [30, 15], undefined);
    // dh1 + load1 + dh2 + load2
    expect(legs).toHaveLength(4);
    expect(legs[0].kind).toBe('deadhead');
    expect(legs[1].kind).toBe('load');
    expect(legs[2].kind).toBe('deadhead');
    expect(legs[3].kind).toBe('load');
  });

  it('should split orders with stopoffs into segments', () => {
    const order = makeOrder({
      stopoffs: [
        { sequence: 1, type: 'pickup', city: 'Dallas', state: 'TX', early_date: '2026-04-15T06:00:00Z', late_date: '2026-04-15T18:00:00Z' },
        { sequence: 2, type: 'dropoff', city: 'Waco', state: 'TX', early_date: '2026-04-15T12:00:00Z', late_date: '2026-04-15T20:00:00Z' },
        { sequence: 3, type: 'dropoff', city: 'Houston', state: 'TX', early_date: '2026-04-16T06:00:00Z', late_date: '2026-04-16T18:00:00Z' },
      ],
    });
    const legs = buildTripLegs([order], [0], undefined);
    // 2 segments (3 stopoffs - 1)
    expect(legs.filter(l => l.kind === 'load')).toHaveLength(2);
  });
});

describe('evaluateChain', () => {
  // evaluateChain wraps simulateTrip + calculateProfit — integration-level test
  const makeOrder = (overrides: Partial<OrderRow> = {}): OrderRow => ({
    order_id: 'ord-1',
    origin_city: 'Dallas',
    origin_state: 'TX',
    dest_city: 'Houston',
    dest_state: 'TX',
    origin_lat: 32.7,
    origin_lng: -96.8,
    dest_lat: 29.7,
    dest_lng: -95.4,
    pay: 2000,
    miles: 240,
    rate_per_mile: 8.33,
    trailer_type: 'flatbed',
    weight: 40000,
    pickup_date_early: '2026-04-15T08:00:00Z',
    pickup_date_late: '2026-04-15T18:00:00Z',
    delivery_date_early: '2026-04-16T06:00:00Z',
    delivery_date_late: '2026-04-16T18:00:00Z',
    tarp_height: null,
    hazmat: null,
    twic: null,
    team_load: null,
    deadhead_miles: 30,
    stopoffs: null,
    ...overrides,
  });

  it('should return a scored result for a feasible chain', () => {
    const result = evaluateChain(
      [makeOrder()],
      [30],
      undefined,
      {},
      6,
      16,
    );
    expect(result).not.toBeNull();
    expect(result!.profit).toBeDefined();
    expect(result!.daily_net_profit).toBeDefined();
    expect(result!.timeline).toBeDefined();
    expect(result!.estimated_days).toBeGreaterThanOrEqual(1);
  });

  it('should return null for an infeasible chain (impossible pickup window)', () => {
    const order = makeOrder({
      // Pickup window already closed
      pickup_date_early: '2025-01-01T06:00:00Z',
      pickup_date_late: '2025-01-01T08:00:00Z',
    });
    const result = evaluateChain([order], [30], undefined, {}, 6, 16);
    expect(result).toBeNull();
  });

  it('should include trailing deadhead in total_deadhead_miles when destination provided', () => {
    const dest = { lat: 30.0, lng: -97.0 };
    const result = evaluateChain([makeOrder()], [30], dest, {}, 6, 16);
    expect(result).not.toBeNull();
    expect(result!.total_deadhead_miles).toBeGreaterThan(30); // 30 initial + trailing
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest route-search.engine --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the engine implementation**

Create `api/src/routes/route-search.engine.ts`:

```typescript
import {
  CostModelSettings,
  TripLeg,
  TripPhase,
  TripSimulationSummary,
  RouteCostBreakdown,
  haversine,
  resolveSettings,
  simulateTrip,
  DEFAULT_WORK_START_HOUR,
  DEFAULT_WORK_END_HOUR,
  DEFAULT_AVG_SPEED_MPH,
  MS_PER_HOUR,
} from '@mwbhtx/haulvisor-core';
import { calculateProfit, deadheadPct, effectiveRpm, dailyNetProfit } from '../scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderRow {
  order_id: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  pay: number;
  miles: number;
  rate_per_mile: number;
  trailer_type: string;
  weight: number | null;
  pickup_date_early: string | null;
  pickup_date_late: string | null;
  delivery_date_early: string | null;
  delivery_date_late: string | null;
  tarp_height: string | null;
  hazmat: boolean | null;
  twic: boolean | null;
  team_load: boolean | null;
  deadhead_miles: number;
  stopoffs: Array<{
    sequence: number;
    type: 'pickup' | 'dropoff';
    city: string;
    state: string;
    early_date: string;
    late_date: string;
  }> | null;
}

export interface SearchConfig {
  search_radius_miles: number;
  legs: number;
  max_deadhead_pct: number | null;
  max_layover_hours: number | null;
  max_trip_days: number;
  work_start_hour: number;
  work_end_hour: number;
  cost_settings: CostModelSettings;
  driver_profile: DriverProfile;
  avg_speed_mph: number;
}

export interface DriverProfile {
  trailer_types: string[];
  max_weight: number | null;
  hazmat_certified: boolean;
  twic_card: boolean;
  team_driver: boolean;
}

interface Destination {
  lat: number;
  lng: number;
}

export interface EvaluatedChain {
  total_pay: number;
  total_miles: number;
  total_deadhead_miles: number;
  estimated_deadhead_cost: number;
  profit: number;
  rate_per_mile: number;
  deadhead_pct: number;
  effective_rpm: number;
  estimated_days: number;
  daily_net_profit: number;
  cost_breakdown: RouteCostBreakdown;
  timeline: TripPhase[];
  trip_summary: TripSimulationSummary;
  suggested_departure?: string;
}

// ---------------------------------------------------------------------------
// resolveSearchConfig
// ---------------------------------------------------------------------------

const MAX_SEARCH_RADIUS = 500;
const DEFAULT_SEARCH_RADIUS = 150;
const DEFAULT_MAX_TRIP_DAYS = 10;

export function resolveSearchConfig(
  query: Record<string, unknown>,
  settings: Record<string, unknown>,
): SearchConfig {
  const q = <T>(key: string): T | undefined => query[key] as T | undefined;
  const s = <T>(key: string): T | undefined => settings[key] as T | undefined;
  const pick = <T>(key: string, fallback: T): T =>
    (q<T>(key) ?? s<T>(key) ?? fallback);

  const radiusRaw = pick<number>('search_radius_miles', DEFAULT_SEARCH_RADIUS);
  const search_radius_miles = Math.min(radiusRaw, MAX_SEARCH_RADIUS);

  const cost_settings: CostModelSettings = {};
  const costKeys = [
    'cost_per_mile:flat_cost_per_mile',
    'diesel_price_per_gallon',
    'maintenance_per_mile',
    'tires_per_mile',
    'truck_payment_per_day',
    'insurance_per_day',
    'per_diem_per_day',
    'avg_mpg',
    'avg_driving_hours_per_day',
    'avg_speed_mph',
  ];
  for (const entry of costKeys) {
    const [qKey, cKey] = entry.includes(':') ? entry.split(':') : [entry, entry];
    const val = q<number>(qKey) ?? s<number>(qKey);
    if (val != null) (cost_settings as Record<string, number>)[cKey!] = val;
  }

  return {
    search_radius_miles,
    legs: pick<number>('legs', 1),
    max_deadhead_pct: q<number>('max_deadhead_pct') ?? null,
    max_layover_hours: q<number>('max_layover_hours') ?? null,
    max_trip_days: pick<number>('max_trip_days', DEFAULT_MAX_TRIP_DAYS),
    work_start_hour: pick<number>('work_start_hour', DEFAULT_WORK_START_HOUR),
    work_end_hour: pick<number>('work_end_hour', DEFAULT_WORK_END_HOUR),
    cost_settings,
    avg_speed_mph: pick<number>('avg_speed_mph', DEFAULT_AVG_SPEED_MPH),
    driver_profile: {
      trailer_types: q<string>('trailer_types')
        ? (q<string>('trailer_types')!).split('|')
        : (s<string[]>('trailer_types') ?? []),
      max_weight: q<number>('max_weight') ?? s<number>('max_weight') ?? null,
      hazmat_certified: pick<boolean>('hazmat_certified', false),
      twic_card: pick<boolean>('twic_card', false),
      team_driver: pick<boolean>('team_driver', false),
    },
  };
}

// ---------------------------------------------------------------------------
// computeDepartureTimestamp
// ---------------------------------------------------------------------------

export function computeDepartureTimestamp(
  departureDate: string,
  workStartHour: number,
  workEndHour: number,
  now: Date = new Date(),
): number {
  const depDate = new Date(departureDate + 'T00:00:00Z');
  const todayStr = now.toISOString().slice(0, 10);
  const isToday = departureDate === todayStr;

  if (!isToday) {
    // Future date — use work_start_hour
    depDate.setUTCHours(workStartHour, 0, 0, 0);
    return depDate.getTime();
  }

  // Today
  const currentHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (currentHour >= workEndHour) {
    // Past work end — bump to tomorrow
    depDate.setUTCDate(depDate.getUTCDate() + 1);
    depDate.setUTCHours(workStartHour, 0, 0, 0);
    return depDate.getTime();
  }

  // Before work end — use max(now, work_start)
  if (currentHour < workStartHour) {
    depDate.setUTCHours(workStartHour, 0, 0, 0);
    return depDate.getTime();
  }

  return now.getTime();
}

// ---------------------------------------------------------------------------
// buildTripLegs
// ---------------------------------------------------------------------------

/** Threshold in miles — below this, destination is considered "same as delivery" */
const DESTINATION_MATCH_THRESHOLD_MILES = 10;

export function buildTripLegs(
  orders: OrderRow[],
  deadheadPerLeg: number[],
  destination: Destination | undefined,
): TripLeg[] {
  const tripLegs: TripLeg[] = [];

  for (let i = 0; i < orders.length; i++) {
    if (deadheadPerLeg[i] > 0) {
      tripLegs.push({
        kind: 'deadhead',
        miles: deadheadPerLeg[i],
        weight_lbs: 0,
        origin_city: i === 0 ? '' : orders[i - 1].dest_city,
        destination_city: orders[i].origin_city,
      });
    }
    tripLegs.push(...buildTripLegsForOrder(orders[i]));
  }

  // Trailing deadhead to destination
  if (destination) {
    const lastOrder = orders[orders.length - 1];
    const distToDest = haversine(
      lastOrder.dest_lat, lastOrder.dest_lng,
      destination.lat, destination.lng,
    );
    if (distToDest > DESTINATION_MATCH_THRESHOLD_MILES) {
      tripLegs.push({
        kind: 'deadhead',
        miles: distToDest,
        weight_lbs: 0,
        origin_city: lastOrder.dest_city,
        destination_city: '',
      });
    }
  }

  return tripLegs;
}

function buildTripLegsForOrder(order: OrderRow): TripLeg[] {
  const stopoffs = order.stopoffs;

  if (!stopoffs || stopoffs.length < 2) {
    return [{
      kind: 'load' as const,
      miles: order.miles,
      weight_lbs: order.weight ?? 0,
      origin_city: order.origin_city,
      destination_city: order.dest_city,
      pickup_date_early: order.pickup_date_early ?? undefined,
      pickup_date_late: order.pickup_date_late ?? undefined,
      delivery_date_early: order.delivery_date_early ?? undefined,
      delivery_date_late: order.delivery_date_late ?? undefined,
    }];
  }

  const segmentCount = stopoffs.length - 1;
  const milesPerSegment = order.miles / segmentCount;

  const legs: TripLeg[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const from = stopoffs[i];
    const to = stopoffs[i + 1];
    legs.push({
      kind: 'load',
      miles: milesPerSegment,
      weight_lbs: order.weight ?? 0,
      origin_city: `${from.city}, ${from.state}`,
      destination_city: `${to.city}, ${to.state}`,
      pickup_date_early: from.early_date,
      pickup_date_late: from.late_date,
      delivery_date_early: to.early_date,
      delivery_date_late: to.late_date,
    });
  }
  return legs;
}

// ---------------------------------------------------------------------------
// evaluateChain
// ---------------------------------------------------------------------------

export function evaluateChain(
  orders: OrderRow[],
  deadheadPerLeg: number[],
  destination: Destination | undefined,
  costSettings: CostModelSettings,
  workStartHour: number,
  workEndHour: number,
): EvaluatedChain | null {
  const tripLegs = buildTripLegs(orders, deadheadPerLeg, destination);

  // Simulate
  const sim = simulateTrip({
    legs: tripLegs,
    settings: {
      loaded_speed_mph: costSettings.avg_speed_mph,
      avg_driving_hours_per_day: costSettings.avg_driving_hours_per_day,
      work_start_hour: workStartHour,
      work_end_hour: workEndHour,
    },
  });

  if (!sim.feasible) return null;

  // Cost
  const totalPay = orders.reduce((s, o) => s + o.pay, 0);
  const totalLoadedMiles = orders.reduce((s, o) => s + o.miles, 0);

  const segments = tripLegs.map(leg => ({
    miles: leg.miles,
    weight_lbs: leg.weight_lbs,
  }));

  const result = calculateProfit(totalPay, segments, costSettings);

  const totalDeadhead = tripLegs
    .filter(l => l.kind === 'deadhead')
    .reduce((s, l) => s + l.miles, 0);

  const tripDays = sim.summary.total_days;

  // Daily cost correction if simulator days exceed cost model estimate
  let netProfit = result.net_profit;
  let dailyCosts = result.costs.daily_costs;
  if (tripDays > result.costs.estimated_days) {
    const dailyRate = result.costs.estimated_days > 0
      ? result.costs.daily_costs / result.costs.estimated_days
      : 0;
    const extraCost = (tripDays - result.costs.estimated_days) * dailyRate;
    netProfit -= extraCost;
    dailyCosts += extraCost;
  }

  const dhPct = deadheadPct(totalLoadedMiles, totalDeadhead);
  const eRpm = effectiveRpm(netProfit, totalLoadedMiles, totalDeadhead);
  const dnp = dailyNetProfit(netProfit, tripDays);
  const totalMiles = totalLoadedMiles + totalDeadhead;

  return {
    total_pay: totalPay,
    total_miles: totalLoadedMiles,
    total_deadhead_miles: Math.round(totalDeadhead),
    estimated_deadhead_cost: Math.round(
      totalDeadhead > 0 && result.costs.total_miles > 0
        ? (totalDeadhead / result.costs.total_miles) * result.costs.total_cost
        : totalDeadhead * 1.5,
    ),
    profit: Math.round(netProfit * 100) / 100,
    rate_per_mile: totalMiles > 0
      ? Math.round((totalPay / totalMiles) * 100) / 100
      : 0,
    deadhead_pct: dhPct,
    effective_rpm: eRpm,
    estimated_days: tripDays,
    daily_net_profit: dnp,
    cost_breakdown: {
      fuel: result.costs.fuel,
      maintenance: result.costs.maintenance,
      tires: result.costs.tires,
      daily_costs: Math.round(dailyCosts * 100) / 100,
      total: Math.round((result.costs.fuel + result.costs.maintenance + result.costs.tires + dailyCosts) * 100) / 100,
    },
    timeline: sim.phases,
    trip_summary: sim.summary,
    suggested_departure: computeSuggestedDepartureFromLegs(orders[0], deadheadPerLeg[0], costSettings.avg_speed_mph ?? DEFAULT_AVG_SPEED_MPH, workStartHour),
  };
}

/**
 * Compute suggested departure: work_start_hour on departure day,
 * adjusted if the pickup window requires an earlier start.
 */
function computeSuggestedDepartureFromLegs(
  firstOrder: OrderRow,
  deadheadMiles: number,
  avgSpeedMph: number,
  workStartHour: number,
): string | undefined {
  const firstPickupStopoff = firstOrder.stopoffs?.find(s => s.type === 'pickup');
  const pickupEarly = firstPickupStopoff?.early_date ?? firstOrder.pickup_date_early;
  if (!pickupEarly) return undefined;

  const pickupEarlyMs = new Date(pickupEarly).getTime();
  const transitMs = (deadheadMiles / avgSpeedMph) * MS_PER_HOUR;

  const naiveDepartMs = pickupEarlyMs - transitMs;
  const naiveDepart = new Date(naiveDepartMs);

  if (naiveDepart.getUTCHours() >= workStartHour) {
    return naiveDepart.toISOString();
  }

  const clamped = new Date(naiveDepartMs);
  clamped.setUTCHours(workStartHour, 0, 0, 0);

  const arrivalMs = clamped.getTime() + transitMs;
  const pickupLate = firstPickupStopoff?.late_date ?? firstOrder.pickup_date_late;
  if (pickupLate) {
    if (arrivalMs <= new Date(pickupLate).getTime()) {
      return clamped.toISOString();
    }
  }

  return naiveDepart.toISOString();
}
```

- [ ] **Step 4: Run tests**

Run: `cd api && npx jest route-search.engine --no-coverage`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: route search engine with pure functions and tests"
```

---

### Task 4: Create SQL builder + tests

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-backend`
**Files:**
- Create: `api/src/routes/route-search.sql.ts`
- Create: `api/src/routes/route-search.sql.spec.ts`

- [ ] **Step 1: Write SQL builder tests**

Create `api/src/routes/route-search.sql.spec.ts`:

```typescript
import { buildCandidatesSql } from './route-search.sql';
import type { DriverProfile } from './route-search.engine';

describe('buildCandidatesSql', () => {
  const baseProfile: DriverProfile = {
    trailer_types: [],
    max_weight: null,
    hazmat_certified: false,
    twic_card: false,
    team_driver: false,
  };

  it('should include pickup reachability filter', () => {
    const { sql } = buildCandidatesSql(baseProfile);
    expect(sql).toContain('pickup_date_late >=');
  });

  it('should not have a LIMIT clause', () => {
    const { sql } = buildCandidatesSql(baseProfile);
    expect(sql.toUpperCase()).not.toContain('LIMIT');
  });

  it('should include ST_DWithin radius filter', () => {
    const { sql } = buildCandidatesSql(baseProfile);
    expect(sql).toContain('ST_DWithin');
  });

  it('should exclude hazmat when not certified', () => {
    const { sql } = buildCandidatesSql({ ...baseProfile, hazmat_certified: false });
    expect(sql).toContain('hazmat IS NULL OR hazmat = FALSE');
  });

  it('should allow hazmat when certified', () => {
    const { sql } = buildCandidatesSql({ ...baseProfile, hazmat_certified: true });
    expect(sql).not.toContain('hazmat');
  });

  it('should add trailer type filter when provided', () => {
    const { sql, extraParams } = buildCandidatesSql({
      ...baseProfile,
      trailer_types: ['flatbed', 'van'],
    });
    expect(sql).toContain('trailer_type = ANY');
    expect(extraParams).toContainEqual(['flatbed', 'van']);
  });

  it('should add weight filter when provided', () => {
    const { sql, extraParams } = buildCandidatesSql({
      ...baseProfile,
      max_weight: 45000,
    });
    expect(sql).toContain('weight IS NULL OR weight <=');
    expect(extraParams).toContain(45000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest route-search.sql --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write the SQL builder**

Create `api/src/routes/route-search.sql.ts`:

```typescript
import { METERS_PER_MILE, MS_PER_HOUR } from '@mwbhtx/haulvisor-core';
import type { DriverProfile } from './route-search.engine';

export function buildCandidatesSql(profile: DriverProfile): {
  sql: string;
  extraParams: unknown[];
} {
  // Base params: $1=lat, $2=lng, $3=companyId, $4=searchRadiusMeters, $5=departureTimestamp, $6=avgSpeedMph
  const conditions: string[] = [
    `company_id = $3`,
    `order_status = 'open'`,
    `origin_point IS NOT NULL`,
    `pickup_date_early IS NOT NULL`,
    `pickup_date_late IS NOT NULL`,
    `delivery_date_early IS NOT NULL`,
    `delivery_date_late IS NOT NULL`,
    `ST_DWithin(origin_point, ST_MakePoint($2, $1)::geography, $4)`,
    // Pickup reachability: can the driver drive from origin to this pickup by pickup_date_late?
    // Simple estimate: deadhead_miles / avg_speed_mph hours of driving
    `pickup_date_late >= to_timestamp($5::bigint / 1000.0) + (ST_Distance(origin_point, ST_MakePoint($2, $1)::geography) / ${METERS_PER_MILE} / $6) * interval '1 hour'`,
  ];

  let paramIndex = 7;
  const extraParams: unknown[] = [];

  if (!profile.hazmat_certified) {
    conditions.push(`(hazmat IS NULL OR hazmat = FALSE)`);
  }
  if (!profile.twic_card) {
    conditions.push(`(twic IS NULL OR twic = FALSE)`);
  }
  if (!profile.team_driver) {
    conditions.push(`(team_load IS NULL OR team_load = FALSE)`);
  }
  if (profile.max_weight != null) {
    conditions.push(`(weight IS NULL OR weight <= $${paramIndex})`);
    extraParams.push(profile.max_weight);
    paramIndex++;
  }
  if (profile.trailer_types.length > 0) {
    conditions.push(`trailer_type = ANY($${paramIndex}::text[])`);
    extraParams.push(profile.trailer_types);
    paramIndex++;
  }

  const sql = `
SELECT order_id, origin_city, origin_state, dest_city, dest_state,
  ST_Y(origin_point::geometry) AS origin_lat, ST_X(origin_point::geometry) AS origin_lng,
  ST_Y(dest_point::geometry) AS dest_lat, ST_X(dest_point::geometry) AS dest_lng,
  pay::real, miles::real, rate_per_mile::real, trailer_type, weight::real,
  stopoffs, tarp_height,
  pickup_date_early, pickup_date_late, delivery_date_early, delivery_date_late,
  hazmat, twic, team_load,
  ST_Distance(origin_point, ST_MakePoint($2, $1)::geography) / ${METERS_PER_MILE} AS deadhead_miles
FROM orders
WHERE ${conditions.join('\n  AND ')}
ORDER BY deadhead_miles ASC
`;

  return { sql, extraParams };
}
```

- [ ] **Step 4: Run tests**

Run: `cd api && npx jest route-search.sql --no-coverage`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: route search SQL builder with pickup reachability filter"
```

---

### Task 5: Create unified search service (orchestrator)

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-backend`
**Files:**
- Create: `api/src/routes/route-search.service.ts`

- [ ] **Step 1: Write the orchestrator service**

Create `api/src/routes/route-search.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import {
  RouteChain,
  RouteLeg,
  RouteSearchResult,
  haversine,
  resolveSettings,
  METERS_PER_MILE,
  MS_PER_DAY,
} from '@mwbhtx/haulvisor-core';
import { PostgresService } from '../postgres/postgres.service';
import { SettingsService } from '../settings/settings.service';
import { CompaniesService } from '../companies/companies.service';
import { RouteSearchDto } from './dto/route-search.dto';
import {
  resolveSearchConfig,
  computeDepartureTimestamp,
  evaluateChain,
  type OrderRow,
  type SearchConfig,
} from './route-search.engine';
import { buildCandidatesSql } from './route-search.sql';

const TOP_LANES_LIMIT = 20;

@Injectable()
export class RouteSearchService {
  private readonly logger = new Logger(RouteSearchService.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly settingsService: SettingsService,
    private readonly companiesService: CompaniesService,
  ) {}

  async search(
    companyId: string,
    userId: string,
    query: RouteSearchDto,
  ): Promise<RouteSearchResult> {
    // Step 1: Resolve config
    const userSettings = await this.settingsService.getSettings(userId);
    const config = resolveSearchConfig(query as Record<string, unknown>, userSettings);
    const resolved = resolveSettings(config.cost_settings);

    // Step 2: Compute departure timestamp
    const departureTs = computeDepartureTimestamp(
      query.departure_date,
      config.work_start_hour,
      config.work_end_hour,
    );

    // Step 3: Query candidates
    const searchRadiusMeters = config.search_radius_miles * METERS_PER_MILE;
    const { sql: candidatesSql, extraParams } = buildCandidatesSql(config.driver_profile);

    const destination = query.destination_lat != null && query.destination_lng != null
      ? { lat: query.destination_lat, lng: query.destination_lng }
      : undefined;

    const leg1Candidates = await this.postgres.query<OrderRow>(
      candidatesSql,
      [query.origin_lat, query.origin_lng, companyId, searchRadiusMeters, departureTs, config.avg_speed_mph, ...extraParams],
    );

    this.logger.log(`Search: ${leg1Candidates.length} candidates, ${config.legs} legs, ${config.search_radius_miles}mi radius`);

    // Step 4-6: Build chains, simulate, cost
    const limit = pLimit(8);
    let chains: RouteChain[];

    if (config.legs === 1) {
      chains = this.buildOneLegChains(leg1Candidates, destination, config);
    } else if (config.legs === 2) {
      chains = await this.buildTwoLegChains(
        limit, leg1Candidates, candidatesSql, extraParams,
        companyId, searchRadiusMeters, departureTs,
        destination, config,
      );
    } else {
      chains = await this.buildThreeLegChains(
        limit, leg1Candidates, candidatesSql, extraParams,
        companyId, searchRadiusMeters, departureTs,
        destination, config,
      );
    }

    // Step 7: Apply filters
    let filtered = chains;
    if (config.max_deadhead_pct != null) {
      const maxPct = config.max_deadhead_pct;
      filtered = filtered.filter(c => c.deadhead_pct <= maxPct);
    }
    if (config.max_trip_days != null) {
      filtered = filtered.filter(c => c.estimated_days <= config.max_trip_days);
    }
    // max_layover_hours is enforced by the simulator (waiting phases)
    // but we can also filter here if needed
    if (config.max_layover_hours != null) {
      const maxWait = config.max_layover_hours;
      filtered = filtered.filter(c => {
        if (!c.trip_summary) return true;
        return c.trip_summary.waiting_hours <= maxWait;
      });
    }

    // Step 8: Sort and rank
    filtered.sort((a, b) => b.daily_net_profit - a.daily_net_profit);

    // Tag top lanes
    const topLanes = await this.getTopLanes(companyId);
    for (const chain of filtered) {
      for (const leg of chain.legs) {
        const laneKey = `${leg.origin_state}→${leg.destination_state}`;
        const rank = topLanes.get(laneKey);
        if (rank != null) leg.lane_rank = rank;
      }
    }

    const routes = filtered.map((chain, i) => ({ ...chain, rank: i + 1 }));

    this.logger.log(`Search: ${chains.length} valid chains → ${routes.length} after filters`);

    const company = await this.companiesService.findOne(companyId);

    return {
      routes,
      origin: {
        city: (userSettings.home_base_city as string) || '',
        state: (userSettings.home_base_state as string) || '',
        lat: query.origin_lat,
        lng: query.origin_lng,
      },
      order_url_template: company?.order_url_template,
    };
  }

  // ── Chain builders ──────────────────────────────────────────────────────

  private buildOneLegChains(
    candidates: OrderRow[],
    destination: { lat: number; lng: number } | undefined,
    config: SearchConfig,
  ): RouteChain[] {
    const chains: RouteChain[] = [];
    for (const order of candidates) {
      const result = evaluateChain(
        [order], [order.deadhead_miles], destination,
        config.cost_settings, config.work_start_hour, config.work_end_hour,
      );
      if (!result) continue;
      chains.push({
        ...result,
        rank: 0,
        legs: [this.orderToLeg(order, 1)],
      });
    }
    return chains;
  }

  private async buildTwoLegChains(
    limit: <T>(fn: () => Promise<T>) => Promise<T>,
    leg1Candidates: OrderRow[],
    candidatesSql: string,
    extraParams: unknown[],
    companyId: string,
    searchRadiusMeters: number,
    departureTs: number,
    destination: { lat: number; lng: number } | undefined,
    config: SearchConfig,
  ): Promise<RouteChain[]> {
    const chainArrays = await Promise.all(
      leg1Candidates.map((leg1) =>
        limit(async () => {
          const localChains: RouteChain[] = [];
          const dh1 = leg1.deadhead_miles;

          const leg2Candidates = await this.postgres.query<OrderRow>(
            candidatesSql,
            [leg1.dest_lat, leg1.dest_lng, companyId, searchRadiusMeters, departureTs, config.avg_speed_mph, ...extraParams],
          );

          for (const leg2 of leg2Candidates) {
            if (leg2.order_id === leg1.order_id) continue;

            const result = evaluateChain(
              [leg1, leg2], [dh1, leg2.deadhead_miles], destination,
              config.cost_settings, config.work_start_hour, config.work_end_hour,
            );
            if (!result) continue;

            localChains.push({
              ...result,
              rank: 0,
              legs: [
                this.orderToLeg(leg1, 1),
                this.orderToLeg(leg2, 2),
              ],
            });
          }
          return localChains;
        }),
      ),
    );
    return chainArrays.flat();
  }

  private async buildThreeLegChains(
    limit: <T>(fn: () => Promise<T>) => Promise<T>,
    leg1Candidates: OrderRow[],
    candidatesSql: string,
    extraParams: unknown[],
    companyId: string,
    searchRadiusMeters: number,
    departureTs: number,
    destination: { lat: number; lng: number } | undefined,
    config: SearchConfig,
  ): Promise<RouteChain[]> {
    const chainArrays = await Promise.all(
      leg1Candidates.map((leg1) =>
        limit(async () => {
          const localChains: RouteChain[] = [];
          const dh1 = leg1.deadhead_miles;

          const leg2Candidates = await this.postgres.query<OrderRow>(
            candidatesSql,
            [leg1.dest_lat, leg1.dest_lng, companyId, searchRadiusMeters, departureTs, config.avg_speed_mph, ...extraParams],
          );

          for (const leg2 of leg2Candidates) {
            if (leg2.order_id === leg1.order_id) continue;
            const dh2 = leg2.deadhead_miles;

            const leg3Candidates = await this.postgres.query<OrderRow>(
              candidatesSql,
              [leg2.dest_lat, leg2.dest_lng, companyId, searchRadiusMeters, departureTs, config.avg_speed_mph, ...extraParams],
            );

            for (const leg3 of leg3Candidates) {
              if (leg3.order_id === leg1.order_id || leg3.order_id === leg2.order_id) continue;

              const result = evaluateChain(
                [leg1, leg2, leg3], [dh1, dh2, leg3.deadhead_miles], destination,
                config.cost_settings, config.work_start_hour, config.work_end_hour,
              );
              if (!result) continue;

              localChains.push({
                ...result,
                rank: 0,
                legs: [
                  this.orderToLeg(leg1, 1),
                  this.orderToLeg(leg2, 2),
                  this.orderToLeg(leg3, 3),
                ],
              });
            }
          }
          return localChains;
        }),
      ),
    );
    return chainArrays.flat();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private orderToLeg(row: OrderRow, legNumber: number): RouteLeg {
    return {
      leg_number: legNumber,
      order_id: row.order_id,
      origin_city: row.origin_city,
      origin_state: row.origin_state,
      origin_lat: row.origin_lat,
      origin_lng: row.origin_lng,
      destination_city: row.dest_city,
      destination_state: row.dest_state,
      destination_lat: row.dest_lat,
      destination_lng: row.dest_lng,
      pay: row.pay,
      miles: row.miles,
      trailer_type: row.trailer_type,
      deadhead_miles: Math.round(row.deadhead_miles),
      weight: row.weight ?? undefined,
      pickup_date_early: row.pickup_date_early ?? undefined,
      pickup_date_late: row.pickup_date_late ?? undefined,
      delivery_date_early: row.delivery_date_early ?? undefined,
      delivery_date_late: row.delivery_date_late ?? undefined,
      tarp_height: row.tarp_height ?? undefined,
    };
  }

  private async getTopLanes(companyId: string): Promise<Map<string, number>> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const rows = await this.postgres.query<{ lane: string }>(
      `SELECT origin_state || '→' || dest_state AS lane, COUNT(*)::int AS cnt
       FROM orders
       WHERE company_id = $1 AND opened_at >= $2
       GROUP BY lane ORDER BY cnt DESC LIMIT ${TOP_LANES_LIMIT}`,
      [companyId, thirtyDaysAgo],
    );
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.lane, i + 1));
    return map;
  }
}
```

- [ ] **Step 2: Build to verify compilation**

Run: `npm run build`
Expected: Compilation succeeds (old services still exist, new one compiles alongside)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: unified route search service orchestrator"
```

---

### Task 6: Wire up controller, update module, remove old files

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor-backend`
**Files:**
- Modify: `api/src/routes/routes.controller.ts`
- Modify: `api/src/routes/routes.module.ts`
- Delete: `api/src/routes/routes.service.ts`
- Delete: `api/src/routes/round-trip.service.ts`
- Delete: `api/src/routes/round-trip.service.spec.ts`
- Delete: `api/src/routes/suggested-departure.ts`
- Delete: `api/src/routes/local-to-utc.ts`
- Delete: `api/src/routes/dto/round-trip-search.dto.ts` (if not already deleted)

- [ ] **Step 1: Update the controller**

Overwrite `api/src/routes/routes.controller.ts`:

```typescript
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { assertCompanyAccess } from '../auth/company-access.guard';
import { RequestUser } from '@mwbhtx/haulvisor-core';
import { RouteSearchService } from './route-search.service';
import { RouteSearchDto } from './dto/route-search.dto';

@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routeSearchService: RouteSearchService,
  ) {}

  @Get(':companyId/search')
  @Roles('admin', 'user', 'demo')
  async search(
    @Param('companyId') companyId: string,
    @Query() query: RouteSearchDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    return this.routeSearchService.search(companyId, req.user.userId, query);
  }
}
```

- [ ] **Step 2: Update the module**

Overwrite `api/src/routes/routes.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RouteSearchService } from './route-search.service';
import { DrivingDistanceService } from './driving-distance.service';
import { SettingsModule } from '../settings/settings.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [SettingsModule, CompaniesModule],
  controllers: [RoutesController],
  providers: [RouteSearchService, DrivingDistanceService],
})
export class RoutesModule {}
```

- [ ] **Step 3: Delete old files**

```bash
rm api/src/routes/routes.service.ts
rm api/src/routes/round-trip.service.ts
rm api/src/routes/round-trip.service.spec.ts
rm api/src/routes/suggested-departure.ts
rm api/src/routes/local-to-utc.ts
rm -f api/src/routes/dto/round-trip-search.dto.ts
```

- [ ] **Step 4: Fix any remaining imports**

Search the codebase for any remaining imports of removed files and update them. Check:
- `api/src/routes/lanes.service.ts` (if it exists, may import from old services)
- Any other file that imports `RoutesService`, `RoundTripService`, `RoundTripSearchDto`, `computeSuggestedDeparture`, or `localTimeToUtcSuffix`

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 6: Run tests**

Run: `cd api && npm test`
Expected: All tests pass (old round-trip tests are deleted, new engine tests pass)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: wire unified search service, remove old route services"
```

---

## Phase 3: Frontend (haulvisor)

### Task 7: Update core types and search hook

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor`
**Files:**
- Modify: `src/core/hooks/use-routes.ts`
- Modify: `src/core/types/index.ts`

- [ ] **Step 1: Update core package**

```bash
npm update @mwbhtx/haulvisor-core
```

- [ ] **Step 2: Update type exports**

In `src/core/types/index.ts`, remove any re-exports of `RoundTripChain`, `RoundTripLeg`, `RoundTripSearchResult`. Ensure `RouteChain`, `RouteLeg`, `RouteSearchResult` are exported.

- [ ] **Step 3: Replace both hooks with a single unified hook**

Overwrite `src/core/hooks/use-routes.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/core/services/api";
import type { RouteSearchResult } from "@mwbhtx/haulvisor-core";

export interface RouteSearchParams {
  origin_lat: number;
  origin_lng: number;
  departure_date: string;
  destination_lat?: number;
  destination_lng?: number;
  search_radius_miles?: number;
  legs?: number;
  max_deadhead_pct?: number;
  max_layover_hours?: number;
  max_trip_days?: number;
  // Driver profile
  trailer_types?: string;
  max_weight?: number;
  hazmat_certified?: boolean;
  twic_card?: boolean;
  team_driver?: boolean;
  // Cost model
  cost_per_mile?: number;
  diesel_price_per_gallon?: number;
  maintenance_per_mile?: number;
  tires_per_mile?: number;
  truck_payment_per_day?: number;
  insurance_per_day?: number;
  per_diem_per_day?: number;
  avg_mpg?: number;
  avg_driving_hours_per_day?: number;
  // Work hours
  work_start_hour?: number;
  work_end_hour?: number;
}

export function useRouteSearch(companyId: string, params: RouteSearchParams | null) {
  return useQuery<RouteSearchResult>({
    queryKey: ["routes", companyId, params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (!params) throw new Error("params required");
      // Build query string from all non-null params
      for (const [key, value] of Object.entries(params)) {
        if (value != null) qs.set(key, String(value));
      }
      return fetchApi<RouteSearchResult>(`routes/${companyId}/search?${qs.toString()}`);
    },
    enabled: !!companyId && !!params,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: unified route search hook, remove one-way/round-trip split"
```

---

### Task 8: Update search form and views

**Repo:** `/Users/matthewbennett/Documents/GitHub/haulvisor`
**Files:**
- Modify: `src/features/routes/components/search-form.tsx`
- Modify: `src/features/routes/views/desktop/desktop-routes-view.tsx`
- Modify: `src/features/routes/views/desktop/location-sidebar.tsx`
- Modify: `src/features/routes/views/desktop/route-list.tsx`
- Modify: `src/features/routes/views/desktop/route-row.tsx`
- Modify: `src/features/routes/views/desktop/route-detail-panel.tsx`
- Modify: `src/features/routes/views/mobile/mobile-routes-view.tsx`
- Modify: `src/features/routes/views/mobile/screens/filters-sheet.tsx`

This task is a frontend refactor that touches many view files. The key changes are:

- [ ] **Step 1: Remove the one-way/round-trip mode toggle from search-form.tsx**

Replace the mode toggle with:
- `departure_date` field (required, defaults to tomorrow's date)
- `destination` field (optional, defaults to home base from settings, clearable)
- Remove `isRoundTrip` / `isOneWay` state and all conditional logic based on it
- Call `useRouteSearch` instead of separate `useRouteSearch`/`useRoundTripSearch`

The search form should always call the same endpoint. When destination is populated, it's sent. When cleared, it's omitted.

- [ ] **Step 2: Update desktop-routes-view.tsx**

- Remove any `routeChainToRoundTrip` or `roundTripToRouteChain` converter functions — there's only one type now
- Remove any conditional rendering based on one-way vs round-trip
- Use `RouteChain` everywhere instead of `RoundTripChain`

- [ ] **Step 3: Update location-sidebar.tsx and route-list.tsx**

- Remove `routeChainToRoundTrip` converters
- Use `chain.profit` instead of `chain.firm_profit`
- Use `chain.legs[n].leg_number` (already present)
- Remove references to `RoundTripChain`, `RoundTripLeg`

- [ ] **Step 4: Update route-row.tsx and route-detail-panel.tsx**

- Update to use `RouteChain` and `RouteLeg` types
- Replace `firm_profit` with `profit`
- Replace `estimated_total_profit` with `profit`

- [ ] **Step 5: Update mobile views**

- `mobile-routes-view.tsx` — remove one-way/round-trip branching, use unified types
- `filters-sheet.tsx` — remove any mode-specific filters, add `departure_date` and `destination` fields

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove one-way/round-trip distinction from frontend"
```
