import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getStock } from "../api";
import { EpsTable } from "../components/EpsTable";
import { Series } from "../components/Series";
import { SplitsEditor } from "../components/SplitsEditor";
import { formatPercent } from "../format";
import { adjustedEpsNumber } from "../splits";
import { useTitle } from "../title";
import type { Earning, HistoryPoint, StockHistory } from "../types";
import { graphBounded, graphPriceEarnings, pegRatio, priceEarnings, ttmEpsGrowth } from "../valuation";

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

  const earningsRatio = priceEarnings(stock.prices, stock.earnings, stock.splits);
  const earningsGraph = graphPriceEarnings(earningsRatio);
  const earningsGrowth = ttmEpsGrowth(stock.earnings, stock.splits);
  const growthScale = graphBounded(earningsGrowth, -0.3, 0.3);
  const peg = pegRatio(stock.prices, stock.earnings, stock.splits);
  const pegGraph = graphPriceEarnings(peg);

  return (
    <>
      <header className="page-head">
        <p className="back">
          <Link to="/">All stocks</Link>
        </p>
        <h1>{stock.ticker}</h1>
        {stock.name ? <p>{stock.name}</p> : null}
      </header>
      <div className="series-list">
        <Series label="Price" points={stock.prices} color="#1e6b45" />
        <Series
          label="Earnings per share"
          note={stock.splits.length > 0 ? "The graph uses adjusted EPS." : undefined}
          points={earningPoints(stock)}
          color="#8d3b2b"
          quarterLines
          quarterAt={(asOf) => {
            const earning = stock.earnings.find((item) => item.reportDate === asOf);
            return earning ? { year: earning.year, quarter: earning.quarter } : null;
          }}
          details={
            <>
              <SplitsEditor stock={stock} onSaved={setStock} />
              <EpsTable stock={stock} onSaved={setStock} />
            </>
          }
        />
        <Series
          label="TTM EPS growth"
          points={earningsGrowth}
          chartPoints={growthScale.visible}
          caps={growthScale.caps}
          yRange={{ min: -0.3, max: 0.3 }}
          yStep={0.1}
          color="#5c4578"
          formatValue={formatPercent}
          quarterLines
          quarterAt={(asOf) => {
            const earning = stock.earnings.find((item) => item.reportDate === asOf);
            return earning ? { year: earning.year, quarter: earning.quarter } : null;
          }}
        />
        <Series
          label="P/E"
          points={earningsRatio}
          chartPoints={earningsGraph.visible}
          caps={earningsGraph.caps}
          quarterLines
          axisFromZero
          yStep={5}
          color="#1e4d78"
        />
        <Series
          label="PEG"
          points={peg}
          chartPoints={pegGraph.visible}
          caps={pegGraph.caps}
          quarterLines
          axisFromZero
          color="#3e6b5a"
        />
      </div>
      <p className="note">
        The EPS graph uses split-adjusted EPS. Reported EPS stays as entered, and adjusted EPS divides it by every split dated after the report. A report date can be saved before the EPS is known. That quarter stays in the table and stays off every graph until an EPS value is set. TTM EPS growth compares the sum of four adjusted quarters in a row with the same four quarters a year earlier, at the report date of the newest quarter. The change is divided by the absolute value of the earlier sum, so a smaller loss counts as growth. A quarter is left out when one of those eight is missing or the year-earlier sum is zero. The growth graph uses a fixed scale from -30% to 30%. Growth above 30% is a dotted line at the top of the scale, and growth below -30% is a dotted line at the bottom. Each stretch is joined to the last plotted value before it and the next one after it. A stretch that switches from the top to the bottom, or the other way, is joined by a vertical dotted line. The table lists every value. P/E is the closing price divided by the sum of the last four adjusted quarterly EPS figures whose report date is on or before that price date. A price has no P/E until four quarters have been reported. Where a P/E is more than 50% above the average of the previous two years, the graph draws a dotted line at the top of the scale and joins it to the last plotted value before that stretch and the next one after it. Where it is more than 50% below, the line is at the bottom. A stretch that switches from the top to the bottom, or the other way, is joined by a vertical dotted line. The line lasts as long as those points. The P/E table lists every value. PEG is that P/E divided by the TTM EPS growth rate in percent, using the growth whose report date is on or before the price. A P/E of 15 and growth of 15% is a PEG of 1. A price is left out when that growth is missing or not positive. The PEG graph uses the same dotted line as the P/E graph, and the table lists every value.
      </p>
    </>
  );
}

function earningPoints(stock: StockHistory): HistoryPoint[] {
  return stock.earnings
    .filter((earning): earning is Earning & { value: string } => earning.value !== null && Number.isFinite(Number(earning.value)))
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate) || left.year - right.year || left.quarter - right.quarter)
    .map((earning) => ({
      asOf: earning.reportDate,
      value: String(adjustedEpsNumber(earning.value, earning.reportDate, stock.splits)),
    }));
}
