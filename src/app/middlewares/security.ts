import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

// Input validation middleware
export const validateInput = [
  body("*").trim().escape(), // Sanitize all inputs
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    next();
  },
];

// File upload rate limiting
export const fileUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit file uploads
  message: "Too many file uploads, please try again later.",
});

// Payment endpoint rate limiting
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 3, // Limit payment attempts
  message: "Too many payment attempts, please try again later.",
});

// Admin action rate limiting
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // Limit admin actions
  message: "Too many admin actions, please slow down.",
});

// Security headers middleware
export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Remove server information
  res.removeHeader("X-Powered-By");

  // Add custom security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );

  next();
};

// Request logging for security monitoring
export const securityLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const suspicious = [
    "script",
    "javascript:",
    "vbscript:",
    "onload",
    "onerror",
    "eval(",
    "alert(",
    "../",
    "..\\",
    "union",
    "select",
    "insert",
    "delete",
    "drop",
    "exec",
  ];

  const url = req.url.toLowerCase();
  const userAgent = req.get("User-Agent")?.toLowerCase() || "";
  const body = JSON.stringify(req.body).toLowerCase();

  const isSuspicious = suspicious.some(
    (pattern) =>
      url.includes(pattern) ||
      userAgent.includes(pattern) ||
      body.includes(pattern),
  );

  if (isSuspicious) {
    console.warn("[SECURITY] Suspicious request detected:", {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
