"use client";

import { ChevronLeftIcon, TruckIcon, ClockIcon, CalendarIcon, CheckCircle2Icon, AlertTriangleIcon } from "lucide-react";
import type { RoundTripChain } from "@/lib/types";

const DH_SPEED_MPH = 55;
const LOADED_SPEED_MPH = 52;

function formatDuration(hours: number | undefined): string {
  if (hours === undefined || isNaN(hours)) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function dhDriveHours(miles: number): number {
  if (miles <= 0) return 0;
  return miles / DH_SPEED_MPH;
}

function loadedDriveHours(miles: number): number {
  if (miles <= 0) return 0;
  const rawDrive = miles / LOADED_SPEED_MPH;
  const breaks = Math.floor(rawDrive / 4) * 0.25;
  const totalOnDuty = rawDrive + breaks;
  const restStops = Math.floor(rawDrive / 11);
  return totalOnDuty + restStops * 10;
}

type Segment =
  | { kind: "dh"; from: string; to: string; miles: number; durationHours: number }
  | { kind: "wait"; city: string; durationHours: number | undefined }
  | {
      kind: "load";
      from: string;
      to: string;
      miles: number;
      weight?: number;
      durationHours: number;
      timingValid?: boolean;
      hasDateInfo: boolean;
    };

function computeSegments(
  chain: RoundTripChain,
  originCity: string,
  returnCity: string,
): Segment[] {
  const segments: Segment[] = [];
  const firstLeg = chain.legs[0];
  const lastLeg = chain.legs[chain.legs.length - 1];

  if (!firstLeg || !lastLeg) return segments;

  const startDhMiles = firstLeg.deadhead_miles ?? 0;
  const betweenDhSum = chain.legs
    .slice(1)
    .reduce((sum, l) => sum + (l.deadhead_miles ?? 0), 0);
  const returnDhMiles = Math.max(
    0,
    chain.total_deadhead_miles - startDhMiles - betweenDhSum,
  );

  // Simulate timeline: depart such that we arrive at first pickup exactly at pickup_date_early
  let currentMs: number | null = null;
  if (firstLeg.pickup_date_early) {
    const pickupMs = new Date(firstLeg.pickup_date_early).getTime();
    currentMs = pickupMs - dhDriveHours(startDhMiles) * 3_600_000;
  }

  const advanceTime = (hours: number) => {
    if (currentMs !== null) currentMs += hours * 3_600_000;
  };

  // Start DH: origin → first pickup
  const startDhDur = dhDriveHours(startDhMiles);
  segments.push({
    kind: "dh",
    from: originCity,
    to: firstLeg.origin_city,
    miles: startDhMiles,
    durationHours: startDhDur,
  });
  advanceTime(startDhDur);

  chain.legs.forEach((leg, i) => {
    // Between-leg DH
    if (i > 0 && (leg.deadhead_miles ?? 0) > 0) {
      const prevLeg = chain.legs[i - 1];
      const dur = dhDriveHours(leg.deadhead_miles);
      segments.push({
        kind: "dh",
        from: prevLeg.destination_city,
        to: leg.origin_city,
        miles: leg.deadhead_miles,
        durationHours: dur,
      });
      advanceTime(dur);
    }

    // Wait for pickup
    let waitHours: number | undefined;
    if (currentMs !== null && leg.pickup_date_early) {
      const pickupOpenMs = new Date(leg.pickup_date_early).getTime();
      waitHours = Math.max(0, (pickupOpenMs - currentMs) / 3_600_000);
    }
    segments.push({ kind: "wait", city: leg.origin_city, durationHours: waitHours });
    if (waitHours !== undefined) advanceTime(waitHours);

    // Loaded segment
    const loadDur = loadedDriveHours(leg.miles);
    segments.push({
      kind: "load",
      from: leg.origin_city,
      to: leg.destination_city,
      miles: leg.miles,
      weight: leg.weight,
      durationHours: loadDur,
      timingValid: leg.timing_valid,
      hasDateInfo: !!(leg.pickup_date_early || leg.delivery_date_early),
    });
    advanceTime(loadDur);
  });

  // Return DH: last delivery → return city
  segments.push({
    kind: "dh",
    from: lastLeg.destination_city,
    to: returnCity,
    miles: returnDhMiles,
    durationHours: dhDriveHours(returnDhMiles),
  });

  return segments;
}

interface RouteInspectorProps {
  chain: RoundTripChain;
  originCity: string;
  returnCity?: string;
  onClose: () => void;
}

export function RouteInspector({
  chain,
  originCity,
  returnCity,
  onClose,
}: RouteInspectorProps) {
  const segments = computeSegments(chain, originCity, returnCity ?? originCity);

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      {/* Header */}
      <div className="flex items-center px-3 py-2.5 border-b border-white/10 shrink-0">
        <p className="flex-1 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Segment Breakdown
        </p>
      </div>

      {/* Segment rows */}
      <div className="flex-1 overflow-y-auto">
        {segments.map((seg, i) => {
          if (seg.kind === "dh") {
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]"
              >
                <div className="h-2 w-2 rounded-full border-2 border-muted-foreground/40 bg-card shrink-0" />
                <span className="flex-1 text-sm text-muted-foreground">
                  DH: {seg.from} → {seg.to}
                </span>
                <span className="text-xs text-muted-foreground/40 tabular-nums shrink-0">
                  {seg.miles.toLocaleString()} mi ÷ {DH_SPEED_MPH} mph
                </span>
                <span className="text-sm text-muted-foreground tabular-nums ml-2 w-14 text-right shrink-0">
                  {formatDuration(seg.durationHours)}
                </span>
              </div>
            );
          }

          if (seg.kind === "wait") {
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]"
              >
                <ClockIcon className="h-3.5 w-3.5 text-[#ff5601]/60 shrink-0" />
                <span className="flex-1 text-sm text-[#ff5601]/70">
                  Waiting for pickup at {seg.city}
                </span>
                <span className="text-sm text-muted-foreground/70 tabular-nums w-14 text-right shrink-0">
                  {formatDuration(seg.durationHours)}
                </span>
              </div>
            );
          }

          // load
          return (
            <div
              key={i}
              className="px-3 py-2.5 border-b border-white/[0.05]"
            >
              <div className="flex items-center gap-2.5">
                <TruckIcon className="h-3.5 w-3.5 text-foreground/70 shrink-0" />
                <span className="flex-1 text-sm font-semibold">
                  {seg.from} → {seg.to}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm tabular-nums font-medium w-14 text-right">
                    {formatDuration(seg.durationHours)}
                  </span>
                  {seg.hasDateInfo && (
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  {seg.timingValid === true && (
                    <CheckCircle2Icon className="h-3.5 w-3.5 text-green-500" />
                  )}
                  {seg.timingValid === false && (
                    <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                {seg.miles.toLocaleString()} mi
                {seg.weight != null ? ` · ${seg.weight.toLocaleString()} lbs` : ""}
              </p>
            </div>
          );
        })}
      </div>

      {/* Assumptions footer */}
      <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
        <p className="text-xs text-muted-foreground/50 leading-relaxed">
          <span className="font-medium text-muted-foreground/70">Assumptions:</span>{" "}
          Loaded @ {LOADED_SPEED_MPH} mph · DH @ {DH_SPEED_MPH} mph · HOS 11h drive / 10h
          rest · 15-min break every 4h · Departs at PU window open unless prior segment
          dictates later.
        </p>
      </div>
    </div>
  );
}
