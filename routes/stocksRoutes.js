import express from "express";
import axios from "axios";

const router = express.Router();

// ===== Config =====
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || "PSLUUCYRCSWFY7L6";
const AV_BASE = "https://www.alphavantage.co/query";

// Cache + request controls
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min (important for free tier)
const REQUEST_TIMEOUT_MS = 20000;
const MAX_SYMBOLS = 40; // keep lower for free tier
const PER_SYMBOL_DELAY_MS = 15000; // Alpha free: ~5 req/min -> 12s+, keep 15s safe

const cacheStore = new Map(); // key -> { ts, data, meta }
const inflightStore = new Map(); // key -> Promise<{data,meta}>

// ===== Utils =====
function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(rawSymbols) {
  return rawSymbols.slice().sort().join(",");
}

function getFreshCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry;
}

function getAnyCache(key) {
  return cacheStore.get(key) || null;
}

function sanitizeSymbols(symbolsParam) {
  return symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(".NS", ""))
    .filter(Boolean)
    .filter((s) => /^[A-Z0-9\-&]+$/.test(s))
    .slice(0, MAX_SYMBOLS);
}

// Alpha symbol format for NSE
function toAvSymbol(sym) {
  return sym.endsWith(".BSE") || sym.endsWith(".NSE") ? sym : `${sym}.BSE`;
  // NOTE: Alpha supports many Indian symbols as .BSE more reliably than .NSE
  // If needed, you can try .NSE fallback in code later.
}

function normalizeAvQuote(globalQuote, fallbackSymbol = "") {
  // Alpha Global Quote keys:
  // "01. symbol", "02. open", "03. high", "04. low", "05. price",
  // "06. volume", "08. previous close", "09. change", "10. change percent"
  const symbolRaw = String(globalQuote?.["01. symbol"] || fallbackSymbol || "").toUpperCase();
  const symbol = symbolRaw.replace(".BSE", "").replace(".NSE", "");

  const ltp = toNum(globalQuote?.["05. price"], 0);
  const prevClose = toNum(globalQuote?.["08. previous close"], ltp);
  const open = toNum(globalQuote?.["02. open"], 0);
  const high = toNum(globalQuote?.["03. high"], 0);
  const low = toNum(globalQuote?.["04. low"], 0);
  const volume = toNum(globalQuote?.["06. volume"], 0);

  let oneDay = 0;
  const cp = String(globalQuote?.["10. change percent"] || "").replace("%", "").trim();
  if (cp) oneDay = toNum(cp, 0);
  else if (prevClose > 0) oneDay = ((ltp - prevClose) / prevClose) * 100;

  return {
    symbol,
    name: symbol, // Alpha quote endpoint doesn't provide long name
    ltp,
    open,
    high,
    low,
    prevClose,
    volume,
    yearHigh: 0,
    yearLow: 0,
    sector: "Other",
    industry: "General",
    changes: {
      "1h": 0,
      "1d": Number(oneDay.toFixed(2)),
      "1w": 0,
      "1m": 0,
      "1y": 0,
    },
  };
}

function parseApiError(err) {
  return (
    err?.response?.data?.["Error Message"] ||
    err?.response?.data?.Note ||
    err?.response?.data?.Information ||
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.status ||
    err?.code ||
    err?.message ||
    "Unknown error"
  );
}

async function fetchOneFromAlpha(symbol) {
  const avSymbol = toAvSymbol(symbol);

  const response = await axios.get(AV_BASE, {
    params: {
      function: "GLOBAL_QUOTE",
      symbol: avSymbol,
      apikey: AV_KEY,
    },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`AlphaVantage HTTP ${response.status}`);
  }

  const payload = response.data || {};

  // Rate limit / invalid API notices
  if (payload.Note || payload["Error Message"] || payload.Information) {
    throw new Error(payload.Note || payload["Error Message"] || payload.Information);
  }

  const gq = payload["Global Quote"];
  if (!gq || Object.keys(gq).length === 0) {
    throw new Error(`No Global Quote for ${symbol}`);
  }

  const normalized = normalizeAvQuote(gq, symbol);
  if (!normalized.symbol || normalized.ltp <= 0) {
    throw new Error(`Invalid quote data for ${symbol}`);
  }

  return normalized;
}

