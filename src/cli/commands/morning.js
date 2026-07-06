import { register } from "../router.js";
import * as core from "../../core/morning.js";
import * as telegram from "../../core/telegram.js";

register("brief", {
  description:
    "Run your morning brief — scan watchlist, read indicators, apply your rules",
  options: {
    rules: {
      type: "string",
      short: "r",
      description: "Path to rules.json (default: ./rules.json)",
    },
    notify: {
      type: "boolean",
      short: "n",
      description: "Push a digest of the scan to Telegram",
    },
  },
  handler: async ({ rules, notify }) => {
    const brief = await core.runBrief({ rules_path: rules });
    if (notify) {
      const lines = (brief.symbols_scanned || []).map((s) =>
        s.error
          ? `${s.symbol}: ${s.error}`
          : `${s.symbol}: ${s.quote?.last_price ?? s.quote?.price ?? "?"}`,
      );
      await telegram.send(`Morning brief — ${lines.length} symbols\n${lines.join("\n")}`);
    }
    return brief;
  },
});

register("session", {
  description: "Get or save a session brief",
  subcommands: new Map([
    [
      "get",
      {
        description:
          "Get today's saved session brief (or yesterday's if today not found)",
        options: {
          date: {
            type: "string",
            description: "Date YYYY-MM-DD (default: today)",
          },
        },
        handler: async ({ date }) => core.getSession({ date }),
      },
    ],
    [
      "save",
      {
        description: "Save a session brief to disk",
        options: {
          brief: {
            type: "string",
            short: "b",
            description: "Brief text to save",
          },
          date: {
            type: "string",
            description: "Date YYYY-MM-DD (default: today)",
          },
        },
        handler: async ({ brief, date }) => {
          if (!brief) throw new Error("--brief is required");
          return core.saveSession({ brief, date });
        },
      },
    ],
  ]),
});
