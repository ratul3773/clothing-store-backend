import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import {
  paginationHelpers,
  type TPaginationOptions,
} from "../../../helpers/paginationHelper";
import { buildPaginationMeta } from "../../../utils/pagination";
import {
  getPublicCategoryIds,
  isVariantPublic,
} from "../product/catalog.rules";
import { getPublicCategoryIdsCached } from "../product/public-category.cache";
import {
  isComboPublic,
  lockCombo,
  resolveComboSelections,
  comboSelectionKey,
} from "../combo/combo.rules";
import { comboAvailabilitySelect } from "../combo/combo.select";
import { CART_LINE_LIMIT, CART_QUANTITY_STORAGE_MAX } from "./cart.constants";
import type {
  AddCartItemInput,
  AddCartComboInput,
  CartOwner,
  UpdateCartItemInput,
  CartDto,
} from "./cart.interface";
import { mapCart } from "./cart.mapper";
import {
  hydrateCart,
  // loadDemandLines,
  loadStockDemand,
  pageCartIds,
  orderedCartIds,
  remainingCapacity,
  type DemandLine,
  hydrateCartFromSnapshot,
  buildDemandLines,
} from "./cart.lines";

import { performance } from "node:perf_hooks";
import { loadCartSnapshot } from "./cart.snapshot";
import { variantAvailabilitySelect } from "./cart.select";
import {
  lockCustomer,
  lockGuest,
  normalizeOwner,
  ownerWhere,
} from "./cart.repository";

const mutationSelect = {
  id: true,
  version: true,
  items: { select: { id: true, variantId: true, quantity: true } },
  combos: {
    select: { id: true, comboId: true, selectionKey: true, quantity: true },
  },
} satisfies Prisma.CartSelect;
type MutationCart = Prisma.CartGetPayload<{ select: typeof mutationSelect }>;

const getCart = async (
  owner: CartOwner | string,
  pagination: TPaginationOptions = {},
) => {
  const resolved = normalizeOwner(owner);
  const options = paginationHelpers.calculatePagination(pagination);

  if (resolved.kind === "none") {
    return {
      data: {
        ...mapCart(null, new Set(), new Date()),
        selectionItems: [],
      },
      meta: buildPaginationMeta(0, 1, options.limit),
    };
  }

  return prisma.$transaction(
    async (tx) => {
      const header = await tx.cart.findFirst({
        where: ownerWhere(resolved),
        select: {
          id: true,
          version: true,
        },
      });

      // Reuse the existing readCart implementation.
      const cart = await readCart(tx, header?.id ?? null);

      const total = cart.distinctItemCount;

      const page = Math.min(
        options.page,
        Math.max(1, Math.ceil(total / options.limit)),
      );

      const { skip, limit } =
        paginationHelpers.calculatePagination({
          page,
          limit: options.limit,
        });

      return {
        data: {
          ...cart,
          items: cart.items.slice(skip, skip + limit),
        },
        meta: buildPaginationMeta(total, page, limit),
      };
    },
    {
      isolationLevel: "RepeatableRead",
    },
  );
};

const assertQuantity = (quantity: number) => {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > CART_QUANTITY_STORAGE_MAX
  )
    throw new ApiError(
      422,
      `Quantity must be an integer from 1 to ${CART_QUANTITY_STORAGE_MAX}`,
    );
};
const assertLineLimit = (cart: MutationCart | null, existing: unknown) => {
  if (
    !existing &&
    cart &&
    cart.items.length + cart.combos.length >= CART_LINE_LIMIT
  )
    throw new ApiError(
      422,
      `Your cart can contain at most ${CART_LINE_LIMIT} lines. Remove an item before adding another.`,
    );
};

const ensureCart = async (
  tx: Prisma.TransactionClient,
  cart: MutationCart | null,
  owner: CartOwner,
) => {
  if (cart) return cart.id;
  if (owner.kind === "user") {
    const customer = await tx.customer.upsert({
      where: { userId: owner.userId },
      create: { userId: owner.userId },
      update: {},
    });
    return (await tx.cart.create({ data: { customerId: customer.id } })).id;
  }
  if (owner.kind === "newGuest")
    return (await tx.cart.create({ data: { guestTokenHash: owner.tokenHash } }))
      .id;
  throw new ApiError(409, "Reload your cart before adding items");
};

