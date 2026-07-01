import axios from "axios";
import { MongoClient } from "mongodb";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

const NSE_BASE = "https://www.nseindia.com";
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");

const INDEX_LIST = [
  "NIFTY 500",
  "NIFTY BANK",
  "NIFTY IT",
  "NIFTY PHARMA",
  "NIFTY AUTO",
  "NIFTY METAL",
  "NIFTY ENERGY",
  "NIFTY FMCG",
  "NIFTY REALTY",
];

function h() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nseindia.com/market-data/live-equity-market",
    Origin: "https://www.nseindia.com",
    Connection: "keep-alive",
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function createClient() {
  const jar = new CookieJar();
  return wrapper(
    axios.create({
      jar,
      withCredentials: true,
      timeout: 30000,
      validateStatus: () => true,
    })
  );
}

async function bootstrap(client) {
  const warm1 = await client.get(`${NSE_BASE}/api/allIndices`, { headers: h() });
  if (warm1.status < 200 || warm1.status >= 400) {
    const warm2 = await client.get(`${NSE_BASE}/`, { headers: h() });
    if (warm2.status < 200 || warm2.status >= 400) {
      throw new Error(`Bootstrap failed (${warm1.status}/${warm2.status})`);
    }
  }
}

async function fetchIndex(client, indexName) {
  const url = `${NSE_BASE}/api/equity-stockIndices?index=${encodeURIComponent(indexName)}`;
  let r = await client.get(url, { headers: h() });

  if ([401, 403, 429].includes(r.status)) {
    await bootstrap(client);
    r = await client.get(url, { headers: h() });
  }

  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${indexName} failed: ${r.status}`);
  }

  const arr = Array.isArray(r.data?.data) ? r.data.data : [];
  return arr
    .filter((s) => s?.symbol && num(s.lastPrice) > 0 && s.symbol !== indexName)
    .map((s) => ({
      symbol: s.symbol,
      name: s?.meta?.companyName || s.symbol,
      ltp: num(s.lastPrice),
      open: num(s.open),
      high: num(s.dayHigh),
      low: num(s.dayLow),
      prevClose: num(s.previousClose, num(s.lastPrice)),
      volume: num(s.totalTradedVolume),
      yearHigh: num(s.yearHigh),
      yearLow: num(s.yearLow),
      sector: "Other",
      industry: "General",
      changes: {
        "1h": 0,
        "1d": num(s.pChange),
        "1w": 0,
        "1m": num(s.perChange30d),
        "1y": num(s.perChange365d),
      },
      fetchedAt: new Date(),
      sourceIndex: indexName,
    }));
}

async function run() {
  const client = createClient();
  await bootstrap(client);

  const merged = new Map();

  for (const idx of INDEX_LIST) {
    try {
      const list = await fetchIndex(client, idx);
      for (const s of list) {
        if (!merged.has(s.symbol)) merged.set(s.symbol, s);
      }
    } catch (e) {
      console.log(`Skip ${idx}: ${e.message}`);
    }
    await sleep(1500); // throttle
  }

  const stocks = [...merged.values()];
  if (!stocks.length) throw new Error("No stocks fetched");

  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  const db = mongo.db("market");
  const latest = db.collection("stock_latest");
  const snapshots = db.collection("stock_snapshots");

  const now = new Date();

  await latest.bulkWrite(
    stocks.map((s) => ({
      updateOne: {
        filter: { symbol: s.symbol },
        update: { $set: { ...s, updatedAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await snapshots.insertOne({
    createdAt: now,
    count: stocks.length,
    data: stocks,
  });

  console.log(`Synced ${stocks.length} stocks at ${now.toISOString()}`);
  await mongo.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});