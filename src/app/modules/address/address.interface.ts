import { DeliveryZone } from "../../../generated/prisma/enums";

export interface Address {
  id: string;
  customerId: string;
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  district: string;
  area: string;
  addressLine: string;
  postalCode: string | null;
  zone: DeliveryZone;
  isDefault: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressPayload {
  label?: string | null;
  recipientName: string;
  recipientPhone: string;
  district: string;
  area: string;
  addressLine: string;
  postalCode?: string | null;
  zone: DeliveryZone;
  isDefault?: boolean;
}

export type UpdateAddressPayload = Partial<CreateAddressPayload>;
