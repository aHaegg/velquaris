import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getStock } from "../api";
import { EpsForm } from "../components/EpsForm";
import { Series } from "../components/Series";
import { useTitle } from "../title";
import type { StockHistory } from "../types";
import { priceEarnings } from "../valuation";

export function StockPage() {
  const { ticker = "" } = useParams();
  const [stock, setStock] = useState<StockHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useTitle(stock?.ticker ?? (missing ? "Not found" : "Stock"));

  useEffect(() => {
    let cancelled = false;
    setStock(null);
    setError(null);
    setMissing(false);
    getStock(ticker)
      .then((row) => {
        if (!cancelled) setStock(row);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setMissing(true);
          return;
        }
        setError(cause instanceof Error ? cause.message : "The database could not be reached.");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (missing) {
    return (
      <>
        <header className="page-head">
          <h1>Not found</h1>
          <p>That page is not in Velquaris.</p>
        </header>
        <p>
          <Link to="/">Back to stocks</Link>
        </p>
      </>
    );
  }

  if (error) {
    return (
      <header className="page-head">
        <h1>Something went wrong</h1>
        <p>{error}</p>
      </header>
    );
  }

  if (!stock) {
    return (
      <header className="page-head">
        <h1>Stock</h1>
        <p>Loading…</p>
      </header>
    );
  }

  return (
    <>
      <header className="page-head">
        <p className="back">
          <Link to="/">All stocks</Link>
        </p>
        <h1>{stock.ticker}</h1>
        {stock.name ? <p>{stock.name}</p> : null}
      </header>
      <EpsForm stock={stock} onSaved={setStock} />
      <div className="series-list">
        <Series label="Price" points={stock.prices} color="#1e6b45" />
        <Series label="Earnings per share" points={stock.earnings} color="#8d3b2b" />
        <Series label="P/E" points={priceEarnings(stock.prices, stock.earnings)} color="#1e4d78" />
      </div>
      <p className="note">P/E is the closing price divided by the sum of the last four quarterly EPS figures on or before that date. Dates with fewer than four quarters have no P/E.</p>
    </>
  );
}
