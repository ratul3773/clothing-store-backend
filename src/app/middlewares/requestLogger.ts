import type { Request, Response, NextFunction } from "express";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();

  res.on("finish", () => {
    console.log(
      `[${res.statusCode}] ${req.method} ${req.originalUrl} - ${Date.now() - start}ms`,
    );
  });

  next();
};