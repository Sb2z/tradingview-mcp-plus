import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/analyze.js';
import * as telegram from '../core/telegram.js';

export function registerAnalyzeTools(server) {
  server.tool('tv_analyze', 'Multi-timeframe structure report for a symbol: per-timeframe trend (EMA20/50), RSI14, ATR14, position in the recent range, plus an overall alignment bias. Metrics are computed from the bars themselves, independent of which studies are on the chart. Restores the original timeframe afterwards.', {
    symbol: z.string().optional().describe('Symbol to analyze (default: active chart)'),
    timeframes: z.string().optional().describe('Comma-separated timeframes, e.g. "15,60,240,1D"'),
    bars: z.coerce.number().optional().describe('Bars sampled per timeframe (default 200)'),
    notify: z.coerce.boolean().optional().describe('Also push the text report to Telegram'),
  }, async ({ symbol, timeframes, bars, notify }) => {
    try {
      const report = await core.analyze({ symbol, timeframes, bars });
      if (notify) await telegram.send(core.formatReport(report));
      return jsonResult(report);
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });

  server.tool('tv_notify', 'Send a text message to the configured Telegram chat. Uses TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars or ~/.tvmcp/telegram.json. Useful to push analysis results, alert digests or completion notices to a phone.', {
    message: z.string().describe('Text to send (truncated to 4000 chars)'),
    silent: z.coerce.boolean().optional().describe('Deliver without a notification sound'),
  }, async ({ message, silent }) => {
    try { return jsonResult(await telegram.send(message, { silent })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
