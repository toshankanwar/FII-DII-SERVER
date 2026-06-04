import axios from "axios";
import mongoose from "mongoose";
import FIIDII from "../models/FIIDII.js";

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

const toNum = (v) =>
  Number(String(v).replace(/,/g, "")) || 0;

async function updateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Mongo Connected");

    const response = await axios.get(
      "https://www.nseindia.com/api/fiidiiTradeReact",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Referer: "https://www.nseindia.com/",
        },
      }
    );

    const data = response.data;

    const fii = data.find(
      (d) => d.category === "FII/FPI"
    );

    const dii = data.find(
      (d) => d.category === "DII"
    );

    if (!fii || !dii) {
      throw new Error("FII/DII data not found");
    }

    const date = parseNSEDate(fii.date);

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

    console.log("Data Updated");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updateData();