import { API, apiFetch } from "./api.js";

import { TAB_PRESETS } from "../components/Content/Profile/Common/workDetailTabs.js";

const STORAGE_PREFIX = "order_activity_seen_v2";
export const DETAIL_ACTIVITY_POLL_MS = 5000;
export const LIST_ACTIVITY_POLL_MS = 8000;

const RESPONSE_SEEN_FIELDS = (current) => ({
  responses_latest_id: current.responses_latest_id,
  response_updated_at: current.response_updated_at,
  assigned_response_latest_id: current.assigned_response_latest_id,
});

export const UPDATE_TYPE_LABELS = {
  message: "Сообщение",
  cancel: "Отказ / отмена",
  response: "Новый отклик",
  estimate: "Смета",
  schedule: "График работ",
  contract: "Договор",
  status: "Статус заказа",
  order: "Изменение заказа",
  complaint: "Жалоба",
  payment: "Оплата",
  review: "Отзыв",
  customer: "Заказчик",
  executor: "Исполнитель",
};

export const TAB_ACTIVITY_TYPES = {
  orderInfo: ["status", "order", "response"],
  orderResponesExecutors: ["response"],
  estimateWorks: ["estimate"],
  estimate: ["estimate"],
  schedule: ["schedule"],
  graphicWorks: ["schedule"],
  chat: ["message"],
  customerInfo: ["customer"],
  executorInfo: ["executor"],
  customerExecutorContract: ["contract"],
  payment: ["payment"],
  customerCancelOrder: ["cancel"],
  executorCancelOrder: ["cancel"],
  complaints: ["complaint"],
  commentsRating: ["review"],
};

/** Типы уведомлений для вкладки с учётом сценария (пресета). */
export function getTabActivityTypes(presetKey, tabId) {
  if (tabId !== "orderInfo") {
    return TAB_ACTIVITY_TYPES[tabId] || [];
  }

  if (presetKey === "customer_search") {
    return ["order"];
  }

  if (presetKey?.startsWith("executor_")) {
    return ["status", "order"];
  }

  return ["order"];
}

