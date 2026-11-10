import { Prisma } from "../../../generated/prisma/client";
import type {
  ActorType,
  StockMovementType,
} from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";

export const orderTransaction = async <T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(run, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError;
      const cause = known
        ? (
            error.meta?.driverAdapterError as
              | { cause?: { originalCode?: string; kind?: string } }
              | undefined
          )?.cause
        : undefined;
      const retryable =
        known &&
        (error.code === "P2034" ||
          (error.code === "P2010" &&
            ([error.meta?.code, cause?.originalCode].some(
              (code) => code === "40001" || code === "40P01",
            ) ||
              cause?.kind === "TransactionWriteConflict")) ||
          (error.code === "P2002" &&
            ["Order", "Customer"].includes(String(error.meta?.modelName))));
      if (!retryable) throw error;
      if (attempt >= 2)
        throw new ApiError(
          409,
          "Order or catalog changed concurrently. Please retry.",
        );
    }
  }
};

export const lockOrderVariants = async (
  tx: Prisma.TransactionClient,
  ids: string[],
) => {
  if (!ids.length) return;
  await tx.$queryRaw`SELECT id FROM variants WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`;
};

export type StockDelta = {
  variantId: string;
  onHand: number;
  reserved: number;
};
export const changeOrderStock = async (
  tx: Prisma.TransactionClient,
  deltas: readonly StockDelta[],
  orderId: string,
  type: StockMovementType,
  actor: { type: ActorType; id: string | null },
) => {
  if (!deltas.length) return;
  const values = Prisma.join(
    deltas.map(
      (delta) =>
        Prisma.sql`(${delta.variantId}::text, ${delta.onHand}::int, ${delta.reserved}::int)`,
    ),
  );
  const rows = await tx.$queryRaw<
    Array<{ id: string; onHand: number; reserved: number }>
  >(Prisma.sql`
    UPDATE variants AS v SET "onHand" = (v."onHand"::bigint + d.hand)::int,
      reserved = (v.reserved::bigint + d.held)::int, version = v.version + 1, "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${values}) AS d(id, hand, held)
    WHERE v.id = d.id AND v."onHand"::bigint + d.hand BETWEEN 0 AND 2147483647
      AND v.reserved::bigint + d.held BETWEEN 0 AND 2147483647
      AND v."onHand"::bigint + d.hand >= v.reserved::bigint + d.held
    RETURNING v.id, v."onHand", v.reserved
  `);
  if (rows.length !== deltas.length)
    throw new ApiError(409, "Insufficient stock or inconsistent reservation");
  const byId = new Map(deltas.map((delta) => [delta.variantId, delta]));
  await tx.stockMovement.createMany({
    data: rows.map((row) => ({
      variantId: row.id,
      type,
      onHandDelta: byId.get(row.id)!.onHand,
      reservedDelta: byId.get(row.id)!.reserved,
      onHandAfter: row.onHand,
      reservedAfter: row.reserved,
      refType: "ORDER",
      refId: orderId,
      actorType: actor.type,
      actorId: actor.id,
    })),
  });
};
