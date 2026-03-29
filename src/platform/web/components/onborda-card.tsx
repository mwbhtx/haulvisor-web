"use client";

import { useRef, useEffect, useState } from "react";
import type { CardComponentProps } from "onborda";
import { useOnborda } from "onborda";
import { X } from "lucide-react";
import { useUpdateSettings } from "@/core/hooks/use-settings";
import { isDemoUser } from "@/core/services/auth";

export function OnbordaCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  arrow,
}: CardComponentProps) {
  const { closeOnborda } = useOnborda();
  const updateSettings = useUpdateSettings();
  const cardRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);
  const [clampStyle, setClampStyle] = useState<React.CSSProperties>({});

  const dismiss = () => {
    if (isDemoUser()) {
      sessionStorage.setItem("hv-tour-dismissed", "1");
    } else {
      updateSettings.mutate({ onboarding_completed: true } as any);
    }
    closeOnborda();
  };

  // Clamp card to viewport — reposition with fixed positioning if overflowing
  useEffect(() => {
    setClamped(false);
    setClampStyle({});

    const el = cardRef.current;
    if (!el) return;

    // Multiple attempts — onborda repositions asynchronously
    const attempts = [50, 150, 300];
    const timers = attempts.map((delay) =>
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const pad = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const overflowLeft = rect.left < pad;
        const overflowRight = rect.right > vw - pad;
        const overflowTop = rect.top < pad;
        const overflowBottom = rect.bottom > vh - pad;

        if (overflowLeft || overflowRight || overflowTop || overflowBottom) {
          // Calculate clamped position
          let left = rect.left;
          let top = rect.top;

          if (overflowLeft) left = pad;
          if (overflowRight) left = vw - rect.width - pad;
          if (overflowTop) top = pad;
          if (overflowBottom) top = vh - rect.height - pad;

          setClamped(true);
          setClampStyle({
            position: "fixed",
            left: `${Math.max(pad, left)}px`,
            top: `${Math.max(pad, top)}px`,
            zIndex: 9999,
          });
        }
      }, delay),
    );

    return () => timers.forEach(clearTimeout);
  }, [currentStep]);

  return (
    <div
      ref={cardRef}
      className="relative w-72 rounded-lg border border-border bg-card p-4 shadow-xl"
      style={clamped ? clampStyle : undefined}
    >
      {/* Close button */}
      <button
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Icon + title */}
      <div className="flex items-center gap-2 pr-6">
        {step.icon}
        <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
      </div>

      {/* Content */}
      <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {step.content}
      </div>

      {/* Controls */}
      {step.showControls && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {totalSteps}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={currentStep + 1 === totalSteps ? dismiss : nextStep}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {currentStep + 1 === totalSteps ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      )}

      {/* Arrow — hide when card is repositioned since it won't point correctly */}
      {!clamped && arrow}
    </div>
  );
}
