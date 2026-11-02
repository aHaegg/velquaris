import { useState, type FormEvent } from "react";
import { ApiError, deleteSplit, getStock, saveSplit } from "../api";
import { formatSplit } from "../splits";
import type { Split, StockHistory } from "../types";

type SplitsEditorProps = {
  stock: StockHistory;
  onSaved: (stock: StockHistory) => void;
};

export function SplitsEditor({ stock, onSaved }: SplitsEditorProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [newShares, setNewShares] = useState("");
  const [oldShares, setOldShares] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(split: Split) {
    setEditing(split.date);
    setDate(split.date);
    setNewShares(String(split.newShares));
    setOldShares(String(split.oldShares));
    setError(null);
  }

  async function reload() {
    onSaved(await getStock(stock.ticker));
  }

  async function saveEdit(split: Split) {
    const parsed = parseSplit(date, newShares, oldShares);
    if (!parsed) {
      setError(splitError(date, newShares, oldShares));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveSplit(stock.ticker, { ...parsed, previousDate: split.date });
      setEditing(null);
      setDate("");
      setNewShares("");
      setOldShares("");
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The stock split could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function addSplit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSplit(date, newShares, oldShares);
    if (!parsed) {
      setError(splitError(date, newShares, oldShares));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveSplit(stock.ticker, parsed);
      setDate("");
      setNewShares("");
      setOldShares("");
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The stock split could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(split: Split) {
    setBusy(true);
    setError(null);
    try {
      await deleteSplit(stock.ticker, split.date);
      if (editing === split.date) setEditing(null);
      await reload();
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The stock split could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split-editor">
      <h3>Stock splits</h3>
      <p className="hint">
        A 4-for-1 split divides every EPS reported before that date by 4. Later splits multiply. Prices stay as imported.
      </p>
      {error ? (
        <p className="banner bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Split</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stock.splits.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <span className="hint">None yet.</span>
                </td>
              </tr>
            ) : (
              stock.splits.map((split) =>
                editing === split.date ? (
                  <tr key={split.date}>
                    <td>
                      <input
                        type="date"
                        aria-label="Split date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <div className="eps-row">
                        <input
                          className="share-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          aria-label="New shares"
                          value={newShares}
                          onChange={(event) => setNewShares(event.target.value)}
                          required
                        />
                        <span className="ratio-word">for</span>
                        <input
                          className="share-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          aria-label="Old shares"
                          value={oldShares}
                          onChange={(event) => setOldShares(event.target.value)}
                          required
                        />
                      </div>
                    </td>
                    <td>
                      <div className="eps-row">
                        <button type="button" className="small" onClick={() => void saveEdit(split)} disabled={busy}>
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setEditing(null);
                            setDate("");
                            setNewShares("");
                            setOldShares("");
                            setError(null);
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={split.date}>
                    <td>{split.date}</td>
                    <td>{formatSplit(split)}</td>
                    <td>
                      <div className="eps-row">
                        <button type="button" className="text-button" onClick={() => startEdit(split)} disabled={busy}>
                          Edit
                        </button>
                        <button type="button" className="text-button" onClick={() => void remove(split)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
            {editing ? null : (
              <tr>
                <td colSpan={3}>
                  <form className="eps-row" onSubmit={(event) => void addSplit(event)}>
                    <input
                      type="date"
                      aria-label="Split date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      required
                    />
                    <input
                      className="share-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      aria-label="New shares"
                      value={newShares}
                      onChange={(event) => setNewShares(event.target.value)}
                      placeholder="4"
                      required
                    />
                    <span className="ratio-word">for</span>
                    <input
                      className="share-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      aria-label="Old shares"
                      value={oldShares}
                      onChange={(event) => setOldShares(event.target.value)}
                      placeholder="1"
                      required
                    />
                    <button type="submit" className="small" disabled={busy}>
                      {busy ? "Saving…" : "Add"}
                    </button>
                  </form>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function splitError(date: string, newShares: string, oldShares: string): string {
  const next = wholeShares(newShares);
  const previous = wholeShares(oldShares);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && next && previous && next === previous) {
    return "New and old shares are the same, so that is not a split.";
  }
  return "Enter the split date, the new shares, and the old shares. For a 4-for-1 split, use 4 and 1.";
}

function parseSplit(date: string, newShares: string, oldShares: string): { date: string; newShares: number; oldShares: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const next = wholeShares(newShares);
  const previous = wholeShares(oldShares);
  if (!next || !previous || next === previous) return null;
  return { date, newShares: next, oldShares: previous };
}

function wholeShares(value: string): number | null {
  if (!/^[1-9]\d{0,6}$/.test(value.trim())) return null;
  const shares = Number(value);
  return shares <= 1_000_000 ? shares : null;
}
