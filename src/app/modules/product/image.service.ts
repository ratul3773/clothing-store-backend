import httpStatus from "http-status";
import config from "../../../config/env";
import { StorageProvider } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { buildStorageKey } from "../upload/local.storage";
import { activeImageStorage, storageForProvider } from "../upload/storage";
import { UpdateImageInput } from "./product.interface";
import { ProductService } from "./product.service";

type ImageFile = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  sizeBytes: number;
};

const assertProductExists = async (productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }
};

const uploadProductImage = async (
  productId: string,
  image: ImageFile,
) => {
  await assertProductExists(productId);

  const count = await prisma.productImage.count({
    where: { productId },
  });

  if (count >= config.storage.max_images_per_product) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      `A product can have at most ${config.storage.max_images_per_product} images`,
    );
  }

  const key = buildStorageKey(`products/${productId}`, image.extension);
  const uploaded = await activeImageStorage.upload({
    key,
    buffer: image.buffer,
    contentType: image.contentType,
  });

  try {
    const last = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    await prisma.productImage.create({
      data: {
        productId,
        storageKey: uploaded.key,
        provider: uploaded.provider,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        isPrimary: count === 0,
        sizeBytes: image.sizeBytes,
      },
    });
  } catch (error) {
    try {
      await activeImageStorage.delete(uploaded.key);
    } catch (cleanupError) {
      console.error(
        "[STORAGE] Failed to clean up product image:",
        cleanupError,
      );
    }

    throw error;
  }

  return ProductService.getAdminProduct(productId);
};

const assertColorBelongsToProduct = async (
  productId: string,
  colorId: string,
) => {
  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: { id: true },
  });

  if (!color) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Colour does not belong to this product",
    );
  }
};

const updateProductImage = async (
  productId: string,
  imageId: string,
  input: UpdateImageInput,
) => {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId, productId },
    select: { id: true },
  });

  if (!image) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product image not found");
  }

  if (input.colorId) {
    await assertColorBelongsToProduct(productId, input.colorId);
  }

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId, id: { not: imageId }, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await tx.productImage.update({
      where: { id: imageId },
      data: {
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.colorId !== undefined ? { colorId: input.colorId } : {}),
        ...(input.isPrimary !== undefined
          ? { isPrimary: input.isPrimary }
          : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
    });
  });

  return ProductService.getAdminProduct(productId);
};

const deleteProductImage = async (productId: string, imageId: string) => {
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
  });

  if (!image) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product image not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });

      if (next) {
        await tx.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  try {
    await storageForProvider(image.provider as StorageProvider).delete(
      image.storageKey,
    );
  } catch (error) {
    console.error("[STORAGE] Failed to delete product image:", error);
  }

  return ProductService.getAdminProduct(productId);
};

const reorderProductImages = async (
  productId: string,
  imageIds: string[],
) => {
  await assertProductExists(productId);

  const images = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true },
  });

  const existingIds = new Set(images.map((image) => image.id));
  const requestedIds = new Set(imageIds);

  if (
    existingIds.size !== requestedIds.size ||
    [...existingIds].some((id) => !requestedIds.has(id))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "imageIds must contain every image for this product exactly once",
    );
  }

  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.productImage.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return ProductService.getAdminProduct(productId);
};

export const ImageService = {
  uploadProductImage,
  updateProductImage,
  deleteProductImage,
  reorderProductImages,
};
