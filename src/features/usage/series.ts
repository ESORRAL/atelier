import type { UsageSummary } from "../../ipc/usage";

export const MAX_SERIES = 5; // matches --color-chart-1..5
export const OTHERS = "Autres";

const nf = (digits: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = nf(2);
const int = nf(0);

export const fmtUsd = (n: number) => `${usd.format(n)} $`;
export const fmtTokens = (n: number) => int.format(n);

export type Bar = { day: string; total: number; segs: { model: string; cost: number }[] };
export type Series = { models: string[]; bars: Bar[]; max: number };

/** Top (MAX_SERIES - 1) models by cost keep their own color, the rest fold into "Autres". */
export function buildSeries(s: UsageSummary): Series {
  const ranked = Object.entries(s.byModel)
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .map(([m]) => m);
  const fold = ranked.length > MAX_SERIES;
  const keep = fold ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  const models = fold ? [...keep, OTHERS] : keep;
  const bars = s.days.map((d) => {
    const cost: Record<string, number> = {};
    for (const [m, u] of Object.entries(d.byModel)) {
      const k = keep.includes(m) ? m : OTHERS;
      cost[k] = (cost[k] ?? 0) + u.costUsd;
    }
    return { day: d.day, total: d.costUsd, segs: models.filter((m) => cost[m] > 0).map((m) => ({ model: m, cost: cost[m] })) };
  });
  return { models, bars, max: Math.max(0, ...bars.map((b) => b.total)) };
}

export const totalTokens = (s: UsageSummary) =>
  Object.values(s.byModel).reduce((a, u) => a + u.inputTokens + u.outputTokens, 0);

export const isEmpty = (s: UsageSummary) => s.totalCostUsd === 0 && totalTokens(s) === 0;
