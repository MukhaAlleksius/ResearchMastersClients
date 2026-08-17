/** Буквы любого алфавита (в т.ч. беларускія і, ў) и цифры. Остальное — разделители. */
const NON_SLUG_CHARS = /[^\p{L}\p{N}]+/gu;

export function buildOrderSlug(title) {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(NON_SLUG_CHARS, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
  return slug;
}

/**
 * Рабочий URL заказа: ID обязателен, slug только декоративный.
 * /orders/12  или  /orders/12/nazvanie
 */
export function buildOrderPath(order) {
  const id = order?.id;
  if (id == null || id === "") return "/orders";
  const slug = buildOrderSlug(order?.title);
  return slug ? `/orders/${id}/${slug}` : `/orders/${id}`;
}

export function resolveCatalogOrderId({
  orderId,
  slug,
  search,
  state,
} = {}) {
  const pathId = String(orderId || "").trim();
  if (/^\d+$/.test(pathId)) return pathId;

  const queryId = new URLSearchParams(search || "").get("id");
  if (queryId && /^\d+$/.test(String(queryId).trim())) {
    return String(queryId).trim();
  }

  if (state?.orderId != null && /^\d+$/.test(String(state.orderId).trim())) {
    return String(state.orderId).trim();
  }

  const slugId = String(slug || "").trim();
  if (/^\d+$/.test(slugId)) return slugId;

  return null;
}
