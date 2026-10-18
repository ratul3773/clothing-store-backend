
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { prisma } from "./lib/prisma";
import config from "./config/env";
import { auth } from "./lib/auth";
import router from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";

const app = express();

app.disable("x-powered-by");

// 1. CORS must run before Better Auth.
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  }),
);

// 2. Mount Better Auth before body parsers.
app.all("/api/auth/{*splat}", toNodeHandler(auth));

// 3. Body parsers for your other Express routes.
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

app.use(globalErrorHandler);

export default app;
