import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth";
import { requireTrustedOrigin } from "../../middlewares/originGuard";
import { adminLimiter } from "../../middlewares/security";
import validateRequest from "../../middlewares/validateRequest";
import { singleImageUpload } from "../upload/upload.middleware";
import { ProductController } from "./product.controller";
import { ProductValidation } from "./product.validation";

const router = Router();

router.use(requireTrustedOrigin, adminLimiter, ...requireAdmin);

router.get(
  "/",
  validateRequest(ProductValidation.adminProductQuerySchema),
  ProductController.listAdminProducts,
);
router.post(
  "/",
  validateRequest(ProductValidation.createProductSchema),
  ProductController.createProduct,
);
router.get(
  "/:id",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.getAdminProduct,
);
router.patch(
  "/:id",
  validateRequest(ProductValidation.updateProductSchema),
  ProductController.updateProduct,
);
router.delete(
  "/:id",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.deleteProduct,
);
router.post(
  "/:id/publish",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.publishProduct,
);
router.post(
  "/:id/unpublish",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.unpublishProduct,
);
router.post(
  "/:id/archive",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.archiveProduct,
);
router.post(
  "/:id/restore",
  validateRequest(ProductValidation.productIdSchema),
  ProductController.restoreProduct,
);

router.post(
  "/:id/colors",
  validateRequest(ProductValidation.productIdSchema),
  validateRequest(ProductValidation.createColorBodySchema),
  ProductController.createColor,
);
router.patch(
  "/:id/colors/:colorId",
  validateRequest(ProductValidation.colorParamsSchema),
  validateRequest(ProductValidation.updateColorBodySchema),
  ProductController.updateColor,
);
router.delete(
  "/:id/colors/:colorId",
  validateRequest(ProductValidation.colorParamsSchema),
  ProductController.deleteColor,
);

router.post(
  "/:id/variants",
  validateRequest(ProductValidation.productIdSchema),
  validateRequest(ProductValidation.createVariantBodySchema),
  ProductController.createVariant,
);
router.patch(
  "/:id/variants/:variantId",
  validateRequest(ProductValidation.productVariantParamsSchema),
  validateRequest(ProductValidation.updateVariantBodySchema),
  ProductController.updateVariant,
);
router.delete(
  "/:id/variants/:variantId",
  validateRequest(ProductValidation.productVariantParamsSchema),
  ProductController.deleteVariant,
);
router.post(
  "/:id/variants/:variantId/stock",
  validateRequest(ProductValidation.productVariantParamsSchema),
  validateRequest(ProductValidation.stockAdjustmentSchema),
  ProductController.adjustStock,
);
router.get(
  "/:id/variants/:variantId/movements",
  validateRequest(ProductValidation.productVariantParamsSchema),
  validateRequest(ProductValidation.stockMovementsQuerySchema),
  ProductController.listStockMovements,
);

router.post(
  "/:id/offers",
  validateRequest(ProductValidation.productIdSchema),
  validateRequest(ProductValidation.createOfferSchema),
  ProductController.createOffer,
);
router.patch(
  "/:id/offers/:offerId",
  validateRequest(ProductValidation.productOfferParamsSchema),
  validateRequest(ProductValidation.updateOfferSchema),
  ProductController.updateOffer,
);
router.delete(
  "/:id/offers/:offerId",
  validateRequest(ProductValidation.productOfferParamsSchema),
  ProductController.deactivateOffer,
);

router.patch(
  "/:id/images/reorder",
  validateRequest(ProductValidation.reorderImagesSchema),
  ProductController.reorderProductImages,
);
router.patch(
  "/:id/images/:imageId",
  validateRequest(ProductValidation.imageIdSchema),
  validateRequest(ProductValidation.updateImageSchema),
  ProductController.updateProductImage,
);
router.delete(
  "/:id/images/:imageId",
  validateRequest(ProductValidation.imageIdSchema),
  ProductController.deleteProductImage,
);
router.post(
  "/:id/images",
  validateRequest(ProductValidation.productIdSchema),
  singleImageUpload,
  ProductController.uploadProductImage,
);

export const AdminProductRoutes = router;
