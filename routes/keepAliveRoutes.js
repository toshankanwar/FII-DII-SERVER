import express from "express";
import axios from "axios";

const router = express.Router();

let keepAliveTimer = null;

// Ping endpoint
router.get("/ping", (req, res) => {
  res.json({ status: "alive", time: new Date() });
});

// Start keep-alive
router.post("/start", (req, res) => {
  if (keepAliveTimer) {
    return res.json({ message: "Already running" });
  }

  console.log("✅ Keep-alive started\n");

  // Call ping every 7 minutes
  keepAliveTimer = setInterval(async () => {
    try {
      await axios.get("https://api.fiidii.toshankanwar.in/api/keepalive/ping");
      console.log("📍 Ping sent:", new Date().toLocaleTimeString());
    } catch (err) {
      console.error("❌ Ping failed:", err.message);
    }
  }, 7 * 60 * 1000); // 7 minutes

  res.json({ message: "Keep-alive started" });
});

// Stop keep-alive
router.post("/stop", (req, res) => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    console.log("🛑 Keep-alive stopped\n");
  }
  res.json({ message: "Keep-alive stopped" });
});

export default router;