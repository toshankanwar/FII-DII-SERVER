import axios from "axios";
import mongoose from "mongoose";
import FIIDII from "./models/FIIDII.js";

await mongoose.connect("mongodb+srv://toshankanwar03_db_user:uSCqOralOPe3snHs@fiidii-databse.hgvxszn.mongodb.net/market");

const NSE_LIVE_API = "https://www.nseindia.com/api/fiidiiTradeReact";

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.nseindia.com/market-data/fii-dii-data'
  }
});

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function fetchHistoricalData() {
  try {
    console.log("🚀 Starting Historical FII/DII Data Fetch\n");

    const today = new Date();
    const startDate = new Date();
    startDate.setFullYear(today.getFullYear() - 5); // Last 5 years

    console.log(`📅 Fetching data from ${startDate.toLocaleDateString('en-IN')} to ${today.toLocaleDateString('en-IN')}\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Loop through each day
    for (let date = new Date(startDate); date <= today; date.setDate(date.getDate() + 1)) {
      
      // Skip weekends
      if (isWeekend(date)) {
        skipCount++;
        continue;
      }

      const dateObj = new Date(date); // Create a copy

      try {
        // Check if data already exists for this date
        const existing = await FIIDII.findOne({
          year: dateObj.getFullYear(),
          month: dateObj.getMonth() + 1,
          day: dateObj.getDate()
        });

        if (existing) {
          console.log(`⏭️ ${dateObj.toLocaleDateString('en-IN')} - Already exists`);
          skipCount++;
          continue;
        }

        // Fetch from NSE
        console.log(`📥 Fetching ${dateObj.toLocaleDateString('en-IN')}...`);
        const response = await axiosInstance.get(NSE_LIVE_API);
        const data = response.data;

        const fii = data.find(d => d.category === "FII/FPI");
        const dii = data.find(d => d.category === "DII");

        if (!fii || !dii) {
          console.log(`⚠️ No data for ${dateObj.toLocaleDateString('en-IN')}`);
          errorCount++;
          continue;
        }

        // Parse date from NSE format
        const dateStr = fii.date;
        const [day, monthStr, year] = dateStr.split("-");
        const months = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };

        const parsedDate = new Date(year, months[monthStr], day);

        const fiiBuyValue = Number(fii.buyValue) || 0;
        const fiiSellValue = Number(fii.sellValue) || 0;
        const diiBuyValue = Number(dii.buyValue) || 0;
        const diiSellValue = Number(dii.sellValue) || 0;

        // Save to MongoDB
        await FIIDII.create({
          date: parsedDate,
          dateString: dateStr,
          year: parsedDate.getFullYear(),
          month: parsedDate.getMonth() + 1,
          week: Math.ceil(parsedDate.getDate() / 7),
          day: parsedDate.getDate(),

          fiiBuyValue,
          fiiSellValue,
          fiiNetValue: fiiBuyValue - fiiSellValue,

          diiBuyValue,
          diiSellValue,
          diiNetValue: diiBuyValue - diiSellValue,
        });

        console.log(`✅ Saved: ${dateStr} | FII Net: ₹${(fiiBuyValue - fiiSellValue).toFixed(2)} Cr | DII Net: ₹${(diiBuyValue - diiSellValue).toFixed(2)} Cr`);
        successCount++;

        // Rate limiting - 500ms delay between requests
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`❌ Error: ${dateObj.toLocaleDateString('en-IN')} - ${err.message}`);
        errorCount++;
        // Continue on error
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log("\n📊 ===== SUMMARY =====");
    console.log(`✅ Successfully saved: ${successCount} records`);
    console.log(`⏭️ Already existed: ${skipCount} records`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Total: ${successCount + skipCount + errorCount}`);

    process.exit(0);

  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

await fetchHistoricalData();