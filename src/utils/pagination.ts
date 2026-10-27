export type PaginationQuery = {
  page?: number | undefined;
  limit?: number | undefined;
};

export const getPagination = (query: PaginationQuery) => {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
};

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number,
) => ({
  page,
  limit,
  total,
  totalPage: Math.ceil(total / limit),
});
