import type { Diagram, DiagramSeries, EnergyPrice, GetDiagramDataResponse } from '../../types/protocol';
import {
  aggregatePoints,
  barInterval,
  defaultKind,
  downsample,
  palette,
  periods,
  scaleUnit,
  toBars,
  type Aggregate,
  type ChartPoint,
  type ChartSeries,
  type Period,
  type RenderSeries,
} from './chart';

// What a diagram card shows, from its settings, its range and its values:
// pure functions, the hooks and components beside it use them.

export const MINUTE = 60 * 1000;
// Points of a line: about one per two pixels of a wide chart
const MAX_LINE_POINTS = 600;

// Levels are recorded from 0 to 1 and shown in percent
const factorOf = (datapoint: string) => (/^LEVEL(_\d)?$/.test(datapoint) ? 100 : 1);
export const keyOf = (s: { address: string; datapoint: string }) => `${s.address}.${s.datapoint}`;

// The costs of a consumption: electricity in Wh or kWh, gas in m³ (turned
// into kWh with calorific value and condition number) or kWh
export const costOf = (sum: number, unit: string, price?: EnergyPrice): number | null => {
  if (!price) return null;
  if (unit === 'Wh' && price.electricity > 0) return (sum / 1000) * price.electricity;
  if (unit === 'kWh' && price.electricity > 0) return sum * price.electricity;
  if (unit === 'm³' && price.gas > 0 && price.gasHeatingValue > 0) {
    return sum * price.gasHeatingValue * (price.gasConditionNumber || 1) * price.gas;
  }
  return null;
};

// The period shown up to now (end null: live) or up to an earlier end, or
// a span zoomed into
export type Range = { period: Period; end: number | null } | { period: Period; from: number; to: number; zoomed: true };

export const boundsOf = (range: Range, now: number) => {
  const end = 'zoomed' in range ? range.to : (range.end ?? now);
  const from = 'zoomed' in range ? range.from : end - periods[range.period];
  return { from, to: end, live: !('zoomed' in range) && range.end === null, width: end - from };
};

// The range one width earlier (-1) or later (1); reaching now it is live again
export const shifted = (range: Range, direction: -1 | 1, now: number): Range => {
  const { from, to, width } = boundsOf(range, now);
  const end = to + direction * width;
  if (end >= now) return { period: range.period, end: null };
  if ('zoomed' in range) return { ...range, from: from + direction * width, to: end };
  return { period: range.period, end };
};

// A series as drawn, from its settings and values
const toRender = (
  s: DiagramSeries,
  data: GetDiagramDataResponse['series'] | undefined,
  from: number,
  to: number,
  shift: number,
): Pick<RenderSeries, 'points' | 'bars' | 'kind' | 'aggregate'> & { key: string } => {
  const factor = factorOf(s.datapoint);
  const raw = (data?.find((d) => d.address === s.address && d.datapoint === s.datapoint)?.points ?? []) as ChartPoint[];
  const scaled = raw.map(([t, avg, lo, hi]) => [t + shift, avg * factor, lo * factor, hi * factor] as ChartPoint);
  const aggregate = (s.aggregate || 'avg') as Aggregate;
  const kind = s.chart || defaultKind(scaled, aggregate);
  const bars =
    kind === 'bar' || aggregate === 'delta' ? toBars(scaled, from, to, barInterval(to - from), aggregate) : [];
  let points = aggregatePoints(
    scaled.filter((p) => p[0] >= from),
    aggregate === 'delta' ? 'avg' : aggregate,
  );
  // Consumption as a line or area: a point per interval
  if (aggregate === 'delta' && kind !== 'bar') points = bars.map((b) => [(b.t0 + b.t1) / 2, b.v, b.v, b.v]);
  else if (kind !== 'state' && kind !== 'step') points = downsample(points, MAX_LINE_POINTS);
  return { key: keyOf(s), points, bars, kind, aggregate };
};

// Values and bars multiplied by factor (Wh in kWh)
const scaledBy = <T extends { points: ChartPoint[]; bars: RenderSeries['bars'] }>(r: T, factor: number): T =>
  factor === 1
    ? r
    : {
        ...r,
        points: r.points.map(([t, a, lo, hi]) => [t, a * factor, lo * factor, hi * factor] as ChartPoint),
        bars: r.bars.map((b) => ({ ...b, v: b.v * factor })),
      };

// The series of a diagram as drawn: label, color, a unit that suits the
// values, and the same span before to compare with
export const renderSeries = ({
  diagram,
  names,
  data,
  before,
  from,
  to,
}: {
  diagram: Diagram;
  names: Map<string, string>;
  data: GetDiagramDataResponse['series'] | undefined;
  // The span before, to compare with; undefined without comparing
  before: GetDiagramDataResponse['series'] | undefined;
  from: number;
  to: number;
}): RenderSeries[] =>
  diagram.series.map((s, i) => {
    const key = keyOf(s);
    const current = toRender(s, data, from, to, 0);
    const previous = before ? toRender(s, before, from, to, to - from) : null;
    // Wh and W in kWh and kW once they get large
    const largest = Math.max(
      0,
      ...current.bars.map((b) => Math.abs(b.v)),
      ...current.points.map((p) => Math.abs(p[3])),
    );
    const { unit, factor } = scaleUnit(s.unit ?? '', largest);
    const scaledPrevious = previous ? scaledBy(previous, factor) : null;
    return {
      ...scaledBy(current, factor),
      label: s.label || names.get(key) || `${s.address} ${s.datapoint}`,
      color: s.color || palette[i % palette.length],
      unit,
      axis: (s.axis || '') as RenderSeries['axis'],
      compare:
        scaledPrevious && current.kind !== 'state'
          ? { points: scaledPrevious.points, bars: scaledPrevious.bars }
          : undefined,
    };
  });

// The series for the CSV export: bars as one point per interval
export const csvSeries = (shown: RenderSeries[]): ChartSeries[] =>
  shown.map((s) => ({
    ...s,
    points:
      s.kind === 'bar' || s.aggregate === 'delta' ? s.bars.map((b) => [b.t0, b.v, b.v, b.v] as ChartPoint) : s.points,
  }));

// A file name from the diagram's name
export const csvFileName = (name: string) => `${name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`;
