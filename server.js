import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import fiidiiRoutes from "./routes/fiidiiRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(
"mongodb+srv://toshankanwar03_db_user:uSCqOralOPe3snHs@fiidii-databse.hgvxszn.mongodb.net/market"
)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));


app.use("/api/fiidii",fiidiiRoutes);


app.get("/",(req,res)=>{
 res.send("FII DII API running");
});


app.listen(5000,()=>{
 console.log("Server running on port 5000");
});