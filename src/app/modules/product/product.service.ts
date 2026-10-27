import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import {
  ActorType,
  ProductBadge,
  ProductStatus,
  StorageProvider,
} from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { buildUniqueSlug } from "../../../utils/slug";
import { buildUniqueSku } from "../../../utils/sku";
import { storageForProvider } from "../upload/storage";
import { mapAdminProduct } from "./product.mapper";
import { productRelationsInclude } from "./product.select";
import {
  CreateProductInput,
  UpdateProductInput,
} from "./product.interface";
import {
  normalizeColorName,
  normalizeOptionalText,
  normalizeProductCode,
  normalizeSize,
} from "./product.utils";

const findAdminProduct = async (
  db: Prisma.TransactionClient,
  id: string,
) => {
  const product = await db.product.findUnique({
    where: { id },
    include: productRelationsInclude,
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  return product;
};

const assertCategoryExists = async (
  db: Prisma.TransactionClient,
  categoryId: string,
  requireActive: boolean,
) => {
  let current: {
    id: string;
    parentId: string | null;
    isActive: boolean;
  } | null = await db.category.findUnique({
    where: { id: categoryId },
    select: { id: true, parentId: true, isActive: true },
  });

  if (!current) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Product category not found",
    );
  }

  if (requireActive && !current.isActive) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      "Product category must be active",
    );
  }

  let parentId = current.parentId;

  while (parentId) {
    const parent: {
      id: string;
      parentId: string | null;
      isActive: boolean;
    } | null = await db.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, isActive: true },
    });

    if (!parent) break;

    if (requireActive && !parent.isActive) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Product category must be active",
      );
    }

    parentId = parent.parentId;
    current = parent;
  }
};

const resolveSlug = async (
  db: Prisma.TransactionClient,
  name: string,
) => {
  return buildUniqueSlug(name, async (slug) => {
    const existing = await db.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    return Boolean(existing);
  });
};

const assertCodeAvailable = async (
  db: Prisma.TransactionClient,
  code: string,
  excludeId?: string,
) => {
  const existing = await db.product.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing && existing.id !== excludeId) {
    throw new ApiError(httpStatus.CONFLICT, "Product code already exists");
  }
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

const regenerateProductSkus = async (
  db: Prisma.TransactionClient,
  productId: string,
  productCode: string,
) => {
  const variants = await db.variant.findMany({
    where: { productId },
    select: {
      id: true,
      sku: true,
      size: true,
      color: { select: { name: true } },
    },
  });

  for (const variant of variants) {
    const sku = await resolveSku(db, {
      productCode,
      color: variant.color.name,
      size: variant.size,
      excludeId: variant.id,
    });

    if (sku === variant.sku) continue;

    await db.variant.update({
      where: { id: variant.id },
      data: { sku, version: { increment: 1 } },
    });
  }
};

