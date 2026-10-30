import { Router } from "express";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";
import validateRequest from "../../middlewares/validateRequest";
import { requireAdmin } from "../../middlewares/auth";
import { requireTrustedOrigin } from "../../middlewares/originGuard";
import { adminLimiter } from "../../middlewares/security";
import { singleImageUpload } from "../upload/upload.middleware";

const router = Router();

router.use(requireTrustedOrigin, adminLimiter, ...requireAdmin);

router.get("/", CategoryController.listAdminCategories);
router.post(
  "/",
  validateRequest(CategoryValidation.createCategorySchema),
  CategoryController.createCategory,
);
router.patch(
  "/:id",
  validateRequest(CategoryValidation.updateCategorySchema),
  CategoryController.updateCategory,
);
router.delete(
  "/:id",
  validateRequest(CategoryValidation.categoryIdSchema),
  CategoryController.deleteCategory,
);
router.post(
  "/:id/image",
  validateRequest(CategoryValidation.categoryIdSchema),
  singleImageUpload,
  CategoryController.uploadCategoryImage,
);
router.delete(
  "/:id/image",
  validateRequest(CategoryValidation.categoryIdSchema),
  CategoryController.removeCategoryImage,
);

export const AdminCategoryRoutes = router;
