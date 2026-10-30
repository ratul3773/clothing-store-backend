import { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";
import httpStatus from "http-status";
import config from "../../../config/env";
import ApiError from "../../../errors/ApiError";

type DetectedImage = {
  extension: "jpg" | "png" | "webp" | "avif";
  contentType: string;
};

const detectImage = (buffer: Buffer): DetectedImage | null => {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { extension: "png", contentType: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") {
      return { extension: "avif", contentType: "image/avif" };
    }
  }

  return null;
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.storage.max_image_size_bytes,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(
        new ApiError(
          httpStatus.BAD_REQUEST,
          "Only JPEG, PNG, WebP, and AVIF images are allowed",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

export const singleImageUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  upload.single("file")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(
          new ApiError(
            httpStatus.REQUEST_ENTITY_TOO_LARGE,
            "The image exceeds the maximum allowed size",
          ),
        );
        return;
      }

      next(new ApiError(httpStatus.BAD_REQUEST, error.message));
      return;
    }

    if (error) {
      next(error);
      return;
    }

    next();
  });
};

export const getValidatedImage = (req: Request) => {
  const file = req.file;

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "An image file is required");
  }

  const detected = detectImage(file.buffer);

  if (!detected) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "The uploaded file is not a supported image",
    );
  }

  return {
    buffer: file.buffer,
    contentType: detected.contentType,
    extension: detected.extension,
    sizeBytes: file.size,
  };
};
