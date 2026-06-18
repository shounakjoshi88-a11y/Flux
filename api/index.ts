// @ts-expect-error - served at runtime via backend build
import app from "../backend/index";
// @ts-expect-error - served at runtime via Vercel serverless
import express from "express";

const serverless = express();
serverless.use("/api", app);

export default serverless;
