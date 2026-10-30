import { Prisma } from "../generated/prisma/client";
import { TErrorMessage } from "./error";

const handleClientError = (error: Prisma.PrismaClientKnownRequestError) => {
  let errors: TErrorMessage[] = [];
  let message = "Database request failed";
  let statusCode = 400;

  if (error.code === "P2002") {
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.join(", ")
      : typeof target === "string"
        ? target
        : "unique field";

    statusCode = 409;
    message = `A record with this ${fields} already exists`;
    errors = [{ path: fields, message }];
  } else if (error.code === "P2025") {
    statusCode = 404;
    message =
      typeof error.meta?.cause === "string"
        ? error.meta.cause
        : "Record not found";
    errors = [{ path: "", message }];
  } else if (error.code === "P2003") {
    statusCode = 409;
    message = "This record is still referenced by other data";
    errors = [{ path: "", message }];
  }

  return {
    statusCode,
    message,
    errorMessages: errors,
  };
};

export default handleClientError;
