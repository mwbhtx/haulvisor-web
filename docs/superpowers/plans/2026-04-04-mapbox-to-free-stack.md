# Mapbox → MapLibre + Protomaps + ORS + LocationIQ Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Mapbox services with free alternatives — MapLibre GL JS + Protomaps for rendering, OpenRouteService for directions, LocationIQ for geocoding.

**Architecture:** Swap three API surfaces in-place. The map component (`route-map.tsx`) switches from mapbox-gl to maplibre-gl with Protomaps tile source. Directions calls in `route-map.tsx` switch from Mapbox to ORS. Geocoding calls in `search-form.tsx` switch from Mapbox to LocationIQ. The `draw-route.ts` utility and its `MapLike` interface are already provider-agnostic and need no changes.

**Tech Stack:** maplibre-gl, pmtiles, protomaps-themes-base, OpenRouteService API, LocationIQ API

**Spec:** `docs/superpowers/specs/2026-04-04-mapbox-to-free-stack-migration-design.md`

---

### Task 1: Swap npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove mapbox-gl, add maplibre-gl + pmtiles + protomaps-themes-base**

```bash
npm uninstall mapbox-gl && npm install maplibre-gl pmtiles protomaps-themes-base
```

- [ ] **Step 2: Verify install succeeded**

```bash
npm ls maplibre-gl pmtiles protomaps-themes-base
```

Expected: all three packages listed, no ERR.

- [ ] **Step 3: Verify mapbox-gl is gone**

```bash
npm ls mapbox-gl 2>&1 || true
```

Expected: `empty` or `not found` — mapbox-gl should no longer be in the tree.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap mapbox-gl for maplibre-gl + pmtiles + protomaps-themes-base"
```

---

### Task 2: Update globals.css — swap CSS import and remove filter hacks

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the mapbox CSS import with maplibre**

Change line 1 from:
```css
@import "mapbox-gl/dist/mapbox-gl.css";
```
to:
```css
@import "maplibre-gl/dist/maplibre-gl.css";
```

- [ ] **Step 2: Remove the dark/light mapbox filter hacks**

Delete these lines (currently lines 166-172):
```css
.dark .mapboxgl-map {
  filter: brightness(2.05) contrast(1.75);
}

.light .mapboxgl-map {
  filter: brightness(1) contrast(1);
}
```

These are no longer needed — proper dark/light Protomaps themes replace them.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "chore: swap mapbox CSS for maplibre, remove filter hacks"
```

---

### Task 3: Update .env.example — swap environment variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace MAPBOX_TOKEN with new env vars**

Replace the full contents of `.env.example` with:
```
NEXT_PUBLIC_PMTILES_URL=
NEXT_PUBLIC_ORS_API_KEY=
NEXT_PUBLIC_LOCATIONIQ_KEY=
NEXT_PUBLIC_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_COGNITO_CLIENT_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: replace Mapbox token with PMTiles, ORS, and LocationIQ env vars"
```

---

### Task 4: Migrate route-map.tsx to MapLibre + Protomaps + ORS directions

This is the largest task — it touches the map init, theme switching, and directions fetch.

**Files:**
- Modify: `src/features/routes/components/route-map.tsx`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import mapboxgl from "mapbox-gl";
```
with:
```typescript
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layersWithCustomTheme } from "protomaps-themes-base";
```

- [ ] **Step 2: Replace env var and add PMTiles protocol + theme config**

Replace:
```typescript
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
```
with:
```typescript
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL ?? "";
const ORS_API_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY ?? "";

// Register PMTiles protocol once
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

/** Protomaps style object for a given theme */
function pmtilesStyle(theme: "light" | "dark"): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layersWithCustomTheme("protomaps", theme),
  };
}
```

Note: `layersWithCustomTheme` accepts `"light"` and `"dark"` as built-in themes. These provide good defaults. If the user later provides Mapbox style JSONs, the color tokens can be customized by passing a custom theme object instead.

- [ ] **Step 3: Update the map initialization useEffect**

Replace the full map init `useEffect` (the one with the comment `// Initialize map (once)`) with:

