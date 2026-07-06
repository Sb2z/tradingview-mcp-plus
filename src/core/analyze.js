/**
 * Multi-timeframe chart analysis.
 * Drives the active chart through a list of timeframes, samples OHLCV on
 * each, computes classic structure metrics (EMA20/50, RSI14, ATR14, position
 * in the recent range) and returns one structured report, the raw material
 * an agent (or a human) needs to form a bias without clicking through
 * timeframes by hand.
 *
 * Indicator math is computed here from the bars, on purpose: the report does
 * not depend on which studies happen to be loaded on the chart.
 */
import * as chart from './chart.js';
import * as data from './data.js';
import { waitForChartReady } from '../wait.js';

const DEFAULT_TIMEFRAMES = ['15', '60', '240', '1D'];
const RANGE_LOOKBACK = 100;   // bars used for the high/low range position
const MIN_BARS = 30;

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose),
    ));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

const round = (v, d = 2) => (v === null || v === undefined ? null : Number(v.toFixed(d)));

function summarizeTimeframe(bars) {
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const window = bars.slice(-RANGE_LOOKBACK);
  const hi = Math.max(...window.map((b) => b.high));
  const lo = Math.min(...window.map((b) => b.low));
  const a = atr(bars);

  let trend = 'mixed';
  if (e20 !== null && e50 !== null) {
    if (e20 > e50 && last.close > e20) trend = 'up';
    else if (e20 < e50 && last.close < e20) trend = 'down';
  }

  return {
    close: last.close,
    trend,
    ema20: round(e20),
    ema50: round(e50),
    rsi14: round(rsi(closes)),
    atr14: round(a, 4),
    atr_pct: a && last.close ? round((a / last.close) * 100, 3) : null,
    range_position: hi > lo ? round((last.close - lo) / (hi - lo)) : null,
    range_high: hi,
    range_low: lo,
    bars_used: bars.length,
  };
}

/**
 * Run the analysis. `timeframes` accepts an array or a comma-separated
 * string; `symbol` is optional (defaults to whatever the chart shows).
 */
export async function analyze({ symbol, timeframes, bars: barCount = 200 } = {}) {
  const tfs = Array.isArray(timeframes)
    ? timeframes
    : (timeframes ? String(timeframes).split(',').map((t) => t.trim()).filter(Boolean) : DEFAULT_TIMEFRAMES);

  if (symbol) await chart.setSymbol({ symbol });

  const info = await chart.symbolInfo().catch(() => null);
  const perTf = {};
  const originalState = await chart.getState().catch(() => null);

  for (const tf of tfs) {
    await chart.setTimeframe({ timeframe: tf });
    await waitForChartReady(null, tf).catch(() => {});
    const res = await data.getOhlcv({ count: barCount }).catch((err) => ({ error: err.message }));
    if (!res || res.error || !res.bars || res.bars.length < MIN_BARS) {
      perTf[tf] = { error: res?.error || `not enough bars (${res?.bars?.length ?? 0} < ${MIN_BARS})` };
      continue;
    }
    perTf[tf] = summarizeTimeframe(res.bars);
  }

  // Put the chart back on the timeframe it was on before we touched it.
  const originalTf = originalState?.timeframe;
  if (originalTf && !tfs.includes(originalTf)) {
    await chart.setTimeframe({ timeframe: originalTf }).catch(() => {});
  }

  const trends = Object.values(perTf).map((t) => t.trend).filter(Boolean);
  const ups = trends.filter((t) => t === 'up').length;
  const downs = trends.filter((t) => t === 'down').length;
  let bias = 'mixed';
  if (trends.length && ups === trends.length) bias = 'bullish';
  else if (trends.length && downs === trends.length) bias = 'bearish';
  else if (ups > downs) bias = 'lean bullish';
  else if (downs > ups) bias = 'lean bearish';

  return {
    success: true,
    symbol: info?.symbol || symbol || 'active chart',
    description: info?.description || null,
    generated_at: new Date().toISOString(),
    timeframes: perTf,
    alignment: { bias, up: ups, down: downs, sampled: trends.length },
  };
}

/** Compact human-readable rendering, small enough for a phone notification. */
export function formatReport(report) {
  const lines = [`${report.symbol}, bias: ${report.alignment.bias} (${report.alignment.up}▲/${report.alignment.down}▼ of ${report.alignment.sampled} TFs)`];
  for (const [tf, t] of Object.entries(report.timeframes)) {
    if (t.error) { lines.push(`${tf}: ${t.error}`); continue; }
    lines.push(
      `${tf}: ${t.trend.toUpperCase()} close ${t.close}`
      + ` | RSI ${t.rsi14} | ATR ${t.atr_pct}%`
      + ` | range ${t.range_position !== null ? Math.round(t.range_position * 100) + '%' : '?'}`,
    );
  }
  return lines.join('\n');
}