const createProduct = async (
  actorId: string,
  input: CreateProductInput,
) => {
  return prisma.$transaction(async (tx) => {
    await assertCategoryExists(tx, input.categoryId, false);

    const code = normalizeProductCode(input.code);
    await assertCodeAvailable(tx, code);
    const slug = await resolveSlug(tx, input.name);

    const product = await tx.product.create({
      data: {
        name: input.name,
        slug,
        code,
        description: normalizeOptionalText(input.description) ?? null,
        material: normalizeOptionalText(input.material) ?? null,
        fit: input.fit ?? null,
        careInstructions:
          normalizeOptionalText(input.careInstructions) ?? null,
        categoryId: input.categoryId,
        regularPrice: input.regularPrice,
        badges: (input.badges ?? []) as ProductBadge[],
        isExchangeEligible: input.isExchangeEligible ?? true,
        seoTitle: normalizeOptionalText(input.seoTitle) ?? null,
        seoDescription: normalizeOptionalText(input.seoDescription) ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const colorInputs = input.colors ?? [];
    const colorNames = new Set<string>();
    const colorsByName = new Map<
      string,
      { id: string; name: string; hex: string | null }
    >();

    for (let index = 0; index < colorInputs.length; index += 1) {
      const colorInput = colorInputs[index]!;
      const name = normalizeColorName(colorInput.name);
      const key = name.toLowerCase();

      if (colorNames.has(key)) {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Duplicate colour "${name}"`,
        );
      }

      colorNames.add(key);

      const color = await tx.productColor.create({
        data: {
          productId: product.id,
          name,
          hex: colorInput.hex ?? null,
          sortOrder: colorInput.sortOrder ?? index,
        },
      });

      colorsByName.set(key, {
        id: color.id,
        name: color.name,
        hex: color.hex,
      });
    }

    const variantInputs = input.variants ?? [];
    const variantKeys = new Set<string>();
    const skuSet = new Set<string>();

    for (const variantInput of variantInputs) {
      const colorKey = normalizeColorName(variantInput.colorName).toLowerCase();
      const color = colorsByName.get(colorKey);

      if (!color) {
        throw new ApiError(
          httpStatus.UNPROCESSABLE_ENTITY,
          `Variant colour "${variantInput.colorName}" is not defined for this product`,
        );
      }

      const size = normalizeSize(variantInput.size);
      const variantKey = `${color.id}:${size.toLowerCase()}`;

      if (variantKeys.has(variantKey)) {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Duplicate variant for ${color.name} / ${size}`,
        );
      }

      variantKeys.add(variantKey);

      const sku = await resolveSku(tx, {
        productCode: code,
        color: color.name,
        size,
      });

      if (skuSet.has(sku)) {
        throw new ApiError(httpStatus.CONFLICT, "Duplicate SKU in request");
      }
      skuSet.add(sku);

      const onHand = variantInput.onHand ?? 0;
      const variant = await tx.variant.create({
        data: {
          productId: product.id,
          colorId: color.id,
          size,
          sizeOrder: variantInput.sizeOrder ?? 0,
          sku,
          onHand,
          lowStockThreshold: variantInput.lowStockThreshold ?? 3,
          isActive: variantInput.isActive ?? true,
        },
      });

      if (onHand > 0) {
        await tx.stockMovement.create({
          data: {
            variantId: variant.id,
            type: "RESTOCK",
            onHandDelta: onHand,
            onHandAfter: onHand,
            reservedAfter: 0,
            refType: "PRODUCT_CREATE",
            refId: product.id,
            note: "Initial stock",
            actorType: ActorType.ADMIN,
            actorId,
          },
        });
      }
    }

    const created = await findAdminProduct(tx, product.id);
    return mapAdminProduct(created);
  });
};

const updateProduct = async (
  actorId: string,
  id: string,
  input: UpdateProductInput,
) => {
  return prisma.$transaction(async (tx) => {
    const current = await findAdminProduct(tx, id);

    if (input.categoryId !== undefined) {
      await assertCategoryExists(tx, input.categoryId, false);
    }

    const code =
      input.code === undefined
        ? undefined
        : normalizeProductCode(input.code);

    if (code !== undefined) {
      await assertCodeAvailable(tx, code, id);
    }

    if (input.regularPrice !== undefined) {
      const conflictingOffer = current.offers.find(
        (offer) =>
          offer.isActive &&
          (!offer.endsAt || offer.endsAt > new Date()) &&
          offer.offerPrice >= input.regularPrice!,
      );

      if (conflictingOffer) {
        throw new ApiError(
          httpStatus.CONFLICT,
          "Regular price must be greater than all active or scheduled offer prices",
        );
      }
    }

    const data: Prisma.ProductUncheckedUpdateManyInput = {
      updatedById: actorId,
      version: { increment: 1 },
    };

    if (input.name !== undefined) data.name = input.name;
    if (code !== undefined) data.code = code;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.regularPrice !== undefined) data.regularPrice = input.regularPrice;
    if (input.fit !== undefined) data.fit = input.fit;
    if (input.isExchangeEligible !== undefined) {
      data.isExchangeEligible = input.isExchangeEligible;
    }
    if (input.badges !== undefined) {
      data.badges = input.badges as ProductBadge[];
    }

    const nullableFields = [
      "description",
      "material",
      "careInstructions",
      "seoTitle",
      "seoDescription",
    ] as const;

    for (const field of nullableFields) {
      if (input[field] !== undefined) {
        data[field] = normalizeOptionalText(input[field]) ?? null;
      }
    }

    const result = await tx.product.updateMany({
      where: { id, version: input.version },
      data,
    });

    if (result.count === 0) {
      const exists = await tx.product.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!exists) {
        throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
      }

      throw new ApiError(
        httpStatus.CONFLICT,
        "Product was modified by another request. Reload and try again.",
      );
    }

    if (code !== undefined && code !== current.code) {
      await regenerateProductSkus(tx, id, code);
    }

    const updated = await findAdminProduct(tx, id);
    return mapAdminProduct(updated);
  });
};

