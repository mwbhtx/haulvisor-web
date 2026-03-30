# Theme & Typography System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Geist/Bebas Neue with Space Grotesk (display) + Inter (body/UI), wire up next-themes for dark/light switching, and add a theme selector in Settings.

**Architecture:** CSS-first approach using Tailwind v4's `@theme inline` block. Font roles defined as CSS variables (`--font-display`, `--font-sans`, `--font-mono`). Theme switching via class on `<html>` managed by `next-themes`. All color tokens stay as CSS custom properties in `globals.css`.

**Tech Stack:** Next.js 15, Tailwind CSS v4, next-themes, next/font/google, shadcn/ui (radix-nova)

**Spec:** `docs/superpowers/specs/2026-03-29-theme-typography-system-design.md`

---

### Task 1: Replace Font Imports in layout.tsx

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace font imports and variables**

Replace the entire file contents:

```tsx
import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/platform/web/components/providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export const metadata: Metadata = {
  title: "haulvisor",
  description: "Stop guessing. Start hauling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Key changes:
- `Geist` → `Inter`, `Bebas_Neue` → `Space_Grotesk`
- CSS variables: `--font-space-grotesk`, `--font-inter`, `--font-geist-mono`
- Removed hardcoded `dark` class (next-themes will manage this in Task 3)

- [ ] **Step 2: Verify the app still loads**

Run: `npm run dev`

Open the app in a browser. The fonts won't look right yet (CSS vars haven't been updated), but the app should load without errors. Check the browser console for any font loading failures.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: replace Geist/Bebas Neue with Space Grotesk + Inter font imports"
```

---

### Task 2: Update globals.css Theme Architecture

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update @theme inline block with new font vars**

In `src/app/globals.css`, replace the `@theme inline` block (lines 19–63) with:

