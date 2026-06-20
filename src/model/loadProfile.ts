import { SimProfile } from './types';

/**
 * Pure, dependency-free model of how a load profile shapes arrival rate over time. This is the single
 * source of truth shared by the k6 sim codegen (`generateSimScript`) and the sim editor's planned-load
 * preview, so the preview always matches what k6 will actually run.
 */

export interface LoadStage {
  toRate: number;
  durationSec: number;
}

export interface LoadPlan {
  /** integer arrival rate (req/s) the profile is built around. */
  rate: number;
  /** rate at t=0. */
  startRate: number;
  stages: LoadStage[];
  /** true when the profile is a flat constant-arrival-rate (no ramping). */
  constant: boolean;
}

export interface RatePoint {
  tSec: number;
  rate: number;
}

export function planLoad(profile: SimProfile, targetTps: number): LoadPlan {
  const rate = Math.max(1, Math.round(targetTps));
  const rampUp = Math.max(0, Math.round(profile.rampUpSec));
  const hold = Math.max(0, Math.round(profile.holdSec));
  const rampDown = Math.max(0, Math.round(profile.rampDownSec));

  const stages: LoadStage[] = [];
  if (rampUp > 0) stages.push({ toRate: rate, durationSec: rampUp });
  if (hold > 0) stages.push({ toRate: rate, durationSec: hold });
  if (rampDown > 0) stages.push({ toRate: 0, durationSec: rampDown });
  if (stages.length === 0) stages.push({ toRate: rate, durationSec: 1 });

  return {
    rate,
    startRate: rampUp > 0 ? 0 : rate,
    constant: rampUp === 0 && rampDown === 0,
    stages,
  };
}

export function totalDurationSec(plan: LoadPlan): number {
  return plan.stages.reduce((sum, s) => sum + s.durationSec, 0);
}

/** Vertices of the piecewise-linear rate curve: (t=0, startRate) then one point per stage boundary. */
function vertices(plan: LoadPlan): RatePoint[] {
  const verts: RatePoint[] = [{ tSec: 0, rate: plan.startRate }];
  let t = 0;
  for (const stage of plan.stages) {
    t += stage.durationSec;
    verts.push({ tSec: t, rate: stage.toRate });
  }
  return verts;
}

function interpAt(verts: RatePoint[], t: number): number {
  if (t <= verts[0].tSec) return verts[0].rate;
  const last = verts[verts.length - 1];
  if (t >= last.tSec) return last.rate;
  for (let i = 1; i < verts.length; i++) {
    const a = verts[i - 1];
    const b = verts[i];
    if (t <= b.tSec) {
      const span = b.tSec - a.tSec;
      return span === 0 ? b.rate : a.rate + (b.rate - a.rate) * ((t - a.tSec) / span);
    }
  }
  return last.rate;
}

/** The plan's rate at absolute time `t` (seconds since the plan's own start), 0 outside [0, duration] —
 *  a plan does not hold its last rate once it finishes, mirroring k6's scenario lifecycle. */
export function rateAt(plan: LoadPlan, t: number): number {
  if (t < 0 || t > totalDurationSec(plan)) return 0;
  return interpAt(vertices(plan), t);
}

/** A plan paired with the offset (seconds into the overall sim) at which it starts. */
export interface ScheduledPlan {
  plan: LoadPlan;
  startAtSec: number;
}

/** Samples one flow's rate curve, shifted by its `startAtSec`, across a shared `spanSec` timeline so
 *  multiple flows with different start times/durations can be plotted on the same x-axis. */
export function sampleScheduledCurve(entry: ScheduledPlan, spanSec: number, maxPoints = 200): RatePoint[] {
  const n = Math.max(2, Math.min(maxPoints, Math.max(1, Math.round(spanSec)) + 1));
  const points: RatePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (spanSec * i) / (n - 1);
    points.push({ tSec: t, rate: rateAt(entry.plan, t - entry.startAtSec) });
  }
  return points;
}

/** Sums multiple flows' rate curves (each shifted by its own start time) into one combined curve,
 *  sampled across the shared sim span. */
export function sumScheduledCurves(entries: ScheduledPlan[], spanSec: number, maxPoints = 200): RatePoint[] {
  const n = Math.max(2, Math.min(maxPoints, Math.max(1, Math.round(spanSec)) + 1));
  const points: RatePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (spanSec * i) / (n - 1);
    let rate = 0;
    for (const entry of entries) rate += rateAt(entry.plan, t - entry.startAtSec);
    points.push({ tSec: t, rate });
  }
  return points;
}

/** Overall sim span: the latest point at which any flow finishes (start + own duration). */
export function combinedSpanSec(entries: ScheduledPlan[]): number {
  return Math.max(1, ...entries.map((e) => e.startAtSec + totalDurationSec(e.plan)));
}

/** Total requests the profile is expected to issue = area under the rate curve. */
export function plannedRequests(plan: LoadPlan): number {
  const verts = vertices(plan);
  let area = 0;
  for (let i = 1; i < verts.length; i++) {
    const a = verts[i - 1];
    const b = verts[i];
    area += ((a.rate + b.rate) / 2) * (b.tSec - a.tSec);
  }
  return Math.round(area);
}
