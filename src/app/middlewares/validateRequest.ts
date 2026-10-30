import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import catchAsync from "../../utils/catchAsync";

const validateRequest = (schema: ZodType) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const parsed = (await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
      cookies: req.cookies,
    })) as {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };

    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }

    if (parsed.params !== undefined) {
      req.params = parsed.params as Request["params"];
    }

    // Express 5 exposes req.query through a getter, so store the coerced and
    // validated query separately for controllers to read.
    req.validatedQuery = parsed.query;

    next();
  });
};

export default validateRequest;
