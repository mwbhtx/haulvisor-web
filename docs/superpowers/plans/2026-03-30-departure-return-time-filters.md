# Departure & Return Time Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Leave By / Return By date+time filters, update idle presets, fix bookmark icon, and fix nudge arrow theming across haulvisor, haulvisor-core, and haulvisor-backend.

**Architecture:** Constants (TIME_PRESETS, IDLE_OPTIONS) live in haulvisor-core. Frontend adds new filter pills and wires new query params. Backend relaxes DTO validation and uses new time params in simulation logic. Timezone conversion uses `geo-tz` on the frontend before sending UTC to the backend.

**Tech Stack:** Next.js (React), NestJS, TypeScript, `geo-tz`, `react-day-picker`, `driver.js`, `class-validator`

---

### Task 1: Update haulvisor-core — IDLE_OPTIONS, TIME_PRESETS, DEFAULT_MAX_IDLE_HOURS

**Files:**
- Modify: `../haulvisor-core/src/search-defaults.ts:21-34`

- [ ] **Step 1: Replace IDLE_OPTIONS and DEFAULT_MAX_IDLE_HOURS**

In `../haulvisor-core/src/search-defaults.ts`, replace lines 21-34:

```typescript
// ── Idle / layover ───────────────────────────────────────────────────────────

/** Preset idle-time options (hours) for filter UIs */
export const IDLE_OPTIONS = [
  { value: 2,  label: '2 Hours',  description: 'Keep me rolling' },
  { value: 4,  label: '4 Hours',  description: 'Meal and short break' },
  { value: 8,  label: '8 Hours',  description: 'A shift, maybe overnight' },
  { value: 24, label: '24 Hours', description: 'Flexible, rest or appointments' },
  { value: 0,  label: 'Any',      description: 'No limit, show everything' },
] as const;

/** Default max idle hours between loads (0 = Any) */
export const DEFAULT_MAX_IDLE_HOURS = 0;
```

- [ ] **Step 2: Add TIME_PRESETS constant**

Append at the bottom of `../haulvisor-core/src/search-defaults.ts`:

```typescript
// ── Time presets (shared by Leave By / Return By filters) ───────────────────

export const TIME_PRESETS = [
  { label: 'Any', value: '' },
  { label: '5:00 AM', value: '05:00' },
  { label: '6:00 AM', value: '06:00' },
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:00 AM', value: '11:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '1:00 PM', value: '13:00' },
  { label: '2:00 PM', value: '14:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '4:00 PM', value: '16:00' },
  { label: '5:00 PM', value: '17:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '7:00 PM', value: '19:00' },
  { label: '8:00 PM', value: '20:00' },
  { label: '9:00 PM', value: '21:00' },
] as const;
```

- [ ] **Step 3: Rebuild haulvisor-core**

Run: `cd ../haulvisor-core && npm run build`
Expected: Clean build, no errors

- [ ] **Step 4: Commit**

```bash
cd ../haulvisor-core
git add src/search-defaults.ts
git commit -m "feat: update IDLE_OPTIONS to hour-based presets, add TIME_PRESETS"
```

---

### Task 2: Backend — Relax DTO validation for max_layover_hours and max_idle_hours

**Files:**
- Modify: `../haulvisor-backend/api/src/routes/dto/route-search.dto.ts:49-52`
- Modify: `../haulvisor-backend/api/src/routes/dto/round-trip-search.dto.ts:122-127`
- Modify: `../haulvisor-backend/api/src/settings/dto/update-settings.dto.ts:162-168`

- [ ] **Step 1: Update route-search.dto.ts — remove Min(24)**

In `../haulvisor-backend/api/src/routes/dto/route-search.dto.ts`, change the `max_layover_hours` block (lines 48-52) from:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(120)
  max_layover_hours?: number;
```

to:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  max_layover_hours?: number;
```

- [ ] **Step 2: Update round-trip-search.dto.ts — remove Min(24)**

In `../haulvisor-backend/api/src/routes/dto/round-trip-search.dto.ts`, change the `max_layover_hours` block (lines 122-127) from:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(120)
  max_layover_hours?: number;
```

to:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  max_layover_hours?: number;
```

- [ ] **Step 3: Update update-settings.dto.ts — relax max_idle_hours Min**

In `../haulvisor-backend/api/src/settings/dto/update-settings.dto.ts`, change the `max_idle_hours` block (lines 162-168) from:

