import type { UploadPolicy } from "./config.js";
import type { HistoryPoint, StockHistory, StockSummary } from "./db.js";
import type { ParseIssue } from "./csv.js";
import { escapeHtml, formatNumber } from "./format.js";

export type UploadFeedback = {
  tone: "ok" | "warn" | "bad";
  summary: string;
  tickers: string[];
  issues: string[];
};

export function stocksPage(stocks: StockSummary[]): string {
  const body = stocks.length === 0 ? emptyStocks() : stockTable(stocks);
  return layout({
    title: "Stocks",
    current: "stocks",
    body: `<header class="page-head"><h1>Stocks</h1><p>${stocks.length === 0 ? "Nothing has been uploaded yet." : `${stocks.length} ${stocks.length === 1 ? "stock" : "stocks"}`}</p></header>${body}`,
  });
}

export function stockPage(stock: StockHistory): string {
  return layout({
    title: stock.ticker,
    current: "stocks",
    body: `<header class="page-head"><p class="back"><a href="/">All stocks</a></p><h1>${escapeHtml(stock.ticker)}</h1>${stock.name ? `<p>${escapeHtml(stock.name)}</p>` : ""}</header><div class="series-list">${seriesBlock("Price", stock.prices, "#1e6b45")}${seriesBlock("Earnings per share", stock.earnings, "#8d3b2b")}${seriesBlock("P/E", stock.valuations, "#1e4d78")}</div>`,
  });
}

export function uploadPage(policy: UploadPolicy, feedback: UploadFeedback | null): string {
  return layout({
    title: "Upload",
    current: "upload",
    body: `<header class="page-head"><h1>Upload CSV</h1><p>Add tickers and historical prices, earnings per share, and P/E ratios.</p></header>${feedback ? feedbackBlock(feedback) : ""}${policy === "disabled" ? disabledUpload() : uploadForm(policy)}<section class="panel"><h2>File format</h2><p>A Nasdaq historical-price export works as-is. Those files are semicolon-separated, start with <code>sep=;</code>, and use a <code>Closing price</code> column. They have no ticker, so type one in the form. A file named like <code>hmb_20261028_202013.csv</code> is read as <code>HMB</code> when the ticker box is empty. Bid, ask, high, low, average, volume, turnover, and trades are ignored.</p><p>A table can also use these columns. A row can leave price, EPS, or P/E blank. Uploading the same ticker and date again updates that point and leaves other dates in place.</p><div class="table-wrap">${exampleTable()}</div><p>Dates can be <code>YYYY-MM-DD</code> or <code>DD.MM.YYYY</code>. Numbers can use a dot or a comma as the decimal separator. <code>name</code> is optional. The delimiter can be a comma or a semicolon.</p><p><a href="/template.csv">Download a template</a>. Delete the DEMO row before you upload it, or that sample will be saved.</p><p>Check “Replace existing history” when the file should become the full history for those tickers. That removes prices, EPS, and P/E already stored for them.</p></section>`,
  });
}

export function notFoundPage(): string {
  return layout({
    title: "Not found",
    current: "none",
    body: `<header class="page-head"><h1>Not found</h1><p>That page is not in Velquaris.</p></header><p><a href="/">Back to stocks</a></p>`,
  });
}

export function problemPage(message: string): string {
  return layout({
    title: "Problem",
    current: "none",
    body: `<header class="page-head"><h1>Something went wrong</h1><p>${escapeHtml(message)}</p></header>`,
  });
}

export function formatIssue(issue: ParseIssue): string {
  return issue.row === null ? `${issue.source}: ${issue.message}` : `${issue.source}, row ${issue.row}: ${issue.message}`;
}

