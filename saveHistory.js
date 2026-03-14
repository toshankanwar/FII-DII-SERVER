import axios from "axios";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import FIIDII from "./models/FIIDII.js";

await mongoose.connect("mongodb+srv://toshankanwar03_db_user:uSCqOralOPe3snHs@fiidii-databse.hgvxszn.mongodb.net/market");

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

async function initSession(){
  await client.get("https://www.nseindia.com",{
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Accept":"text/html"
    }
  });
}

function formatDate(d){
  const day = String(d.getDate()).padStart(2,"0");
  const month = String(d.getMonth()+1).padStart(2,"0");
  const year = d.getFullYear();
  return `${year}${month}${day}`;
}

function isWeekend(d){
  const day = d.getDay();
  return day === 0 || day === 6;
}

await initSession();

const today = new Date();
const start = new Date();
start.setFullYear(today.getFullYear() - 5);

for(let d = new Date(start); d <= today; d.setDate(d.getDate()+1)){

  if(isWeekend(d)) continue;

  const dateStr = formatDate(d);

  const url =
  `https://archives.nseindia.com/content/fiidii/fii_stats_${dateStr}.xls`;

  try{

    const res = await client.get(url,{
      responseType:"arraybuffer",
      headers:{
        "User-Agent":"Mozilla/5.0",
        "Referer":"https://www.nseindia.com/"
      }
    });

    const workbook = XLSX.read(res.data,{type:"buffer"});
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet,{header:1});

    const fiiRow = rows.find(r => String(r[0]).includes("FII"));
    const diiRow = rows.find(r => String(r[0]).includes("DII"));

    if(!fiiRow || !diiRow) continue;

    const fiiBuy = Number(fiiRow[2]) || 0;
    const fiiSell = Number(fiiRow[3]) || 0;

    const diiBuy = Number(diiRow[2]) || 0;
    const diiSell = Number(diiRow[3]) || 0;

    await FIIDII.updateOne(
      {date:d},
      {
        date:d,
        year:d.getFullYear(),
        month:d.getMonth()+1,
        week:Math.ceil(d.getDate()/7),
        day:d.getDate(),

        fiiBuy,
        fiiSell,
        fiiNet:fiiBuy - fiiSell,

        diiBuy,
        diiSell,
        diiNet:diiBuy - diiSell
      },
      {upsert:true}
    );

    console.log("Saved:",dateStr);

  }catch(err){

    console.log("No data:",dateStr);

  }

}

console.log("5 year import finished");