```typescript
  @IsOptional()
  @ValidateIf((o) => o.max_idle_hours !== null)
  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(120)
  max_idle_hours?: number | null;
```

to:

```typescript
  @IsOptional()
  @ValidateIf((o) => o.max_idle_hours !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  max_idle_hours?: number | null;
```

- [ ] **Step 4: Commit**

```bash
cd ../haulvisor-backend
git add api/src/routes/dto/route-search.dto.ts api/src/routes/dto/round-trip-search.dto.ts api/src/settings/dto/update-settings.dto.ts
git commit -m "feat: relax max_layover_hours Min from 24 to 0 for new idle presets"
```

---

### Task 3: Backend — Add depart_by, depart_by_time, home_by_time DTO params

**Files:**
- Modify: `../haulvisor-backend/api/src/routes/dto/route-search.dto.ts`
- Modify: `../haulvisor-backend/api/src/routes/dto/round-trip-search.dto.ts`
- Modify: `../haulvisor-backend/api/src/recent-searches/dto/create-recent-search.dto.ts:13-37`

- [ ] **Step 1: Add depart_by and depart_by_time to route-search.dto.ts**

Add before the closing brace of `RouteSearchDto` in `../haulvisor-backend/api/src/routes/dto/route-search.dto.ts`:

```typescript
  @IsOptional()
  depart_by?: string;

  @IsOptional()
  depart_by_time?: string;
```

- [ ] **Step 2: Add depart_by, depart_by_time, and home_by_time to round-trip-search.dto.ts**

Add after the `home_by` field (line 27) in `../haulvisor-backend/api/src/routes/dto/round-trip-search.dto.ts`:

```typescript
  @IsOptional()
  home_by_time?: string;

  @IsOptional()
  depart_by?: string;

  @IsOptional()
  depart_by_time?: string;
```

- [ ] **Step 3: Add new fields to FiltersDto in create-recent-search.dto.ts**

Add to the `FiltersDto` class in `../haulvisor-backend/api/src/recent-searches/dto/create-recent-search.dto.ts`, after the existing `homeBy` field:

```typescript
  @IsOptional()
  @IsString()
  homeByTime?: string;

  @IsOptional()
  @IsString()
  departBy?: string;

  @IsOptional()
  @IsString()
  departByTime?: string;
```

- [ ] **Step 4: Commit**

```bash
cd ../haulvisor-backend
git add api/src/routes/dto/route-search.dto.ts api/src/routes/dto/round-trip-search.dto.ts api/src/recent-searches/dto/create-recent-search.dto.ts
git commit -m "feat: add depart_by, depart_by_time, home_by_time DTO params"
```

---

### Task 4: Backend — Use home_by_time in return-by deadline calculation

**Files:**
- Modify: `../haulvisor-backend/api/src/routes/round-trip.service.ts:369`

- [ ] **Step 1: Update returnByDeadline to use home_by_time**

In `../haulvisor-backend/api/src/routes/round-trip.service.ts`, replace line 369:

```typescript
    const returnByDeadline = query.home_by ? new Date(query.home_by + 'T23:59:59').getTime() : null;
```

with:

```typescript
    const returnByDeadline = query.home_by
      ? new Date(query.home_by + 'T' + (query.home_by_time || '23:59:59')).getTime()
      : null;
```

Note: `home_by_time` arrives as UTC `"HH:00"` from the frontend. When provided (e.g. `"17:00"`), this produces `"2026-04-02T17:00"`. When not provided, falls back to `"T23:59:59"` (existing behavior).

- [ ] **Step 2: Commit**

```bash
cd ../haulvisor-backend
git add api/src/routes/round-trip.service.ts
git commit -m "feat: use home_by_time in return-by deadline calculation"
```

---

### Task 5: Backend — Use depart_by/depart_by_time as simulation anchor

**Files:**
- Modify: `../haulvisor-backend/api/src/routes/round-trip.service.ts:275-283`
- Modify: `../haulvisor-backend/api/src/routes/routes.service.ts` (similar extraction area)

- [ ] **Step 1: Extract depart_by params in round-trip.service.ts**

In `../haulvisor-backend/api/src/routes/round-trip.service.ts`, after line 283 (`const maxLayoverHours = query.max_layover_hours;`), add:

