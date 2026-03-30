# Theme & Typography System Design

**Date:** 2026-03-29
**Status:** Draft

## Overview

Centralize haulvisor's theme and typography system to support multiple themes (dark/light now, custom later) and establish clear font roles with Space Grotesk (display) and Inter (body/UI).

## Goals

1. Replace Geist and Bebas Neue with Space Grotesk (display) and Inter (body/UI)
2. Wire up `next-themes` for class-based theme switching with dark as default
3. Ship both dark and light themes
4. Add theme selector in Settings
5. Establish font role boundaries enforced through Tailwind utilities
6. Architecture supports adding custom themes later with zero structural changes

## Non-Goals

- Custom theme builder UI
- Per-user theme persistence beyond localStorage (no backend storage)
- Typography component library (use Tailwind classes directly)

## Typography System

### Font Stack

| Role | Font | CSS Variable | Tailwind Class | Loaded Via |
|------|------|-------------|----------------|------------|
| Display | Space Grotesk | `--font-space-grotesk` | `font-display` | `next/font/google` |
| Body / UI | Inter | `--font-inter` | `font-sans` | `next/font/google` |
| Monospace | Geist Mono | `--font-geist-mono` | `font-mono` | `next/font/google` |

### Font Role Boundaries

**`font-display` (Space Grotesk):**
- Hero titles (landing pages, marketing)
- H1 — page titles
- H2 — section headers
- Brand text ("HAULVISOR" wordmark)

**`font-sans` (Inter) — default for all elements:**
- H3–H6 headings
- Body text, paragraphs
- Buttons, navigation, form elements
- Dashboard metrics, tables, cards
- All shadcn/ui components
- Badges, chips, metadata

**`font-mono` (Geist Mono):**
- Code blocks
- Terminal output
- Monospace data displays

### Type Scale Reference

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Hero title | 48px | 700 | Space Grotesk |
| H1 | 32px | 600 | Space Grotesk |
| H2 | 24px | 600 | Space Grotesk |
| H3 | 20px | 600 | Inter |
| H4 | 16px | 600 | Inter |
| Body | 16px | 400 | Inter |
| Body small | 14px | 400 | Inter |
| Button / nav | 14px | 500 | Inter |
| Metric value | 28px | 700 | Inter (tabular-nums) |
| Caption / label | 12px | 500 | Inter (uppercase) |

## Theme Architecture

### CSS Variable Layers

```
:root {
  /* Shared tokens — same across all themes */
  --radius: 0.625rem;
  /* Font families stay in @theme inline, not per-theme */
}

.dark {
  --background: #000000;
  --primary: #ff5601;
  --card: #111111;
  /* ... all current .dark values ... */
}

.light {
  --background: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
  --card: oklch(1 0 0);
  /* ... current :root color values move here ... */
}

/* Future: .theme-midnight, .theme-brand, etc. */
```

### `@theme inline` Block

```css
@theme inline {
  --font-display: var(--font-space-grotesk);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-geist-mono);
  --color-background: var(--background);
  --color-primary: var(--primary);
  /* ... all existing color mappings unchanged ... */
}
```

### Theme Switching

**Provider setup** (`providers.tsx`):
```tsx
import { ThemeProvider } from "next-themes";

<ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
  {/* existing providers */}
</ThemeProvider>
```

**Flow:** Settings UI → `next-themes` `setTheme()` → swaps class on `<html>` → CSS vars resolve → instant repaint.

`next-themes` handles:
- localStorage persistence
- Blocking script to prevent flash of wrong theme
- `useTheme()` hook for reading current theme in components

### Layout Changes

**`layout.tsx`:**
- Remove: `Geist`, `Bebas_Neue` imports
- Add: `Space_Grotesk`, `Inter` from `next/font/google`
- CSS variables: `--font-space-grotesk`, `--font-inter`, `--font-geist-mono`
- Remove hardcoded `dark` class from `<html>` (next-themes manages this)
- Add `suppressHydrationWarning` (already present)

### Settings UI

Add a "Theme" section to the existing settings page with a simple selector showing:
- Dark (default)
- Light

The selector calls `setTheme()` from `next-themes`. No custom component library needed — a simple group of tappable options with a check/highlight on the active theme.

## Files Changed

| File | Action | What Changes |
|------|--------|-------------|
| `src/app/globals.css` | Edit | Restructure CSS vars: `:root` shared only, `.light` class with current light values, `.dark` stays, `@theme inline` font vars updated, remove `--font-heading` |
| `src/app/layout.tsx` | Edit | Replace font imports (Space Grotesk + Inter), remove hardcoded `dark` class |
| `src/platform/web/components/providers.tsx` | Edit | Wrap with `ThemeProvider` from next-themes |
| `src/platform/web/components/ui/card.tsx` | Edit | `font-heading` → `font-display` |
| `src/platform/web/components/ui/dialog.tsx` | Edit | `font-heading` → `font-display` |
| `src/platform/web/components/ui/popover.tsx` | Edit | `font-heading` → `font-display` |
| `src/app/page.tsx` | Edit | Replace 3 inline Bebas Neue styles with `font-display` class |
| `src/app/login/page.tsx` | Edit | Replace inline Bebas Neue style with `font-display` class |
| `src/platform/web/components/marketing-nav.tsx` | Edit | Replace inline Bebas Neue style with `font-display` class |
| `src/platform/web/components/layouts/app-shell.tsx` | Edit | Replace inline Bebas Neue style with `font-display` class |
| `src/features/settings/views/desktop/desktop-settings-view.tsx` | Edit | Add theme section with dark/light selector |
| Theme selector component | New | Tappable dark/light option group using `useTheme()` |

## Migration Notes

- `font-heading` is renamed to `font-display` everywhere — search-and-replace across components
- All inline `style={{ fontFamily: 'var(--font-bebas-neue)' }}` replaced with `className="font-display"`
- Geist Sans and Bebas Neue font imports removed entirely from layout.tsx
- The existing Sonner toaster already uses `useTheme()` — it will work automatically once ThemeProvider is added
- Dark mode mapbox filter (`.dark .mapboxgl-map`) continues to work since next-themes uses the same `.dark` class

## Adding Future Themes

To add a new theme:
1. Add a new class block in `globals.css` (e.g., `.theme-midnight { --background: ...; }`)
2. Add the option to the theme selector component
3. Pass the theme name to `next-themes` config's `themes` array

No structural changes required.
