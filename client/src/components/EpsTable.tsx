import { useEffect, useMemo, useState } from "react";
import { ApiError, getStock, saveEarning } from "../api";
import { formatNumber } from "../format";
import { listMissingQuarters, periodKey, periodLabel } from "../quarters";
import type { Earning, StockHistory } from "../types";

type EpsTableProps = {
  stock: StockHistory;
  onSaved: (stock: StockHistory) => void;
};

export function EpsTable({ stock, onSaved }: EpsTableProps) {
  const missing = useMemo(
    () => listMissingQuarters(stock.prices, stock.earnings),
    [stock.prices, stock.earnings],
  );
  const latestFirst = [...stock.earnings].reverse();
  const [editing, setEditing] = useState<string | null>(null);
  const [year, setYear] = useState("");
  const [quarter, setQuarter] = useState("1");
  const [reportDate, setReportDate] = useState("");
  const [eps, setEps] = useState("");
  const [selectedMissing, setSelectedMissing] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (missing.some((item) => periodKey(item.year, item.quarter) === selectedMissing)) return;
    const next = missing[0];
    setSelectedMissing(next ? periodKey(next.year, next.quarter) : "");
    setAdding(false);
  }, [missing, selectedMissing]);

  function startEdit(point: Earning) {
    setEditing(periodKey(point.year, point.quarter));
    setYear(String(point.year));
    setQuarter(String(point.quarter));
    setReportDate(point.reportDate);
    setEps(plainEps(point.value));
    setAdding(false);
    setError(null);
  }

  function startAdd() {
    if (!selectedMissing) return;
    setAdding(true);
    setEditing(null);
    setReportDate("");
    setEps("");
    setError(null);
  }

  async function saveEdit(point: Earning) {
    const nextYear = Number(year);
    const nextQuarter = Number(quarter);
    if (!Number.isInteger(nextYear) || !Number.isInteger(nextQuarter)) return;
    await persist({
      year: nextYear,
      quarter: nextQuarter,
      reportDate,
      eps,
      previousYear: point.year,
      previousQuarter: point.quarter,
    });
  }

  async function saveAdd() {
    const [yearText, quarterText] = selectedMissing.split("-");
    const nextYear = Number(yearText);
    const nextQuarter = Number(quarterText);
    if (!Number.isInteger(nextYear) || !Number.isInteger(nextQuarter)) return;
    await persist({ year: nextYear, quarter: nextQuarter, reportDate, eps });
  }

  async function persist(earning: {
    year: number;
    quarter: number;
    reportDate: string;
    eps: string;
    previousYear?: number;
    previousQuarter?: number;
  }) {
    setBusy(true);
    setError(null);
    try {
      await saveEarning(stock.ticker, earning);
      setEditing(null);
      setAdding(false);
      setReportDate("");
      setEps("");
      onSaved(await getStock(stock.ticker));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The EPS value could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <p className="banner bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-wrap scroll">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Quarter</th>
              <th>Report date</th>
              <th className="num">EPS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {latestFirst.map((point) =>
              editing === periodKey(point.year, point.quarter) ? (
                <tr key={periodKey(point.year, point.quarter)}>
                  <td>
                    <input
                      type="number"
                      aria-label="Year"
                      min={1900}
                      max={2200}
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <select aria-label="Quarter" value={quarter} onChange={(event) => setQuarter(event.target.value)}>
                      <option value="1">Q1</option>
                      <option value="2">Q2</option>
                      <option value="3">Q3</option>
                      <option value="4">Q4</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      aria-label="Report date"
                      value={reportDate}
                      onChange={(event) => setReportDate(event.target.value)}
                      required
                    />
                  </td>
                  <td className="num">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="EPS"
                      value={eps}
                      onChange={(event) => setEps(event.target.value)}
                      required
                      autoComplete="off"
                    />
                  </td>
                  <td>
                    <div className="eps-row">
                      <button type="button" className="small" onClick={() => void saveEdit(point)} disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="text-button" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={periodKey(point.year, point.quarter)}>
                  <td>{point.year}</td>
                  <td>Q{point.quarter}</td>
                  <td>{point.reportDate}</td>
                  <td className="num">{formatNumber(point.value)}</td>
                  <td>
                    <button type="button" className="text-button" onClick={() => startEdit(point)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
            {missing.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <span className="hint">Every quarter in this range already has an EPS value.</span>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={5}>
                  <div className="eps-row">
                    <select
                      className="period-select"
                      aria-label="Year and quarter without an EPS value"
                      value={selectedMissing}
                      onChange={(event) => setSelectedMissing(event.target.value)}
                    >
                      {missing.map((item) => (
                        <option key={periodKey(item.year, item.quarter)} value={periodKey(item.year, item.quarter)}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="small" onClick={startAdd} disabled={!selectedMissing || adding || busy}>
                      Add
                    </button>
                    {adding ? (
                      <>
                        <input
                          type="date"
                          aria-label="Report date"
                          value={reportDate}
                          onChange={(event) => setReportDate(event.target.value)}
                          autoFocus
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="EPS"
                          value={eps}
                          onChange={(event) => setEps(event.target.value)}
                          placeholder="EPS"
                          autoComplete="off"
                        />
                        <button type="button" className="small" onClick={() => void saveAdd()} disabled={busy}>
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setAdding(false);
                            setError(null);
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function plainEps(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, useGrouping: false }).format(number);
}