```css
@theme inline {
  --font-display: var(--font-space-grotesk);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-geist-mono);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-accent-alt: var(--accent-alt);
  --color-accent-alt-foreground: var(--accent-alt-foreground);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

Changes: `--font-heading` removed, `--font-display` added pointing to Space Grotesk, `--font-sans` now points to Inter.

- [ ] **Step 2: Restructure :root to shared-only, move light colors to .light class**

Replace the `:root` block (lines 65–101) with shared-only tokens:

```css
:root {
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --radius: 0.625rem;
}
```

Then add a `.light` class block immediately after `:root` with the current light values:

```css
.light {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --accent-alt: #fbff00;
  --accent-alt-foreground: oklch(0 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

The `.dark` block (lines 103–137) stays unchanged.

- [ ] **Step 3: Update base layer**

Replace the base layer (lines 165–175):

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

This is unchanged — `font-sans` now resolves to Inter via the new `@theme inline` mapping.

- [ ] **Step 4: Verify fonts render correctly**

Run: `npm run dev`

Open the app. Body text should now render in Inter. The hero/branding text will look wrong (still referencing Bebas Neue inline) — that's expected and fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: restructure CSS vars for multi-theme support, update font mappings"
```

---

### Task 3: Wire Up next-themes ThemeProvider

**Files:**
- Modify: `src/platform/web/components/providers.tsx`

- [ ] **Step 1: Add ThemeProvider wrapper**

Replace the entire file:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/core/services/auth-provider";
import { Toaster } from "@/platform/web/components/ui/sonner";
import { TooltipProvider } from "@/platform/web/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

Changes: Added `ThemeProvider` from `next-themes` wrapping inside `QueryClientProvider`. Config: `attribute="class"` (swaps class on `<html>`), `defaultTheme="dark"`, `disableTransitionOnChange` (prevents flash during theme swap).

- [ ] **Step 2: Verify dark theme still works**

Run: `npm run dev`

The app should look identical to before — dark theme applied via next-themes instead of the hardcoded class. Inspect `<html>` in devtools to confirm it has `class="... dark"`.

- [ ] **Step 3: Verify light theme works via devtools**

In browser devtools, manually change `<html>` class from `dark` to `light`. The entire app should swap to light colors. Change it back to `dark`.

- [ ] **Step 4: Commit**

```bash
git add src/platform/web/components/providers.tsx
git commit -m "feat: wire up next-themes ThemeProvider for class-based theme switching"
```

---

### Task 4: Replace All Bebas Neue Inline Styles with font-display

**Files:**
- Modify: `src/app/page.tsx` (3 instances)
- Modify: `src/app/login/page.tsx` (1 instance)
- Modify: `src/platform/web/components/marketing-nav.tsx` (1 instance)
- Modify: `src/platform/web/components/layouts/app-shell.tsx` (1 instance)

- [ ] **Step 1: Update page.tsx — hero title (line 107)**

Replace:
```tsx
<h1 className="font-normal tracking-wide leading-[0.85] text-white" style={{ fontFamily: 'var(--font-bebas-neue)', fontSize: '95px' }}>
```
With:
```tsx
<h1 className="font-display font-normal tracking-wide leading-[0.85] text-white text-[95px]">
```

- [ ] **Step 2: Update page.tsx — bottom CTA heading (line 155)**

Replace:
```tsx
<h2 className="text-4xl sm:text-5xl md:text-6xl font-normal tracking-wide leading-[0.9]" style={{ fontFamily: 'var(--font-bebas-neue)' }}>
```
With:
```tsx
<h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-normal tracking-wide leading-[0.9]">
```

- [ ] **Step 3: Update page.tsx — footer brand (line 176)**

Replace:
```tsx
<span className="text-3xl tracking-wide leading-none" style={{ fontFamily: 'var(--font-bebas-neue)' }}>
```
With:
```tsx
<span className="font-display text-3xl tracking-wide leading-none">
```

- [ ] **Step 4: Update login/page.tsx — form heading (line 91)**

Replace:
```tsx
<h2 className="text-3xl font-normal tracking-wide mb-8 text-white" style={{ fontFamily: 'var(--font-bebas-neue)' }}>
```
With:
```tsx
<h2 className="font-display text-3xl font-normal tracking-wide mb-8 text-white">
```

- [ ] **Step 5: Update marketing-nav.tsx — logo (line 9)**

Replace:
```tsx
<Link href="/" className={`text-3xl tracking-wide leading-none ${isDark ? "text-white" : "text-white"}`} style={{ fontFamily: 'var(--font-bebas-neue)' }}>
```
With:
```tsx
<Link href="/" className={`font-display text-3xl tracking-wide leading-none ${isDark ? "text-white" : "text-white"}`}>
```

- [ ] **Step 6: Update app-shell.tsx — logo (line 35)**

Replace:
```tsx
<Link href="/routes" className="text-3xl text-sidebar-foreground tracking-wide" style={{ fontFamily: 'var(--font-bebas-neue)' }}>
```
With:
```tsx
<Link href="/routes" className="font-display text-3xl text-sidebar-foreground tracking-wide">
```

- [ ] **Step 7: Verify all pages render with Space Grotesk for display text**

Run: `npm run dev`

Check these pages:
- `/` (landing page) — hero title, bottom CTA h2, footer brand
- `/login` — form heading
- `/routes` (or any app page) — top nav "HAULVISOR" logo

All should render in Space Grotesk. Inspect in devtools: `font-family` should show Space Grotesk.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/login/page.tsx src/platform/web/components/marketing-nav.tsx src/platform/web/components/layouts/app-shell.tsx
git commit -m "feat: replace inline Bebas Neue styles with font-display class"
```

---

### Task 5: Update shadcn/ui Components — font-heading → font-display

**Files:**
- Modify: `src/platform/web/components/ui/card.tsx` (line 41)
- Modify: `src/platform/web/components/ui/dialog.tsx` (line 133)
- Modify: `src/platform/web/components/ui/popover.tsx` (line 62)

- [ ] **Step 1: Update CardTitle in card.tsx**

On line 41, replace:
```tsx
"font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
```
With:
```tsx
"font-display text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
```

- [ ] **Step 2: Update DialogTitle in dialog.tsx**

On line 133, replace:
```tsx
"font-heading text-base leading-none font-medium",
```
With:
```tsx
"font-display text-base leading-none font-medium",
```

- [ ] **Step 3: Update PopoverTitle in popover.tsx**

On line 62, replace:
```tsx
"font-heading font-medium",
```
With:
```tsx
"font-display font-medium",
```

- [ ] **Step 4: Verify components render correctly**

Run: `npm run dev`

Open the app and check:
- Any card with a title (e.g., settings cards, dashboard cards) — should show Space Grotesk
- Open a dialog if one is accessible — title should show Space Grotesk
- Open a popover if one is accessible — title should show Space Grotesk

- [ ] **Step 5: Commit**

```bash
git add src/platform/web/components/ui/card.tsx src/platform/web/components/ui/dialog.tsx src/platform/web/components/ui/popover.tsx
git commit -m "feat: update shadcn/ui components from font-heading to font-display"
```

---

### Task 6: Add Theme Selector to Settings

**Files:**
- Create: `src/features/settings/components/theme-selector.tsx`
- Modify: `src/features/settings/views/desktop/desktop-settings-view.tsx`

- [ ] **Step 1: Create the theme selector component**

Create `src/features/settings/components/theme-selector.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { cn } from "@/core/utils";
import { Monitor, Moon, Sun } from "lucide-react";

const themes = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      {themes.map((t) => {
        const isActive = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add theme section to settings view**

In `src/features/settings/views/desktop/desktop-settings-view.tsx`, add the import at the top with the other imports:

```tsx
import { ThemeSelector } from "@/features/settings/components/theme-selector";
```

Then add a "Theme" section in the settings view. Find the first `<Card>` in the JSX (the driver profile card) and add this section **before** it:

```tsx
{/* Theme */}
<div className="space-y-3">
  <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
    Appearance
  </h3>
  <ThemeSelector />
</div>

<Separator />
```

- [ ] **Step 3: Verify theme switching works**

Run: `npm run dev`

Navigate to `/settings`. The Appearance section should show three buttons: Dark, Light, System. Click "Light" — the entire app should switch to light theme. Click "Dark" — back to dark. Refresh the page — the selected theme should persist (localStorage).

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/components/theme-selector.tsx src/features/settings/views/desktop/desktop-settings-view.tsx
git commit -m "feat: add theme selector to settings page"
```

---

### Task 7: Final Verification & Cleanup

**Files:**
- None new — verification pass only

- [ ] **Step 1: Search for any remaining Bebas Neue or font-heading references**

Run:
```bash
grep -r "bebas\|font-heading\|font-geist-sans" src/ --include="*.tsx" --include="*.ts" --include="*.css" -l
```

Expected: No results. If any files are found, update them to use the new font vars.

- [ ] **Step 2: Full visual check across all pages**

Run: `npm run dev`

Check each page in both dark and light themes:
- `/` — landing page (hero, features, CTA, footer)
- `/login` — login form
- `/routes` — app shell with nav
- `/settings` — theme selector + all settings cards
- `/dashboard` — if accessible, check metric cards
- `/orders` — if accessible, check table/cards

For each page verify:
- Display text (h1, h2, brand) renders in Space Grotesk
- Body text, buttons, nav render in Inter
- Light theme colors are readable and not broken
- Dark theme still looks as before

- [ ] **Step 3: Check for hydration warnings**

Open browser console and look for any Next.js hydration mismatch warnings. `next-themes` with `suppressHydrationWarning` on `<html>` should prevent these, but verify.

- [ ] **Step 4: Build check**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any remaining fixes**

If any fixes were needed during verification:

```bash
git add -A
git commit -m "fix: cleanup remaining font references and theme issues"
```
