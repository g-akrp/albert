import { ApmExportResult, SimFile, SimSummary } from '../model/types';

const ENDPOINTS: Record<'US' | 'EU', string> = {
  US: 'https://metric-api.newrelic.com/metric/v1',
  EU: 'https://metric-api.eu.newrelic.com/metric/v1',
};

/**
 * Posts a sim's per-scenario summary to New Relic's Metric API. Each scenario contributes a set of
 * gauge/count metrics tagged with the sim name and flow label so they can be filtered in New Relic.
 * Returns 202 Accepted as success.
 */
export async function sendToNewRelic(
  sim: SimFile,
  summary: SimSummary,
  key: string,
  region: 'US' | 'EU'
): Promise<ApmExportResult> {
  const timestamp = Date.now();
  const commonAttrs = { 'albert.sim': sim.name, 'service.name': 'albert' };

  const metrics: NewRelicMetric[] = [];
  for (const sc of summary.scenarios) {
    const attrs = { ...commonAttrs, 'albert.flow': sc.label, 'albert.scenario': sc.key, 'albert.targetTps': sc.targetTps };
    metrics.push(gauge('albert.sim.tps', sc.achievedTps, timestamp, attrs));
    metrics.push(gauge('albert.sim.errorRate', sc.errorRate, timestamp, attrs));
    metrics.push(gauge('albert.sim.latency.p50', sc.p50, timestamp, attrs));
    metrics.push(gauge('albert.sim.latency.p95', sc.p95, timestamp, attrs));
    metrics.push(gauge('albert.sim.latency.p99', sc.p99, timestamp, attrs));
    metrics.push(count('albert.sim.requests', sc.totalReqs, timestamp, summary.durationSec * 1000, attrs));
    if (sc.checksTotal > 0) {
      metrics.push(gauge('albert.sim.checks.passRate', sc.checksPassed / sc.checksTotal, timestamp, attrs));
    }
  }

  const payload = [{ common: { timestamp, 'interval.ms': summary.durationSec * 1000 }, metrics }];

  try {
    const res = await fetch(ENDPOINTS[region], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': key },
      body: JSON.stringify(payload),
    });
    if (res.status === 202) {
      return { provider: 'newrelic', ok: true, message: `Sent ${metrics.length} metrics to New Relic (${region}).` };
    }
    const text = await res.text().catch(() => '');
    return { provider: 'newrelic', ok: false, message: `New Relic responded ${res.status} ${res.statusText}: ${text.slice(0, 300)}` };
  } catch (err: any) {
    return { provider: 'newrelic', ok: false, message: `New Relic export failed: ${err?.message ?? String(err)}` };
  }
}

interface NewRelicMetric {
  name: string;
  type: 'gauge' | 'count';
  value: number;
  timestamp: number;
  'interval.ms'?: number;
  attributes: Record<string, string | number>;
}

function gauge(name: string, value: number, timestamp: number, attributes: Record<string, string | number>): NewRelicMetric {
  return { name, type: 'gauge', value: safe(value), timestamp, attributes };
}

function count(name: string, value: number, timestamp: number, intervalMs: number, attributes: Record<string, string | number>): NewRelicMetric {
  return { name, type: 'count', value: safe(value), timestamp, 'interval.ms': intervalMs, attributes };
}

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