export const TAB_SEEN_PATCH = {
  orderInfo: (current) => ({
    order_unavailable: current.order_unavailable,
    order_updated_at: current.order_updated_at,
    responses_latest_id: current.responses_latest_id,
    response_updated_at: current.response_updated_at,
    assigned_response_latest_id: current.assigned_response_latest_id,
  }),
  orderResponesExecutors: RESPONSE_SEEN_FIELDS,
  estimateWorks: (current) => ({ estimate_max_id: current.estimate_max_id }),
  estimate: (current) => ({ estimate_max_id: current.estimate_max_id }),
  schedule: (current) => ({ schedule_max_id: current.schedule_max_id }),
  graphicWorks: (current) => ({ schedule_max_id: current.schedule_max_id }),
  chat: (current) => ({ unread_messages: current.unread_messages }),
  customerInfo: (current) => ({
    customer_info_max_id: current.customer_info_max_id,
  }),
  executorInfo: (current) => ({
    executor_info_max_id: current.executor_info_max_id,
  }),
  customerExecutorContract: (current) => ({
    contract_updated_at: current.contract_updated_at,
    contract_other_signed: current.contract_other_signed,
  }),
  payment: (current) => ({
    payment_latest_id: current.payment_latest_id,
    payment_updated_at: current.payment_updated_at,
  }),
  customerCancelOrder: (current) => ({
    pending_cancel_ack: current.pending_cancel,
  }),
  executorCancelOrder: (current) => ({
    pending_cancel_ack: current.pending_cancel,
  }),
  complaints: (current) => ({
    unread_complaint_messages: current.unread_complaint_messages,
    complaint_latest_id: current.complaint_latest_id,
  }),
  commentsRating: (current) => ({ review_latest_id: current.review_latest_id }),
};

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}_${userId}`;
}

function readStore(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(userId, store) {
  if (!userId) return;
  localStorage.setItem(getStorageKey(userId), JSON.stringify(store));
}

export function normalizeActivity(activity) {
  if (!activity) {
    return {
      unread_messages: 0,
      pending_cancel: false,
      pending_cancel_ack: false,
      responses_count: 0,
      responses_latest_id: 0,
      estimate_count_other: 0,
      estimate_max_id: 0,
      schedule_count_other: 0,
      schedule_max_id: 0,
      contract_other_signed: false,
      contract_viewer_signed: false,
      contract_updated_at: null,
      order_unavailable: false,
      order_updated_at: null,
      response_updated_at: null,
      assigned_response_latest_id: 0,
      unread_complaint_messages: 0,
      complaint_latest_id: 0,
      payment_latest_id: 0,
      payment_updated_at: null,
      review_latest_id: 0,
      customer_info_max_id: 0,
      executor_info_max_id: 0,
    };
  }

  return {
    unread_messages: Number(activity.unread_messages || 0),
    pending_cancel: Boolean(activity.pending_cancel),
    pending_cancel_ack: Boolean(activity.pending_cancel_ack),
    responses_count: Number(activity.responses_count || 0),
    responses_latest_id: Number(activity.responses_latest_id || 0),
    estimate_count_other: Number(activity.estimate_count_other || 0),
    estimate_max_id: Number(activity.estimate_max_id || 0),
    schedule_count_other: Number(activity.schedule_count_other || 0),
    schedule_max_id: Number(activity.schedule_max_id || 0),
    contract_other_signed: Boolean(activity.contract_other_signed),
    contract_viewer_signed: Boolean(activity.contract_viewer_signed),
    contract_updated_at: activity.contract_updated_at || null,
    order_unavailable: Boolean(activity.order_unavailable),
    order_updated_at: activity.order_updated_at || null,
    response_updated_at: activity.response_updated_at || null,
    assigned_response_latest_id: Number(activity.assigned_response_latest_id || 0),
    unread_complaint_messages: Number(activity.unread_complaint_messages || 0),
    complaint_latest_id: Number(activity.complaint_latest_id || 0),
    payment_latest_id: Number(activity.payment_latest_id || 0),
    payment_updated_at: activity.payment_updated_at || null,
    review_latest_id: Number(activity.review_latest_id || 0),
    customer_info_max_id: Number(activity.customer_info_max_id || 0),
    executor_info_max_id: Number(activity.executor_info_max_id || 0),
  };
}

function toTimestamp(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const NUMERIC_MAX_FIELDS = new Set([
  "unread_messages",
  "responses_latest_id",
  "estimate_max_id",
  "schedule_max_id",
  "assigned_response_latest_id",
  "unread_complaint_messages",
  "complaint_latest_id",
  "payment_latest_id",
  "review_latest_id",
  "customer_info_max_id",
  "executor_info_max_id",
]);

const TIMESTAMP_FIELDS = new Set([
  "contract_updated_at",
  "order_updated_at",
  "response_updated_at",
  "payment_updated_at",
]);

/** Счётчики/id существующих сущностей — 0→N при первом опросе не считаем изменением. */
const COUNTER_BASELINE_FIELDS = new Set([
  "estimate_max_id",
  "schedule_max_id",
  "responses_latest_id",
  "assigned_response_latest_id",
  "payment_latest_id",
  "review_latest_id",
  "complaint_latest_id",
  "customer_info_max_id",
  "executor_info_max_id",
]);

const TIMESTAMP_BASELINE_FIELDS = new Set([
  "order_updated_at",
  "response_updated_at",
  "contract_updated_at",
  "payment_updated_at",
]);

function hasCounterUpdate(currentValue, seenValue) {
  const current = Number(currentValue || 0);
  const seen = Number(seenValue || 0);
  return seen > 0 && current > seen;
}

function mergeSeenSnapshot(seen, snapshot, rawActivity) {
  const merged = { ...normalizeActivity(seen) };
  const hasRaw = rawActivity && typeof rawActivity === "object";

  for (const [key, value] of Object.entries(snapshot)) {
    if (hasRaw && !(key in rawActivity)) {
      continue;
    }

    if (NUMERIC_MAX_FIELDS.has(key)) {
      merged[key] = Math.max(Number(merged[key] || 0), Number(value || 0));
      continue;
    }

    if (TIMESTAMP_FIELDS.has(key)) {
      const seenTs = toTimestamp(merged[key]);
      const valueTs = toTimestamp(value);
      merged[key] = valueTs >= seenTs ? value : merged[key];
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function hasSeenRecord(userId, orderId) {
  if (!userId || !orderId) return false;
  const store = readStore(userId);
  return Object.prototype.hasOwnProperty.call(store, String(orderId));
}

/** Фиксируем текущее состояние activity как базовое, чтобы опрос не давал ложных точек. */
export function syncSeenActivityBaseline(userId, orderId, activity) {
  if (!userId || !orderId || !activity) return false;

  const seen = getSeenActivity(userId, orderId);
  const current = normalizeActivity(activity);
  const patch = {};
  let changed = false;

  for (const key of COUNTER_BASELINE_FIELDS) {
    const seenVal = Number(seen[key] || 0);
    const curVal = Number(current[key] || 0);
    if (seenVal === 0 && curVal > 0) {
      patch[key] = curVal;
      changed = true;
    }
  }

  for (const key of TIMESTAMP_BASELINE_FIELDS) {
    if (!seen[key] && current[key]) {
      patch[key] = current[key];
      changed = true;
    }
  }

  if (current.contract_other_signed && !seen.contract_other_signed) {
    patch.contract_other_signed = true;
    changed = true;
  }

  if (!changed) return false;

  markOrderActivitySeen(userId, orderId, { ...seen, ...patch });
  return true;
}

/** @deprecated используйте syncSeenActivityBaseline */
export function syncSeenProfileInfoBaseline(userId, orderId, activity) {
  return syncSeenActivityBaseline(userId, orderId, activity);
}

/**
 * При смене статуса заказа/услуги переснимаем baseline activity:
 * иначе order_updated_at и другие поля дают ложную точку после перехода
 * (например, «В поиске» → «Ожидают выполнения»).
 */
export function syncSeenOnRoleStatusChange(
  userId,
  orderId,
  activity,
  role,
  currentStatus,
) {
  if (!userId || !orderId || !role || !currentStatus || !activity) {
    return false;
  }

  const statusField =
    role === "customer" ? "_customer_status" : "_executor_status";
  const store = readStore(userId);
  const key = String(orderId);
  const prev = store[key] || {};
  const prevStatus = prev[statusField];

  if (prevStatus && prevStatus !== currentStatus) {
    markAllActivitySeen(userId, orderId, activity);
    const updated = readStore(userId)[key] || normalizeActivity(activity);
    store[key] = { ...updated, [statusField]: currentStatus };
    writeStore(userId, store);
    return true;
  }

  if (!prevStatus) {
    const seen = getSeenActivity(userId, orderId);
    const current = normalizeActivity(activity);
    const patch = {};
    let migrated = false;

    if (
      current.order_updated_at &&
      toTimestamp(current.order_updated_at) > toTimestamp(seen.order_updated_at)
    ) {
      patch.order_updated_at = current.order_updated_at;
      migrated = true;
    }

    if (Object.keys(patch).length > 0) {
      markOrderActivitySeen(userId, orderId, { ...seen, ...patch });
    }

    const record = readStore(userId)[key] || seen;
    store[key] = { ...record, [statusField]: currentStatus };
    writeStore(userId, store);
    return migrated;
  }

  return false;
}

export function getRoleFromPreset(presetKey) {
  if (!presetKey) return null;
  if (presetKey.startsWith("customer_")) return "customer";
  if (presetKey.startsWith("executor_")) return "executor";
  return null;
}

export async function fetchOrderActivity(orderId, userId, role) {
  if (!orderId || !userId || !role) return null;

  const params = new URLSearchParams({ role });
  const response = await apiFetch(
    `${API.baseURL}/order/${orderId}/activity?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function syncSeenCancelAck(userId, orderId, activity) {
  if (!userId || !orderId) return false;

  const current = normalizeActivity(activity);
  if (current.pending_cancel) return false;

  const seen = getSeenActivity(userId, orderId);
  if (!seen.pending_cancel_ack) return false;

  markOrderActivitySeen(userId, orderId, {
    ...seen,
    pending_cancel_ack: false,
  });
  return true;
}

