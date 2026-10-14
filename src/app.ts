
import express from "express";
import { prisma } from "./lib/prisma";

const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Clothing Store API",
  });
});

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

export default app;