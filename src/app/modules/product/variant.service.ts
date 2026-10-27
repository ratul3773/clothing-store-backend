import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import {
  ActorType,
  StockMovementType,
} from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import {
  buildPaginationMeta,
  getPagination,
} from "../../../utils/pagination";
import { buildUniqueSku } from "../../../utils/sku";
import {
  CreateVariantInput,
  StockAdjustmentInput,
  UpdateVariantInput,
} from "./product.interface";
import { ProductService } from "./product.service";
import {
  normalizeOptionalText,
  normalizeSize,
} from "./product.utils";

const getVariantContext = async (productId: string, variantId: string) => {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, productId },
    include: {
      color: { select: { id: true, name: true } },
      product: {
        select: {
          id: true,
          slug: true,
          code: true,
          status: true,
        },
      },
      _count: { select: { movements: true } },
    },
  });

  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
  }

  return variant;
};

const resolveSku = async (
  db: Prisma.TransactionClient,
  input: {
    productCode: string;
    color: string;
    size: string;
    excludeId?: string;
  },
) => {
  return buildUniqueSku(
    {
      productCode: input.productCode,
      color: input.color,
      size: input.size,
    },
    async (sku) => {
      const existing = await db.variant.findUnique({
        where: { sku },
        select: { id: true },
      });
      return Boolean(existing && existing.id !== input.excludeId);
    },
  );
};

const assertSizeAvailable = async (
  db: Prisma.TransactionClient,
  productId: string,
  colorId: string,
  size: string,
  excludeId?: string,
) => {
  const existing = await db.variant.findFirst({
    where: {
      productId,
      colorId,
      size: { equals: size, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "A variant with this colour and size already exists",
    );
  }
};

const createVariant = async (
  actorId: string,
  productId: string,
  input: CreateVariantInput,
) => {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true },
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (!product.code) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Product code is required to generate variant SKUs",
      );
    }

    const color = await tx.productColor.findFirst({
      where: { id: input.colorId, productId },
      select: { id: true, name: true },
    });

    if (!color) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Colour does not belong to this product",
      );
    }

    const size = normalizeSize(input.size);
    await assertSizeAvailable(tx, productId, color.id, size);

    const sku = await resolveSku(tx, {
      productCode: product.code,
      color: color.name,
      size,
    });

    const onHand = input.onHand ?? 0;
    const variant = await tx.variant.create({
      data: {
        productId,
        colorId: color.id,
        size,
        sizeOrder: input.sizeOrder ?? 0,
        sku,
        onHand,
        lowStockThreshold: input.lowStockThreshold ?? 3,
        isActive: input.isActive ?? true,
      },
    });

    if (onHand > 0) {
      await tx.stockMovement.create({
        data: {
          variantId: variant.id,
          type: StockMovementType.RESTOCK,
          onHandDelta: onHand,
          onHandAfter: onHand,
          reservedAfter: 0,
          refType: "MANUAL",
          refId: variant.id,
          note: "Initial stock",
          actorType: ActorType.ADMIN,
          actorId,
        },
      });
    }
  });

  return ProductService.getAdminProduct(productId);
};

const updateVariant = async (
  actorId: string,
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
) => {
  await prisma.$transaction(async (tx) => {
    const variant = await tx.variant.findFirst({
      where: { id: variantId, productId },
      select: {
        id: true,
        colorId: true,
        size: true,
        version: true,
        product: { select: { code: true } },
        color: { select: { name: true } },
      },
    });

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    const data: Prisma.VariantUncheckedUpdateManyInput = {
      version: { increment: 1 },
    };
    if (input.size !== undefined) {
      const size = normalizeSize(input.size);

      if (size !== variant.size) {
        if (!variant.product.code) {
          throw new ApiError(
            httpStatus.UNPROCESSABLE_ENTITY,
            "Product code is required to generate variant SKUs",
          );
        }

        await assertSizeAvailable(
          tx,
          productId,
          variant.colorId,
          size,
          variantId,
        );
        data.size = size;
        data.sku = await resolveSku(tx, {
          productCode: variant.product.code,
          color: variant.color.name,
          size,
          excludeId: variantId,
        });
      }
    }

    if (input.sizeOrder !== undefined) data.sizeOrder = input.sizeOrder;
    if (input.lowStockThreshold !== undefined) {
      data.lowStockThreshold = input.lowStockThreshold;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const result = await tx.variant.updateMany({
      where: { id: variantId, productId, version: input.version },
      data,
    });

    if (result.count === 0) {
      const exists = await tx.variant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!exists) {
        throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
      }

      throw new ApiError(
        httpStatus.CONFLICT,
        "Variant was modified by another request. Reload and try again.",
      );
    }

    void actorId;
  });

  return ProductService.getAdminProduct(productId);
};

