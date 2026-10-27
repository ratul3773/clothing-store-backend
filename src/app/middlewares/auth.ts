import { NextFunction, Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { Role } from "../../generated/prisma/enums";

const sendUnauthorized = (res: Response, message: string) => {
  res.status(401).json({
    success: false,
    message,
  });
};

const sendForbidden = (res: Response, message: string) => {
  res.status(403).json({
    success: false,
    message,
  });
};

export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      sendUnauthorized(res, "Please sign in to continue");
      return;
    }

    // The session payload can be cached briefly and may be stale. Always load
    // the current user record before making an authorization decision.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!user || user.isDeleted || user.deletedAt) {
      sendUnauthorized(res, "Your account is no longer active");
      return;
    }

    if (!user.emailVerified) {
      sendUnauthorized(res, "Please verify your email address to continue");
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...allowedRoles: Role[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      sendUnauthorized(res, "Please sign in to continue");
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      sendForbidden(
        res,
        "You do not have permission to access this resource",
      );
      return;
    }

    next();
  };
};

export const requireAdmin: RequestHandler[] = [
  requireAuth,
  requireRole(Role.admin),
];
