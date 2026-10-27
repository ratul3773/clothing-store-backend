import fs from "node:fs";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { prisma } from "./lib/prisma";
import config from "./config/env";
import { auth } from "./lib/auth";
import router from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import {
  securityHeaders,
  securityLogger,
} from "./app/middlewares/security";

const app = express();

app.disable("x-powered-by");

if (config.env === "production") {
  app.set("trust proxy", 1);
}

const allowedOrigins = new Set(
  [config.frontend_url, config.better_auth.url].filter(Boolean),
);

// CORS must run before Better Auth.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "If-Match"],
  }),
);

app.use(securityHeaders);
app.use(securityLogger);

if (config.storage.driver === "local") {
  fs.mkdirSync(config.storage.upload_dir, { recursive: true });

  app.use(
    "/uploads",
    express.static(config.storage.upload_dir, {
      dotfiles: "deny",
      index: false,
      redirect: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
}

// Mount Better Auth before body parsers.
app.all("/api/auth/{*splat}", toNodeHandler(auth));

// Body parsers for the Express API routes.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Clothing Store API",
  });
});

app.use("/api/v1", router);

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "API and database are ready",
    });
  } catch (error) {
    console.error("Database readiness check failed:", error);

    res.status(503).json({
      success: false,
      message: "Database is unavailable",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use(globalErrorHandler);

export default app;
