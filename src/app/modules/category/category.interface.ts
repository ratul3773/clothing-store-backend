import { z } from "zod";
import { CategoryValidation } from "./category.validation";

export type CreateCategoryInput = z.infer<
  typeof CategoryValidation.createCategorySchema
>["body"];

export type UpdateCategoryInput = z.infer<
  typeof CategoryValidation.updateCategorySchema
>["body"];

export type CategoryCounts = {
  children: number;
  products: number;
};

export type CategoryLike = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageKey: string | null;
  imageProvider: "LOCAL" | "BUNNY" | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: CategoryCounts;
};

export type CategoryDto = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
  children?: CategoryDto[];
};
