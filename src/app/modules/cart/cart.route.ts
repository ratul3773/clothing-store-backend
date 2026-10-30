import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middlewares/auth";
import { requireTrustedOrigin } from "../../middlewares/originGuard";
import validateRequest from "../../middlewares/validateRequest";
import { CartController } from "./cart.controller";
import { CartValidation } from "./cart.validation";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
router.use(requireTrustedOrigin, requireAuth);
const mutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
  message: {
    success: false,
    message: "Too many cart changes. Please try again shortly.",
  },
});
router.use(mutationLimiter);
router.get(
  "/",
  validateRequest(CartValidation.getCart),
  CartController.getCart,
);
router.post(
  "/items",
  validateRequest(CartValidation.addItem),
  CartController.addItem,
);
router.patch(
  "/items/:itemId",
  validateRequest(CartValidation.updateItem),
  CartController.updateItem,
);
router.delete(
  "/items/:itemId",
  validateRequest(CartValidation.removeItem),
  CartController.removeItem,
);
router.delete(
  "/",
  validateRequest(CartValidation.clearCart),
  CartController.clearCart,
);

export const CartRoutes = router;
