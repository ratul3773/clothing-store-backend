import { prisma } from "../../../lib/prisma";
import { getPublicCategoryIds } from "./catalog.rules";

const TTL_MS = 30_000;
let cached: { ids: ReadonlySet<string>; expiresAt: number } | undefined;
let inFlight: Promise<ReadonlySet<string>> | undefined;
let generation = 0;

export const invalidatePublicCategoryCache = () => {
  generation++;
  cached = undefined;
  inFlight = undefined;
};

export const getPublicCategoryIdsCached = (): Promise<ReadonlySet<string>> => {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.ids);
  if (inFlight) return inFlight;
  const started = generation;
  const pending = getPublicCategoryIds(prisma).then((ids) => {
    // An admin write during the query must not repopulate an invalidated cache.
    if (generation === started) cached = { ids, expiresAt: Date.now() + TTL_MS };
    return ids;
  }).finally(() => {
    if (inFlight === pending) inFlight = undefined;
  });
  inFlight = pending;
  return pending;
};