const deleteVariant = async (productId: string, variantId: string) => {
  await prisma.$transaction(async (tx) => {
    const variant = await tx.variant.findFirst({
      where: { id: variantId, productId },
      select: {
        id: true,
        reserved: true,
        _count: { select: { movements: true } },
      },
    });

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    if (variant.reserved > 0) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "This variant has reserved stock and cannot be deleted",
      );
    }

    if (variant._count.movements > 0) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "This variant has stock history; deactivate it instead of deleting it",
      );
    }

    await tx.variant.delete({ where: { id: variantId } });
  });

  return ProductService.getAdminProduct(productId);
};

const adjustStock = async (
  actorId: string,
  productId: string,
  variantId: string,
  input: StockAdjustmentInput,
) => {
  const movement = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        onHand: number;
        reserved: number;
        version: number;
      }>
    >`
      SELECT id, "onHand", reserved, version
      FROM "variants"
      WHERE id = ${variantId} AND "productId" = ${productId}
      FOR UPDATE
    `;

    const variant = rows[0];

    if (!variant) {
      throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
    }

    let delta = 0;

    switch (input.type) {
      case "STOCKTAKE":
        delta = input.onHand! - variant.onHand;
        break;
      case "RESTOCK":
        delta = input.quantity!;
        break;
      case "DAMAGED":
        delta = -input.quantity!;
        break;
      case "ADJUSTMENT":
        delta = input.quantity!;
        break;
    }

    const onHandAfter = variant.onHand + delta;

    if (onHandAfter < 0) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Stock cannot be reduced below zero",
      );
    }

    if (onHandAfter < variant.reserved) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Stock cannot be reduced below the reserved quantity",
      );
    }

    await tx.variant.update({
      where: { id: variantId },
      data: {
        onHand: onHandAfter,
        version: { increment: 1 },
      },
    });

    return tx.stockMovement.create({
      data: {
        variantId,
        type: input.type as StockMovementType,
        onHandDelta: delta,
        onHandAfter,
        reservedAfter: variant.reserved,
        refType: input.type === "STOCKTAKE" ? "STOCKTAKE" : "MANUAL",
        refId: variantId,
        note: normalizeOptionalText(input.note) ?? null,
        actorType: ActorType.ADMIN,
        actorId,
      },
    });
  });

  return {
    product: await ProductService.getAdminProduct(productId),
    movement: {
      id: movement.id.toString(),
      type: movement.type,
      onHandDelta: movement.onHandDelta,
      onHandAfter: movement.onHandAfter,
      note: movement.note,
      createdAt: movement.createdAt.toISOString(),
    },
  };
};

const listStockMovements = async (
  productId: string,
  variantId: string,
  query: { page?: number; limit?: number },
) => {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, productId },
    select: { id: true },
  });

  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, "Variant not found");
  }

  const { page, limit, skip, take } = getPagination(query);
  const where = { variantId };

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    data: movements.map((movement) => ({
      id: movement.id.toString(),
      type: movement.type,
      onHandDelta: movement.onHandDelta,
      reservedDelta: movement.reservedDelta,
      onHandAfter: movement.onHandAfter,
      reservedAfter: movement.reservedAfter,
      refType: movement.refType,
      refId: movement.refId,
      note: movement.note,
      actorType: movement.actorType,
      actorId: movement.actorId,
      createdAt: movement.createdAt.toISOString(),
    })),
    meta: buildPaginationMeta(total, page, limit),
  };
};

export const VariantService = {
  createVariant,
  updateVariant,
  deleteVariant,
  adjustStock,
  listStockMovements,
};
