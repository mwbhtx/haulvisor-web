# Three-Column Desktop Routes Layout Design

**Date:** 2026-03-29
**Status:** Draft

## Overview

Restructure the desktop routes view from a single sidebar overlay on a map to a 3-column layout: route list, route details, and map. The details that currently expand inline within route cards move to a dedicated second column.

## Goals

1. Split route results and route details into separate columns
2. Column 2 is a narrow collapsed strip when no route is selected, expands when one is selected
3. Map shrinks to accommodate column 2 (no overlay)
4. Route inspector (segment breakdown timeline) becomes a collapsed section at the bottom of column 2 instead of a sliding drawer
5. Clean component decomposition — each column is its own focused component

## Non-Goals

- Mobile layout changes (mobile stays as-is)
- Changing the filter bar or nav bar layout
- Adding new data or functionality — just reorganizing what exists

## Layout

```
┌──────────────────────────────────────────────────────┐
│ Nav bar (full width)                                 │
├──────────────────────────────────────────────────────┤
│ Filter bar (full width)                              │
├────────────┬───────────────────┬─────────────────────┤
│ Col 1      │ Col 2             │ Col 3               │
│ ~300px     │ collapsed: ~48px  │ flex                 │
│ fixed      │ expanded: ~400px  │                      │
│            │ transition: width │                      │
├────────────┼───────────────────┼─────────────────────┤
│ Sort bar   │ (collapsed)       │                      │
│ ────────── │ "Select a route"  │       Map            │
│ Route row  │                   │                      │
│ ────────── │ (expanded)        │                      │
│ Route row  │ Cost breakdown ▸  │                      │
│ ────────── │ Segments          │                      │
│ Route row  │  ─ origin DH      │                      │
│ ────────── │  ─ leg 1          │                      │
│ Route row  │  ─ between DH     │                      │
│            │  ─ leg 2          │                      │
│            │  ─ return DH      │                      │
│            │ ──────────────    │                      │
│            │ ▸ Segment Details │                      │
│            │   (collapsed)     │                      │
└────────────┴───────────────────┴─────────────────────┘
```

## Component Architecture

### Current structure (before)

```
desktop-routes-view.tsx
├── RouteMap
├── SearchFilters (filter bar)
└── LocationSidebar (sort bar + route list + inline expanded details + inspector drawer)
    └── RouteCard (metrics row + expanded details + inspector overlay)
        └── RouteInspector (sliding drawer)
```

### New structure (after)

```
desktop-routes-view.tsx (manages 3-column grid + selected route state)
├── SearchFilters (filter bar, full width above grid)
├── Column 1: RouteList (new component, extracted from LocationSidebar)
│   ├── Sort bar
│   └── Scrollable list of RouteRow components (summary metrics only)
├── Column 2: RouteDetailPanel (new component)
│   ├── Collapsed state: narrow strip with "Select a route"
│   └── Expanded state: scrollable panel with:
│       ├── Cost breakdown (collapsible)
│       ├── Segments list (origin DH, legs, between DH, return DH)
│       └── Segment Details (collapsed by default, expandable)
│           └── RouteInspector (same component, rendered inline instead of as overlay)
└── Column 3: RouteMap
```

### New files

| File | Purpose |
|------|---------|
| `src/features/routes/views/desktop/route-list.tsx` | Column 1 — sort bar + scrollable route summary rows |
| `src/features/routes/views/desktop/route-row.tsx` | Single route summary row (metrics + bookmark) |
| `src/features/routes/views/desktop/route-detail-panel.tsx` | Column 2 — full details for selected route |

### Modified files

| File | Changes |
|------|---------|
| `desktop-routes-view.tsx` | 3-column grid layout, passes selected route data to RouteDetailPanel |
| `location-sidebar.tsx` | Significantly simplified or replaced by RouteList — most code moves out |
| `route-inspector.tsx` | No changes — rendered inline in RouteDetailPanel instead of as overlay |

### Removed patterns

- Inline expansion within route cards (the `isSelected && (...)` block in RouteCard)
- Inspector sliding drawer overlay
- The `showInspector` state and chevron handle buttons

## Column 1: RouteList

**Width:** ~300px fixed

**Contents:**
- Sort bar (sort pills + watchlist filter) — same as current
- Scrollable list of `RouteRow` components

**RouteRow** renders only the summary metrics:
- $/Day, Profit, Net/mi, Miles columns with values and sub-labels
- Bookmark button
- Clickable — calls `onSelect(index)` to populate column 2
- Selected state: `bg-surface-elevated` highlight
- No expansion, no details

**Data flow:** RouteList receives the sorted/filtered route array and `selectedIndex` from `desktop-routes-view.tsx`. Calls `onSelectIndex` when a row is clicked.

## Column 2: RouteDetailPanel

**Width:**
- Collapsed (no route selected): `48px` — shows rotated "Select a route" text or just an empty narrow strip
- Expanded (route selected): `400px`
- CSS `transition: width 300ms ease-in-out`

**Props:**
- `chain: RoundTripChain | null` — the selected route (null = collapsed)
- `originCity: string`
- `destCity: string`
- `costPerMile: number`
- `orderUrlTemplate?: string`
- `onHoverLeg?: (index: number | null) => void`
- `onShowComments?: (orderId: string) => void`

**Expanded contents (scrollable):**
1. **Cost breakdown** — collapsible toggle (same as current), shows fuel, maintenance, tires, daily costs, total
2. **Segments list** — origin deadhead, each leg with route details (city pair, pay, weight, miles, rate, pickup/delivery dates), between deadheads, return deadhead. Same rendering as current expanded card.
3. **Segment Details** — `RouteInspector` component rendered at the bottom, wrapped in a collapsible section (collapsed by default). User clicks to expand and see the phase-by-phase timeline.

## Column 3: Map

Same `RouteMap` component. Takes remaining width via `flex: 1`. Shrinks/grows as column 2 transitions.

## State Management

All in `desktop-routes-view.tsx` (same as current):
- `selectedItemIndex` — which route is selected
- The selected route's chain data is derived from the sorted array using the index
- Pass the full chain to `RouteDetailPanel` and the legs to `RouteMap`

No new state management needed. The `selectedIndex` already exists and drives everything.

## Animation

- Column 2 width transition: `transition: width 300ms ease-in-out` on the column container
- Map resizes automatically since it uses `flex: 1`
- Mapbox GL handles resize via `map.resize()` — may need to call this after transition ends

## Migration from LocationSidebar

`location-sidebar.tsx` is currently ~670 lines. It will be significantly reduced:

**Moves to `route-list.tsx`:** Sort bar, watchlist toggle, loading skeletons, empty state, scrollable list rendering
**Moves to `route-row.tsx`:** The summary metrics section of RouteCard ($/Day, Profit, Net/mi, Miles, bookmark)
**Moves to `route-detail-panel.tsx`:** Cost breakdown, segments rendering, deadhead rows, leg detail rows
**Stays in location-sidebar.tsx or gets deleted:** The file may be replaced entirely by the new components. Comments dialog logic moves to `desktop-routes-view.tsx`.

The `RouteCard` component inside `location-sidebar.tsx` (~340 lines) gets split:
- Top metrics section → `RouteRow` (~80 lines)
- Expanded details section → `RouteDetailPanel` (~200 lines)
- Inspector drawer → rendered inline in `RouteDetailPanel`
