import { API, apiFetch } from "./api.js";

export const NOTIFICATION_POLL_MS = 15000;

export function formatNotificationDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export async function fetchNotifications(userId, { unreadOnly = false } = {}) {
  const params = new URLSearchParams({ unread_only: String(unreadOnly) });
  const response = await apiFetch(`${API.baseURL}/notifications?${params}`);
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        detail =
          typeof body.detail === "string"
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function acknowledgeNotification(userId, notificationId, reaction) {
  const response = await apiFetch(
    `${API.baseURL}/notifications/${notificationId}/acknowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export async function markNotificationRead(userId, notificationId) {
  const response = await apiFetch(
    `${API.baseURL}/notifications/${notificationId}/read`,
    { method: "PATCH" },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
