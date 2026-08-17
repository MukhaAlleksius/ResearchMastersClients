/** Сегменты путей личного кабинета под `/profile/...`. */
const PROFILE_CABINET_SEGMENTS = new Set([
  "orders",
  "main_page",
  "my_executors",
  "services",
  "my_customers",
  "specialization",
  "executor",
  "portfolio",
  "analytics",
  "executor_bank_account",
  "administrator",
]);

/** Публичная страница исполнителя: `/profile/:slug` (не раздел кабинета). */
export function isPublicExecutorProfilePath(pathname = "") {
  const match = String(pathname).match(/^\/profile\/([^/]+)/);
  if (!match) return false;
  return !PROFILE_CABINET_SEGMENTS.has(match[1]);
}

export function isProfileCabinetPath(pathname = "") {
  const path = String(pathname);
  if (path === "/profile" || path === "/profile/") return true;
  if (!path.startsWith("/profile/")) return false;
  return !isPublicExecutorProfilePath(path);
}

export function isExecutorsNavActive(pathname = "") {
  const path = String(pathname);
  return path.startsWith("/catalog") || isPublicExecutorProfilePath(path);
}

/** Каталог заказов и карточка заказа: `/orders`, `/orders/:id`, `/order/:slug`. */
export function isOrdersNavActive(pathname = "") {
  const path = String(pathname);
  return path === "/orders" || path.startsWith("/orders/") || path.startsWith("/order/");
}
