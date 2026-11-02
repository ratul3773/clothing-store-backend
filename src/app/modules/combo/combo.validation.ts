import { z } from "zod";
import { comboItemsError } from "./combo.rules";

const items = z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(3) }).strict())
  .min(1).max(3).superRefine((items, ctx) => {
    const message = comboItemsError(items);
    if (message) ctx.addIssue({ code: "custom", message });
  });
const fields = {
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(10000).nullable().optional(),
  price: z.number().int().min(1).max(2_147_483_647),
  startsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).nullable().optional(),
  isActive: z.boolean().optional(), items,
};
const datesValid = (value: { startsAt?: Date | null | undefined; endsAt?: Date | null | undefined }) =>
  !value.startsAt || !value.endsAt || value.startsAt < value.endsAt;
const pageInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2_147_483_647));
const query = z.object({ page: pageInteger.optional(), limit: pageInteger.pipe(z.number().max(100)).optional() }).strict().default({});
export const ComboValidation = {
  list: z.object({ query }),
  id: z.object({ params: z.object({ id: z.string().uuid() }).strict() }),
  slug: z.object({ params: z.object({ slug: z.string().min(1).max(200) }).strict() }),
  create: z.object({ body: z.object(fields).strict().refine(datesValid, { message: "startsAt must be before endsAt" }) }),
  update: z.object({
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object(fields).partial().strict().refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field" })
      .refine(datesValid, { message: "startsAt must be before endsAt" }),
  }),
};
