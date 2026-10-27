import { StorageProvider } from "../../../generated/prisma/enums";
import { publicUrlFor } from "../upload/storage";
import { ProductWithRelations } from "./product.select";

export type Offer = ProductWithRelations["offers"][number];
type Variant = ProductWithRelations["variants"][number];
type Image = ProductWithRelations["images"][number];
type Color = ProductWithRelations["colors"][number];

export type OfferState = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";

export type ProductOfferDto = {
  id: string;
  offerPrice: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  state: OfferState;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductImageDto = {
  id: string;
  url: string;
  alt: string | null;
  colorId: string | null;
  sortOrder: number;
  isPrimary: boolean;
  storageKey?: string;
  provider?: StorageProvider;
  createdAt: string;
};

export type PublicVariantDto = {
  id: string;
  colorId: string;
  colorName: string;
  colorHex: string | null;
  size: string;
  sizeOrder: number;
  inStock: boolean;
  lowStock: boolean;
};

export type AdminVariantDto = PublicVariantDto & {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicProductDto = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  description: string | null;
  material: string | null;
  fit: string | null;
  careInstructions: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  regularPrice: number;
  effectivePrice: number;
  hasOffer: boolean;
  discountPercentage: number;
  offer: {
    offerPrice: number;
    startsAt: string;
    endsAt: string | null;
  } | null;
  badges: ProductWithRelations["badges"];
  isExchangeEligible: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  images: ProductImageDto[];
  colors: Array<{
    id: string;
    name: string;
    hex: string | null;
    sortOrder: number;
  }>;
  variants: PublicVariantDto[];
  inStock: boolean;
  lowStock: boolean;
};

export type AdminProductDto = PublicProductDto & {
  status: ProductWithRelations["status"];
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: ProductWithRelations["createdBy"];
  updatedBy: ProductWithRelations["updatedBy"];
  variants: AdminVariantDto[];
  offers: ProductOfferDto[];
  images: ProductImageDto[];
  totalOnHand: number;
  totalReserved: number;
};

const offerState = (offer: Offer, now: Date): OfferState => {
  if (!offer.isActive) return "INACTIVE";
  if (offer.startsAt > now) return "SCHEDULED";
  if (offer.endsAt && offer.endsAt <= now) return "EXPIRED";
  return "ACTIVE";
};

const resolveActiveOffer = (
  offers: Offer[],
  regularPrice: number,
  now: Date,
): Offer | null => {
  return (
    offers
      .filter(
        (offer) =>
          offer.isActive &&
          offer.startsAt <= now &&
          (!offer.endsAt || offer.endsAt > now) &&
          offer.offerPrice < regularPrice,
      )
      .sort((a, b) => a.offerPrice - b.offerPrice)[0] ?? null
  );
};

export const mapOffer = (offer: Offer, now: Date): ProductOfferDto => ({
  id: offer.id,
  offerPrice: offer.offerPrice,
  startsAt: offer.startsAt.toISOString(),
  endsAt: offer.endsAt?.toISOString() ?? null,
  isActive: offer.isActive,
  state: offerState(offer, now),
  createdById: offer.createdById,
  createdAt: offer.createdAt.toISOString(),
  updatedAt: offer.updatedAt.toISOString(),
});

const mapImage = (image: Image, includeInternal = false): ProductImageDto => ({
  id: image.id,
  url: publicUrlFor(image.provider, image.storageKey),
  alt: image.alt,
  colorId: image.colorId,
  sortOrder: image.sortOrder,
  isPrimary: image.isPrimary,
  createdAt: image.createdAt.toISOString(),
  ...(includeInternal
    ? {
        storageKey: image.storageKey,
        provider: image.provider,
      }
    : {}),
});

const colorMap = (colors: Color[]) =>
  new Map(colors.map((color) => [color.id, color]));

const mapPublicVariant = (
  variant: Variant,
  colors: Map<string, Color>,
): PublicVariantDto => {
  const color = colors.get(variant.colorId);
  const available = variant.onHand - variant.reserved;
  const inStock = variant.isActive && available > 0;

  return {
    id: variant.id,
    colorId: variant.colorId,
    colorName: color?.name ?? "",
    colorHex: color?.hex ?? null,
    size: variant.size,
    sizeOrder: variant.sizeOrder,
    inStock,
    lowStock:
      variant.isActive && available > 0 && available <= variant.lowStockThreshold,
  };
};

const mapAdminVariant = (
  variant: Variant,
  colors: Map<string, Color>,
): AdminVariantDto => {
  const color = colors.get(variant.colorId);
  const available = variant.onHand - variant.reserved;

  return {
    id: variant.id,
    colorId: variant.colorId,
    colorName: color?.name ?? "",
    colorHex: color?.hex ?? null,
    size: variant.size,
    sizeOrder: variant.sizeOrder,
    sku: variant.sku,
    onHand: variant.onHand,
    reserved: variant.reserved,
    available,
    lowStockThreshold: variant.lowStockThreshold,
    isActive: variant.isActive,
    version: variant.version,
    inStock: variant.isActive && available > 0,
    lowStock:
      variant.isActive && available > 0 && available <= variant.lowStockThreshold,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
};

const mapPublicImages = (images: Image[]) =>
  images
    .map((image) => mapImage(image))
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
    );

const publicColors = (product: ProductWithRelations) => {
  const activeColorIds = new Set(
    product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => variant.colorId),
  );

  return product.colors
    .filter((color) => activeColorIds.has(color.id))
    .map((color) => ({
      id: color.id,
      name: color.name,
      hex: color.hex,
      sortOrder: color.sortOrder,
    }));
};

