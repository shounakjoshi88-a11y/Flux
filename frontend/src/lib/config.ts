const isLocalhost = typeof globalThis !== 'undefined' &&
  typeof globalThis.location !== 'undefined' &&
  (globalThis.location.hostname === 'localhost' ||
   globalThis.location.hostname === '127.0.0.1' ||
   globalThis.location.hostname === '[::1]');

export const BACKEND_URL = (globalThis as any).__BACKEND_URL__ ?? (process.env.BUN_PUBLIC_BACKEND_URL || (isLocalhost ? "http://localhost:3001" : "/api"));
export const UNSPLASH_ACCESS_KEY = "F20HPbf6v1PbJuOyW4Q-b5vl5eflqsNzs-eIjoI8hf4";

