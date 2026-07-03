export const BACKEND_URL = (globalThis as any).__BACKEND_URL__ ?? (process.env.BUN_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === "production" ? "/api" : "https://localhost:3001"));
export const SITE_URL = (globalThis as any).__SITE_URL__ ?? (process.env.BUN_PUBLIC_SITE_URL || "https://flux-weld-rho.vercel.app");
export const UNSPLASH_ACCESS_KEY = "F20HPbf6v1PbJuOyW4Q-b5vl5eflqsNzs-eIjoI8hf4";
