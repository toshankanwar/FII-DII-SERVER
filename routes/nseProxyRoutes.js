import express from "express";
import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

const router = express.Router();
const NSE_BASE = "https://www.nseindia.com";
const BOOT_TTL_MS = 3 * 60 * 1000;

let client = null;
let lastBoot = 0;

function mkHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nseindia.com/market-data/live-equity-market",
    Origin: "https://www.nseindia.com",
    Connection: "keep-alive",
    DNT: "1",
  };
}

function makeClient() {
  const jar = new CookieJar();
  return wrapper(
    axios.create({
      jar,
      withCredentials: true,
      timeout: 20000,
      validateStatus: () => true,
    })
  );
}

async function boot(force = false) {
  const stale = Date.now() - lastBoot > BOOT_TTL_MS;
  if (!client || force || stale) client = makeClient();

  // Important: bootstrap via API (works better than homepage in many regions)
  const warmups = [
    "/api/allIndices",
    "/api/marketStatus",
  ];

  for (const p of warmups) {
    const r = await client.get(`${NSE_BASE}${p}`, { headers: mkHeaders() });
    if (r.status >= 200 && r.status < 400) {
      lastBoot = Date.now();
      return;
    }
  }

  throw new Error("NSE bootstrap blocked on warmup endpoints");
}

async function nseRequest(endpoint) {
  if (!endpoint.startsWith("/api/")) {
    return { status: 400, data: { error: "endpoint must start with /api/" } };
  }

  if (!client || Date.now() - lastBoot > BOOT_TTL_MS) {
    await boot(true);
  }

  let r = await client.get(`${NSE_BASE}${endpoint}`, { headers: mkHeaders() });

  if ([401, 403, 429].includes(r.status)) {
    await boot(true);
    r = await client.get(`${NSE_BASE}${endpoint}`, { headers: mkHeaders() });
  }

  return r;
}

router.get("/", async (req, res) => {
  try {
    const endpoint = String(req.query.endpoint || "").trim();
    if (!endpoint) {
      return res.status(400).json({
        error: "Missing endpoint. Example: ?endpoint=/api/allIndices",
      });
    }

    const r = await nseRequest(endpoint);

    if (r.status < 200 || r.status >= 300) {
      return res.status(r.status).json({
        error: `NSE returned ${r.status}`,
        details: r.data || null,
      });
    }

    return res.status(200).json(r.data);
  } catch (e) {
    console.error("nse-proxy error:", e?.message || e);
    return res.status(500).json({
      error: "Failed NSE bootstrap/request",
      message: e?.message || "Unknown error",
    });
  }
});

export default router;