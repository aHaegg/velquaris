import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStocks } from "../api";
import { formatNumber, formatPercent } from "../format";
import { useTitle } from "../title";
import type { StockSummary } from "../types";
import { latestPegRatio, latestPriceEarnings, latestTtmEpsGrowth } from "../valuation";

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
                  <th className="num">TTM EPS growth</th>
                  <th className="num">P/E</th>
                  <th className="num">PEG</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => {
                  const pe = latestPriceEarnings(stock.price, stock.priceDate, stock.earnings, stock.splits);
                  const growth = latestTtmEpsGrowth(stock.earnings, stock.splits);
                  const peg = latestPegRatio(stock.price, stock.priceDate, stock.earnings, stock.splits);
                  return (
                    <tr key={stock.ticker}>
                      <td>
                        <Link className="ticker" to={`/stocks/${encodeURIComponent(stock.ticker)}`}>
                          {stock.ticker}
                        </Link>
                        {stock.name ? <span className="sub">{stock.name}</span> : null}
                      </td>
                      <Figure value={stock.price} date={stock.priceDate} />
                      <Figure value={stock.eps} date={stock.epsYear && stock.epsQuarter ? `${stock.epsYear} Q${stock.epsQuarter}` : null} />
                      <Figure
                        value={growth.value}
                        date={growth.year !== null && growth.quarter !== null ? `${growth.year} Q${growth.quarter}` : null}
                        format={formatPercent}
                      />
                      <Figure value={pe.value} date={pe.date} />
                      <Figure value={peg.value} date={peg.date} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">
            Price is the latest close. EPS is the latest quarter, as reported. TTM EPS growth is the change from the four split-adjusted quarters a year earlier to the latest four quarters in a row. It is blank until those eight quarters have been reported, and the date under it is the newest quarter in that window. P/E is the latest price divided by the sum of the last four quarterly EPS figures, adjusted for later stock splits, whose report date is on or before the price date. It is blank until four quarters have been reported. PEG is that P/E divided by the TTM EPS growth rate in percent, so a P/E of 15 and growth of 15% is a PEG of 1. It is blank when that growth is missing or not positive.
          </p>
        </>
      )}
    </>
  );
}

function Figure({
  value,
  date,
  format = formatNumber,
}: {
  value: string | null;
  date: string | null;
  format?: (value: string | number | null) => string;
}) {
  if (value === null) {
    return (
      <td className="num">
        <span className="figure muted">—</span>
      </td>
    );
  }
  return (
    <td className="num">
      <span className="figure">{format(value)}</span>
      {date ? <span className="asof">{date}</span> : null}
    </td>
  );
}
