import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { ProductController } from "./product.controller";
import { ProductValidation } from "./product.validation";

const router = Router();

router.get(
  "/",
  validateRequest(ProductValidation.publicProductQuerySchema),
  ProductController.listPublicProducts,
);
router.get(
  "/:slug",
  validateRequest(ProductValidation.productSlugSchema),
  ProductController.getPublicProduct,
);

export const ProductRoutes = router;
