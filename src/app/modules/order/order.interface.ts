import type { DeliveryZone } from "../../../generated/prisma/enums";

export interface AddressSnapshot {
  recipientName: string;
  recipientPhone: string;
  district: string;
  area: string;
  addressLine: string;
  postalCode: string | null;
  zone: DeliveryZone;
}

export interface ProductSnapshot {
  name: string;
  unitPrice: number;
  imageUrl: string | null;
}

export interface OrderComponentSnapshot {
  productName: string;
  sku: string;
  color: string;
  size: string;
  imageUrl: string | null;
}
