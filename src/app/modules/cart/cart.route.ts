import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requireTrustedOrigin } from "../../middlewares/originGuard";
import validateRequest from "../../middlewares/validateRequest";
import { CartController } from "./cart.controller";
import { CartValidation } from "./cart.validation";
import { resolveCart } from "./cart.middleware";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// Bound anonymous session/hash lookups before reaching authentication/storage.
router.use(
  requireTrustedOrigin,
  rateLimit({
    windowMs: 60_000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many cart requests. Please try again shortly.",
    },
  }),
  resolveCart,
);

// Limit creation separately; rotating cookies must not bypass IP throttling.
router.use(
  rateLimit({
    windowMs: 60 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.method !== "POST" || req.cartOwner?.kind !== "none",
    message: {
      success: false,
      message: "Too many guest carts created. Please try again later.",
    },
  }),
);

// Rate limit cart mutations
const mutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.cartOwner?.kind === "user"
      ? `user:${req.cartOwner.userId}`
      : `guest:${ipKeyGenerator(req.ip ?? "unknown")}`,
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
router.post("/combos", validateRequest(CartValidation.addCombo), CartController.addCombo);
router.patch("/combos/:itemId", validateRequest(CartValidation.updateItem), CartController.updateCombo);
router.delete("/combos/:itemId", validateRequest(CartValidation.removeItem), CartController.removeCombo);
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
