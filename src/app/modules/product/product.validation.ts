import { z } from "zod";
import {
  ADMIN_PRODUCT_SORTS,
  ADMIN_STOCK_ADJUSTMENT_TYPES,
  PRODUCT_FITS,
  PUBLIC_PRODUCT_SORTS,
} from "./product.constants";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug may contain lowercase letters, numbers, and hyphens",
  )
  .max(200);

const codeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "Code may contain letters, numbers, underscores, and hyphens",
  )
  .max(50);

const badgeSchema = z.enum([
  "NEW",
  "SALE",
  "BEST_SELLER",
  "LIMITED",
  "COMBO",
]);

const priceSchema = z.coerce
  .number()
  .int()
  .positive("Price must be greater than zero")
  .max(1_000_000_000);

const nonNegativeInt = z.coerce.number().int().min(0).max(10_000_000);

const pagination = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const productCoreBody = {
  name: z.string().trim().min(1).max(200),
  code: codeSchema,
  description: z.string().trim().max(20000).nullable().optional(),
  material: z.string().trim().max(200).nullable().optional(),
  fit: z.enum(PRODUCT_FITS).nullable().optional(),
  careInstructions: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid(),
  regularPrice: priceSchema,
  badges: z.array(badgeSchema).max(5).optional(),
  isExchangeEligible: z.boolean().optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(500).nullable().optional(),
};

const createColorSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    hex: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Hex colour must be #RRGGBB")
      .nullable()
      .optional(),
    sortOrder: nonNegativeInt.optional(),
  })
  .strict();

const createVariantSchema = z
  .object({
    colorName: z.string().trim().min(1).max(50),
    size: z.string().trim().min(1).max(20),
    sizeOrder: nonNegativeInt.optional(),
    onHand: nonNegativeInt.optional(),
    lowStockThreshold: nonNegativeInt.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const createProductSchema = z.object({
  body: z
    .object({
      ...productCoreBody,
      colors: z.array(createColorSchema).max(20).optional(),
      variants: z.array(createVariantSchema).max(200).optional(),
    })
    .strict(),
});

const updateProductSchema = z.object({
  body: z
    .object({
      ...productCoreBody,
      name: productCoreBody.name.optional(),
      categoryId: productCoreBody.categoryId.optional(),
      regularPrice: productCoreBody.regularPrice.optional(),
      version: z.coerce.number().int().min(1),
    })
    .partial()
    .strict()
    .required({ version: true }),
});

const productIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }).strict(),
});

const productSlugSchema = z.object({
  params: z.object({ slug: slugSchema }).strict(),
});

const productVariantParamsSchema = z.object({
  params: z
    .object({ id: z.string().uuid(), variantId: z.string().uuid() })
    .strict(),
});

const variantIdSchema = z.object({
  params: z.object({ variantId: z.string().uuid() }).strict(),
});

const colorParamsSchema = z.object({
  params: z
    .object({ id: z.string().uuid(), colorId: z.string().uuid() })
    .strict(),
});

const productOfferParamsSchema = z.object({
  params: z
    .object({ id: z.string().uuid(), offerId: z.string().uuid() })
    .strict(),
});

const imageIdSchema = z.object({
  params: z
    .object({ id: z.string().uuid(), imageId: z.string().uuid() })
    .strict(),
});

const offerIdSchema = z.object({
  params: z.object({ offerId: z.string().uuid() }).strict(),
});

const publicProductQuerySchema = z.object({
  query: z
    .object({
      ...pagination,
      q: z.string().trim().max(100).optional(),
      category: slugSchema.optional(),
      minPrice: z.coerce.number().int().min(0).optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      badge: badgeSchema.optional(),
      inStock: z.enum(["true", "false"]).optional(),
      offers: z.enum(["true", "false"]).optional(),
      sort: z.enum(PUBLIC_PRODUCT_SORTS).optional(),
    })
    .strict()
    .refine(
      (query) =>
        query.minPrice === undefined ||
        query.maxPrice === undefined ||
        query.minPrice <= query.maxPrice,
      { message: "minPrice cannot exceed maxPrice" },
    ),
});

