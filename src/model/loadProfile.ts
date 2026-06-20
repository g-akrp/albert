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
  const duration = Math.max(1, Math.round(profile.durationSec));
  const ramp = Math.max(1, Math.round(profile.rampUpSec ?? Math.min(10, Math.ceil(duration / 6))));

  switch (profile.type) {
    case 'constant':
    case 'soak':
      return { rate, startRate: rate, constant: true, stages: [{ toRate: rate, durationSec: duration }] };

    case 'spike': {
      const baseline = Math.max(1, Math.round(rate * 0.1));
      const hold = Math.max(1, duration - 2 * ramp);
      return {
        rate,
        startRate: 0,
        constant: false,
        stages: [
          { toRate: baseline, durationSec: ramp },
          { toRate: rate, durationSec: 1 },
          { toRate: rate, durationSec: hold },
          { toRate: 0, durationSec: ramp },
        ],
      };
    }

    case 'stress': {
      const hold = Math.max(1, Math.round((duration - 3 * ramp) / 2));
      return {
        rate,
        startRate: 0,
        constant: false,
        stages: [
          { toRate: rate, durationSec: ramp },
          { toRate: rate, durationSec: hold },
          { toRate: rate * 2, durationSec: ramp },
          { toRate: rate * 2, durationSec: hold },
          { toRate: 0, durationSec: ramp },
        ],
      };
    }

    case 'load':
    default: {
      const hold = Math.max(1, duration - 2 * ramp);
      return {
        rate,
        startRate: 0,
        constant: false,
        stages: [
          { toRate: rate, durationSec: ramp },
          { toRate: rate, durationSec: hold },
          { toRate: 0, durationSec: ramp },
        ],
      };
    }
  }
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

/** Samples the rate curve at up to `maxPoints` evenly-spaced times across the run for plotting. */
export function sampleRateCurve(plan: LoadPlan, maxPoints = 200): RatePoint[] {
  const total = totalDurationSec(plan);
  const verts = vertices(plan);
  const n = Math.max(2, Math.min(maxPoints, total + 1));
  const points: RatePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (total * i) / (n - 1);
    points.push({ tSec: t, rate: interpAt(verts, t) });
  }
  return points;
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
