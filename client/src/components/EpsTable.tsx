import { useEffect, useMemo, useState } from "react";
import { ApiError, getStock, saveEarning } from "../api";
import { formatNumber } from "../format";
import { listQuarters } from "../quarters";
import type { HistoryPoint, StockHistory } from "../types";

type EpsTableProps = {
  stock: StockHistory;
  onSaved: (stock: StockHistory) => void;
};

export function EpsTable({ stock, onSaved }: EpsTableProps) {
  const missing = useMemo(
    () => listQuarters(stock.prices, stock.earnings).filter((quarter) => quarter.eps === null),
    [stock.prices, stock.earnings],
  );
  const latestFirst = [...stock.earnings].reverse();
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [eps, setEps] = useState("");
  const [selectedMissing, setSelectedMissing] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (missing.some((quarter) => quarter.asOf === selectedMissing)) return;
    setSelectedMissing(missing[0]?.asOf ?? "");
    setAdding(false);
  }, [missing, selectedMissing]);

  function startEdit(point: HistoryPoint) {
    setEditing(point.asOf);
    setDate(point.asOf);
    setEps(plainEps(point.value));
    setAdding(false);
    setError(null);
  }

  function startAdd() {
    if (!selectedMissing) return;
    setAdding(true);
    setEditing(null);
    setEps("");
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    await persist(date, eps, editing);
  }

  async function saveAdd() {
    if (!selectedMissing) return;
    await persist(selectedMissing, eps);
  }

  async function persist(asOf: string, value: string, previousAsOf?: string) {
    setBusy(true);
    setError(null);
    try {
      await saveEarning(stock.ticker, asOf, value, previousAsOf);
      setEditing(null);
      setAdding(false);
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
              <th>Date</th>
              <th className="num">EPS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {latestFirst.map((point) =>
              editing === point.asOf ? (
                <tr key={point.asOf}>
                  <td colSpan={3}>
                    <div className="eps-row">
                      <input
                        type="date"
                        aria-label="Date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="EPS"
                        value={eps}
                        onChange={(event) => setEps(event.target.value)}
                        required
                        autoComplete="off"
                      />
                      <button type="button" className="small" onClick={() => void saveEdit()} disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="text-button" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={point.asOf}>
                  <td>{point.asOf}</td>
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
                <td colSpan={3}>
                  <span className="hint">Every quarter in this range already has an EPS value.</span>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={3}>
                  <div className="eps-row">
                    <select
                      aria-label="Quarter without an EPS value"
                      value={selectedMissing}
                      onChange={(event) => setSelectedMissing(event.target.value)}
                    >
                      {missing.map((quarter) => (
                        <option key={quarter.asOf} value={quarter.asOf}>
                          {quarter.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="small" onClick={startAdd} disabled={!selectedMissing || adding || busy}>
                      Add
                    </button>
                    {adding ? (
                      <>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="EPS"
                          value={eps}
                          onChange={(event) => setEps(event.target.value)}
                          placeholder="EPS"
                          autoFocus
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
