import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getUploadPolicy, uploadCsv } from "../api";
import { useTitle } from "../title";
import type { UploadFeedback, UploadPolicy } from "../types";

export function UploadPage() {
  useTitle("Upload");
  const [policy, setPolicy] = useState<UploadPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUploadPolicy()
      .then((value) => {
        if (!cancelled) setPolicy(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The upload form could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("replace") !== "1") form.delete("replace");
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(await uploadCsv(form));
    } catch (cause: unknown) {
      setFeedback({
        tone: "bad",
        summary: cause instanceof Error ? cause.message : "The upload could not be read.",
        tickers: [],
        issues: [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Upload CSV</h1>
        <p>Add tickers and historical prices and quarterly earnings per share. P/E is the price divided by the sum of the last four quarters.</p>
      </header>
      {feedback ? <Feedback feedback={feedback} /> : null}
      {error ? (
        <section className="banner bad">
          <p>{error}</p>
        </section>
      ) : null}
      {policy === null && !error ? (
        <section className="panel">
          <p>Loading…</p>
        </section>
      ) : null}
      {policy === "disabled" ? (
        <section className="panel">
          <p>
            Uploads are turned off until <code>UPLOAD_SECRET</code> is set on the server.
          </p>
        </section>
      ) : null}
      {policy === "open" || policy === "secret" ? (
        <form className="panel form" onSubmit={onSubmit}>
          <label>
            Ticker
            <input type="text" name="ticker" maxLength={16} autoCapitalize="characters" spellCheck={false} placeholder="HMB" />
            <span className="hint">
              Required when the file has no ticker column. Leave blank for <code>hmb_20261028_202013.csv</code>.
            </span>
          </label>
          <label>
            CSV file
            <input type="file" name="file" accept=".csv,text/csv" required />
          </label>
          {policy === "secret" ? (
            <label>
              Upload secret
              <input type="password" name="secret" autoComplete="current-password" required />
            </label>
          ) : null}
          <label className="check">
            <input type="checkbox" name="replace" value="1" />
            Replace existing history for tickers in this file
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
      ) : null}
      <section className="panel">
        <h2>File format</h2>
        <p>
          A Nasdaq historical-price export works as-is. Those files are semicolon-separated, start with <code>sep=;</code>, and use a{" "}
          <code>Closing price</code> column. They have no ticker, so type one in the form. A file named like{" "}
          <code>hmb_20261028_202013.csv</code> is read as <code>HMB</code> when the ticker box is empty. Bid, ask, high, low, average,
          volume, turnover, and trades are ignored.
        </p>
        <p>
          A table can also use these columns. A row can leave price or EPS blank. Uploading the same ticker and date again updates that
          point and leaves other dates in place.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ticker</th>
                <th>date</th>
                <th className="num">price</th>
                <th className="num">eps</th>
                <th>name</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>AAPL</td>
                <td>2024-01-05</td>
                <td className="num">181.18</td>
                <td />
                <td>Apple</td>
              </tr>
              <tr>
                <td>AAPL</td>
                <td>2024-03-30</td>
                <td />
                <td className="num">1.53</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Dates can be <code>YYYY-MM-DD</code> or <code>DD.MM.YYYY</code>. Numbers can use a dot or a comma as the decimal separator.{" "}
          <code>name</code> is optional. The delimiter can be a comma or a semicolon.
        </p>
        <p>
          <a href="/template.csv">Download a template</a>. Delete the DEMO row before you upload it, or that sample will be saved.
        </p>
        <p>
          Check “Replace existing history” when the file should become the full history for those tickers. That removes prices and EPS
          already stored for them.
        </p>
      </section>
    </>
  );
}

function Feedback({ feedback }: { feedback: UploadFeedback }) {
  return (
    <section className={`banner ${feedback.tone}`}>
      <p>{feedback.summary}</p>
      {feedback.tickers.length > 0 ? (
        <p>
          {feedback.tickers.map((ticker, index) => (
            <span key={ticker}>
              {index > 0 ? ", " : null}
              <Link to={`/stocks/${encodeURIComponent(ticker)}`}>{ticker}</Link>
            </span>
          ))}
        </p>
      ) : null}
      {feedback.issues.length > 0 ? (
        <ul>
          {feedback.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
