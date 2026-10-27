import { Prisma } from "../generated/prisma/client";
import { TGenericErrorResponse } from "./error";

const handleValidationError = (
  error: Prisma.PrismaClientValidationError,
): TGenericErrorResponse => {
  const errors = [
    {
      path: "",
      message: error.message,
    },
  ];
  const statusCode = 400;
  return {
    statusCode,
    message: "Validation Error",
    errorMessages: errors,
  };
};

export default handleValidationError;
