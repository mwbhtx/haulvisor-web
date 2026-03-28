"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/platform/web/components/ui/button";
import { Input } from "@/platform/web/components/ui/input";
import { Slider } from "@/platform/web/components/ui/slider";
import { cn } from "@/core/utils";

export interface AdvancedFilters {
  legs: number;
  maxDeadheadPct: number;
  maxIdleHours: number;
  homeBy: string;
  trailerType: string;
}

interface FiltersSheetProps {
  onBack: () => void;
  onApply: (filters: AdvancedFilters) => void;
  initialFilters?: Partial<AdvancedFilters>;
}

const LEG_OPTIONS = [1, 2, 3, 4, 5];

export function FiltersSheet({ onBack, onApply, initialFilters }: FiltersSheetProps) {
  const [legs, setLegs] = useState(initialFilters?.legs ?? 3);
  const [maxDeadheadPct, setMaxDeadheadPct] = useState(initialFilters?.maxDeadheadPct ?? 30);
  const [maxIdleHours, setMaxIdleHours] = useState(initialFilters?.maxIdleHours ?? 48);
  const [homeBy, setHomeBy] = useState(initialFilters?.homeBy ?? "");
  const [trailerType, setTrailerType] = useState(initialFilters?.trailerType ?? "");

  const handleApply = () => {
    onApply({ legs, maxDeadheadPct, maxIdleHours, homeBy, trailerType });
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button type="button" onClick={onBack} className="rounded-full p-1 hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Filters</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Number of legs */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Number of Legs
          </label>
          <div className="flex gap-2">
            {LEG_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLegs(n)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium border transition-colors",
                  legs === n
                    ? "border-foreground/30 bg-white/10 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Max Deadhead % */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Max Deadhead %
            </label>
            <span className="text-sm tabular-nums font-medium">{maxDeadheadPct}%</span>
          </div>
          <Slider
            value={[maxDeadheadPct]}
            onValueChange={(v) => setMaxDeadheadPct(v[0])}
            min={0}
            max={100}
            step={5}
          />
        </div>

        {/* Max Idle Hours */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Max Idle Hours
          </label>
          <Input
            type="number"
            value={maxIdleHours}
            onChange={(e) => setMaxIdleHours(Number(e.target.value))}
            min={0}
            className="h-11"
          />
        </div>

        {/* Home By */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Home By
          </label>
          <Input
            type="date"
            value={homeBy}
            onChange={(e) => setHomeBy(e.target.value)}
            className="h-11"
          />
        </div>

        {/* Trailer Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Trailer Type
          </label>
          <Input
            type="text"
            placeholder="e.g. Van, Reefer, Flatbed"
            value={trailerType}
            onChange={(e) => setTrailerType(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {/* Apply button */}
      <div className="px-4 pb-6 pt-2">
        <Button
          onClick={handleApply}
          className="w-full h-12 rounded-xl text-base font-semibold"
        >
          Apply Filters
        </Button>
      </div>
    </motion.div>
  );
}
