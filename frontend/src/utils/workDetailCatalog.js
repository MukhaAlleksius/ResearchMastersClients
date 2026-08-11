/**
 * Единый справочник вкладок/пресетов/уведомлений — без React.
 * UI (workDetailTabs) и utils (notificationNavigation) берут данные отсюда.
 */

export const TAB_DEFS = {
  orderInfo: {
    id: "orderInfo",
    label: "Информация о заказе",
    shortLabel: "Заказ",
    group: "order",
    description: "Описание, бюджет, сроки и адрес выполнения",
  },
  // id с опечаткой сохранён: так пишут backend и старые уведомления
  orderResponesExecutors: {
    id: "orderResponesExecutors",
    label: "Ответы исполнителей",
    shortLabel: "Отклики",
    group: "order",
    description: "Предложения цены и сроков от мастеров",
  },
  estimateWorks: {
    id: "estimateWorks",
    label: "Смета для работ",
    shortLabel: "Смета",
    group: "work",
    description: "Перечень работ, материалы и итоговая стоимость",
  },
  estimate: {
    id: "estimate",
    label: "Смета",
    shortLabel: "Смета",
    group: "work",
    description: "Составьте смету для самостоятельного выполнения",
  },
  schedule: {
    id: "schedule",
    label: "Выполненные работы",
    shortLabel: "График",
    group: "work",
    description: "Фиксация и отчёт о выполненных работах по датам",
  },
  graphicWorks: {
    id: "graphicWorks",
    label: "Выполненные работы",
    shortLabel: "График",
    group: "work",
    description: "Фиксация выполненных работ по датам",
  },
  chat: {
    id: "chat",
    label: "Чат",
    shortLabel: "Чат",
    group: "people",
    description: "Переписка по заказу с второй стороной сделки",
  },
  customerInfo: {
    id: "customerInfo",
    label: "Информация о заказчике",
    shortLabel: "Заказчик",
    group: "people",
    description: "Контакты и заметки о заказчике",
  },
  executorInfo: {
    id: "executorInfo",
    label: "Информация об исполнителе",
    shortLabel: "Исполнитель",
    group: "people",
    description: "Контакты и данные выбранного мастера",
  },
  customerExecutorContract: {
    id: "customerExecutorContract",
    label: "Договор",
    shortLabel: "Договор",
    group: "legal",
    description: "Условия сделки: договорная цена или цена по смете",
  },
  payment: {
    id: "payment",
    label: "Оплата",
    shortLabel: "Оплата",
    group: "legal",
    description: "Платежи, эскроу и история переводов",
  },
  customerCancelOrder: {
    id: "customerCancelOrder",
    label: "Отказ от исполнения",
    shortLabel: "Отказ",
    group: "issues",
    description: "Запрос на отмену заказа заказчиком",
  },
  executorCancelOrder: {
    id: "executorCancelOrder",
    label: "Отказ от исполнения",
    shortLabel: "Отказ",
    group: "issues",
    description: "Запрос на отмену услуги исполнителем",
  },
  complaints: {
    id: "complaints",
    label: "Жалобы",
    shortLabel: "Жалобы",
    group: "issues",
    description: "Обращение к администратору по спорной ситуации",
  },
  commentsRating: {
    id: "commentsRating",
    label: "Комментарии и рейтинг",
    shortLabel: "Отзыв",
    group: "issues",
    description: "Оценка работы исполнителя после завершения",
  },
};

