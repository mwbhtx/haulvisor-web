# Departure & Return Time Filters, Idle Presets, Bookmark Fix

**Date:** 2026-03-30

## Overview

Changes to route search across all repos (haulvisor, haulvisor-backend, haulvisor-core, haulvisor-mercer):

1. **Leave By filter** — new date+time picker for departure simulation start
2. **Return By** — rename "Home By" to "Return By", add time preset
3. **Max idle presets** — replace day-based options with driver-friendly hour-based presets (2h, 4h, 8h, 24h, Any)
4. **Bookmark fix** — restore missing bookmark icon on route detail panel
5. **Nudge arrow fix** — theme-aware background in light mode

All route results are simulated from the departure date/time to determine if route requirements (delivery, pickup, return by) can be met.

---

## 1. New Filter: "Leave By"

### UI (haulvisor)
- New pill in the search filter bar: **"Leave By: Any"**
- Popover contains:
  - Calendar date picker (same pattern as existing Return By)
  - Time preset dropdown: **"Any"** (default) + hourly from **5:00 AM to 9:00 PM** (17 slots)
- Pill label updates to show selection, e.g. "Leave By: Mar 30, 8:00 AM"
- Clear button resets both date and time

### Query Parameters
- `depart_by` — date string `YYYY-MM-DD`
- `depart_by_time` — time string in UTC `HH:00` (e.g. `"13:00"`), or omitted when "Any"

### Timezone Conversion
- Display times in the **origin city's local timezone**
- Use `geo-tz` package (offline lat/lng → IANA timezone lookup)
- Convert selected local hour to UTC before sending to backend

### Backend (haulvisor-backend)
- **`route-search.dto.ts`**: Add optional `depart_by?: string` and `depart_by_time?: string` params
- **`round-trip-search.dto.ts`**: Add optional `depart_by?: string` and `depart_by_time?: string` params
- **`routes.service.ts`**: Use `depart_by` + `depart_by_time` as the simulation start point for chain building. If not provided, fall back to current behavior (use pickup windows as-is).
- **`round-trip.service.ts`**: Same — use departure datetime as simulation anchor

---

## 2. Rename "Home By" → "Return By" + Add Time

### UI Rename (haulvisor)
- All UI labels: "Home By" → "Return By"
- Pill: **"Return By: Any"** → **"Return By: Apr 2, 5:00 PM"**
- Add time preset dropdown within the existing calendar popover
- Same time options as Leave By: "Any" (default) + 5 AM–9 PM hourly
- Onboarding tour step updated

### Query Parameters
- `home_by` — stays as `YYYY-MM-DD` (backend param name unchanged for now)
- `home_by_time` — **new**, time string in UTC `HH:00`, or omitted when "Any"

### Timezone Conversion
- Display times in the **home/return location's timezone**
- Same `geo-tz` approach as Leave By

### Backend (haulvisor-backend)
- **`round-trip-search.dto.ts`**: Add optional `home_by_time?: string`
- **`round-trip.service.ts`** (~line 369): Currently hardcodes `home_by + 'T23:59:59'`. Change to use `home_by_time` when provided:
  - With time: `home_by + 'T' + home_by_time + ':00'`
  - Without time (Any): keep existing `'T23:59:59'` fallback
- **`create-recent-search.dto.ts`**: Add `homeByTime?: string` to FiltersDto for persistence

### Core (haulvisor-core)
- Add `TIME_PRESETS` constant (shared by Leave By and Return By)

---

## 3. Time Preset Options (haulvisor-core)

Shared constant for both filters:

