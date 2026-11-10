import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin, requireAuth, requireRole } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { resolveCart } from "../cart/cart.middleware";
import { OrderController } from "./order.controller";
import { OrderValidation as validation } from "./order.validation";

const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60_000, limit,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Too many order requests. Please try again later." },
});
const placementLimiter = limiter(10);
const guestLimiter = limiter(30);
const customer = [requireAuth, requireRole("customer")];

export const OrderRoutes = Router();
OrderRoutes.get("/delivery-policy", OrderController.deliveryPolicy);
OrderRoutes.post("/", placementLimiter, resolveCart, validateRequest(validation.create), OrderController.create);
OrderRoutes.get("/", ...customer, validateRequest(validation.list), OrderController.list);
OrderRoutes.get("/:id/guest", guestLimiter, validateRequest(validation.detail), OrderController.guestDetail);
OrderRoutes.post("/:id/guest/cancel", guestLimiter, validateRequest(validation.cancel), OrderController.guestCancel);
OrderRoutes.get("/:id", ...customer, validateRequest(validation.detail), OrderController.detail);
OrderRoutes.post("/:id/cancel", ...customer, validateRequest(validation.cancel), OrderController.cancel);

export const AdminOrderRoutes = Router();
AdminOrderRoutes.use(...requireAdmin);
AdminOrderRoutes.post("/", validateRequest(validation.manualCreate), OrderController.manualCreate);
AdminOrderRoutes.get("/", validateRequest(validation.list), OrderController.adminList);
AdminOrderRoutes.get("/customer-search", validateRequest(validation.customerSearch), OrderController.customerSearch);
AdminOrderRoutes.get("/:id", validateRequest(validation.detail), OrderController.adminDetail);
AdminOrderRoutes.patch("/:id/status", validateRequest(validation.transition), OrderController.transition);
AdminOrderRoutes.post("/:id/return-receipt", validateRequest(validation.returnReceipt), OrderController.returnReceipt);
