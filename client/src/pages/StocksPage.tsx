import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStocks } from "../api";
import { formatNumber } from "../format";
import { useTitle } from "../title";
import type { StockSummary } from "../types";

export function StocksPage() {
  useTitle("Stocks");
  const [stocks, setStocks] = useState<StockSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStocks()
      .then((rows) => {
        if (!cancelled) setStocks(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The database could not be reached.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <>
        <header className="page-head">
          <h1>Something went wrong</h1>
          <p>{error}</p>
        </header>
      </>
    );
  }

  if (!stocks) {
    return (
      <header className="page-head">
        <h1>Stocks</h1>
        <p>Loading…</p>
      </header>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>Stocks</h1>
        <p>{stocks.length === 0 ? "Nothing has been uploaded yet." : `${stocks.length} ${stocks.length === 1 ? "stock" : "stocks"}`}</p>
      </header>
      {stocks.length === 0 ? (
        <section className="panel empty-state">
          <p>Upload a CSV file to add a ticker and its history.</p>
          <p>
            <Link className="button" to="/upload">
              Upload CSV
            </Link>
          </p>
        </section>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="num">Price</th>
                  <th className="num">EPS</th>
                  <th className="num">P/E</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => (
                  <tr key={stock.ticker}>
                    <td>
                      <Link className="ticker" to={`/stocks/${encodeURIComponent(stock.ticker)}`}>
                        {stock.ticker}
                      </Link>
                      {stock.name ? <span className="sub">{stock.name}</span> : null}
                    </td>
                    <Figure value={stock.price} date={stock.priceDate} />
                    <Figure value={stock.eps} date={stock.epsDate} />
                    <Figure value={stock.pe} date={stock.peDate} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Each figure is the latest uploaded value, with its date underneath. P/E is stored as uploaded, not calculated from price and EPS.
          </p>
        </>
      )}
    </>
  );
}

function Figure({ value, date }: { value: string | null; date: string | null }) {
  if (value === null) {
    return (
      <td className="num">
        <span className="figure muted">—</span>
      </td>
    );
  }
  return (
    <td className="num">
      <span className="figure">{formatNumber(value)}</span>
      {date ? <span className="asof">{date}</span> : null}
    </td>
  );
}
