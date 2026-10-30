import { Router } from "express";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";
import validateRequest from "../../middlewares/validateRequest";

const router = Router();

router.get("/", CategoryController.listPublicCategories);
router.get(
  "/:slug",
  validateRequest(CategoryValidation.categorySlugSchema),
  CategoryController.getPublicCategory,
);

export const CategoryRoutes = router;
