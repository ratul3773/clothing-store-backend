import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { CreateAddressPayload } from "./address.interface";

const resolveUser = async (userId: string) => {
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

const addAddress = async (
  userId: string,
  addressData: CreateAddressPayload,
) => {
  const {
    label,
    recipientName,
    recipientPhone,
    division,
    district,
    area,
    addressLine,
    postalCode,
    zone,
    isDefault,
  } = addressData;

  const customer = await resolveUser(userId);
  if (isDefault) {
    await prisma.address.updateMany({
      where: {
        customerId: customer.id,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });
  }
  const newAddress = await prisma.address.create({
    data: {
      customerId: customer.id,
      label,
      recipientName,
      recipientPhone,
      division,
      district,
      area,
      addressLine,
      postalCode,
      zone,
      isDefault,
    },
  });
  return newAddress;
};

const getAddresses = async (userId: string) => {
  const customer = await resolveUser(userId);
  const addresses = await prisma.address.findMany({
    where: {
      customerId: customer.id,
    },
  });
  return addresses;
};

const getAddressById = async (userId: string, addressId: string) => {
  const customer = await resolveUser(userId);
  const address = await prisma.address.findUnique({
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
  addressData: Partial<CreateAddressPayload>,
) => {
  const customer = await resolveUser(userId);
  const address = await prisma.address.findUnique({
    where: {
      id: addressId,
      customerId: customer.id,
      deletedAt: null,
    },
  });
  if (!address) {
    throw new ApiError(404, "Address not found");
  }
  const updatedAddress = await prisma.address.update({
    where: {
      id: addressId,
    },
    data: addressData,
  });
  return updatedAddress;
};

const deleteAddress = async (userId: string, addressId: string) => {
  const customer = await resolveUser(userId);
  const address = await prisma.address.findUnique({
    where: {
      id: addressId,
      customerId: customer.id,
      deletedAt: null,
    },
  });
  if (!address) {
    throw new ApiError(404, "Address not found");
  }
  const deletedAddress = await prisma.address.update({
    where: {
      id: addressId,
    },
    data: {
      deletedAt: new Date(),
    },
  });
  return deletedAddress;
};

export const addressService = {
  addAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
};
