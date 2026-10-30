import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { getValidatedImage } from "../upload/upload.middleware";
import { CategoryService } from "./category.service";

const listPublicCategories = catchAsync(
  async (_req: Request, res: Response) => {
    const data = await CategoryService.listPublicCategories();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Categories retrieved successfully",
      data,
    });
  },
);

const getPublicCategory = catchAsync(async (req: Request, res: Response) => {
  const data = await CategoryService.getPublicCategory(
    req.params.slug as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category retrieved successfully",
    data,
  });
});

const listAdminCategories = catchAsync(
  async (_req: Request, res: Response) => {
    const data = await CategoryService.listAdminCategories();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Categories retrieved successfully",
      data,
    });
  },
);

const createCategory = catchAsync(async (req: Request, res: Response) => {
  const data = await CategoryService.createCategory(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Category created successfully",
    data,
  });
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const data = await CategoryService.updateCategory(
    req.params.id as string,
    req.body,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category updated successfully",
    data,
  });
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const data = await CategoryService.deleteCategory(
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: data.archived
      ? "Category archived successfully"
      : "Category deleted successfully",
    data,
  });
});

const uploadCategoryImage = catchAsync(
  async (req: Request, res: Response) => {
    const image = getValidatedImage(req);
    const data = await CategoryService.uploadCategoryImage(
      req.params.id as string,
      image,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Category image uploaded successfully",
      data,
    });
  },
);

const removeCategoryImage = catchAsync(
  async (req: Request, res: Response) => {
    const data = await CategoryService.removeCategoryImage(
      req.params.id as string,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Category image removed successfully",
      data,
    });
  },
);

export const CategoryController = {
  listPublicCategories,
  getPublicCategory,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
  removeCategoryImage,
};