async function fetchFromAlpha(rawSymbols) {
  const result = [];
  const failedSymbols = [];

  // Sequential requests (free-tier friendly)
  for (let i = 0; i < rawSymbols.length; i++) {
    const s = rawSymbols[i];
    try {
      const quote = await fetchOneFromAlpha(s);
      result.push(quote);
    } catch (e) {
      failedSymbols.push(s);
    }

    if (i < rawSymbols.length - 1) {
      await sleep(PER_SYMBOL_DELAY_MS);
    }
  }

  return {
    source: "alpha-vantage",
    updatedAt: new Date().toISOString(),
    requested: rawSymbols.length,
    returned: result.length,
    failed: failedSymbols.length,
    failedSymbols,
    data: result,
  };
}

// /api/stocks/live?symbols=RELIANCE,TCS,INFY
router.get("/live", async (req, res) => {
  try {
    if (!AV_KEY || AV_KEY === "YOUR_ALPHA_VANTAGE_KEY") {
      return res.status(500).json({
        source: "alpha-vantage",
        error: "Missing ALPHA_VANTAGE_API_KEY in backend environment",
        data: [],
      });
    }

    const symbolsParam = (req.query.symbols || "").toString().trim();
    if (!symbolsParam) {
      return res.status(400).json({
        source: "alpha-vantage",
        error: "symbols query param is required",
        data: [],
      });
    }

    const rawSymbols = sanitizeSymbols(symbolsParam);
    if (!rawSymbols.length) {
      return res.status(400).json({
        source: "alpha-vantage",
        error: "No valid symbols provided",
        data: [],
      });
    }

    const cacheKey = buildCacheKey(rawSymbols);

    // 1) Fresh cache hit
    const fresh = getFreshCache(cacheKey);
    if (fresh) {
      return res.status(200).json({
        source: "alpha-vantage-cache",
        ...fresh.meta,
        cache: { hit: true, stale: false, ttlMs: CACHE_TTL_MS },
        data: fresh.data,
      });
    }

    // 2) Deduplicate in-flight identical requests
    if (inflightStore.has(cacheKey)) {
      try {
        const shared = await inflightStore.get(cacheKey);
        return res.status(200).json({
          source: "alpha-vantage-shared",
          ...shared.meta,
          cache: { hit: false, shared: true, stale: false, ttlMs: CACHE_TTL_MS },
          data: shared.data,
        });
      } catch {
        // continue to fetch path
      }
    }

    // 3) Live provider call
    const inflightPromise = fetchFromAlpha(rawSymbols)
      .then((payload) => {
        const meta = {
          updatedAt: payload.updatedAt,
          requested: payload.requested,
          returned: payload.returned,
          failed: payload.failed,
          failedSymbols: payload.failedSymbols,
        };

        cacheStore.set(cacheKey, {
          ts: Date.now(),
          data: payload.data,
          meta,
        });

        return { data: payload.data, meta };
      })
      .finally(() => {
        inflightStore.delete(cacheKey);
      });

    inflightStore.set(cacheKey, inflightPromise);
    const live = await inflightPromise;

    return res.status(200).json({
      source: "alpha-vantage",
      ...live.meta,
      cache: { hit: false, stale: false, ttlMs: CACHE_TTL_MS },
      data: live.data,
    });
  } catch (err) {
    const apiMsg = parseApiError(err);
    console.error("❌ AlphaVantage /live error:", apiMsg);

    // stale cache fallback
    try {
      const symbolsParam = (req.query.symbols || "").toString().trim();
      const rawSymbols = sanitizeSymbols(symbolsParam);
      const cacheKey = buildCacheKey(rawSymbols);
      const stale = getAnyCache(cacheKey);

      if (stale && Array.isArray(stale.data) && stale.data.length > 0) {
        return res.status(200).json({
          source: "alpha-vantage-stale-cache",
          warning: String(apiMsg),
          updatedAt: new Date(stale.ts).toISOString(),
          requested: rawSymbols.length,
          returned: stale.data.length,
          failed: Math.max(0, rawSymbols.length - stale.data.length),
          cache: { hit: true, stale: true, ttlMs: CACHE_TTL_MS },
          data: stale.data,
        });
      }
    } catch (fallbackErr) {
      console.error("❌ stale fallback error:", parseApiError(fallbackErr));
    }

    return res.status(200).json({
      source: "alpha-vantage",
      error: String(apiMsg),
      data: [],
    });
  }
});

export default router;