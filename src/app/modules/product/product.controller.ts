import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { getValidatedImage } from "../upload/upload.middleware";
import { CatalogService } from "./catalog.service";
import { ColorService } from "./color.service";
import { ImageService } from "./image.service";
import { OfferService } from "./offer.service";
import {
  AdminProductQuery,
  CreateColorInput,
  CreateOfferInput,
  CreateProductInput,
  CreateVariantInput,
  PublicProductQuery,
  StockAdjustmentInput,
  UpdateColorInput,
  UpdateImageInput,
  UpdateOfferInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./product.interface";
import { ProductService } from "./product.service";
import { VariantService } from "./variant.service";

const listPublicProducts = catchAsync(
  async (req: Request, res: Response) => {
    const result = await CatalogService.listPublicProducts(
      req.validatedQuery as PublicProductQuery,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Products retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getPublicProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await CatalogService.getPublicProduct(
    req.params.slug as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product retrieved successfully",
    data,
  });
});

const listAdminProducts = catchAsync(
  async (req: Request, res: Response) => {
    const result = await CatalogService.listAdminProducts(
      req.validatedQuery as AdminProductQuery,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Products retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getAdminProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.getAdminProduct(
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product retrieved successfully",
    data,
  });
});

const createProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.createProduct(
    req.user!.id,
    req.body as CreateProductInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product created successfully",
    data,
  });
});

const updateProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.updateProduct(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateProductInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product updated successfully",
    data,
  });
});

const publishProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.publishProduct(
    req.user!.id,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product published successfully",
    data,
  });
});

const unpublishProduct = catchAsync(
  async (req: Request, res: Response) => {
    const data = await ProductService.unpublishProduct(
      req.user!.id,
      req.params.id as string,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product unpublished successfully",
      data,
    });
  },
);

const archiveProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.archiveProduct(
    req.user!.id,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product archived successfully",
    data,
  });
});

const restoreProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.restoreProduct(
    req.user.id,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product restored successfully",
    data,
  });
});

const deleteProduct = catchAsync(async (req: Request, res: Response) => {
  const data = await ProductService.deleteProduct(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product deleted successfully",
    data,
  });
});

const createColor = catchAsync(async (req: Request, res: Response) => {
  const data = await ColorService.createColor(
    req.params.id as string,
    req.body as CreateColorInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product colour created successfully",
    data,
  });
});

const updateColor = catchAsync(async (req: Request, res: Response) => {
  const data = await ColorService.updateColor(
    req.params.id as string,
    req.params.colorId as string,
    req.body as UpdateColorInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product colour updated successfully",
    data,
  });
});

const deleteColor = catchAsync(async (req: Request, res: Response) => {
  const data = await ColorService.deleteColor(
    req.params.id as string,
    req.params.colorId as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product colour deleted successfully",
    data,
  });
});

const createVariant = catchAsync(async (req: Request, res: Response) => {
  const data = await VariantService.createVariant(
    req.user!.id,
    req.params.id as string,
    req.body as CreateVariantInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Variant created successfully",
    data,
  });
});

const updateVariant = catchAsync(async (req: Request, res: Response) => {
  const data = await VariantService.updateVariant(
    req.user!.id,
    req.params.id as string,
    req.params.variantId as string,
    req.body as UpdateVariantInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Variant updated successfully",
    data,
  });
});

const deleteVariant = catchAsync(async (req: Request, res: Response) => {
  const data = await VariantService.deleteVariant(
    req.params.id as string,
    req.params.variantId as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Variant deleted successfully",
    data,
  });
});

const adjustStock = catchAsync(async (req: Request, res: Response) => {
  const data = await VariantService.adjustStock(
    req.user!.id,
    req.params.id as string,
    req.params.variantId as string,
    req.body as StockAdjustmentInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stock adjusted successfully",
    data,
  });
});

const listStockMovements = catchAsync(
  async (req: Request, res: Response) => {
    const result = await VariantService.listStockMovements(
      req.params.id as string,
      req.params.variantId as string,
      req.validatedQuery as { page?: number; limit?: number },
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Stock movements retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  },
);

const createOffer = catchAsync(async (req: Request, res: Response) => {
  const data = await OfferService.createOffer(
    req.user!.id,
    req.params.id as string,
    req.body as CreateOfferInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Offer created successfully",
    data,
  });
});

const updateOffer = catchAsync(async (req: Request, res: Response) => {
  const data = await OfferService.updateOffer(
    req.params.id as string,
    req.params.offerId as string,
    req.body as UpdateOfferInput,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Offer updated successfully",
    data,
  });
});

const deactivateOffer = catchAsync(async (req: Request, res: Response) => {
  const data = await OfferService.deactivateOffer(
    req.params.id as string,
    req.params.offerId as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Offer deactivated successfully",
    data,
  });
});

const uploadProductImage = catchAsync(
  async (req: Request, res: Response) => {
    const data = await ImageService.uploadProductImage(
      req.params.id as string,
      getValidatedImage(req),
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Product image uploaded successfully",
      data,
    });
  },
);

const updateProductImage = catchAsync(
  async (req: Request, res: Response) => {
    const data = await ImageService.updateProductImage(
      req.params.id as string,
      req.params.imageId as string,
      req.body as UpdateImageInput,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product image updated successfully",
      data,
    });
  },
);

const deleteProductImage = catchAsync(
  async (req: Request, res: Response) => {
    const data = await ImageService.deleteProductImage(
      req.params.id as string,
      req.params.imageId as string,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product image deleted successfully",
      data,
    });
  },
);

const reorderProductImages = catchAsync(
  async (req: Request, res: Response) => {
    const data = await ImageService.reorderProductImages(
      req.params.id as string,
      (req.body as { imageIds: string[] }).imageIds,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product images reordered successfully",
      data,
    });
  },
);

export const ProductController = {
  listPublicProducts,
  getPublicProduct,
  listAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  publishProduct,
  unpublishProduct,
  archiveProduct,
  restoreProduct,
  deleteProduct,
  createColor,
  updateColor,
  deleteColor,
  createVariant,
  updateVariant,
  deleteVariant,
  adjustStock,
  listStockMovements,
  createOffer,
  updateOffer,
  deactivateOffer,
  uploadProductImage,
  updateProductImage,
  deleteProductImage,
  reorderProductImages,
};