const adminProductQuerySchema = z.object({
  query: z
    .object({
      ...pagination,
      q: z.string().trim().max(100).optional(),
      categoryId: z.string().uuid().optional(),
      category: slugSchema.optional(),
      status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
      badge: badgeSchema.optional(),
      inStock: z.enum(["true", "false"]).optional(),
      minPrice: z.coerce.number().int().min(0).optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      sort: z.enum(ADMIN_PRODUCT_SORTS).optional(),
    })
    .strict()
    .refine(
      (query) =>
        query.minPrice === undefined ||
        query.maxPrice === undefined ||
        query.minPrice <= query.maxPrice,
      { message: "minPrice cannot exceed maxPrice" },
    ),
});

const createColorBodySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(50),
    hex: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Hex colour must be #RRGGBB")
      .nullable()
      .optional(),
    sortOrder: nonNegativeInt.optional(),
  }).strict(),
});

const updateColorBodySchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(50).optional(),
      hex: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, "Hex colour must be #RRGGBB")
        .nullable()
        .optional(),
      sortOrder: nonNegativeInt.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
});

const createVariantBodySchema = z.object({
  body: z
    .object({
      colorId: z.string().uuid(),
      size: z.string().trim().min(1).max(20),
      sizeOrder: nonNegativeInt.optional(),
      onHand: nonNegativeInt.optional(),
      lowStockThreshold: nonNegativeInt.optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

const updateVariantBodySchema = z.object({
  body: z
    .object({
      size: z.string().trim().min(1).max(20).optional(),
      sizeOrder: nonNegativeInt.optional(),
      lowStockThreshold: nonNegativeInt.optional(),
      isActive: z.boolean().optional(),
      version: z.coerce.number().int().min(1),
    })
    .strict(),
});

const stockAdjustmentSchema = z.object({
  body: z
    .object({
      type: z.enum(ADMIN_STOCK_ADJUSTMENT_TYPES),
      quantity: z.coerce.number().int().optional(),
      onHand: nonNegativeInt.optional(),
      note: z.string().trim().max(500).nullable().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.type === "STOCKTAKE") {
        if (value.onHand === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["onHand"],
            message: "onHand is required for a stocktake",
          });
        }
        if (value.quantity !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["quantity"],
            message: "quantity is not allowed for a stocktake",
          });
        }
        return;
      }

      if (value.quantity === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["quantity"],
          message: "quantity is required",
        });
        return;
      }

      if (
        (value.type === "RESTOCK" || value.type === "DAMAGED") &&
        value.quantity <= 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["quantity"],
          message: "quantity must be greater than zero",
        });
      }

      if (value.type === "ADJUSTMENT" && value.quantity === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["quantity"],
          message: "quantity cannot be zero",
        });
      }
    }),
});

const stockMovementsQuerySchema = z.object({
  query: z
    .object({
      ...pagination,
    })
    .strict(),
});

const offerBody = {
  offerPrice: priceSchema,
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
};

const createOfferSchema = z.object({
  body: z
    .object(offerBody)
    .strict()
    .refine(
      (value) =>
        !value.endsAt || !value.startsAt || value.endsAt > value.startsAt,
      { message: "endsAt must be after startsAt", path: ["endsAt"] },
    ),
});

const updateOfferSchema = z.object({
  body: z
    .object(offerBody)
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    })
    .refine(
      (value) =>
        !value.endsAt || !value.startsAt || value.endsAt > value.startsAt,
      { message: "endsAt must be after startsAt", path: ["endsAt"] },
    ),
});

const updateImageSchema = z.object({
  body: z
    .object({
      alt: z.string().trim().max(300).nullable().optional(),
      colorId: z.string().uuid().nullable().optional(),
      isPrimary: z.boolean().optional(),
      sortOrder: nonNegativeInt.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
});

const reorderImagesSchema = z.object({
  params: z.object({ id: z.string().uuid() }).strict(),
  body: z
    .object({
      imageIds: z.array(z.string().uuid()).min(1).max(50),
    })
    .strict(),
});

export const ProductValidation = {
  createProductSchema,
  updateProductSchema,
  productIdSchema,
  productSlugSchema,
  productVariantParamsSchema,
  variantIdSchema,
  colorParamsSchema,
  productOfferParamsSchema,
  imageIdSchema,
  offerIdSchema,
  publicProductQuerySchema,
  adminProductQuerySchema,
  createColorBodySchema,
  updateColorBodySchema,
  createVariantBodySchema,
  updateVariantBodySchema,
  stockAdjustmentSchema,
  stockMovementsQuerySchema,
  createOfferSchema,
  updateOfferSchema,
  updateImageSchema,
  reorderImagesSchema,
};
