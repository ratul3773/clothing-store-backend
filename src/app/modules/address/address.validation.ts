import { z } from "zod";

const createAddressSchema = z.object({
  body: z.object({
    recipientName: z.string().trim().min(1).max(100),
    recipientPhone: z.string().trim().min(1).max(20),
    label: z.string().trim().max(100).optional(),
    area: z.string().trim().min(1).max(100),
    addressLine: z.string().trim().min(1).max(500),
    isDefault: z.boolean().optional(),
    zone: z.enum(["INSIDE_DHAKA", "OUTSIDE_DHAKA"]),
    division: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
  })
});

const updateAddressSchema = z.object({
  body: z.object({
    recipientName: z.string().trim().min(1).max(100).optional(),
    recipientPhone: z.string().trim().min(1).max(20).optional(),
    label: z.string().trim().max(100).optional(),
    area: z.string().trim().min(1).max(100).optional(),
    addressLine: z.string().trim().min(1).max(500).optional(),
    isDefault: z.boolean().optional(),
    zone: z.enum(["INSIDE_DHAKA", "OUTSIDE_DHAKA"]).optional(),
    division: z.string().trim().min(1).max(100).optional(),
    district: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
  })
});

const getAddressByIdSchema = z.object({
  params: z.object({
    addressId: z.string().uuid(),
  })
});

const deleteAddressSchema = z.object({
  params: z.object({
    addressId: z.string().uuid(),
  })
});

export const AddressValidation = {
  createAddressSchema,
  updateAddressSchema,
  getAddressByIdSchema,
  deleteAddressSchema
};