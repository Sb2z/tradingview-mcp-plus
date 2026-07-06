/**
 * Telegram notification channel.
 * Lets any command or tool push its output to a Telegram chat, so chart
 * events reach your phone without keeping the desktop in sight.
 *
 * Credentials are read from TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars,
 * with ~/.tvmcp/telegram.json ({"bot_token": "...", "chat_id": "..."}) as a
 * fallback. Nothing is sent anywhere else; one HTTPS call to api.telegram.org.
 */
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_PATH = join(homedir(), '.tvmcp', 'telegram.json');
const MAX_LEN = 4000; // Telegram hard limit is 4096

function credentials() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;
  if ((!token || !chatId) && existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      token = token || cfg.bot_token;
      chatId = chatId || cfg.chat_id;
    } catch {
      // unreadable config falls through to the explicit error below
    }
  }
  if (!token || !chatId) {
    throw new Error(
      'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, '
      + `or create ${CONFIG_PATH} with {"bot_token": "...", "chat_id": "..."}`,
    );
  }
  return { token, chatId };
}

export function isConfigured() {
  try { credentials(); return true; } catch { return false; }
}

export function send(text, { silent = false } = {}) {
  const { token, chatId } = credentials();
  const body = JSON.stringify({
    chat_id: chatId,
    text: String(text).slice(0, MAX_LEN),
    disable_notification: Boolean(silent),
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10_000,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.ok) resolve({ success: true, message_id: parsed.result?.message_id });
          else reject(new Error(parsed.description || `Telegram error (HTTP ${res.statusCode})`));
        } catch {
          reject(new Error(`Telegram: unexpected response (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Telegram: request timed out')));
    req.write(body);
    req.end();
  });
}
