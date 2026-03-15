import express from "express";
import axios from "axios";
import FIIDII from "../models/FIIDII.js";

const router = express.Router();

// convert NSE date safely
function parseNSEDate(dateStr) {
  const [day, monthStr, year] = dateStr.split("-");

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  return new Date(year, months[monthStr], Number(day));
}

// UPDATE DAILY DATA
router.get("/update", async (req, res) => {
  try {
    const url = "https://www.nseindia.com/api/fiidiiTradeReact";

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.nseindia.com/",
      },
    });

    const data = response.data;

    const fii = data.find((d) => d.category === "FII/FPI");
    const dii = data.find((d) => d.category === "DII");

    const date = parseNSEDate(fii.date);

    const toNum = (v) => Number(v) || 0;

    await FIIDII.updateOne(
      { date },
      {
        date,
        dateString: fii.date,

        year: date.getFullYear(),
        month: date.getMonth() + 1,
        week: Math.ceil(date.getDate() / 7),
        day: date.getDate(),

        fiiBuyValue: toNum(fii.buyValue),
        fiiSellValue: toNum(fii.sellValue),
        fiiNetValue: toNum(fii.netValue),

        diiBuyValue: toNum(dii.buyValue),
        diiSellValue: toNum(dii.sellValue),
        diiNetValue: toNum(dii.netValue),
      },
      { upsert: true }
    );

    res.json({ message: "data saved" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// TODAY
router.get("/today", async (req, res) => {
  try {
    const today = new Date();

    const data = await FIIDII.findOne({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    });

    res.json(data || {});
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// WEEK
router.get("/week", async (req, res) => {
  try {
    const today = new Date();

    const data = await FIIDII.find({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      week: Math.ceil(today.getDate() / 7),
    }).sort({ date: -1 });

    res.json(data || []);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// MONTH - with optional year and month query parameters
router.get("/month", async (req, res) => {
    try {
      const today = new Date();
  
      // Get year and month from query params, default to current
      let year = parseInt(req.query.year) || today.getFullYear();
      let month = parseInt(req.query.month) || today.getMonth() + 1;
  
      console.log(`📊 Fetching FII/DII for ${month}/${year}`);
  
      // Validate month and year
      if (month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid month. Must be between 1 and 12" });
      }
  
      if (year < 2000 || year > 2100) {
        return res.status(400).json({ error: "Invalid year. Must be between 2000 and 2100" });
      }
  
      // Query database with EXACT month and year match
      const data = await FIIDII.find({
        year: year,
        month: month,
      }).sort({ date: -1 });
  
      console.log(`✅ Found ${data.length} records for ${month}/${year}`);
  
      res.json(data || []);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
});

// YEAR - with optional year query parameter
router.get("/year", async (req, res) => {
  try {
    const today = new Date();

    // Get year from query params, default to current
    let year = parseInt(req.query.year) || today.getFullYear();

    console.log(`📊 Fetching FII/DII for year ${year}`);

    // Validate year
    if (year < 2000 || year > 2100) {
      return res.status(400).json({ error: "Invalid year. Must be between 2000 and 2100" });
    }

    const data = await FIIDII.find({
      year: year,
    }).sort({ date: -1 });

    console.log(`✅ Found ${data.length} records for ${year}`);

    res.json(data || []);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// WEEK - with optional year, month, and week query parameters
router.get("/week-custom", async (req, res) => {
  try {
    const today = new Date();

    // Get year, month, and week from query params
    let year = parseInt(req.query.year) || today.getFullYear();
    let month = parseInt(req.query.month) || today.getMonth() + 1;
    let week = parseInt(req.query.week) || Math.ceil(today.getDate() / 7);

    console.log(`📊 Fetching FII/DII for week ${week}, ${month}/${year}`);

    // Validate inputs
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: "Invalid month" });
    }

    if (week < 1 || week > 5) {
      return res.status(400).json({ error: "Invalid week" });
    }

    const data = await FIIDII.find({
      year: year,
      month: month,
      week: week,
    }).sort({ date: -1 });

    console.log(`✅ Found ${data.length} records for week ${week}/${month}/${year}`);

    res.json(data || []);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// DATE RANGE - Fetch data between two dates
router.get("/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "Both startDate and endDate query params required (YYYY-MM-DD format)" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    console.log(`📊 Fetching FII/DII from ${startDate} to ${endDate}`);

    const data = await FIIDII.find({
      date: {
        $gte: start,
        $lte: end,
      },
    }).sort({ date: -1 });

    console.log(`✅ Found ${data.length} records between ${startDate} and ${endDate}`);

    res.json(data || []);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL DATA - with optional pagination
router.get("/all", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const skip = parseInt(req.query.skip) || 0;

    console.log(`📊 Fetching all FII/DII data (limit: ${limit}, skip: ${skip})`);

    const data = await FIIDII.find({})
      .sort({ date: -1 })
      .limit(limit)
      .skip(skip);

    const total = await FIIDII.countDocuments();

    res.json({
      total,
      limit,
      skip,
      count: data.length,
      data,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// SPECIFIC DATE
router.get("/date/:dateString", async (req, res) => {
  try {
    const { dateString } = req.params;

    console.log(`📊 Fetching FII/DII for date ${dateString}`);

    const data = await FIIDII.findOne({
      dateString: dateString,
    });

    if (!data) {
      return res.status(404).json({ error: "No data found for this date" });
    }

    res.json(data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// STATISTICS - Get aggregated statistics
router.get("/stats/month", async (req, res) => {
  try {
    const today = new Date();
    let year = parseInt(req.query.year) || today.getFullYear();
    let month = parseInt(req.query.month) || today.getMonth() + 1;

    console.log(`📊 Getting stats for ${month}/${year}`);

    const data = await FIIDII.find({
      year: year,
      month: month,
    });

    if (data.length === 0) {
      return res.json({ error: "No data found for this month" });
    }

    const fiiFlows = data.map((d) => d.fiiNetValue);
    const diiFlows = data.map((d) => d.diiNetValue);

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const max = (arr) => Math.max(...arr);
    const min = (arr) => Math.min(...arr);

    const stats = {
      month: month,
      year: year,
      totalDays: data.length,
      fii: {
        totalFlow: sum(fiiFlows),
        avgDaily: parseFloat(avg(fiiFlows).toFixed(2)),
        maxInflow: max(fiiFlows),
        maxOutflow: min(fiiFlows),
        bullishDays: fiiFlows.filter((f) => f > 0).length,
        bearishDays: fiiFlows.filter((f) => f < 0).length,
      },
      dii: {
        totalFlow: sum(diiFlows),
        avgDaily: parseFloat(avg(diiFlows).toFixed(2)),
        maxInflow: max(diiFlows),
        maxOutflow: min(diiFlows),
        bullishDays: diiFlows.filter((d) => d > 0).length,
        bearishDays: diiFlows.filter((d) => d < 0).length,
      },
    };

    res.json(stats);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST: Manually insert single FII/DII record =====
router.post("/add-single", async (req, res) => {
  try {
    const {
      dateString,
      year,
      month,
      day,
      fiiBuyValue,
      fiiSellValue,
      diiBuyValue,
      diiSellValue
    } = req.body;

    // Validate required fields
    if (!dateString || !year || !month || !day) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create date object
    const date = new Date(year, month - 1, day);

    // Calculate net values
    const fiiNetValue = (parseFloat(fiiBuyValue) || 0) - (parseFloat(fiiSellValue) || 0);
    const diiNetValue = (parseFloat(diiBuyValue) || 0) - (parseFloat(diiSellValue) || 0);

    // Check if record already exists
    const existing = await FIIDII.findOne({
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day)
    });

    if (existing) {
      return res.status(400).json({ error: `Data already exists for ${dateString}` });
    }

    // Create new record
    const newRecord = await FIIDII.create({
      date,
      dateString,
      year: parseInt(year),
      month: parseInt(month),
      week: Math.ceil(parseInt(day) / 7),
      day: parseInt(day),
      fiiBuyValue: parseFloat(fiiBuyValue) || 0,
      fiiSellValue: parseFloat(fiiSellValue) || 0,
      fiiNetValue,
      diiBuyValue: parseFloat(diiBuyValue) || 0,
      diiSellValue: parseFloat(diiSellValue) || 0,
      diiNetValue
    });

    res.status(201).json({
      message: "Record added successfully",
      data: newRecord
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== POST: Bulk insert multiple records =====
router.post("/add-bulk", async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ error: "Records must be an array" });
    }

    const formattedRecords = records.map(record => {
      const fiiNetValue = (parseFloat(record.fiiBuyValue) || 0) - (parseFloat(record.fiiSellValue) || 0);
      const diiNetValue = (parseFloat(record.diiBuyValue) || 0) - (parseFloat(record.diiSellValue) || 0);

      return {
        date: new Date(record.year, record.month - 1, record.day),
        dateString: record.dateString,
        year: parseInt(record.year),
        month: parseInt(record.month),
        week: Math.ceil(parseInt(record.day) / 7),
        day: parseInt(record.day),
        fiiBuyValue: parseFloat(record.fiiBuyValue) || 0,
        fiiSellValue: parseFloat(record.fiiSellValue) || 0,
        fiiNetValue,
        diiBuyValue: parseFloat(record.diiBuyValue) || 0,
        diiSellValue: parseFloat(record.diiSellValue) || 0,
        diiNetValue
      };
    });

    const result = await FIIDII.insertMany(formattedRecords, { ordered: false });

    res.status(201).json({
      message: `${result.length} records added successfully`,
      count: result.length,
      data: result
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: "Some records already exist (duplicates)" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ===== PUT: Update existing record =====
router.put("/update/:year/:month/:day", async (req, res) => {
  try {
    const { year, month, day } = req.params;
    const { fiiBuyValue, fiiSellValue, diiBuyValue, diiSellValue } = req.body;

    const fiiNetValue = (parseFloat(fiiBuyValue) || 0) - (parseFloat(fiiSellValue) || 0);
    const diiNetValue = (parseFloat(diiBuyValue) || 0) - (parseFloat(diiSellValue) || 0);

    const updated = await FIIDII.findOneAndUpdate(
      {
        year: parseInt(year),
        month: parseInt(month),
        day: parseInt(day)
      },
      {
        fiiBuyValue: parseFloat(fiiBuyValue) || 0,
        fiiSellValue: parseFloat(fiiSellValue) || 0,
        fiiNetValue,
        diiBuyValue: parseFloat(diiBuyValue) || 0,
        diiSellValue: parseFloat(diiSellValue) || 0,
        diiNetValue
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json({
      message: "Record updated successfully",
      data: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE record =====
router.delete("/delete/:year/:month/:day", async (req, res) => {
  try {
    const { year, month, day } = req.params;

    const deleted = await FIIDII.findOneAndDelete({
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day)
    });

    if (!deleted) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json({
      message: "Record deleted successfully",
      data: deleted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;