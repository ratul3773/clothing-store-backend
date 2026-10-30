import { NextFunction, Request, Response } from "express";
import config from "../../config/env";

const allowedOrigins = new Set(
  [config.frontend_url, config.better_auth.url].filter(Boolean),
);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireTrustedOrigin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const source = req.get("origin") ?? req.get("referer");

  if (!source) {
    if (config.env === "production") {
      res.status(403).json({
        success: false,
        message: "Request origin could not be verified",
      });
      return;
    }

    next();
    return;
  }

  let sourceOrigin: string;

  try {
    sourceOrigin = new URL(source).origin;
  } catch {
    res.status(403).json({
      success: false,
      message: "Request origin could not be verified",
    });
    return;
  }

  if (!allowedOrigins.has(sourceOrigin)) {
    res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
    return;
  }

  next();
};