export function getSeenActivity(userId, orderId) {
  const store = readStore(userId);
  return normalizeActivity(store[String(orderId)]);
}

function preserveSeenMeta(prevRecord, nextRecord) {
  const meta = {};
  if (prevRecord?._customer_status != null) {
    meta._customer_status = prevRecord._customer_status;
  }
  if (prevRecord?._executor_status != null) {
    meta._executor_status = prevRecord._executor_status;
  }
  return { ...nextRecord, ...meta };
}

export function markOrderActivitySeen(userId, orderId, activity) {
  if (!userId || !orderId) return;
  const store = readStore(userId);
  const prev = store[String(orderId)] || {};
  store[String(orderId)] = preserveSeenMeta(
    prev,
    normalizeActivity(activity),
  );
  writeStore(userId, store);
}

export function buildSeenSnapshotFromActivity(activity) {
  const current = normalizeActivity(activity);
  return {
    unread_messages: current.unread_messages,
    pending_cancel_ack: current.pending_cancel,
    responses_latest_id: current.responses_latest_id,
    estimate_max_id: current.estimate_max_id,
    schedule_max_id: current.schedule_max_id,
    contract_other_signed: current.contract_other_signed,
    contract_updated_at: current.contract_updated_at,
    order_unavailable: current.order_unavailable,
    order_updated_at: current.order_updated_at,
    response_updated_at: current.response_updated_at,
    assigned_response_latest_id: current.assigned_response_latest_id,
    unread_complaint_messages: current.unread_complaint_messages,
    complaint_latest_id: current.complaint_latest_id,
    payment_latest_id: current.payment_latest_id,
    payment_updated_at: current.payment_updated_at,
    review_latest_id: current.review_latest_id,
    customer_info_max_id: current.customer_info_max_id,
    executor_info_max_id: current.executor_info_max_id,
  };
}

