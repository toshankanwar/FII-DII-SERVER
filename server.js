import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import axios from "axios";

import fiidiiRoutes from "./routes/fiidiiRoutes.js";
import keepAliveRoutes from "./routes/keepAliveRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(
"mongodb+srv://toshankanwar03_db_user:uSCqOralOPe3snHs@fiidii-databse.hgvxszn.mongodb.net/market"
)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));


app.use("/api/fiidii",fiidiiRoutes);
app.use("/api/keepalive",keepAliveRoutes);


app.get("/",(req,res)=>{
 res.send("FII DII API running");
});


// Auto-start keep-alive
setTimeout(() => {
  axios.post("https://api.fiidii.toshankanwar.in/api/keepalive/start")
    .then(() => console.log("Keep-alive auto-started"))
    .catch(err => console.error("Keep-alive failed:", err.message));
}, 2000);


app.listen(5000,()=>{
 console.log("Server running on port 5000");
});