function layout(args: { title: string; current: "stocks" | "upload" | "none"; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(args.title)} · Velquaris</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site">
    <a class="mark" href="/"><span class="pip" aria-hidden="true"></span>Velquaris</a>
    <nav>
      <a href="/" ${args.current === "stocks" ? 'aria-current="page"' : ""}>Stocks</a>
      <a href="/upload" ${args.current === "upload" ? 'aria-current="page"' : ""}>Upload</a>
    </nav>
  </header>
  <main>${args.body}</main>
</body>
</html>`;
}

function emptyStocks(): string {
  return `<section class="panel empty-state"><p>Upload a CSV file to add a ticker and its history.</p><p><a class="button" href="/upload">Upload CSV</a></p></section>`;
}

function stockTable(stocks: StockSummary[]): string {
  const rows = stocks
    .map(
      (stock) => `<tr>
        <td><a class="ticker" href="/stocks/${encodeURIComponent(stock.ticker)}">${escapeHtml(stock.ticker)}</a>${stock.name ? `<span class="sub">${escapeHtml(stock.name)}</span>` : ""}</td>
        ${figureCell(stock.price, stock.priceDate)}
        ${figureCell(stock.eps, stock.epsDate)}
        ${figureCell(stock.pe, stock.peDate)}
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Ticker</th><th class="num">Price</th><th class="num">EPS</th><th class="num">P/E</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="note">Each figure is the latest uploaded value, with its date underneath. P/E is stored as uploaded, not calculated from price and EPS.</p>`;
}

function figureCell(value: string | null, date: string | null): string {
  if (value === null) return `<td class="num"><span class="figure muted">—</span></td>`;
  return `<td class="num"><span class="figure">${escapeHtml(formatNumber(value))}</span>${date ? `<span class="asof">${escapeHtml(date)}</span>` : ""}</td>`;
}

function seriesBlock(label: string, points: HistoryPoint[], color: string): string {
  const caption =
    points.length === 0
      ? "No points yet."
      : `${points.length} ${points.length === 1 ? "point" : "points"} · ${points[0]?.asOf ?? ""} – ${points[points.length - 1]?.asOf ?? ""}`;
  const latestFirst = [...points].reverse();
  const rows = latestFirst
    .map(
      (point) =>
        `<tr><td>${escapeHtml(point.asOf)}</td><td class="num">${escapeHtml(formatNumber(point.value))}</td></tr>`,
    )
    .join("");
  return `<section class="series"><header><h2>${escapeHtml(label)}</h2><p>${escapeHtml(caption)}</p></header>${lineChart(points, color, label)}${points.length === 0 ? "" : `<div class="table-wrap scroll"><table><thead><tr><th>Date</th><th class="num">${escapeHtml(label)}</th></tr></thead><tbody>${rows}</tbody></table></div>`}</section>`;
}

function lineChart(points: HistoryPoint[], color: string, label: string): string {
  if (points.length === 0) return `<p class="empty">No ${escapeHtml(label.toLowerCase())} history yet.</p>`;
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
  const dots =
    points.length <= 36
      ? coordinates
          .map((pair) => {
            const [x, y] = pair.split(",");
            return `<circle cx="${x}" cy="${y}" r="${points.length === 1 ? 4 : 2.5}" fill="${color}" />`;
          })
          .join("")
      : "";
  const zero =
    min < 0 && max > 0
      ? `<line x1="${pad.left}" y1="${yAt(0).toFixed(1)}" x2="${width - pad.right}" y2="${yAt(0).toFixed(1)}" stroke="#e2d8c8" />`
      : "";
  const first = points[0]?.asOf ?? "";
  const last = points[points.length - 1]?.asOf ?? "";
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} from ${escapeHtml(first)} to ${escapeHtml(last)}">
    ${zero}
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${coordinates.join(" ")}" />
    ${dots}
    <text x="${pad.left - 8}" y="${Math.max(12, yAt(dataMax)).toFixed(1)}" text-anchor="end">${escapeHtml(formatNumber(dataMax))}</text>
    ${dataMin === dataMax ? "" : `<text x="${pad.left - 8}" y="${yAt(dataMin).toFixed(1)}" text-anchor="end">${escapeHtml(formatNumber(dataMin))}</text>`}
  </svg>`;
}

function uploadForm(policy: UploadPolicy): string {
  const secret =
    policy === "secret"
      ? `<label>Upload secret<input type="password" name="secret" autocomplete="current-password" required></label>`
      : "";
  return `<form class="panel form" method="post" action="/upload" enctype="multipart/form-data">
    <label>Ticker<input type="text" name="ticker" maxlength="16" autocapitalize="characters" spellcheck="false" placeholder="HMB"><span class="hint">Required when the file has no ticker column. Leave blank for <code>hmb_20261028_202013.csv</code>.</span></label>
    <label>CSV file<input type="file" name="file" accept=".csv,text/csv" required></label>
    ${secret}
    <label class="check"><input type="checkbox" name="replace" value="1">Replace existing history for tickers in this file</label>
    <button type="submit">Upload</button>
  </form>`;
}

function disabledUpload(): string {
  return `<section class="panel"><p>Uploads are turned off until <code>UPLOAD_SECRET</code> is set on the server.</p></section>`;
}

function feedbackBlock(feedback: UploadFeedback): string {
  const links = feedback.tickers
    .map((ticker) => `<a href="/stocks/${encodeURIComponent(ticker)}">${escapeHtml(ticker)}</a>`)
    .join(", ");
  const issues =
    feedback.issues.length === 0
      ? ""
      : `<ul>${feedback.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>`;
  return `<section class="banner ${feedback.tone}"><p>${escapeHtml(feedback.summary)}</p>${links ? `<p>${links}</p>` : ""}${issues}</section>`;
}

function exampleTable(): string {
  return `<table>
    <thead><tr><th>ticker</th><th>date</th><th class="num">price</th><th class="num">eps</th><th class="num">pe</th><th>name</th></tr></thead>
    <tbody>
      <tr><td>AAPL</td><td>2024-01-05</td><td class="num">181.18</td><td></td><td></td><td>Apple</td></tr>
      <tr><td>AAPL</td><td>2024-03-30</td><td></td><td class="num">1.53</td><td class="num">28.4</td><td></td></tr>
    </tbody>
  </table>`;
}