export const mapPublicProduct = (
  product: ProductWithRelations,
  now = new Date(),
): PublicProductDto => {
  const activeOffer = resolveActiveOffer(
    product.offers,
    product.regularPrice,
    now,
  );
  const colors = colorMap(product.colors);
  const activeVariants = product.variants.filter(
    (variant) => variant.isActive,
  );
  const variants = activeVariants.map((variant) =>
    mapPublicVariant(variant, colors),
  );
  const inStock = variants.some((variant) => variant.inStock);
  const lowStock = variants.some((variant) => variant.lowStock);
  const effectivePrice = activeOffer?.offerPrice ?? product.regularPrice;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    code: product.code,
    description: product.description,
    material: product.material,
    fit: product.fit,
    careInstructions: product.careInstructions,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    regularPrice: product.regularPrice,
    effectivePrice,
    hasOffer: Boolean(activeOffer),
    discountPercentage: activeOffer
      ? Math.round(
          ((product.regularPrice - effectivePrice) / product.regularPrice) *
            100,
        )
      : 0,
    offer: activeOffer
      ? {
          offerPrice: activeOffer.offerPrice,
          startsAt: activeOffer.startsAt.toISOString(),
          endsAt: activeOffer.endsAt?.toISOString() ?? null,
        }
      : null,
    badges: product.badges,
    isExchangeEligible: product.isExchangeEligible,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    images: mapPublicImages(product.images),
    colors: publicColors(product),
    variants,
    inStock,
    lowStock,
  };
};

export const mapAdminProduct = (
  product: ProductWithRelations,
  now = new Date(),
): AdminProductDto => {
  const publicDto = mapPublicProduct(product, now);
  const colors = colorMap(product.colors);
  const variants = product.variants.map((variant) =>
    mapAdminVariant(variant, colors),
  );

  return {
    ...publicDto,
    status: product.status,
    version: product.version,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    createdBy: product.createdBy,
    updatedBy: product.updatedBy,
    colors: product.colors.map((color) => ({
      id: color.id,
      name: color.name,
      hex: color.hex,
      sortOrder: color.sortOrder,
    })),
    variants,
    offers: product.offers.map((offer) => mapOffer(offer, now)),
    images: product.images.map((image) => mapImage(image, true)),
    totalOnHand: product.variants.reduce(
      (total, variant) => total + variant.onHand,
      0,
    ),
    totalReserved: product.variants.reduce(
      (total, variant) => total + variant.reserved,
      0,
    ),
  };
};