```typescript
export const TIME_PRESETS = [
  { label: "Any", value: "" },
  { label: "5:00 AM", value: "05:00" },
  { label: "6:00 AM", value: "06:00" },
  { label: "7:00 AM", value: "07:00" },
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
  { label: "10:00 AM", value: "10:00" },
  { label: "11:00 AM", value: "11:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "1:00 PM", value: "13:00" },
  { label: "2:00 PM", value: "14:00" },
  { label: "3:00 PM", value: "15:00" },
  { label: "4:00 PM", value: "16:00" },
  { label: "5:00 PM", value: "17:00" },
  { label: "6:00 PM", value: "18:00" },
  { label: "7:00 PM", value: "19:00" },
  { label: "8:00 PM", value: "20:00" },
  { label: "9:00 PM", value: "21:00" },
] as const;
```

Values are stored in 24-hour local format in the UI state. Converted to UTC only when building query params.

---

## 4. Timezone Utility (haulvisor)

### Package
- `geo-tz` — offline timezone lookup from coordinates, no API calls

### Helper Function
```typescript
// src/core/utils/local-to-utc.ts
import { find as geoTzFind } from "geo-tz";

export function localHourToUtc(
  localHour: string,   // "08:00" (24h local)
  lat: number,
  lng: number,
): string {
  // 1. geoTzFind(lat, lng) → IANA timezone (e.g. "America/Chicago")
  // 2. Build a Date in that timezone for today at localHour
  // 3. Convert to UTC, return "HH:00"
}
```

---

## 5. Filter State Changes (haulvisor)

### New Fields in Filter State
Add to existing filter state (persisted in sessionStorage `"hv-route-filters"`):

```typescript
depart_by: string;       // "YYYY-MM-DD" or ""
depart_by_time: string;  // "08:00" (local) or "" for Any
home_by_time: string;    // "17:00" (local) or "" for Any
```

### Query Param Construction
In `use-routes.ts`, when building URLSearchParams:
- Include `depart_by` when set
- Include `depart_by_time` as UTC-converted value when not "Any"
- Include `home_by_time` as UTC-converted value when not "Any"
- Origin lat/lng used for Leave By timezone; home base lat/lng for Return By timezone

---

## 6. Updated Max Idle Time Options

### Current State
`IDLE_OPTIONS` in `haulvisor-core/src/search-defaults.ts` uses day-based increments (1–5 Days + Any). Backend DTOs validate `max_layover_hours` with `Min: 24, Max: 120`.

### New Options (haulvisor-core)
Replace with driver-friendly presets:

```typescript
export const IDLE_OPTIONS = [
  { value: 2,  label: "2 Hours",  description: "Keep me rolling" },
  { value: 4,  label: "4 Hours",  description: "Meal and short break" },
  { value: 8,  label: "8 Hours",  description: "A shift, maybe overnight" },
  { value: 24, label: "24 Hours", description: "Flexible, rest or appointments" },
  { value: 0,  label: "Any",      description: "No limit, show everything" },
] as const;

export const DEFAULT_MAX_IDLE_HOURS = 0; // Any
```

### Backend DTO Validation (haulvisor-backend)
- **`route-search.dto.ts`**: Change `max_layover_hours` validation from `Min(24), Max(120)` → `Min(0), Max(120)` (or remove Min entirely since 0 = Any)
- **`round-trip-search.dto.ts`**: Same validation change
- **`update-settings.dto.ts`**: Change `max_idle_hours` validation from `Min(24), Max(120)` → `Min(0), Max(120)`

### UI (haulvisor)
The `MaxIdlePill` in `search-form.tsx` already renders `IDLE_OPTIONS` dynamically — no UI code change needed beyond optionally showing the description as helper text beneath each button.

---

## 7. Bookmark Icon Fix (haulvisor)

### Problem
The `RouteDetailPanel` accepts `isWatchlisted` and `onToggleWatchlist` props, but `desktop-routes-view.tsx` does not pass them (lines 296-304). The watchlist state lives in `route-list.tsx`.

### Solution
Lift the watchlist state (or expose it via callback) so `desktop-routes-view.tsx` can pass `isWatchlisted` and `onToggleWatchlist` to `RouteDetailPanel`. Options:

**Option A (recommended):** Have `RouteList` expose the current watchlist set and toggle function via a callback/ref prop, so the parent can wire it into `RouteDetailPanel`.

