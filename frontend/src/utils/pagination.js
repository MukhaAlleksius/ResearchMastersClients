export const CATALOG_PAGE_SIZE = 12;

export function getCatalogPageFromSearch(search) {
  const page = parseInt(new URLSearchParams(search).get("page"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function getVisiblePageNumbers(currentPage, totalPages, maxVisible = 5) {
  if (totalPages <= 0) return [];
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
