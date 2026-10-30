import { z } from "zod";
import { ProductValidation } from "./product.validation";

export type CreateProductInput = z.infer<
  typeof ProductValidation.createProductSchema
>["body"];

export type UpdateProductInput = z.infer<
  typeof ProductValidation.updateProductSchema
>["body"];

export type PublicProductQuery = z.infer<
  typeof ProductValidation.publicProductQuerySchema
>["query"] & {
  ids: string[];
};

export type AdminProductQuery = z.infer<
  typeof ProductValidation.adminProductQuerySchema
>["query"];

export type CreateColorInput = z.infer<
  typeof ProductValidation.createColorBodySchema
>["body"];

export type UpdateColorInput = z.infer<
  typeof ProductValidation.updateColorBodySchema
>["body"];

export type CreateVariantInput = z.infer<
  typeof ProductValidation.createVariantBodySchema
>["body"];

export type UpdateVariantInput = z.infer<
  typeof ProductValidation.updateVariantBodySchema
>["body"];

export type StockAdjustmentInput = z.infer<
  typeof ProductValidation.stockAdjustmentSchema
>["body"];

export type CreateOfferInput = z.infer<
  typeof ProductValidation.createOfferSchema
>["body"];

export type UpdateOfferInput = z.infer<
  typeof ProductValidation.updateOfferSchema
>["body"];

export type UpdateImageInput = z.infer<
  typeof ProductValidation.updateImageSchema
>["body"];