```typescript
    const departBy = query.depart_by && query.depart_by_time
      ? new Date(query.depart_by + 'T' + query.depart_by_time).getTime()
      : query.depart_by
        ? new Date(query.depart_by + 'T00:00:00').getTime()
        : null;
```

This value is now available for chain builders to use as a simulation start anchor. The chain builders filter out orders whose pickup windows have closed before `departBy`. The specific integration point depends on how `buildTwoLegChains` and `buildThreeLegChains` currently receive parameters — pass `departBy` as an additional parameter and use it as a floor for pickup window filtering.

- [ ] **Step 2: Extract depart_by params in routes.service.ts**

In `../haulvisor-backend/api/src/routes/routes.service.ts`, near the equivalent query extraction area (around line 112), add:

```typescript
    const departBy = query.depart_by && query.depart_by_time
      ? new Date(query.depart_by + 'T' + query.depart_by_time).getTime()
      : query.depart_by
        ? new Date(query.depart_by + 'T00:00:00').getTime()
        : null;
```

- [ ] **Step 3: Commit**

```bash
cd ../haulvisor-backend
git add api/src/routes/round-trip.service.ts api/src/routes/routes.service.ts
git commit -m "feat: extract depart_by datetime as simulation anchor"
```

---

### Task 6: Frontend — Install geo-tz and create timezone conversion utility

**Files:**
- Modify: `package.json`
- Create: `src/core/utils/local-to-utc.ts`

- [ ] **Step 1: Install geo-tz**

Run: `npm install geo-tz`

- [ ] **Step 2: Create local-to-utc.ts**

Create `src/core/utils/local-to-utc.ts`:

