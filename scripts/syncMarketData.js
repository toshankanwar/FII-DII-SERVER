import { MongoClient } from "mongodb";
import axios from "axios";

const MONGODB_URI = process.env.MONGODB_URI;
const NSE_PROXY_BASE = process.env.NSE_PROXY_BASE; // e.g. https://your-api.com/api/nse-proxy

if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
if (!NSE_PROXY_BASE) throw new Error("Missing NSE_PROXY_BASE");

const INDEX_LIST = [
  "NIFTY 500",
  "NIFTY BANK",
  "NIFTY IT",
  "NIFTY PHARMA",
  "NIFTY AUTO",
  "NIFTY METAL",
  "NIFTY ENERGY",
  "NIFTY FMCG",
];

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function fetchIndex(indexName) {
  const endpoint = `/api/equity-stockIndices?index=${encodeURIComponent(indexName)}`;
  const url = `${NSE_PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;

  const { data } = await axios.get(url, { timeout: 30000 });
  const arr = Array.isArray(data?.data) ? data.data : [];

  return arr
    .filter((s) => s?.symbol && toNum(s.lastPrice, 0) > 0)
    .map((s) => ({
      symbol: s.symbol,
      name: s?.meta?.companyName || s.symbol,
      ltp: toNum(s.lastPrice),
      open: toNum(s.open),
      high: toNum(s.dayHigh),
      low: toNum(s.dayLow),
      prevClose: toNum(s.previousClose, toNum(s.lastPrice)),
      volume: toNum(s.totalTradedVolume),
      yearHigh: toNum(s.yearHigh),
      yearLow: toNum(s.yearLow),
      changes: {
        "1d": toNum(s.pChange),
        "1m": toNum(s.perChange30d),
        "1y": toNum(s.perChange365d),
      },
      sourceIndex: indexName,
      fetchedAt: new Date(),
    }));
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db("market");
  const latest = db.collection("stock_latest");
  const history = db.collection("stock_history");

  const results = await Promise.allSettled(INDEX_LIST.map(fetchIndex));

  const map = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const s of r.value) {
      if (!map.has(s.symbol)) map.set(s.symbol, s);
    }
  }

  const all = Array.from(map.values());
  const ts = new Date();

  if (all.length === 0) throw new Error("No stocks fetched");

  // bulk upsert latest
  const ops = all.map((s) => ({
    updateOne: {
      filter: { symbol: s.symbol },
      update: { $set: { ...s, updatedAt: ts } },
      upsert: true,
    },
  }));
  await latest.bulkWrite(ops, { ordered: false });

  // insert snapshot history (optional)
  await history.insertOne({
    snapshotAt: ts,
    count: all.length,
    data: all,
  });

  console.log(`Synced ${all.length} stocks at ${ts.toISOString()}`);
  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});