```typescript
  // Initialize map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const isMobile = window.innerWidth < 768;
    const isDarkInit = document.documentElement.classList.contains("dark");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: pmtilesStyle(isDarkInit ? "dark" : "light"),
      center: [-95.7, 37.1],
      zoom: 4,
      attributionControl: false,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
```

Notes:
- Globe projection is removed for now — MapLibre v4+ supports it but Protomaps tiles may not render correctly in globe mode. Can be re-added later if needed.
- The `style.load` config properties (`setConfigProperty`) are removed — those are Mapbox Standard-specific and don't apply to Protomaps styles.

- [ ] **Step 4: Update the theme-switching useEffect**

Replace the two theme-related `useEffect` blocks (the one that calls `map.setStyle(newStyle)` and the one that calls `map.setConfigProperty`) with a single block:

```typescript
  // Swap map style when theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const theme = resolvedTheme === "light" ? "light" : "dark";
    if (map.isStyleLoaded()) {
      map.setStyle(pmtilesStyle(theme));
    } else {
      const onLoad = () => map.setStyle(pmtilesStyle(theme));
      map.once("style.load", onLoad);
      return () => { map.off("style.load", onLoad); };
    }
  }, [resolvedTheme]);
```

- [ ] **Step 5: Update the directions fetch in the draw useEffect**

In the `draw` async function inside the `useEffect` that draws the selected route, replace the Mapbox Directions fetch block. Find this code:

```typescript
      Promise.all(
        allSegments.map(async (seg) => {
          const [a, b] = [seg.coords[0], seg.coords[seg.coords.length - 1]];
          const key = `${a[0]},${a[1]};${b[0]},${b[1]}`;
          if (directionsCache.has(key)) return { id: seg.id, coords: directionsCache.get(key)! };
          try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${key}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
            const res = await fetch(url);
            const data = await res.json();
            const coords: [number, number][] = data.routes?.[0]?.geometry?.coordinates ?? [a, b];
            directionsCache.set(key, coords);
            return { id: seg.id, coords };
          } catch {
            return { id: seg.id, coords: [a, b] as [number, number][] };
          }
        }),
      ).then((results) => {
```

Replace with:

```typescript
      Promise.all(
        allSegments.map(async (seg) => {
          const [a, b] = [seg.coords[0], seg.coords[seg.coords.length - 1]];
          const key = `${a[0]},${a[1]};${b[0]},${b[1]}`;
          if (directionsCache.has(key)) return { id: seg.id, coords: directionsCache.get(key)! };
          try {
            const url = `https://api.openrouteservice.org/v2/directions/driving-hgv?start=${a[0]},${a[1]}&end=${b[0]},${b[1]}`;
            const res = await fetch(url, {
              headers: { "Authorization": ORS_API_KEY },
            });
            const data = await res.json();
            const coords: [number, number][] = data.features?.[0]?.geometry?.coordinates ?? [a, b];
            directionsCache.set(key, coords);
            return { id: seg.id, coords };
          } catch {
            return { id: seg.id, coords: [a, b] as [number, number][] };
          }
        }),
      ).then((results) => {
```

Key differences from Mapbox:
- ORS uses query params `start` and `end` (lng,lat format) instead of path-based coordinates
- ORS requires an `Authorization` header with the API key (not a query param)
- ORS GeoJSON response nests geometry under `features[0].geometry.coordinates` (GeoJSON FeatureCollection) instead of `routes[0].geometry.coordinates`

- [ ] **Step 6: Update mapboxgl references in the rest of the file**

Replace all remaining `mapboxgl.` references:

- `const bounds = new mapboxgl.LngLatBounds();` → `const bounds = new maplibregl.LngLatBounds();`
- `mapRef.current` type: `useRef<mapboxgl.Map | null>(null)` → `useRef<maplibregl.Map | null>(null)`
- `as mapboxgl.GeoJSONSource` → `as maplibregl.GeoJSONSource`

- [ ] **Step 7: Run the build to check for type errors**

```bash
npm run build 2>&1 | head -50
```

Expected: no TypeScript errors related to mapbox/maplibre.

- [ ] **Step 8: Commit**

```bash
git add src/features/routes/components/route-map.tsx
git commit -m "feat: migrate route-map from Mapbox to MapLibre + Protomaps + ORS directions"
```

---

### Task 5: Migrate search-form.tsx geocoding to LocationIQ

**Files:**
- Modify: `src/features/routes/components/search-form.tsx`

- [ ] **Step 1: Replace the env var and searchPlaces function**

Replace:
```typescript
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (query.length < 2) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=US&types=place&limit=5`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    name: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
  }));
}
```

with:

```typescript
const LOCATIONIQ_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_KEY ?? "";

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (query.length < 2) return [];
  const url = `https://us1.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(query)}&countrycodes=us&limit=5&tag=place:city,place:town`;
  const res = await fetch(url);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    name: [item.address?.city || item.address?.town || item.display_name?.split(",")[0], item.address?.state].filter(Boolean).join(", "),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}
```

Key differences from Mapbox:
- LocationIQ returns an array of objects (not `{ features: [...] }`)
- Each result has `lat`/`lon` as strings (need `parseFloat`), not `center: [lng, lat]`
- Display name is constructed from `address.city`/`address.town` + `address.state` for clean "City, State" format (matching the CLAUDE.md requirement to never show country)
- Falls back to splitting `display_name` if address fields are missing

- [ ] **Step 2: Replace the reverse geocoding in handleUseMyLocation**

Find the `handleUseMyLocation` function (around line 617) and replace:

```typescript
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=place&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      const name = data.features?.[0]?.place_name ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      setOrigin({ name, lat: latitude, lng: longitude });
    });
  };
