"use client";

import { useState, useCallback } from "react";

export type MobileScreen =
  | { type: "home" }
  | { type: "search" }
  | { type: "filters" }
  | { type: "results" }
  | { type: "detail"; routeIndex: number };

export function useMobileRouteNav() {
  const [screenStack, setScreenStack] = useState<MobileScreen[]>([{ type: "home" }]);

  const currentScreen = screenStack[screenStack.length - 1];

  const push = useCallback((screen: MobileScreen) => {
    setScreenStack((prev) => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setScreenStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const reset = useCallback(() => {
    setScreenStack([{ type: "home" }]);
  }, []);

  const goToResults = useCallback(() => {
    setScreenStack([{ type: "home" }, { type: "results" }]);
  }, []);

  return { currentScreen, push, pop, reset, goToResults };
}
