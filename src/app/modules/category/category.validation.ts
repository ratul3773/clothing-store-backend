import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug may contain lowercase letters, numbers, and hyphens",
  )
  .max(200);

const categoryBody = {
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(500).nullable().optional(),
};

const createCategorySchema = z.object({
  body: z.object(categoryBody).strict(),
});

const updateCategorySchema = z.object({
  body: z
    .object(categoryBody)
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
});

const categoryIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }).strict(),
});

const categorySlugSchema = z.object({
  params: z.object({ slug: slugSchema }).strict(),
});

export const CategoryValidation = {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
  categorySlugSchema,
};
