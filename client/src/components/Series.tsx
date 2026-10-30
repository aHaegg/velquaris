import type { ReactNode } from "react";
import { formatNumber } from "../format";
import type { HistoryPoint } from "../types";

export function Series({
  label,
  points,
  color,
  details,
}: {
  label: string;
  points: HistoryPoint[];
  color: string;
  details?: ReactNode;
}) {
  const caption =
    points.length === 0
      ? "No points yet."
      : `${points.length} ${points.length === 1 ? "point" : "points"} · ${points[0]?.asOf ?? ""} – ${points[points.length - 1]?.asOf ?? ""}`;
  const latestFirst = [...points].reverse();

  return (
    <section className="series">
      <header>
        <h2>{label}</h2>
        <p>{caption}</p>
      </header>
      <LineChart points={points} color={color} label={label} />
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
                  <td className="num">{formatNumber(point.value)}</td>
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
  color,
  label,
}: {
  points: HistoryPoint[];
  color: string;
  label: string;
}) {
  if (points.length === 0) return <p className="empty">No {label.toLowerCase()} history yet.</p>;

  const width = 760;
  const height = 220;
  const pad = { left: 72, right: 16, top: 16, bottom: 16 };
  const values = points.map((point) => Number(point.value));
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let min = dataMin;
  let max = dataMax;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xAt = (index: number) =>
    points.length === 1 ? pad.left + plotWidth / 2 : pad.left + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) => pad.top + ((max - value) / (max - min)) * plotHeight;
  const coordinates = values.map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`);
  const first = points[0]?.asOf ?? "";
  const last = points[points.length - 1]?.asOf ?? "";

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} from ${first} to ${last}`}
    >
      {min < 0 && max > 0 ? (
        <line x1={pad.left} y1={yAt(0)} x2={width - pad.right} y2={yAt(0)} stroke="#e2d8c8" />
      ) : null}
      <polyline fill="none" stroke={color} strokeWidth={2} points={coordinates.join(" ")} />
      {points.length <= 36
        ? coordinates.map((pair) => {
            const [x, y] = pair.split(",");
            return <circle key={pair} cx={x} cy={y} r={points.length === 1 ? 4 : 2.5} fill={color} />;
          })
        : null}
      <text x={pad.left - 8} y={Math.max(12, yAt(dataMax))} textAnchor="end">
        {formatNumber(dataMax)}
      </text>
      {dataMin === dataMax ? null : (
        <text x={pad.left - 8} y={yAt(dataMin)} textAnchor="end">
          {formatNumber(dataMin)}
        </text>
      )}
    </svg>
  );
}
