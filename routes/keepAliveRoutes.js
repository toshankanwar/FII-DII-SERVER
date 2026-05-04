import express from "express";

const router = express.Router();


// Ping endpoint
router.get("/ping", (req, res) => {
  res.json({ status: "Toshan bhai ka server jinda hai 🤪😁", time: new Date() });
});

export default router;