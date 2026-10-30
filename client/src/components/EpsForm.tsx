import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, getStock, saveEarning } from "../api";
import { followsReportedMonths, listQuarters } from "../quarters";
import type { StockHistory } from "../types";

type EpsFormProps = {
  stock: StockHistory;
  onSaved: (stock: StockHistory) => void;
};

export function EpsForm({ stock, onSaved }: EpsFormProps) {
  const quarters = useMemo(
    () => listQuarters(stock.prices, stock.earnings),
    [stock.prices, stock.earnings],
  );
  const [missingOnly, setMissingOnly] = useState(false);
  const [asOf, setAsOf] = useState("");
  const [eps, setEps] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (missingOnly ? quarters.filter((quarter) => quarter.eps === null) : quarters),
    [missingOnly, quarters],
  );

  useEffect(() => {
    if (visible.some((quarter) => quarter.asOf === asOf)) return;
    const next = quarters.find((quarter) => quarter.eps === null) ?? quarters[0];
    setAsOf(next?.asOf ?? "");
    setEps(next?.eps ?? "");
  }, [asOf, quarters, visible]);

  function chooseQuarter(value: string) {
    setAsOf(value);
    setEps(quarters.find((quarter) => quarter.asOf === value)?.eps ?? "");
    setMessage(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asOf) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await saveEarning(stock.ticker, asOf, eps);
      const saved = quarters.find((quarter) => quarter.asOf === asOf);
      setMessage(`Saved EPS for ${saved?.label.split(" · ")[0] ?? asOf}.`);
      onSaved(await getStock(stock.ticker));
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The EPS value could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const selected = quarters.find((quarter) => quarter.asOf === asOf);
  const cycleHint = followsReportedMonths(stock.earnings)
    ? "Quarter ends follow the months already used for this stock's EPS."
    : "Quarter ends are March, June, September, and December until an EPS date is saved.";

  return (
    <form className="panel form" onSubmit={onSubmit}>
      <h2>Earnings per share</h2>
      {message ? (
        <p className="banner ok" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="banner bad" role="alert">
          {error}
        </p>
      ) : null}
      <label>
        Quarter
        <select value={asOf} onChange={(event) => chooseQuarter(event.target.value)} required disabled={visible.length === 0}>
          {visible.map((quarter) => (
            <option key={quarter.asOf} value={quarter.asOf}>
              {quarter.label}
            </option>
          ))}
        </select>
        <span className="hint">{cycleHint}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={missingOnly}
          onChange={(event) => {
            setMissingOnly(event.target.checked);
            setMessage(null);
          }}
        />
        Only quarters missing an EPS value
      </label>
      {visible.length === 0 ? <p className="hint">Every quarter in this range already has an EPS value.</p> : null}
      <label>
        EPS
        <input
          type="text"
          inputMode="decimal"
          value={eps}
          onChange={(event) => setEps(event.target.value)}
          required
          disabled={visible.length === 0}
          autoComplete="off"
        />
        {selected?.eps != null ? <span className="hint">This replaces the EPS already saved for this quarter.</span> : null}
      </label>
      <button type="submit" disabled={busy || visible.length === 0}>
        {busy ? "Saving…" : "Save EPS"}
      </button>
    </form>
  );
}