const MAX_CART_READ_ATTEMPTS = 3;

const readCart = async (
  db: Prisma.TransactionClient,
  cartId: string | null,
): Promise<CartDto> => {
  const publicIds = cartId
    ? await getPublicCategoryIdsCached()
    : new Set<string>();

  for (
    let attempt = 1;
    attempt <= MAX_CART_READ_ATTEMPTS;
    attempt++
  ) {
    const header = cartId
      ? await db.cart.findUnique({
          where: { id: cartId },
          select: {
            id: true,
            version: true,
          },
        })
      : null;

    const now = new Date();

    const snapshot = header
      ? await loadCartSnapshot(db, header.id)
      : { items: [], combos: [] };
    const lines = buildDemandLines(
      snapshot,
      publicIds,
      now,
    );
    const result = hydrateCartFromSnapshot(
      header,
      snapshot,
      lines,
      publicIds,
      now,
      orderedCartIds(lines),
    );
    if (!header) return result;

    const latest = await db.cart.findUnique({
      where: { id: header.id },
      select: { version: true },
    });

    if (latest?.version === header.version) {
      return result;
    }
  }

  throw new ApiError(
    409,
    "Cart changed while loading. Please reload your cart.",
  );
};

const measure = async <T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const start = performance.now();

  try {
    return await operation();
  } finally {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[CART] ${label}: ${(performance.now() - start).toFixed(2)}ms`,
      );
    }
  }
};

const mutate = async (
  inputOwner: CartOwner | string,
  version: number,
  action: (
    tx: Prisma.TransactionClient,
    cart: MutationCart | null,
    owner: CartOwner,
  ) => Promise<string | null>,
) => {
  const header = await measure("mutation transaction", () =>
    retryCartTransaction(async () =>
      prisma.$transaction(
        async (tx) => {
          const owner = normalizeOwner(inputOwner);

          if (owner.kind === "user") {
            await lockCustomer(tx, owner.userId);
          }

          if (owner.kind === "newGuest") {
            await tx.$queryRaw<{ locked: string }[]>`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${owner.tokenHash}, 0)
              )::text AS locked
            `;
          }

          if (
            owner.kind === "guest" &&
            !(await lockGuest(tx, owner.cartId, owner.tokenHash))
          ) {
            throw new ApiError(
              409,
              "Guest cart expired or changed. Reload your cart.",
            );
          }

          const where =
            owner.kind === "newGuest"
              ? {
                  guestTokenHash: owner.tokenHash,
                  customerId: null,
                }
              : ownerWhere(owner);

          let cart = await tx.cart.findFirst({
            where,
            select: mutationSelect,
          });

          if (owner.kind === "newGuest" && cart?.version === version) {
            if (!(await lockGuest(tx, cart.id, owner.tokenHash))) {
              throw new ApiError(
                409,
                "Guest cart expired or changed. Reload your cart.",
              );
            }

            cart = await tx.cart.findFirst({
              where,
              select: mutationSelect,
            });
          }

          if ((cart?.version ?? 0) !== version) {
            throw new ApiError(
              409,
              "Cart was modified by another request. Reload your cart and try again.",
            );
          }

          const cartId = await action(tx, cart, owner);

          return cartId
            ? tx.cart.update({
                where: { id: cartId },
                data: {
                  version: { increment: 1 },
                },
                select: {
                  id: true,
                  version: true,
                },
              })
            : null;
        },
        {
          isolationLevel: "ReadCommitted",
        },
      ),
    ),
  );

  // Keep the existing API response contract.
  // Never retry the committed mutation if this read fails.
  return measure("readCart", () => readCart(prisma, header?.id ?? null));
};

// Retry only failed writes. Owner locks precede all version/line/stock checks.
const retryCartTransaction = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const adapter =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (error.meta?.driverAdapterError as
              | { cause?: { originalCode?: unknown; kind?: unknown } }
              | undefined)
          : undefined;
      const serializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2010" &&
        ([error.meta?.code, adapter?.cause?.originalCode].some(
          (code) => code === "40001" || code === "40P01",
        ) ||
          adapter?.cause?.kind === "TransactionWriteConflict");
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          serializationFailure ||
          // A snapshot taken before an owner-lock waiter resumes may not see a
          // cart or configuration inserted by the preceding writer. Roll back
          // and recheck its version in a fresh snapshot instead of leaking P2002.
          (error.code === "P2002" &&
            ["Cart", "Customer", "CartItem", "CartCombo"].includes(
              String(error.meta?.modelName),
            )));
      if (!retryable) throw error;
      if (attempt >= 2)
        throw new ApiError(
          409,
          "Cart or catalogue changed concurrently. Reload your cart and try again.",
        );
    }
  }
};

const assertStock = async (
  tx: Prisma.TransactionClient,
  cart: MutationCart | null,
  components: DemandLine["components"],
  quantity: number,
  exclude?: string,
) => {
  const demand = await loadStockDemand(tx, cart, exclude);
  if (quantity > remainingCapacity(components, demand))
    throw new ApiError(
      409,
      "Requested quantity exceeds available stock across cart items and combos",
    );
};

const addItem = async (owner: CartOwner | string, input: AddCartItemInput) => {
  assertQuantity(input.quantity);
  // Resolve before acquiring cart locks.
  const publicIds = await getPublicCategoryIdsCached();

  return mutate(owner, input.version, async (tx, cart, resolved) => {
    const existing = cart?.items.find(
      (item) => item.variantId === input.variantId,
    );

    assertLineLimit(cart, existing);

    const quantity = (existing?.quantity ?? 0) + input.quantity;
    assertQuantity(quantity);

    const variant = await tx.variant.findUnique({
      where: { id: input.variantId },
      select: variantAvailabilitySelect,
    });

    const now = new Date();

    if (!variant || !isVariantPublic(variant, publicIds, now)) {
      throw new ApiError(404, "Variant is not available");
    }

    await assertStock(
      tx,
      cart,
      [{ variantId: variant.id, quantity: 1, variant }],
      quantity,
      existing?.id,
    );

    const cartId = await ensureCart(tx, cart, resolved);

    await tx.cartItem.upsert({
      where: {
        cartId_variantId: {
          cartId,
          variantId: variant.id,
        },
      },
      create: {
        cartId,
        variantId: variant.id,
        quantity,
      },
      update: { quantity },
    });

    return cartId;
  });
};

const addCombo = async (
  owner: CartOwner | string,
  input: AddCartComboInput,
) => {
  assertQuantity(input.quantity);
  return mutate(owner, input.version, async (tx, cart, resolved) => {
    const selectionKey = comboSelectionKey(input.selections);
    const existing = cart?.combos.find(
      (item) =>
        item.comboId === input.comboId && item.selectionKey === selectionKey,
    );
    assertLineLimit(cart, existing);
    const quantity = (existing?.quantity ?? 0) + input.quantity;
    assertQuantity(quantity);
    await lockCombo(tx, input.comboId);
    const combo = await tx.combo.findUniqueOrThrow({
      where: { id: input.comboId },
      select: comboAvailabilitySelect,
    });
    const publicIds = await getPublicCategoryIdsCached();
    if (!isComboPublic(combo, publicIds, new Date()))
      throw new ApiError(404, "Combo is not available");
    const components = resolveComboSelections(combo, input.selections);
    if (!components)
      throw new ApiError(
        422,
        "Choose exactly one size belonging to each included product/color",
      );
    if (
      components.some(
        (item) => !isVariantPublic(item.variant, publicIds, new Date()),
      )
    )
      throw new ApiError(404, "A selected size is no longer available");
    await assertStock(tx, cart, components, quantity, existing?.id);
    const cartId = await ensureCart(tx, cart, resolved);
    if (existing)
      await tx.cartCombo.update({
        where: { id: existing.id },
        data: { quantity },
      });
    else
      await tx.cartCombo.create({
        data: {
          cartId,
          comboId: combo.id,
          quantity,
          selectionKey,
          selections: {
            create: input.selections.map(({ comboItemId, variantId }) => ({
              comboItemId,
              variantId,
            })),
          },
        },
      });
    return cartId;
  });
};

const updateLine = async (
  type: "VARIANT" | "COMBO",
  owner: CartOwner | string,
  itemId: string,
  input: UpdateCartItemInput,
) => {
  assertQuantity(input.quantity);
  return mutate(owner, input.version, async (tx, cart) => {
    const item =
      type === "VARIANT"
        ? cart?.items.find((item) => item.id === itemId)
        : cart?.combos.find((item) => item.id === itemId);
    if (!item || !cart) throw new ApiError(404, "Cart item not found");
    if (input.quantity > item.quantity) {
      const publicIds = await getPublicCategoryIdsCached();
      const now = new Date();
      let components: DemandLine["components"];
      if (type === "VARIANT") {
        const target = cart.items.find((line) => line.id === itemId)!;
        const variant = await tx.variant.findUnique({
          where: { id: target.variantId },
          select: variantAvailabilitySelect,
        });
        if (!variant || !isVariantPublic(variant, publicIds, now))
          throw new ApiError(404, "Item is not available");
        components = [{ variantId: variant.id, quantity: 1, variant }];
      } else {
        const target = await tx.cartCombo.findUnique({
          where: { id: itemId },
          select: {
            combo: { select: comboAvailabilitySelect },
            selections: { select: { comboItemId: true, variantId: true } },
          },
        });
        const resolved =
          target && resolveComboSelections(target.combo, target.selections);
        if (
          !target ||
          !resolved?.length ||
          !isComboPublic(target.combo, publicIds, now) ||
          resolved.some(
            (component) => !isVariantPublic(component.variant, publicIds, now),
          )
        )
          throw new ApiError(404, "Item is not available");
        components = resolved;
      }
      await assertStock(tx, cart, components, input.quantity, itemId);
    }
    if (type === "VARIANT")
      await tx.cartItem.update({
        where: { id: itemId },
        data: { quantity: input.quantity },
      });
    else
      await tx.cartCombo.update({
        where: { id: itemId },
        data: { quantity: input.quantity },
      });
    return cart.id;
  });
};

const updateItem = (
  owner: CartOwner | string,
  itemId: string,
  input: UpdateCartItemInput,
) => updateLine("VARIANT", owner, itemId, input);

const removeLine = (
  type: "VARIANT" | "COMBO",
  owner: CartOwner | string,
  itemId: string,
  version: number,
) =>
  mutate(owner, version, async (tx, cart) => {
    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    const result =
      type === "VARIANT"
        ? await tx.cartItem.deleteMany({
            where: {
              id: itemId,
              cartId: cart.id,
            },
          })
        : await tx.cartCombo.deleteMany({
            where: {
              id: itemId,
              cartId: cart.id,
            },
          });

    if (result.count === 0) {
      throw new ApiError(404, "Cart item not found");
    }

    return cart.id;
  });

const updateCombo = (
  owner: CartOwner | string,
  itemId: string,
  input: UpdateCartItemInput,
) => updateLine("COMBO", owner, itemId, input);

const removeCombo = (
  owner: CartOwner | string,
  itemId: string,
  version: number,
) => removeLine("COMBO", owner, itemId, version);

const removeItem = (
  owner: CartOwner | string,
  itemId: string,
  version: number,
) => removeLine("VARIANT", owner, itemId, version);

const clearCart = (owner: CartOwner | string, version: number) =>
  mutate(owner, version, async (tx, cart) => {
    if (!cart) return null;
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cartCombo.deleteMany({ where: { cartId: cart.id } });
    return cart.id;
  });

export const CartService = {
  getCart,
  addItem,
  addCombo,
  clearCart,
  updateItem,
  updateCombo,
  removeItem,
  removeCombo,
};
