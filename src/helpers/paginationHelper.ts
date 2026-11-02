export type TPaginationOptions = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
};

type TPaginationOptionsResult = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: string;
};

const calculatePagination = (
  options?: TPaginationOptions,
): TPaginationOptionsResult => {
  const page = Math.max(1, Number(options?.page) || 1);

  const limit = Math.min(
    100,
    Math.max(1, Number(options?.limit) || 10)
  );

  const skip = (page - 1) * limit;

  const sortBy = options?.sortBy || "createdAt";

  const sortOrder =
    options?.sortOrder === "asc"
      ? "asc"
      : "desc";

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

export const paginationHelpers = {
  calculatePagination,
};
