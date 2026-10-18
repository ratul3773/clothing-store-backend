import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";

export const requireRole = (
  ...allowedRoles: string[]
): RequestHandler => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      // No valid session
      if (!session) {
        res.status(401).json({
          success: false,
          message: "Please sign in to continue",
        });
        return;
      }

      // Role is not permitted
      if (!allowedRoles.includes(session.user.role)) {
        res.status(403).json({
          success: false,
          message: "You do not have permission to access this resource",
        });
        return;
      }
      req.user = session.user;
      next();
    } catch (error) {
      next(error);
    }
  };
};
