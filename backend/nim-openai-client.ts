import OpenAI from "openai";

export const nimOpenAI = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NIM_API_KEY!,
});