```

with:

```typescript
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${latitude}&lon=${longitude}&format=json`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.display_name?.split(",")[0];
        const state = data.address?.state;
        const name = [city, state].filter(Boolean).join(", ") || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        setOrigin({ name, lat: latitude, lng: longitude });
      } catch {
        setOrigin({ name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`, lat: latitude, lng: longitude });
      }
    });
  };
```

- [ ] **Step 3: Verify no remaining Mapbox references in search-form.tsx**

```bash
grep -n -i "mapbox" src/features/routes/components/search-form.tsx
```

Expected: no results.

- [ ] **Step 4: Commit**

```bash
git add src/features/routes/components/search-form.tsx
git commit -m "feat: migrate geocoding from Mapbox to LocationIQ"
```

---

### Task 6: Final verification — grep for any remaining Mapbox references

**Files:**
- No files to create/modify — this is a verification task

- [ ] **Step 1: Grep entire codebase for mapbox references**

```bash
grep -rn -i "mapbox" src/ --include="*.ts" --include="*.tsx" --include="*.css"
```

Expected: zero results. If any remain, fix them.

- [ ] **Step 2: Grep for old env var references**

```bash
grep -rn "MAPBOX_TOKEN" src/ .env.example
```

Expected: zero results.

- [ ] **Step 3: Run the test suite**

```bash
npm run test
```

Expected: all tests pass. The `draw-route.test.ts` tests should pass without modification since they use the `MapLike` mock interface (provider-agnostic).

- [ ] **Step 4: Run the build**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit any remaining fixes (if needed)**

```bash
git add -A
git commit -m "chore: clean up remaining Mapbox references"
```

---

### Task 7: Manual smoke test

**Files:**
- No files to modify — this is a verification task

Requires valid `NEXT_PUBLIC_PMTILES_URL`, `NEXT_PUBLIC_ORS_API_KEY`, and `NEXT_PUBLIC_LOCATIONIQ_KEY` in `.env.local`.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify map renders**

Open `http://localhost:3001` in a browser. The map should render with Protomaps tiles. Toggle dark/light mode — the map theme should switch cleanly without CSS filter hacks.

- [ ] **Step 3: Verify geocoding**

Type a city name in the origin/destination autocomplete. Results should appear as "City, State" format. Select one. Try "Use My Location" — should resolve to your city.

- [ ] **Step 4: Verify route rendering**

Search for a route. Select a route card. The map should:
1. Immediately draw straight/arc lines between stops
2. Upgrade to road-following geometries via ORS within a few seconds
3. Show leg colors, deadhead dashes, pickup dot, and checkered flag finish marker

- [ ] **Step 5: Verify fallback**

Temporarily set `NEXT_PUBLIC_ORS_API_KEY` to an invalid value. Routes should still render using straight lines (graceful fallback).
