import app from "../backend/index";
import express from "express";

const serverless = express();
serverless.use("/api", app);

export default serverless;
