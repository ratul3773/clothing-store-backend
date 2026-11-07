import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { addressService } from "./address.service";

const addAddress = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await addressService.addAddress(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Address added successfully",
    data: result,
  });
});

const getAddresses = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await addressService.getAddresses(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Addresses retrieved successfully",
    data: result,
  });
});

const getAddressById = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const addressId = req.params.addressId as string;
  const result = await addressService.getAddressById(userId, addressId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Address retrieved successfully",
    data: result,
  });
});

const updateAddress = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const addressId = req.params.addressId as string;
  const result = await addressService.updateAddress(userId, addressId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Address updated successfully",
    data: result,
  });
});

const deleteAddress = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const addressId = req.params.addressId as string;
  const result = await addressService.deleteAddress(userId, addressId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Address deleted successfully",
    data: result,
  });
});

export const AddressController = {
  addAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
};
