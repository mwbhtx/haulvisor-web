# Haulvisor

**[haulvisor.com](https://haulvisor.com)** — Route optimization platform for owner-operator truck drivers.

Haulvisor analyzes thousands of available loads and builds the most profitable multi-stop routes, factoring in deadhead, fuel costs, and scheduling constraints so drivers can maximize revenue per mile and get home on time.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Maps:** Mapbox GL JS with custom route visualization
- **Data:** REST API with React Query for caching and real-time updates
- **Auth:** JWT-based authentication with role-based access control
- **Animations:** Framer Motion, Shader Gradient
- **UI:** Radix UI primitives, custom component library
- **Testing:** Vitest, Testing Library
- **Types:** Shared TypeScript interfaces published as an npm package (`@mwbhtx/haulvisor-types`)

## Key Features

- **Multi-stop route optimization** — Evaluates route chains (1–3 legs) and ranks them by a composite score factoring in pay, deadhead percentage, and cost per mile
- **Round-trip planning** — "Home By" date constraint ensures routes get drivers back on schedule
- **Real-time cost modeling** — Per-driver cost-per-mile settings with color-coded rate tiers (red/yellow/green) based on industry benchmarks and individual operating costs
- **Interactive map** — Mapbox-powered route visualization with animated arcs, origin/destination markers, and click-to-select locations
- **Guided onboarding** — Step-by-step tour walks new users through the filter bar using Onborda
- **Lane watchlists** — Save and monitor preferred lanes for rate changes
- **Analytics dashboard** — Track earnings, costs, and profit per lane over time
- **Mobile-first design** — Fully responsive with swipeable route cards and touch-optimized filters

## Architecture

```
src/
  app/              # Next.js App Router pages and layouts
  components/       # React components (map, layout, UI primitives)
  lib/              # Shared utilities, hooks, API client, type definitions
    hooks/          # React Query hooks for data fetching
    map/            # Mapbox route drawing and map utilities
```

## Development

```bash
npm install
npm run dev
```

## License

Proprietary