```typescript
import { find as geoTzFind } from "geo-tz";

/**
 * Convert a local hour string (e.g. "08:00") at a given lat/lng
 * to a UTC hour string (e.g. "13:00").
 *
 * Uses the geo-tz library to resolve the IANA timezone from coordinates,
 * then calculates the UTC offset for today.
 */
export function localHourToUtc(
  localHour: string,
  lat: number,
  lng: number,
): string {
  const [h, m] = localHour.split(":").map(Number);
  const tzNames = geoTzFind(lat, lng);
  const tz = tzNames[0] ?? "UTC";

  // Build a date string for today at the given local hour
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Use Intl to find the UTC offset for this timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  // Create a Date in UTC at the local hour, then adjust by offset
  const localDate = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  // Get the offset by comparing local representation to UTC
  const utcRef = new Date(`${dateStr}T12:00:00Z`);
  const parts = formatter.formatToParts(utcRef);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // Parse offset like "GMT-5" or "GMT+5:30"
  const offsetMatch = offsetPart.match(/GMT([+-]?)(\d{1,2})(?::(\d{2}))?/);
  let offsetMinutes = 0;
  if (offsetMatch) {
    const sign = offsetMatch[1] === "-" ? -1 : 1;
    offsetMinutes = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0));
  }

  // UTC = local - offset
  const utcMinutes = h * 60 + m - offsetMinutes;
  // Normalize to 0-1439 range (wrap around midnight)
  const normalized = ((utcMinutes % 1440) + 1440) % 1440;
  const utcH = Math.floor(normalized / 60);
  const utcM = normalized % 60;

  return `${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build` (or `npx tsc --noEmit`)
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/core/utils/local-to-utc.ts
git commit -m "feat: add geo-tz timezone conversion utility"
```

---

### Task 7: Frontend — Add depart_by/depart_by_time/home_by_time to query param interfaces

**Files:**
- Modify: `src/core/hooks/use-routes.ts`

- [ ] **Step 1: Add new params to RouteSearchParams interface**

In `src/core/hooks/use-routes.ts`, add to the `RouteSearchParams` interface (after line 16 `max_layover_hours`):

```typescript
  depart_by?: string;
  depart_by_time?: string;
```

- [ ] **Step 2: Add new params to RoundTripSearchParams interface**

In `src/core/hooks/use-routes.ts`, add to the `RoundTripSearchParams` interface. After `home_by` (line 48):

```typescript
  home_by_time?: string;
  depart_by?: string;
  depart_by_time?: string;
```

- [ ] **Step 3: Wire new params into useRouteSearch URLSearchParams builder**

In `src/core/hooks/use-routes.ts`, inside the `useRouteSearch` queryFn, after line 32 (`if (params.max_layover_hours != null) ...`), add:

```typescript
        if (params.depart_by) qs.set("depart_by", params.depart_by);
        if (params.depart_by_time) qs.set("depart_by_time", params.depart_by_time);
```

- [ ] **Step 4: Wire new params into useRoundTripSearch URLSearchParams builder**

In `src/core/hooks/use-routes.ts`, inside the `useRoundTripSearch` queryFn, after line 81 (`if (params.home_by) ...`), add:

```typescript
        if (params.home_by_time) qs.set("home_by_time", params.home_by_time);
        if (params.depart_by) qs.set("depart_by", params.depart_by);
        if (params.depart_by_time) qs.set("depart_by_time", params.depart_by_time);
```

- [ ] **Step 5: Commit**

```bash
git add src/core/hooks/use-routes.ts
git commit -m "feat: add depart_by, depart_by_time, home_by_time to route search params"
```

---

### Task 8: Frontend — Rename Home By → Return By, add Leave By pill, add time pickers

**Files:**
- Modify: `src/features/routes/components/search-form.tsx`

This is the largest UI task. It involves:
1. Adding the `TIME_PRESETS` import
2. Renaming `HomeByPill` to `ReturnByPill` with time dropdown
3. Creating a new `LeaveByPill` with date + time
4. Adding new state variables and wiring them into search calls
5. Updating sessionStorage persistence

- [ ] **Step 1: Update imports**

In `src/features/routes/components/search-form.tsx`, update the haulvisor-core import (line 23) to add `TIME_PRESETS`:

```typescript
import { TRAILER_CATEGORIES, expandTrailerCodes, codesToLabels, DEFAULT_LEGS_ONE_WAY, DEFAULT_LEGS_ROUND_TRIP, DEFAULT_MAX_DEADHEAD_PCT, DEFAULT_MAX_IDLE_HOURS, MIN_DEADHEAD_PCT, MAX_DEADHEAD_PCT, DEFAULT_COST_PER_MILE, IDLE_OPTIONS, ALL_WORK_DAYS, TIME_PRESETS } from "@mwbhtx/haulvisor-core";
```

Add the `localHourToUtc` import after line 25:

```typescript
import { localHourToUtc } from "@/core/utils/local-to-utc";
```

- [ ] **Step 2: Rename HomeByPill → ReturnByPill and add time dropdown**

Replace the entire `HomeByPill` function (lines 258-307) with:

```typescript
/* ---- Return By Pill (calendar + time popover) ---- */

function ReturnByPill({
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateValue ? new Date(dateValue + "T00:00:00") : undefined;

  const displayLabel = dateValue
    ? `${formatDateShort(dateValue)}${timeValue ? `, ${TIME_PRESETS.find((t) => t.value === timeValue)?.label ?? timeValue}` : ""}`
    : "Any";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full border bg-card/95 backdrop-blur px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent mobile-filter-pill whitespace-nowrap"
        >
          <span className="text-muted-foreground">Return By:</span>
          <span className="flex items-center gap-1.5">
            <span>{displayLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={{ before: new Date() }}
          onSelect={(day: Date | undefined) => {
            if (day) {
              const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
              onDateChange(iso);
            }
          }}
          defaultMonth={selected}
        />
        <div className="border-t px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Time</p>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onTimeChange(opt.value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  timeValue === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {(dateValue || timeValue) && (
          <div className="border-t px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => { onDateChange(""); onTimeChange(""); setOpen(false); }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Create LeaveByPill component**

Add a new component after `ReturnByPill` (same pattern):

```typescript
/* ---- Leave By Pill (calendar + time popover) ---- */

function LeaveByPill({
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateValue ? new Date(dateValue + "T00:00:00") : undefined;

  const displayLabel = dateValue
    ? `${formatDateShort(dateValue)}${timeValue ? `, ${TIME_PRESETS.find((t) => t.value === timeValue)?.label ?? timeValue}` : ""}`
    : "Any";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full border bg-card/95 backdrop-blur px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent mobile-filter-pill whitespace-nowrap"
        >
          <span className="text-muted-foreground">Leave By:</span>
          <span className="flex items-center gap-1.5">
            <span>{displayLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={{ before: new Date() }}
          onSelect={(day: Date | undefined) => {
            if (day) {
              const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
              onDateChange(iso);
            }
          }}
          defaultMonth={selected}
        />
        <div className="border-t px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Time</p>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onTimeChange(opt.value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  timeValue === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {(dateValue || timeValue) && (
          <div className="border-t px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => { onDateChange(""); onTimeChange(""); setOpen(false); }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Add new state variables**

In the `SearchFilters` component (around line 495-517), add new state after `const [homeBy, setHomeBy]`:

```typescript
  const [homeByTime, setHomeByTime] = useState<string>(r.homeByTime ?? "");
  const [departBy, setDepartBy] = useState<string>(r.departBy ?? "");
  const [departByTime, setDepartByTime] = useState<string>(r.departByTime ?? "");
```

- [ ] **Step 5: Update sessionStorage persistence**

In the `useEffect` that persists to sessionStorage (around line 536-543), add the new fields:

```typescript
  useEffect(() => {
    if (compactBar) return;
    try {
      sessionStorage.setItem("hv-route-filters", JSON.stringify({
        orders, risk, origin, destination, homeBy, homeByTime, departBy, departByTime, maxDeadheadPct, maxIdle, workDays, legs,
      }));
    } catch {}
  }, [orders, risk, origin, destination, homeBy, homeByTime, departBy, departByTime, maxDeadheadPct, maxIdle, compactBar]);
```

- [ ] **Step 6: Update restored type annotation**

Update the `restored` ref type (line 495-498) to include new fields:

```typescript
  const restored = useRef<{
    orders?: string; risk?: RiskLevel; origin?: PlaceResult | null;
    destination?: PlaceResult | null; homeBy?: string; homeByTime?: string;
    departBy?: string; departByTime?: string;
    maxDeadheadPct?: number; maxIdle?: number; workDays?: string[]; legs?: number;
  } | null>(null);
```

- [ ] **Step 7: Update filter reset**

In the reset effect (around line 546-554), add resets for new fields:

```typescript
    setHomeByTime("");
    setDepartBy("");
    setDepartByTime("");
```

- [ ] **Step 8: Build UTC conversion helper for search calls**

Add a helper inside `SearchFilters`, after the state declarations:

```typescript
  // Convert local time presets to UTC using origin coordinates
  const buildTimeParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (departBy) params.depart_by = departBy;
    if (departByTime && origin) {
      params.depart_by_time = localHourToUtc(departByTime, origin.lat, origin.lng);
    }
    if (homeByTime && origin) {
      // Use home base coords for return timezone if available, else origin
      const lat = settings?.home_base_lat ?? origin.lat;
      const lng = settings?.home_base_lng ?? origin.lng;
      params.home_by_time = localHourToUtc(homeByTime, lat as number, lng as number);
    }
    return params;
  }, [departBy, departByTime, homeByTime, origin, settings]);
```

- [ ] **Step 9: Update fireSearch to include new params**

Update the `fireSearch` callback to spread time params into search calls. In each `onSearchRoundTrip` call, add `...buildTimeParams()`. In each `onSearch` call, add `...buildTimeParams()`.

For round-trip calls, this means changing patterns like:

```typescript
      onSearchRoundTrip({
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        origin_city: origin.name.split(",")[0],
        legs,
        risk,
        ...(homeBy ? { home_by: homeBy } : {}),
        max_deadhead_pct: maxDeadheadPct,
        ...(maxIdle > 0 ? { max_layover_hours: maxIdle } : {}),
        ...driverProfile,
        ...buildTimeParams(),
      });
```

For one-way calls:

```typescript
      onSearch({
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        ...(destination ? { dest_lat: destination.lat, dest_lng: destination.lng } : {}),
        legs,
        trailer_types: driverProfile.trailer_types,
        ...(maxIdle > 0 ? { max_layover_hours: maxIdle } : {}),
        ...buildTimeParams(),
      });
```

Apply this to ALL search call sites in `SearchFilters` (there are ~6 occurrences — the restore effect, trip type change effect, fireSearch, and initial load).

Also add `buildTimeParams` to `fireSearch`'s dependency array.

- [ ] **Step 10: Update auto-search triggers**

Add `homeByTime`, `departBy`, `departByTime` to the auto-search effect dependency array (line 716):

```typescript
  }, [risk, homeBy, homeByTime, departBy, departByTime, maxDeadheadPct, legs]);
```

- [ ] **Step 11: Update desktop pill layout**

In the desktop layout return (around line 975), replace the Home By pill and add Leave By:

```typescript
      {isRoundTrip && <div id="onborda-leave-by"><LeaveByPill dateValue={departBy} timeValue={departByTime} onDateChange={setDepartBy} onTimeChange={setDepartByTime} /></div>}
      {isRoundTrip && <div id="onborda-home-by"><ReturnByPill dateValue={homeBy} timeValue={homeByTime} onDateChange={setHomeBy} onTimeChange={setHomeByTime} /></div>}
```

- [ ] **Step 12: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 13: Commit**

```bash
git add src/features/routes/components/search-form.tsx
git commit -m "feat: add Leave By pill, rename Home By to Return By with time presets"
```

---

### Task 9: Frontend — Fix nudge arrow light mode

**Files:**
- Modify: `src/features/routes/components/search-form.tsx:962`

- [ ] **Step 1: Replace bg-black with bg-background**

In `src/features/routes/components/search-form.tsx`, find line 962:

```typescript
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black border-2 border-primary animate-bounce">
```

Replace `bg-black` with `bg-background`:

```typescript
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background border-2 border-primary animate-bounce">
```

- [ ] **Step 2: Commit**

```bash
git add src/features/routes/components/search-form.tsx
git commit -m "fix: nudge arrow uses theme-aware bg-background for light mode"
```

---

### Task 10: Frontend — Wire watchlist into RouteDetailPanel (bookmark fix)

**Files:**
- Modify: `src/features/routes/views/desktop/route-list.tsx:60-97`
- Modify: `src/features/routes/views/desktop/desktop-routes-view.tsx:282-304`

- [ ] **Step 1: Expose watchlist from RouteList via new props**

In `src/features/routes/views/desktop/route-list.tsx`, add two new props to `RouteListProps` (line 60):

```typescript
interface RouteListProps {
  roundTripChains: RoundTripChain[];
  routeChains: RouteChain[];
  selectedIndex: number;
  onSelectIndex: (index: number, chain: RoundTripChain | null) => void;
  isLoading?: boolean;
  onClearFilters?: () => void;
  onWatchlistChange?: (watchlist: Set<string>, toggle: (key: string) => void) => void;
}
```

Destructure the new prop in the function signature:

```typescript
export function RouteList({
  roundTripChains,
  routeChains,
  selectedIndex,
  onSelectIndex,
  isLoading,
  onClearFilters,
  onWatchlistChange,
}: RouteListProps) {
```

After the `toggleWatchlist` callback (line 97), add an effect to propagate the watchlist up:

```typescript
  useEffect(() => {
    onWatchlistChange?.(watchlist, toggleWatchlist);
  }, [watchlist, toggleWatchlist, onWatchlistChange]);
```

- [ ] **Step 2: Wire watchlist in desktop-routes-view.tsx**

In `src/features/routes/views/desktop/desktop-routes-view.tsx`, add state for watchlist at the top of `DesktopRoutesView`:

```typescript
  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
  const toggleWatchlistRef = useRef<((key: string) => void) | null>(null);
```

Add a handler:

```typescript
  const handleWatchlistChange = useCallback((wl: Set<string>, toggle: (key: string) => void) => {
    setWatchlistSet(wl);
    toggleWatchlistRef.current = toggle;
  }, []);
```

Add the necessary imports at the top (`useRef` should already be imported).

Pass to `RouteList` (around line 283):

```typescript
            <RouteList
              roundTripChains={displayLocation.roundTripChains}
              routeChains={displayLocation.routeChains}
              selectedIndex={selectedItemIndex}
              onSelectIndex={handleRouteSelect}
              onClearFilters={hasActiveSearch ? handleClearSearch : undefined}
              isLoading={!ready || isLoading || isRoundTripLoading || filterPending || (hasPersistedFilters && !hasActiveSearch && !hasSearchedOnce.current)}
              onWatchlistChange={handleWatchlistChange}
            />
```

Pass to `RouteDetailPanel` (around line 296). We need to compute the selected route's key. Add a helper:

```typescript
  const selectedRouteKey = useMemo(() => {
    if (!selectedChain) return "";
    return selectedChain.legs.map((l) => l.order_id ?? "spec").join("|");
  }, [selectedChain]);
```

Then update `RouteDetailPanel`:

```typescript
          <RouteDetailPanel
            chain={selectedChain}
            originCity={originFilter?.city}
            destCity={destFilter?.city}
            costPerMile={(settings?.cost_per_mile as number | undefined) ?? DEFAULT_COST_PER_MILE}
            orderUrlTemplate={orderUrlTemplate}
            onHoverLeg={(idx) => hoverLegRef.current?.(idx)}
            onShowComments={handleShowComments}
            isWatchlisted={watchlistSet.has(selectedRouteKey)}
            onToggleWatchlist={selectedRouteKey ? () => toggleWatchlistRef.current?.(selectedRouteKey) : undefined}
          />
```

- [ ] **Step 3: Verify bookmark icon appears**

Run the dev server and select a route. The bookmark icon should now appear above "Route Summary" in the detail panel.

- [ ] **Step 4: Commit**

```bash
git add src/features/routes/views/desktop/route-list.tsx src/features/routes/views/desktop/desktop-routes-view.tsx
git commit -m "fix: wire watchlist to RouteDetailPanel, restore bookmark icon"
```

---

### Task 11: Frontend — Update onboarding tour steps

**Files:**
- Modify: `src/platform/web/components/tour-steps.tsx`

- [ ] **Step 1: Update tour steps**

Replace the entire content of `src/platform/web/components/tour-steps.tsx`:

```typescript
import type { DriveStep } from "driver.js";

const hl = "font-semibold"; // driver.js uses inline HTML, not JSX

export const tourSteps: DriveStep[] = [
  {
    element: "#onborda-trip-mode",
    popover: {
      title: "🚛 Trip Mode",
      description: `Choose between <strong class="${hl}">Round Trip</strong> (out and back) or <strong class="${hl}">One Way</strong> routing.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-origin",
    popover: {
      title: "📍 Set Your Origin",
      description: `Select a <strong class="${hl}">starting city</strong> to see available routes from that location. This is the only required field to begin searching.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-legs",
    popover: {
      title: "📦 Number of Loads",
      description: `Set how many <strong class="${hl}">loads</strong> (stops) you want in a route. More loads can mean better revenue but longer trips.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-leave-by",
    popover: {
      title: "🚀 Leave By",
      description: `Set a <strong class="${hl}">departure date and time</strong>. Routes are simulated from this point to check if pickups, deliveries, and return deadlines can be met.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-home-by",
    popover: {
      title: "🏠 Return By",
      description: `Set a <strong class="${hl}">date and time</strong> you need to be back. Routes that can't get you home in time will be filtered out.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-idle",
    popover: {
      title: "⏱️ Max Idle Time",
      description: `Choose how long you're willing to <strong class="${hl}">wait between loads</strong> — from 2 hours to keep rolling, up to 24 hours for maximum flexibility.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-deadhead",
    popover: {
      title: "🛣️ Max Deadhead",
      description: `Control how far you're willing to <strong class="${hl}">drive empty</strong> between loads, as a percentage of the total trip.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-all-filters",
    popover: {
      title: "⚙️ All Filters",
      description: `Fine-tune your search with <strong class="${hl}">trailer type</strong>, <strong class="${hl}">weight limits</strong>, <strong class="${hl}">hazmat</strong>, <strong class="${hl}">TWIC</strong>, <strong class="${hl}">risk</strong>, and <strong class="${hl}">work days</strong>. Set your work days to avoid routes that require pickups or deliveries on your off days.`,
      side: "bottom",
      align: "end",
    },
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/platform/web/components/tour-steps.tsx
git commit -m "feat: update onboarding tour for Leave By, Return By, and new idle presets"
```

---

### Task 12: Verify — Run dev server and smoke test

- [ ] **Step 1: Rebuild haulvisor-core if not done**

Run: `cd ../haulvisor-core && npm run build`

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

- [ ] **Step 3: Smoke test checklist**

Verify in the browser:
- [ ] Filter bar shows "Leave By" and "Return By" pills (round-trip mode)
- [ ] Leave By pill opens calendar + time presets
- [ ] Return By pill opens calendar + time presets (was "Home By")
- [ ] Max Idle shows 2 Hours, 4 Hours, 8 Hours, 24 Hours, Any
- [ ] Bookmark icon visible on route detail panel
- [ ] Nudge arrow circle is white in light mode, dark in dark mode
- [ ] No console errors

- [ ] **Step 4: Final commit if any fixes needed**
