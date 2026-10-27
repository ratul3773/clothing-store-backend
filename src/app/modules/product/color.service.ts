import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { CreateColorInput, UpdateColorInput } from "./product.interface";
import { ProductService } from "./product.service";
import { normalizeColorName } from "./product.utils";

const assertProductExists = async (productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }
};

const assertColourNameAvailable = async (
  productId: string,
  name: string,
  excludeId?: string,
) => {
  const existing = await prisma.productColor.findFirst({
    where: {
      productId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Colour "${name}" already exists for this product`,
    );
  }
};

const createColor = async (
  productId: string,
  input: CreateColorInput,
) => {
  await assertProductExists(productId);
  const name = normalizeColorName(input.name);
  await assertColourNameAvailable(productId, name);

  await prisma.productColor.create({
    data: {
      productId,
      name,
      hex: input.hex ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return ProductService.getAdminProduct(productId);
};

const updateColor = async (
  productId: string,
  colorId: string,
  input: UpdateColorInput,
) => {
  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: { id: true },
  });

  if (!color) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product colour not found");
  }

  const name =
    input.name !== undefined ? normalizeColorName(input.name) : undefined;

  if (name !== undefined) {
    await assertColourNameAvailable(productId, name, colorId);
  }

  await prisma.productColor.update({
    where: { id: colorId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.hex !== undefined ? { hex: input.hex } : {}),
      ...(input.sortOrder !== undefined
        ? { sortOrder: input.sortOrder }
        : {}),
    },
  });

  return ProductService.getAdminProduct(productId);
};

const deleteColor = async (productId: string, colorId: string) => {
  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: {
      id: true,
      _count: { select: { variants: true } },
    },
  });

  if (!color) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product colour not found");
  }

  if (color._count.variants > 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "Delete this colour's variants before deleting the colour",
    );
  }

  await prisma.$transaction([
    prisma.productImage.updateMany({
      where: { colorId },
      data: { colorId: null },
    }),
    prisma.productColor.delete({ where: { id: colorId } }),
  ]);

  return ProductService.getAdminProduct(productId);
};

export const ColorService = {
  createColor,
  updateColor,
  deleteColor,
};