**Option B:** Lift watchlist state up to `desktop-routes-view.tsx` and pass it down to both `RouteList` and `RouteDetailPanel`.

Either way, the result is `RouteDetailPanel` receives both props and the bookmark icon renders above "Route Summary".

---

## 8. Onboarding Tour Updates (haulvisor)

The app uses `driver.js` for an onboarding tour (`src/platform/web/components/tour-steps.tsx`). Each filter pill has an `#onborda-*` ID that the tour targets.

### Changes

1. **Add tour step for "Leave By"** — new `#onborda-leave-by` ID on the Leave By pill
2. **Rename "Home By" step → "Return By"** — mention the new time picker ("Set a date and time you need to be back by...")
3. **Update "Max Idle" step** — reflect the new hour-based presets ("Choose how long you're willing to wait between loads — from 2 hours to keep rolling, up to 24 hours for maximum flexibility")

---

## 9. Nudge Arrow Light Mode Fix (haulvisor)

The origin nudge box bouncing arrow (`search-form.tsx` ~line 962) has a hardcoded `bg-black` on the circle. In light mode this should be white.

### Fix
Change `bg-black` to `bg-background` (or `bg-card`) so it follows the theme. The arrow icon uses `text-primary` which already adapts.

---

## 10. Files to Modify — All Repos

### haulvisor (frontend)
| File | Change |
|------|--------|
| `package.json` | Add `geo-tz` dependency |
| `src/core/utils/local-to-utc.ts` | **New** — timezone conversion helper |
| `src/features/routes/components/search-form.tsx` | Add "Leave By" pill; add time dropdown to "Return By" pill; rename "Home By" → "Return By"; add `#onborda-leave-by` ID; fix nudge arrow `bg-black` → `bg-background` |
| `src/core/hooks/use-routes.ts` | Send new query params (`depart_by`, `depart_by_time`, `home_by_time`) |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Wire watchlist props to `RouteDetailPanel`; add new filter state fields |
| `src/features/routes/views/desktop/route-list.tsx` | Expose watchlist state to parent |
| `src/platform/web/components/tour-steps.tsx` | Add Leave By step, rename Home By → Return By, update Max Idle description |
| Filter state type (wherever defined) | Add `depart_by`, `depart_by_time`, `home_by_time` fields |

### haulvisor-core (shared types/constants)
| File | Change |
|------|--------|
| `src/search-defaults.ts` | Replace `IDLE_OPTIONS` array; update `DEFAULT_MAX_IDLE_HOURS` to `0`; add `TIME_PRESETS` constant |

### haulvisor-backend (API)
| File | Change |
|------|--------|
| `api/src/routes/dto/route-search.dto.ts` | Add `depart_by`, `depart_by_time` params; relax `max_layover_hours` Min from 24 → 0 |
| `api/src/routes/dto/round-trip-search.dto.ts` | Add `depart_by`, `depart_by_time`, `home_by_time` params; relax `max_layover_hours` Min from 24 → 0 |
| `api/src/routes/routes.service.ts` | Use `depart_by`/`depart_by_time` as simulation start anchor |
| `api/src/routes/round-trip.service.ts` | Use `depart_by`/`depart_by_time` as simulation start; use `home_by_time` instead of hardcoded `T23:59:59` |
| `api/src/settings/dto/update-settings.dto.ts` | Relax `max_idle_hours` Min from 24 → 0 |
| `api/src/recent-searches/dto/create-recent-search.dto.ts` | Add `homeByTime`, `departBy`, `departByTime` to FiltersDto |

### haulvisor-mercer (data pipeline)
No changes expected — Mercer ingests order data but does not handle route search queries or filter logic. Confirm during implementation.

---

## 11. Out of Scope

- Mobile view updates (will follow separately)
- Timezone display label in the UI (future nice-to-have)
- Renaming `home_by` backend param to `return_by` (cosmetic, deferred to avoid breaking changes)
