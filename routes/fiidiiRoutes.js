import express from "express";
import axios from "axios";
import FIIDII from "../models/FIIDII.js";

const router = express.Router();


// convert NSE date safely
function parseNSEDate(dateStr){

 const [day,monthStr,year] = dateStr.split("-");

 const months = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
 };

 return new Date(year, months[monthStr], Number(day));

}



// UPDATE DAILY DATA
router.get("/update", async(req,res)=>{

 try{

  const url = "https://www.nseindia.com/api/fiidiiTradeReact";

  const response = await axios.get(url,{
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Referer":"https://www.nseindia.com/"
    }
  });

  const data = response.data;

  const fii = data.find(d=>d.category==="FII/FPI");
  const dii = data.find(d=>d.category==="DII");

  const date = parseNSEDate(fii.date);

  const toNum = v => Number(v) || 0;

  await FIIDII.updateOne(
   {date},
   {
    date,
    dateString:fii.date,

    year:date.getFullYear(),
    month:date.getMonth()+1,
    week:Math.ceil(date.getDate()/7),
    day:date.getDate(),

    fiiBuyValue:toNum(fii.buyValue),
    fiiSellValue:toNum(fii.sellValue),
    fiiNetValue:toNum(fii.netValue),

    diiBuyValue:toNum(dii.buyValue),
    diiSellValue:toNum(dii.sellValue),
    diiNetValue:toNum(dii.netValue)
   },
   {upsert:true}
  );

  res.json({message:"data saved"});

 }
 catch(err){

  console.log(err);
  res.status(500).json({error:err.message});

 }

});



// TODAY
router.get("/today", async(req,res)=>{

 const today = new Date();

 const data = await FIIDII.findOne({
  year:today.getFullYear(),
  month:today.getMonth()+1,
  day:today.getDate()
 });

 res.json(data);

});



// WEEK
router.get("/week", async(req,res)=>{

 const today = new Date();

 const data = await FIIDII.find({
  year:today.getFullYear(),
  month:today.getMonth()+1,
  week:Math.ceil(today.getDate()/7)
 });

 res.json(data);

});



// MONTH
router.get("/month", async(req,res)=>{

 const today = new Date();

 const data = await FIIDII.find({
  year:today.getFullYear(),
  month:today.getMonth()+1
 });

 res.json(data);

});



// YEAR
router.get("/year", async(req,res)=>{

 const today = new Date();

 const data = await FIIDII.find({
  year:today.getFullYear()
 });

 res.json(data);

});



export default router;