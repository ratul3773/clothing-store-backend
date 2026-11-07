import { z } from "zod";

const addressFields = {
  recipientName: z.string().trim().min(1).max(100),
  recipientPhone: z.string().trim().min(1).max(20),
  label: z.string().trim().max(100).nullable(),
  area: z.string().trim().min(1).max(100),
  addressLine: z.string().trim().min(1).max(500),
  isDefault: z.boolean(),
  zone: z.enum(["INSIDE_DHAKA", "OUTSIDE_DHAKA"]),
  district: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().max(20).nullable(),
};

const addressIdParams = z.object({
  addressId: z.string().uuid(),
});

const createAddressSchema = z.object({
  body: z
    .object({
      ...addressFields,
      label: addressFields.label.optional(),
      postalCode: addressFields.postalCode.optional(),
      isDefault: addressFields.isDefault.optional(),
    })
    .strict(),
});

const updateAddressSchema = z.object({
  params: addressIdParams,
  body: z
    .object(addressFields)
    .partial()
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "Provide at least one field to update",
    }),
});

const addressIdSchema = z.object({
  params: addressIdParams,
});

export const AddressValidation = {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema,
};
