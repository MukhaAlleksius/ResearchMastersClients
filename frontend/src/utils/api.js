/**
 * Backend API base URL (CRA: REACT_APP_API_URL from .env.development / .env.production).
 * Dev fallback: http://localhost:8000. Prod without env: same-origin /api (nginx).
 */
const DEV_API_FALLBACK = "http://localhost:8000";

function resolveApiBaseUrl() {
  const raw = (process.env.REACT_APP_API_URL || "").trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "/api";
  }
  return DEV_API_FALLBACK;
}

const API_BASE_URL = resolveApiBaseUrl();

export const API = {
  baseURL: API_BASE_URL,
  headers: (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }),
};

export function getApiBaseUrl() {
  return API_BASE_URL;
}

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function handleUnauthorizedResponse(response) {
  if (response?.status === 401) {
    unauthorizedHandler?.();
  }
  return response;
}

// Публичные GET — см. backend/src/backend/core/public_reads.py
// Роутеры дополнительно проверяют доступ (заказ в каталоге, профиль исполнителя).
const PUBLIC_GET_EXACT = new Set([
  "/",
  "/health",
  "/business_form",
  "/categories_works",
  "/categories_works_for_users",
  "/countries",
  "/profiles_executors_for_cards",
  "/orders_customers",
  "/profile/regions",
]);

const PUBLIC_POST_EXACT = new Set([
  "/token",
  "/refresh",
  "/register",
  "/auth/google/register",
  "/api/auth/google/register",
  "/payment/callback",
]);

function normalizePath(url) {
  try {
    const parsed = new URL(url, API.baseURL);
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url;
  }
}

export function isPublicRequest(url, method = "GET") {
  const path = normalizePath(url);
  const verb = (method || "GET").toUpperCase();

  if (verb === "OPTIONS") return true;
  if (path.startsWith("/portfolio")) return true;
  if (verb === "POST" && PUBLIC_POST_EXACT.has(path)) return true;
  if (verb !== "GET") return false;
  if (PUBLIC_GET_EXACT.has(path)) return true;
  if (path.startsWith("/currency/")) return true;
  if (/^\/avatar\/\d+$/.test(path)) return true;
  if (/^\/profile$/.test(path)) return true;
  if (/^\/verify-email$/.test(path)) return true;
  if (/^\/information_about_user\/\d+$/.test(path)) return true;
  if (/^\/users\/\d+\/contacts$/.test(path)) return true;
  if (/^\/users\/\d+\/geography_execute_orders$/.test(path)) return true;
  if (/^\/countries\/\d+\/regions$/.test(path)) return true;
  if (/^\/regions\/\d+\/towns$/.test(path)) return true;
  if (/^\/order\/\d+$/.test(path)) return true;
  if (/^\/project_images_portfolio_master\/\d+$/.test(path)) return true;
  if (path.startsWith("/projects_portfolio_master")) return true;
  if (path.startsWith("/works_for_category_work")) return true;
  if (path.startsWith("/works_masters_for_category_work")) return true;
  if (/^\/categories_works_master\/\d+$/.test(path)) return true;
  if (/^\/works_master_from_admin\/\d+\/\d+$/.test(path)) return true;
  if (/^\/works_master_myself\/\d+\/\d+$/.test(path)) return true;
  return false;
}

const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Math.floor(Date.now() / 1000) >= payload.exp;
  } catch {
    return true;
  }
};

export function getStoredUserId() {
  const raw = localStorage.getItem("user_id");
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function persistAuthSession(data = {}) {
  if (data.access_token) {
    localStorage.setItem("access_token", data.access_token);
  }
  if (data.refresh_token) {
    localStorage.setItem("refresh_token", data.refresh_token);
  }
  if (data.user_id != null && data.user_id !== "") {
    localStorage.setItem("user_id", String(data.user_id));
  }
  if (data.role) {
    localStorage.setItem("user_role", data.role);
  }
}

export async function ensureStoredUserId() {
  const existing = getStoredUserId();
  if (existing) return existing;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;

  const res = await fetch(`${API.baseURL}/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refreshToken}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  persistAuthSession(data);
  return getStoredUserId();
}

export const fetchWithAuth = async (
  url,
  options = {},
  { onUnauthorized } = {},
) => {
  let token = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");

  if (!token || isTokenExpired(token)) {
    if (!refreshToken) {
      onUnauthorized?.();
      unauthorizedHandler?.();
      throw new Error("Нет refresh_token");
    }

    const res = await fetch(`${API.baseURL}/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });

    if (!res.ok) {
      onUnauthorized?.();
      unauthorizedHandler?.();
      throw new Error("Не удалось обновить токен");
    }

    const data = await res.json();
    persistAuthSession(data);
    token = data.access_token;
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, ...API.headers(token) },
  });
  handleUnauthorizedResponse(response);
  return response;
};

export async function apiFetch(url, options = {}, config = {}) {
  const method = options.method || "GET";
  // Public catalog/home endpoints must never open the login modal.
  // Stale tokens in localStorage previously forced fetchWithAuth → 401 → login.
  if (isPublicRequest(url, method)) {
    const token = localStorage.getItem("access_token");
    if (token && !isTokenExpired(token)) {
      return fetch(url, {
        ...options,
        headers: { ...options.headers, ...API.headers(token) },
      });
    }
    return fetch(url, options);
  }
  return fetchWithAuth(url, options, config);
}

export function buildApiUrl(path, params) {
  const url = path.startsWith("http") ? path : `${API.baseURL}${path}`;
  if (!params) return url;
  const search = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

export function resolveMediaUrl(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `http:${raw}`;
  return `${API.baseURL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export async function readApiError(response) {
  try {
    const body = await response.json();
    if (!body?.detail) return null;
    return typeof body.detail === "string"
      ? body.detail
      : JSON.stringify(body.detail);
  } catch {
    return null;
  }
}

export function normalizeListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function fetchOrderExecutorResponse(executorId, orderId) {
  if (!executorId || !orderId) return null;

  const single = await apiFetch(
    `${API.baseURL}/order_response_executor/${executorId}/${orderId}`,
  );

  if (single.ok) {
    return single.json();
  }

  if ([403, 404, 409].includes(single.status)) {
    const list = await apiFetch(
      `${API.baseURL}/order_responses_executors/${orderId}`,
    );
    if (!list.ok) return null;

    const items = normalizeListResponse(await list.json());
    return (
      items.find(
        (item) => Number(item.executor_id) === Number(executorId),
      ) || null
    );
  }

  const detail = await readApiError(single);
  throw new Error(detail || `HTTP ${single.status}`);
}
