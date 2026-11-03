import type { ReactNode } from "react";
import { formatNumber } from "../format";
import type { HistoryPoint } from "../types";

export function Series({
  label,
  points,
  color,
  details,
  chartPoints,
  quarterLines,
  quarterAt,
  axisFromZero,
  yStep,
  note,
  caps,
  formatValue = formatNumber,
  yRange,
}: {
  label: string;
  points: HistoryPoint[];
  color: string;
  details?: ReactNode;
  chartPoints?: HistoryPoint[];
  quarterLines?: boolean;
  quarterAt?: (asOf: string) => { year: number; quarter: number } | null;
  axisFromZero?: boolean;
  yStep?: number;
  note?: string;
  caps?: ChartCap[];
  formatValue?: (value: string | number | null) => string;
  yRange?: { min: number; max: number };
}) {
  const caption =
    points.length === 0
      ? "No points yet."
      : `${points.length} ${points.length === 1 ? "point" : "points"} · ${points[0]?.asOf ?? ""} – ${points[points.length - 1]?.asOf ?? ""}`;
  const latestFirst = [...points].reverse();
  const plotted = chartPoints ?? points;

  return (
    <section className="series">
      <header>
        <h2>{label}</h2>
        <p>
          {caption}
          {note ? <span className="asof">{note}</span> : null}
        </p>
      </header>
      {plotted.length === 0 && points.length > 0 && !yRange ? (
        <p className="empty">Every value in this range is outside the scale of the graph.</p>
      ) : (
        <LineChart
          points={plotted}
          slots={chartPoints ? points : undefined}
          color={color}
          label={label}
          quarterLines={quarterLines}
          quarterAt={quarterAt}
          axisFromZero={axisFromZero}
          yStep={yStep}
          caps={caps}
          formatValue={formatValue}
          yRange={yRange}
        />
      )}
      {details}
      {details || points.length === 0 ? null : (
        <div className="table-wrap scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">{label}</th>
              </tr>
            </thead>
            <tbody>
              {latestFirst.map((point) => (
                <tr key={point.asOf}>
                  <td>{point.asOf}</td>
                  <td className="num">{formatValue(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LineChart({
  points,
  slots,
  color,
  label,
  quarterLines,
  quarterAt,
  axisFromZero,
  yStep,
  caps,
  formatValue,
  yRange,
}: {
  points: HistoryPoint[];
  slots?: HistoryPoint[];
  color: string;
  label: string;
  quarterLines?: boolean;
  quarterAt?: (asOf: string) => { year: number; quarter: number } | null;
  axisFromZero?: boolean;
  yStep?: number;
  caps?: ChartCap[];
  formatValue: (value: string | number | null) => string;
  yRange?: { min: number; max: number };
}) {
  const axis = slots ?? points;
  if (axis.length === 0) return <p className="empty">No {label.toLowerCase()} history yet.</p>;

  const width = 760;
  const height = 220;
  const pad = { left: 72, right: 16, top: 16, bottom: quarterLines ? 32 : 16 };
  const values = points.map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const dataMax = values.length > 0 ? Math.max(...values) : 0;
  let min = yRange ? yRange.min : dataMin;
  let max = yRange ? yRange.max : dataMax;
  if (!yRange && min === max) {
    min -= 1;
    max += 1;
  }
  if (!yRange && axisFromZero) min = Math.min(0, dataMin);
  if (!yRange) {
    const span = max - min || 1;
    max += span * 0.08;
    if (!axisFromZero || min < 0) min -= span * 0.08;
  }
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xAt = (index: number) =>
    axis.length === 1 ? pad.left + plotWidth / 2 : pad.left + (index / (axis.length - 1)) * plotWidth;
  const yAt = (value: number) => pad.top + ((max - value) / (max - min)) * plotHeight;
  const runs = chartRuns(axis, points);
  const capLines = capSegments(axis, points, caps ?? [], xAt, max, min, yAt, plotWidth);
  const quarters = quarterLines ? quarterMarks(axis, quarterAt) : [];
  const ticks = yStep && yStep > 0 ? yTicks(min, max, yStep) : [];
  const quarterLabels = labeledQuarters(quarters, xAt, pad.left);
  const first = axis[0]?.asOf ?? "";
  const last = axis[axis.length - 1]?.asOf ?? "";
  const bottom = height - pad.bottom;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} from ${first} to ${last}`}
    >
      {quarters.map((mark) => (
        <line key={`${mark.year}-${mark.quarter}`} x1={xAt(mark.index)} y1={pad.top} x2={xAt(mark.index)} y2={bottom} stroke="#e2d8c8" />
      ))}
      {quarterLabels.map((item) => (
        <text key={`${item.year}-${item.quarter}`} x={item.x} y={height - 8} textAnchor={item.anchor}>
          {item.text}
        </text>
      ))}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} y1={yAt(tick)} x2={width - pad.right} y2={yAt(tick)} stroke="#e2d8c8" />
          <text x={pad.left - 8} y={tickLabelY(yAt(tick), pad.top, bottom)} textAnchor="end">
            {formatValue(tick)}
          </text>
        </g>
      ))}
      {ticks.length === 0 && min < 0 && max > 0 ? (
        <line x1={pad.left} y1={yAt(0)} x2={width - pad.right} y2={yAt(0)} stroke="#e2d8c8" />
      ) : null}
      {ticks.length === 0 && axisFromZero && min >= 0 ? (
        <line x1={pad.left} y1={bottom} x2={width - pad.right} y2={bottom} stroke="#e2d8c8" />
      ) : null}
      {capLines.map((cap) => (
        <g key={cap.key}>
          <title>{cap.side === "high" ? `${label} above the scale` : `${label} below the scale`}</title>
          {cap.joints.map((joint) => (
            <line key={joint.key} className="chart-cap" stroke={color} x1={joint.x1} y1={joint.y1} x2={joint.x2} y2={joint.y2} />
          ))}
        </g>
      ))}
      {runs.map((run) => {
        const coordinates = run.map(
          (item) => `${xAt(item.index).toFixed(1)},${yAt(Number(item.point.value)).toFixed(1)}`,
        );
        const key = `${run[0]?.index ?? 0}-${run[run.length - 1]?.index ?? 0}`;
        if (run.length === 1) {
          if (axis.length <= 36) return null;
          const [x, y] = coordinates[0]?.split(",") ?? [];
          return <circle key={key} cx={x} cy={y} r={2.5} fill={color} />;
        }
        return <polyline key={key} fill="none" stroke={color} strokeWidth={2} points={coordinates.join(" ")} />;
      })}
      {axis.length <= 36
        ? runs.flatMap((run) =>
            run.map((item) => {
              const x = xAt(item.index);
              const y = yAt(Number(item.point.value));
              return <circle key={item.index} cx={x} cy={y} r={axis.length === 1 ? 4 : 2.5} fill={color} />;
            }),
          )
        : null}
      {ticks.length > 0 ? null : (
        <text x={pad.left - 8} y={Math.max(12, yAt(dataMax))} textAnchor="end">
          {formatValue(dataMax)}
        </text>
      )}
      {ticks.length > 0 || (dataMin === dataMax && !axisFromZero) ? null : (
        <text x={pad.left - 8} y={Math.min(bottom - 2, yAt(axisFromZero ? Math.min(0, dataMin) : dataMin))} textAnchor="end">
          {formatValue(axisFromZero ? Math.min(0, dataMin) : dataMin)}
        </text>
      )}
    </svg>
  );
}

function labeledQuarters(
  marks: Array<{ index: number; year: number; quarter: number }>,
  xAt: (index: number) => number,
  plotLeft: number,
): Array<{ year: number; quarter: number; x: number; text: string; anchor: "start" | "middle" }> {
  const labels: Array<{ year: number; quarter: number; x: number; text: string; anchor: "start" | "middle" }> = [];
  let lastLabelEnd = plotLeft - 8;
  for (const mark of marks) {
    const x = xAt(mark.index);
    const text = mark.quarter === 1 ? String(mark.year) : `Q${mark.quarter}`;
    const textWidth = text.length * 8;
    const anchor = x < plotLeft + textWidth / 2 ? "start" : "middle";
    const left = anchor === "start" ? x : x - textWidth / 2;
    if (left < lastLabelEnd) continue;
    labels.push({ year: mark.year, quarter: mark.quarter, x, text, anchor });
    lastLabelEnd = left + textWidth + 8;
  }
  return labels;
}

function yTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const start = Math.ceil((min - step * 1e-9) / step) * step;
  for (let value = start; value <= max + step * 1e-9; value += step) {
    const rounded = Math.round(value * 1e6) / 1e6;
    if (rounded + 1e-9 < min || rounded - 1e-9 > max) continue;
    ticks.push(rounded);
  }
  return ticks;
}

function tickLabelY(y: number, top: number, bottom: number): number {
  return Math.min(bottom - 2, Math.max(top + 10, y));
}

function quarterMarks(
  points: HistoryPoint[],
  quarterAt?: (asOf: string) => { year: number; quarter: number } | null,
): Array<{ index: number; year: number; quarter: number }> {
  const marks: Array<{ index: number; year: number; quarter: number }> = [];
  let previous = "";
  for (let index = 0; index < points.length; index += 1) {
    const asOf = points[index]?.asOf ?? "";
    const period = quarterAt ? quarterAt(asOf) : calendarQuarter(asOf);
    if (!period) continue;
    const key = `${period.year}-${period.quarter}`;
    if (key === previous) continue;
    marks.push({ index, year: period.year, quarter: period.quarter });
    previous = key;
  }
  return marks;
}

function calendarQuarter(asOf: string): { year: number; quarter: number } | null {
  const month = Number(asOf.slice(5, 7));
  const year = Number(asOf.slice(0, 4));
  if (month < 1 || month > 12 || year < 1900) return null;
  return { year, quarter: Math.ceil(month / 3) };
}

type ChartCap = {
  from: string;
  to: string;
  side: "high" | "low";
};

function capSegments(
  axis: HistoryPoint[],
  plotted: HistoryPoint[],
  caps: ChartCap[],
  xAt: (index: number) => number,
  max: number,
  min: number,
  yAt: (value: number) => number,
  plotWidth: number,
): Array<{ key: string; side: ChartCap["side"]; joints: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> }> {
  const indexByDate = new Map(axis.map((point, index) => [point.asOf, index]));
  const plottedDates = new Set(plotted.map((point) => point.asOf));
  const step = axis.length <= 1 ? plotWidth : plotWidth / (axis.length - 1);
  const plotLeft = xAt(0) - (axis.length <= 1 ? plotWidth / 2 : 0);
  const plotRight = axis.length <= 1 ? plotLeft + plotWidth : xAt(axis.length - 1);
  const segments: Array<{ key: string; side: ChartCap["side"]; joints: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> }> = [];
  for (let index = 0; index < caps.length; index += 1) {
    const cap = caps[index];
    if (!cap) continue;
    const start = indexByDate.get(cap.from);
    const end = indexByDate.get(cap.to);
    if (start === undefined || end === undefined) continue;
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const capY = cap.side === "high" ? yAt(max) : yAt(min);
    const before = neighborPoint(axis, from - 1, plottedDates);
    const after = neighborPoint(axis, to + 1, plottedDates);
    const next = caps[index + 1];
    const nextStart = next ? indexByDate.get(next.from) : undefined;
    const switches = next !== undefined && next.side !== cap.side && nextStart === to + 1;
    let x1 = before ? xAt(before.index) : xAt(from);
    let x2 = after ? xAt(after.index) : xAt(switches ? to + 1 : to);
    if (!switches && x2 - x1 < step) {
      const mid = (x1 + x2) / 2;
      x1 = Math.max(plotLeft, mid - step / 2);
      x2 = Math.min(plotRight, mid + step / 2);
    }
    const key = `${cap.from}-${cap.to}-${cap.side}`;
    const joints = [{ key: `${key}-level`, x1, y1: capY, x2, y2: capY }];
    if (before) joints.push({ key: `${key}-before`, x1: xAt(before.index), y1: yAt(Number(before.point.value)), x2: xAt(before.index), y2: capY });
    if (after) joints.push({ key: `${key}-after`, x1: xAt(after.index), y1: capY, x2: xAt(after.index), y2: yAt(Number(after.point.value)) });
    if (switches && next) {
      const otherY = next.side === "high" ? yAt(max) : yAt(min);
      joints.push({ key: `${key}-switch`, x1: xAt(to + 1), y1: capY, x2: xAt(to + 1), y2: otherY });
    }
    segments.push({ key, side: cap.side, joints });
  }
  return segments;
}

function neighborPoint(
  axis: HistoryPoint[],
  index: number,
  plottedDates: Set<string>,
): { point: HistoryPoint; index: number } | null {
  const point = axis[index];
  if (!point || !plottedDates.has(point.asOf)) return null;
  return { point, index };
}

function chartRuns(
  slots: HistoryPoint[],
  points: HistoryPoint[],
): Array<Array<{ point: HistoryPoint; index: number }>> {
  const indexByDate = new Map(slots.map((point, index) => [point.asOf, index]));
  const placed = points
    .map((point) => ({ point, index: indexByDate.get(point.asOf) }))
    .filter((item): item is { point: HistoryPoint; index: number } => item.index !== undefined)
    .sort((left, right) => left.index - right.index);
  const runs: Array<Array<{ point: HistoryPoint; index: number }>> = [];
  for (const item of placed) {
    const current = runs[runs.length - 1];
    const previous = current?.[current.length - 1];
    if (!current || !previous || item.index !== previous.index + 1) runs.push([item]);
    else current.push(item);
  }
  return runs;
}
