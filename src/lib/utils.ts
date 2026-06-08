import { NextRequest } from "next/server";

/**
 * Generates a cryptographically strong random alphanumeric string of a given length.
 */
export function generateShortId(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  
  if (typeof window === "undefined" && typeof global !== "undefined" && require) {
    // Node.js environment
    const crypto = require("crypto");
    const bytes = crypto.randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
  
  // Browser or fallback environment
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

// In-memory rate limiting map
// Maps IP Address -> Array of timestamps (in ms)
const ipCache = new Map<string, number[]>();

// Cleanup interval to avoid memory leaks
if (typeof global !== "undefined") {
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipCache.entries()) {
      const validTimestamps = timestamps.filter(ts => now - ts < 60000); // 1 minute window
      if (validTimestamps.length === 0) {
        ipCache.delete(ip);
      } else {
        ipCache.set(ip, validTimestamps);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Checks if the request client has exceeded the allowed rate limit.
 * Defaults to 10 requests per minute.
 */
export function isRateLimited(req: NextRequest, limit = 10, windowMs = 60000): boolean {
  // Get IP address from headers
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
  
  const now = Date.now();
  const timestamps = ipCache.get(ip) || [];
  
  // Filter out timestamps older than the window
  const activeTimestamps = timestamps.filter(ts => now - ts < windowMs);
  
  if (activeTimestamps.length >= limit) {
    return true;
  }
  
  activeTimestamps.push(now);
  ipCache.set(ip, activeTimestamps);
  return false;
}