/** Порядок вкладок по сценарию (статус × роль). */
export const TAB_PRESETS = {
  customer_search: ["orderInfo", "orderResponesExecutors"],
  customer_self_execution: ["orderInfo", "estimate", "graphicWorks"],
  customer_wait_execute: [
    "orderInfo",
    "estimateWorks",
    "customerExecutorContract",
    "chat",
    "executorInfo",
    "customerCancelOrder",
  ],
  customer_in_progress: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "customerExecutorContract",
    "chat",
    "executorInfo",
    "customerCancelOrder",
    "complaints",
  ],
  customer_completed: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "customerExecutorContract",
    "executorInfo",
    "commentsRating",
  ],
  executor_consideration: ["orderInfo", "estimateWorks", "customerInfo"],
  executor_offer: ["orderInfo", "estimateWorks"],
  executor_wait_execute: [
    "orderInfo",
    "estimateWorks",
    "customerExecutorContract",
    "chat",
    "customerInfo",
    "executorCancelOrder",
  ],
  executor_in_progress: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "customerExecutorContract",
    "chat",
    "customerInfo",
    "executorCancelOrder",
    "complaints",
  ],
  executor_execute: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "customerExecutorContract",
    "chat",
    "customerInfo",
  ],
  executor_refused: ["orderInfo", "estimateWorks", "schedule"],
};

export const GROUP_LABELS = {
  order: "Заказ",
  work: "Работа",
  people: "Участники",
  legal: "Документы",
  issues: "Разбор",
};

/**
 * Тип уведомления → вкладка (зеркало backend/core/notification_tabs.py).
 * Роль-зависимые типы (cancel / counterparty) — в resolveNotificationTab().
 */
export const NOTIFICATION_TYPE_TO_TAB = {
  new_message: "chat",
  estimate_updated: "estimateWorks",
  schedule_updated: "schedule",
  executor_response: "orderResponesExecutors",
  executor_response_updated: "orderResponesExecutors",
  order_updated: "orderInfo",
  contract_updated: "customerExecutorContract",
  contract_signed: "customerExecutorContract",
  complaint_message: "complaints",
  payment_updated: "payment",
  work_started: "schedule",
  order_completed: "orderInfo",
  start_date_updated: "orderInfo",
  executor_assigned: "orderInfo",
  customer_status_changed: "orderInfo",
  executor_status_changed: "orderInfo",
  customer_order_offer: "orderInfo",
  customer_accepted_proposal: "orderInfo",
};

const CANCEL_NOTIFICATION_TYPES = new Set([
  "cancel_requested",
  "cancel_decision",
  "order_refused",
]);

/**
 * @param {string} notificationType
 * @param {{ isCustomerSide?: boolean }} [options]
 */
export function resolveNotificationTab(
  notificationType,
  { isCustomerSide = true } = {},
) {
  if (!notificationType) return null;

  if (CANCEL_NOTIFICATION_TYPES.has(notificationType)) {
    return isCustomerSide ? "customerCancelOrder" : "executorCancelOrder";
  }

  if (notificationType === "counterparty_info_updated") {
    return isCustomerSide ? "executorInfo" : "customerInfo";
  }

  return NOTIFICATION_TYPE_TO_TAB[notificationType] || null;
}

export function getCustomerOrderPresetKey(statusOrderCustomer) {
  const status = statusOrderCustomer || "";
  if (status.includes("В поиске исполнителя")) return "customer_search";
  if (status.includes("Самостоятельное выполнение")) return "customer_self_execution";
  if (status.includes("Ожидают выполнения")) return "customer_wait_execute";
  if (status.includes("В процессе выполнения")) return "customer_in_progress";
  if (status.includes("Выполнен")) return "customer_completed";
  return null;
}

export function getExecutorServicePresetKey(statusServiceExecutor) {
  const status = statusServiceExecutor || "";
  if (status.includes("Предложения")) return "executor_offer";
  if (status.includes("На рассмотрении")) return "executor_consideration";
  if (status.includes("Ожидают выполнения")) return "executor_wait_execute";
  if (status.includes("В процессе")) return "executor_in_progress";
  if (status.includes("Отказано заказчиком")) return "executor_refused";
  if (status.includes("Отказ от заказа")) return "executor_refused";
  if (status.includes("Выполнен")) return "executor_execute";
  return null;
}