const publishProduct = async (actorId: string, id: string) => {
  return prisma.$transaction(async (tx) => {
    const product = await findAdminProduct(tx, id);

    if (product.status === ProductStatus.ARCHIVED) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Restore the product before publishing it",
      );
    }

    if (product.status === ProductStatus.ACTIVE) {
      throw new ApiError(httpStatus.CONFLICT, "Product is already published");
    }

    await assertCategoryExists(tx, product.categoryId, true);

    const activeColors = product.colors.length;
    const activeVariants = product.variants.filter(
      (variant) => variant.isActive,
    );

    if (activeColors === 0 || activeVariants.length === 0) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Add at least one active colour and variant before publishing",
      );
    }

    if (product.images.length === 0) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Add at least one image before publishing",
      );
    }

    const invalidSku = activeVariants.some(
      (variant) => !variant.sku || variant.sku.trim().length === 0,
    );

    if (invalidSku) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Every active variant must have a SKU",
      );
    }

    await tx.product.update({
      where: { id },
      data: {
        status: ProductStatus.ACTIVE,
        publishedAt: product.publishedAt ?? new Date(),
        archivedAt: null,
        updatedById: actorId,
        version: { increment: 1 },
      },
    });

    const updated = await findAdminProduct(tx, id);
    return mapAdminProduct(updated);
  });
};

const unpublishProduct = async (actorId: string, id: string) => {
  return prisma.$transaction(async (tx) => {
    const product = await findAdminProduct(tx, id);

    if (product.status !== ProductStatus.ACTIVE) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Only published products can be unpublished",
      );
    }

    await tx.product.update({
      where: { id },
      data: {
        status: ProductStatus.DRAFT,
        publishedAt: null,
        updatedById: actorId,
        version: { increment: 1 },
      },
    });

    const updated = await findAdminProduct(tx, id);
    return mapAdminProduct(updated);
  });
};

const archiveProduct = async (actorId: string, id: string) => {
  return prisma.$transaction(async (tx) => {
    const product = await findAdminProduct(tx, id);

    if (product.status === ProductStatus.ARCHIVED) {
      throw new ApiError(httpStatus.CONFLICT, "Product is already archived");
    }

    await tx.product.update({
      where: { id },
      data: {
        status: ProductStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: actorId,
        version: { increment: 1 },
      },
    });

    const updated = await findAdminProduct(tx, id);
    return mapAdminProduct(updated);
  });
};

const restoreProduct = async (actorId: string, id: string) => {
  return prisma.$transaction(async (tx) => {
    const product = await findAdminProduct(tx, id);

    if (product.status !== ProductStatus.ARCHIVED) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Only archived products can be restored",
      );
    }

    await tx.product.update({
      where: { id },
      data: {
        status: ProductStatus.DRAFT,
        archivedAt: null,
        updatedById: actorId,
        version: { increment: 1 },
      },
    });

    const updated = await findAdminProduct(tx, id);
    return mapAdminProduct(updated);
  });
};

const deleteProduct = async (id: string) => {
  const images = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        images: {
          select: { storageKey: true, provider: true },
        },
        variants: {
          select: {
            id: true,
            reserved: true,
            _count: {
              select: { movements: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.status !== ProductStatus.DRAFT) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Only draft products can be permanently deleted; archive this product instead",
      );
    }

    const hasHistory = product.variants.some(
      (variant) =>
        variant.reserved > 0 || variant._count.movements > 0,
    );

    if (hasHistory) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "This product has stock history and can only be archived",
      );
    }

    await tx.variant.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });

    return product.images;
  });

  for (const image of images) {
    try {
      await storageForProvider(image.provider as StorageProvider).delete(
        image.storageKey,
      );
    } catch (error) {
      console.error("[STORAGE] Failed to delete product image:", error);
    }
  }

  return { deleted: true };
};

const getAdminProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productRelationsInclude,
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  return mapAdminProduct(product);
};

export const ProductService = {
  createProduct,
  updateProduct,
  publishProduct,
  unpublishProduct,
  archiveProduct,
  restoreProduct,
  deleteProduct,
  getAdminProduct,
};
