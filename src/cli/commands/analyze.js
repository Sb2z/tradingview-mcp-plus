import { register } from '../router.js';
import * as core from '../../core/analyze.js';
import * as telegram from '../../core/telegram.js';

register('analyze', {
  description: 'Multi-timeframe structure report (EMA/RSI/ATR/range) for a symbol',
  options: {
    symbol: { type: 'string', short: 's', description: 'Symbol to analyze (default: active chart)' },
    timeframes: { type: 'string', short: 't', description: 'Comma-separated list (default: 15,60,240,1D)' },
    bars: { type: 'string', short: 'b', description: 'Bars sampled per timeframe (default 200)' },
    notify: { type: 'boolean', short: 'n', description: 'Send the report to Telegram' },
    json: { type: 'boolean', description: 'Print raw JSON instead of the text report' },
  },
  handler: async (opts) => {
    const report = await core.analyze({
      symbol: opts.symbol,
      timeframes: opts.timeframes,
      bars: opts.bars ? Number(opts.bars) : undefined,
    });
    if (opts.notify) await telegram.send(core.formatReport(report));
    return opts.json ? report : core.formatReport(report);
  },
});
