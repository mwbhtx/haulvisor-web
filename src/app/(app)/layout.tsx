"use client";

import { OnbordaProvider, Onborda } from "onborda";
import { RequireAuth } from "@/core/services/auth-provider";
import { AppShell } from "@/platform/web/components/layouts/app-shell";
import { OnbordaCard } from "@/platform/web/components/onborda-card";
import { tourSteps } from "@/platform/web/components/tour-steps";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <OnbordaProvider>
        <Onborda
          steps={tourSteps}
          shadowRgb="0,0,0"
          shadowOpacity="0.7"
          cardComponent={OnbordaCard}
        >
          <AppShell>{children}</AppShell>
        </Onborda>
      </OnbordaProvider>
    </RequireAuth>
  );
}