export function markAllActivitySeen(userId, orderId, activity) {
  if (!userId || !orderId || activity == null) return;
  const seen = getSeenActivity(userId, orderId);
  const snapshot = buildSeenSnapshotFromActivity(activity);
  markOrderActivitySeen(userId, orderId, mergeSeenSnapshot(seen, snapshot, activity));
}

export function markTabActivitySeen(userId, orderId, tabId, activity) {
  if (!userId || !orderId || !tabId || activity == null) return;
  const patchFn = TAB_SEEN_PATCH[tabId];
  if (!patchFn) return;

  const current = normalizeActivity(activity);
  const seen = getSeenActivity(userId, orderId);
  const patch = patchFn(current);

  markOrderActivitySeen(userId, orderId, {
    ...seen,
    ...patch,
  });
}

function getEffectiveSeenActivity(seenActivity, currentActivity) {
  const seen = normalizeActivity(seenActivity);
  const current = normalizeActivity(currentActivity);
  if (!current.pending_cancel && seen.pending_cancel_ack) {
    return { ...seen, pending_cancel_ack: false };
  }
  return seen;
}

function hasResponseUpdate(current, seen) {
  return (
    hasCounterUpdate(current.responses_latest_id, seen.responses_latest_id) ||
    hasCounterUpdate(
      current.assigned_response_latest_id,
      seen.assigned_response_latest_id,
    ) ||
    (seen.response_updated_at &&
      toTimestamp(current.response_updated_at) >
        toTimestamp(seen.response_updated_at))
  );
}

