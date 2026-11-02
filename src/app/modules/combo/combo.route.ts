import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth";
import { requireTrustedOrigin } from "../../middlewares/originGuard";
import { adminLimiter } from "../../middlewares/security";
import validateRequest from "../../middlewares/validateRequest";
import { ComboController as controller } from "./combo.controller";
import { ComboValidation as validation } from "./combo.validation";

export const ComboRoutes = Router();
ComboRoutes.get("/", validateRequest(validation.list), controller.list);
ComboRoutes.get("/:slug", validateRequest(validation.slug), controller.detail);

export const AdminComboRoutes = Router();
AdminComboRoutes.use(requireTrustedOrigin, adminLimiter, ...requireAdmin);
AdminComboRoutes.get("/", validateRequest(validation.list), controller.adminList);
AdminComboRoutes.get("/:id", validateRequest(validation.id), controller.adminDetail);
AdminComboRoutes.post("/", validateRequest(validation.create), controller.create);
AdminComboRoutes.patch("/:id", validateRequest(validation.update), controller.update);
