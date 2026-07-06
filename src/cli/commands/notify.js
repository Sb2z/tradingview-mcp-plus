import { register } from '../router.js';
import * as telegram from '../../core/telegram.js';

register('notify', {
  description: 'Send a message to Telegram (no message = configuration test)',
  options: {
    message: { type: 'string', short: 'm', description: 'Text to send' },
    silent: { type: 'boolean', description: 'Deliver without a notification sound' },
  },
  handler: async (opts) => {
    const text = opts.message || 'tradingview-mcp: Telegram channel is working.';
    const res = await telegram.send(text, { silent: opts.silent });
    return { ...res, sent: text };
  },
});
