import { ZodError, ZodIssue } from "zod";
import { TErrorMessage, TGenericErrorResponse } from "../interfaces/error";

const handleZodError = (error: ZodError): TGenericErrorResponse => {
  const errors: TErrorMessage[] = error.issues.map((issue: ZodIssue) => {
    return {
      path: issue?.path[issue.path.length - 1],
      message: issue?.message,
    };
  });

  const statusCode = 400;

  return {
    statusCode,
    message: "Validation Error",
    errorMessages: errors,
  };
};

export default handleZodError;
