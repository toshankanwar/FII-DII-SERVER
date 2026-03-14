import mongoose from "mongoose";

const schema = new mongoose.Schema({

  date: Date,
  dateString: String,

  year: Number,
  month: Number,
  week: Number,
  day: Number,

  fiiBuyValue: Number,
  fiiSellValue: Number,
  fiiNetValue: Number,

  diiBuyValue: Number,
  diiSellValue: Number,
  diiNetValue: Number

},{
  timestamps:true
});

export default mongoose.model("FIIDII", schema);