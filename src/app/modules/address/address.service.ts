import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import {
  CreateAddressPayload,
  UpdateAddressPayload,
} from "./address.interface";

const resolveCustomer = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      isDeleted: false,
    },
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  let customer = await prisma.customer.findUnique({
    where: {
      userId: user.id,
      deletedAt: null,
    },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        userId: user.id,
      },
    });
  }
  return customer;
};

const clearOtherDefaults = (
  tx: Prisma.TransactionClient,
  customerId: string,
  keepId?: string,
) =>
  tx.address.updateMany({
    where: {
      customerId,
      isDefault: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: {
      isDefault: false,
    },
  });

const promoteDefault = async (
  tx: Prisma.TransactionClient,
  customerId: string,
  excludeId: string,
) => {
  const next = await tx.address.findFirst({
    where: {
      customerId,
      deletedAt: null,
      id: { not: excludeId },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (next) {
    await tx.address.update({
      where: { id: next.id },
      data: { isDefault: true },
    });
  }
};

const addAddress = async (
  userId: string,
  addressData: CreateAddressPayload,
) => {
  const customer = await resolveCustomer(userId);

  return prisma.$transaction(async (tx) => {
    if (addressData.isDefault) {
      await clearOtherDefaults(tx, customer.id);
    }
    return tx.address.create({
      data: {
        customerId: customer.id,
        ...addressData,
      },
    });
  });
};

const getAddresses = async (userId: string) => {
  const customer = await resolveCustomer(userId);
  const addresses = await prisma.address.findMany({
    where: {
      customerId: customer.id,
      deletedAt: null,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return addresses;
};

const getAddressById = async (userId: string, addressId: string) => {
  const customer = await resolveCustomer(userId);
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      customerId: customer.id,
      deletedAt: null,
    },
  });
  if (!address) {
    throw new ApiError(404, "Address not found");
  }
  return address;
};

const updateAddress = async (
  userId: string,
  addressId: string,
  addressData: UpdateAddressPayload,
) => {
  const customer = await resolveCustomer(userId);
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      customerId: customer.id,
      deletedAt: null,
    },
  });
  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  return prisma.$transaction(async (tx) => {
    if (addressData.isDefault === true) {
      await clearOtherDefaults(tx, customer.id, addressId);
    }

    const updatedAddress = await tx.address.update({
      where: {
        id: addressId,
      },
      data: addressData,
    });

    if (addressData.isDefault === false && address.isDefault) {
      await promoteDefault(tx, customer.id, addressId);
    }

    return updatedAddress;
  });
};

const deleteAddress = async (userId: string, addressId: string) => {
  const customer = await resolveCustomer(userId);
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      customerId: customer.id,
      deletedAt: null,
    },
  });
  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  return prisma.$transaction(async (tx) => {
    const deletedAddress = await tx.address.update({
      where: {
        id: addressId,
      },
      data: {
        deletedAt: new Date(),
        isDefault: false,
      },
    });

    if (address.isDefault) {
      await promoteDefault(tx, customer.id, addressId);
    }

    return deletedAddress;
  });
};

export const addressService = {
  addAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
};
