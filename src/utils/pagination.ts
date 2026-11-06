export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const getPaginationParams = (
  pageQuery?: any,
  limitQuery?: any,
  defaultLimit: number = 10
): PaginationParams => {
  const page = Math.max(1, parseInt(String(pageQuery), 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(String(limitQuery), 10) || defaultLimit));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

export const getPaginationMeta = (
  totalItems: number,
  currentPage: number,
  limit: number
): PaginationMeta => {
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    totalItems,
    totalPages,
    currentPage,
    limit,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};
