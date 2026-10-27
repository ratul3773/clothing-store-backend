import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import { ProductStatus } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { CreateOfferInput, UpdateOfferInput } from "./product.interface";
import { mapOffer } from "./product.mapper";

const FAR_FUTURE = new Date("9999-12-31T23:59:59.999Z");

type LockedProduct = {
  id: string;
  regularPrice: number;
  status: ProductStatus;
};

const lockProduct = async (
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<LockedProduct> => {
  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, "regularPrice", status
    FROM "products"
    WHERE id = ${productId}
    FOR UPDATE
  `;

  const product = rows[0];

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  if (product.status === ProductStatus.ARCHIVED) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "Offers cannot be changed for archived products",
    );
  }

  return product;
};

const assertOfferPrice = (offerPrice: number, regularPrice: number) => {
  if (offerPrice >= regularPrice) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      "Offer price must be lower than the regular price",
    );
  }
};

const assertNoOverlap = async (
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    startsAt: Date;
    endsAt: Date | null;
    excludeOfferId?: string;
  },
) => {
  const overlap = await tx.productOffer.findFirst({
    where: {
      productId: input.productId,
      isActive: true,
      startsAt: { lt: input.endsAt ?? FAR_FUTURE },
      ...(input.excludeOfferId
        ? { id: { not: input.excludeOfferId } }
        : {}),
      OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }],
    },
    select: { id: true, startsAt: true, endsAt: true },
  });

  if (overlap) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "This offer overlaps an existing active offer for the product",
    );
  }
};

const createOffer = async (
  actorId: string,
  productId: string,
  input: CreateOfferInput,
) => {
  return prisma.$transaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    assertOfferPrice(input.offerPrice, product.regularPrice);

    const startsAt = input.startsAt ?? new Date();
    const endsAt = input.endsAt ?? null;

    if (endsAt && endsAt <= startsAt) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "endsAt must be after startsAt",
      );
    }

    if (input.isActive ?? true) {
      await assertNoOverlap(tx, {
        productId,
        startsAt,
        endsAt,
      });
    }

    const offer = await tx.productOffer.create({
      data: {
        productId,
        offerPrice: input.offerPrice,
        startsAt,
        endsAt,
        isActive: input.isActive ?? true,
        createdById: actorId,
      },
    });

    return mapOffer(offer, new Date());
  });
};

const updateOffer = async (
  productId: string,
  offerId: string,
  input: UpdateOfferInput,
) => {
  return prisma.$transaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    const current = await tx.productOffer.findFirst({
      where: { id: offerId, product },
    });

    if (!current) {
      throw new ApiError(httpStatus.NOT_FOUND, "Offer not found");
    }

    const offerPrice = input.offerPrice ?? current.offerPrice;
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt =
      input.endsAt === undefined ? current.endsAt : input.endsAt;
    const isActive = input.isActive ?? current.isActive;

    assertOfferPrice(offerPrice, product.regularPrice);

    if (endsAt && endsAt <= startsAt) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "endsAt must be after startsAt",
      );
    }

    if (isActive) {
      await assertNoOverlap(tx, {
        productId,
        startsAt,
        endsAt,
        excludeOfferId: offerId,
      });
    }

    const offer = await tx.productOffer.update({
      where: { id: offerId },
      data: {
        offerPrice,
        startsAt,
        endsAt,
        isActive,
      },
    });

    return mapOffer(offer, new Date());
  });
};

const deactivateOffer = async (productId: string, offerId: string) => {
  const offer = await prisma.productOffer.findFirst({
    where: { id: offerId, productId },
  });

  if (!offer) {
    throw new ApiError(httpStatus.NOT_FOUND, "Offer not found");
  }

  const updated = await prisma.productOffer.update({
    where: { id: offerId },
    data: { isActive: false },
  });

  return mapOffer(updated, new Date());
};

export const OfferService = {
  createOffer,
  updateOffer,
  deactivateOffer,
};