export function getOrderUpdateInfo(activity, seenActivity) {
  const current = normalizeActivity(activity);
  const seen = getEffectiveSeenActivity(seenActivity, activity);
  const types = [];

  if (current.unread_messages > seen.unread_messages) {
    types.push("message");
  }

  const cancelAck = current.pending_cancel ? seen.pending_cancel_ack : false;
  if (current.pending_cancel && !cancelAck) {
    types.push("cancel");
  }

  const responseUpdated = hasResponseUpdate(current, seen);
  if (responseUpdated) {
    types.push("response");
  }

  if (hasCounterUpdate(current.estimate_max_id, seen.estimate_max_id)) {
    types.push("estimate");
  }

  if (hasCounterUpdate(current.schedule_max_id, seen.schedule_max_id)) {
    types.push("schedule");
  }

  if (
    seen.contract_updated_at &&
    toTimestamp(current.contract_updated_at) >
      toTimestamp(seen.contract_updated_at)
  ) {
    types.push("contract");
  } else if (
    current.contract_other_signed &&
    !seen.contract_other_signed &&
    !current.contract_viewer_signed
  ) {
    types.push("contract");
  }

  if (current.order_unavailable && !seen.order_unavailable) {
    types.push("status");
  }

  if (
    seen.order_updated_at &&
    toTimestamp(current.order_updated_at) > toTimestamp(seen.order_updated_at) &&
    !responseUpdated
  ) {
    types.push("order");
  }

  if (
    current.unread_complaint_messages > seen.unread_complaint_messages ||
    hasCounterUpdate(current.complaint_latest_id, seen.complaint_latest_id)
  ) {
    types.push("complaint");
  }

  if (
    hasCounterUpdate(current.payment_latest_id, seen.payment_latest_id) ||
    (seen.payment_updated_at &&
      toTimestamp(current.payment_updated_at) >
        toTimestamp(seen.payment_updated_at))
  ) {
    types.push("payment");
  }

  if (hasCounterUpdate(current.review_latest_id, seen.review_latest_id)) {
    types.push("review");
  }

  if (hasCounterUpdate(current.customer_info_max_id, seen.customer_info_max_id)) {
    types.push("customer");
  }

  if (hasCounterUpdate(current.executor_info_max_id, seen.executor_info_max_id)) {
    types.push("executor");
  }

  const uniqueTypes = [...new Set(types)];

  return {
    hasUpdates: uniqueTypes.length > 0,
    updateCount: uniqueTypes.length,
    updateTypes: uniqueTypes,
    updateLabel: uniqueTypes
      .map((type) => UPDATE_TYPE_LABELS[type] || type)
      .join(", "),
  };
}

export function getVisibleUpdateInfoForPreset(presetKey, activity, seenActivity) {
  const updateInfo = getOrderUpdateInfo(activity, seenActivity);
  if (!presetKey) return updateInfo;

  const presetTabs = TAB_PRESETS[presetKey] || [];
  const visibleTypes = new Set();

  for (const tabId of presetTabs) {
    const tabTypes = getTabActivityTypes(presetKey, tabId);
    tabTypes.forEach((type) => {
      if (updateInfo.updateTypes.includes(type)) {
        visibleTypes.add(type);
      }
    });
  }

  const updateTypes = [...visibleTypes];

  return {
    hasUpdates: updateTypes.length > 0,
    updateCount: updateTypes.length,
    updateTypes,
    updateLabel: updateTypes
      .map((type) => UPDATE_TYPE_LABELS[type] || type)
      .join(", "),
  };
}

export function enrichListItemWithUpdates(item, userId, presetKey = null) {
  const seen = getSeenActivity(userId, item.id);
  const updateInfo = presetKey
    ? getVisibleUpdateInfoForPreset(presetKey, item.activity, seen)
    : getOrderUpdateInfo(item.activity, seen);

  return {
    ...item,
    updateInfo,
  };
}

export function countUpdatesForItems(items, userId, getPresetKey) {
  return items.reduce((total, item) => {
    const presetKey = getPresetKey?.(item) ?? null;
    const enriched = enrichListItemWithUpdates(item, userId, presetKey);
    return total + (enriched.updateInfo?.hasUpdates ? 1 : 0);
  }, 0);
}
