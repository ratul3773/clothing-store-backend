import { NextFunction, Request, Response } from "express";
import config from "../../config/env";

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const allowedOrigins = new Set(
  [
    config.frontend_url,
    config.better_auth.url,
  ]
    .filter((url): url is string => Boolean(url))
    .map((url) => new URL(url).origin),
);

const allowMissingOrigin =
  config.env !== "production";

const reject = (
  res: Response,
  message: string,
) => {
  res.status(403).json({
    success: false,
    message,
  });
};

export const requireTrustedOrigin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.get("origin");
  const referer = req.get("referer");

  if (!origin && !referer) {
    if (allowMissingOrigin) {
      return next();
    }

    return reject(
      res,
      "Request origin could not be verified",
    );
  }

  let sourceOrigin: string;

  try {
    if (origin) {
      const parsed = new URL(origin);

      // Origin must not contain a path,
      // query string, or fragment.
      if (
        parsed.origin === "null" ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        return reject(
          res,
          "Invalid request origin",
        );
      }

      sourceOrigin = parsed.origin;
    } else {
      const parsed = new URL(referer!);

      if (
        parsed.origin === "null" ||
        parsed.username ||
        parsed.password
      ) {
        return reject(
          res,
          "Invalid request referer",
        );
      }

      sourceOrigin = parsed.origin;
    }
  } catch {
    return reject(
      res,
      "Request origin could not be verified",
    );
  }

  if (!allowedOrigins.has(sourceOrigin)) {
    return reject(
      res,
      "Request origin is not allowed",
    );
  }

  next();
};
