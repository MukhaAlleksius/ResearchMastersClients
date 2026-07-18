/**
 * Вкладки заказа/услуги: группы, порядок, описания.
 * group: order | work | people | legal | issues
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export const TAB_DEFS = {
  orderInfo: {
    id: "orderInfo",
    label: "Информация о заказе",
    shortLabel: "Заказ",
    group: "order",
    description: "Описание, бюджет, сроки и адрес выполнения",
  },
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
    label: "График выполнения",
    shortLabel: "График",
    group: "work",
    description: "Отчёт о выполненных работах по датам",
  },
  graphicWorks: {
    id: "graphicWorks",
    label: "График работ",
    shortLabel: "График",
    group: "work",
    description: "Планирование этапов и сроков работ",
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
    description: "Условия сотрудничества между сторонами",
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

/** Порядок вкладок по сценарию (только релевантные для статуса). */
export const TAB_PRESETS = {
  customer_search: ["orderInfo", "orderResponesExecutors"],
  customer_self_execution: ["orderInfo", "estimate", "graphicWorks"],
  customer_wait_execute: [
    "orderInfo",
    "estimateWorks",
    "chat",
    "executorInfo",
    "customerExecutorContract",
    "customerCancelOrder",
  ],
  customer_in_progress: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "chat",
    "executorInfo",
    "customerExecutorContract",
    "payment",
    "customerCancelOrder",
    "complaints",
  ],
  customer_completed: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "executorInfo",
    "customerExecutorContract",
    "payment",
    "commentsRating",
  ],
  executor_consideration: ["orderInfo", "estimateWorks", "customerInfo"],
  executor_offer: ["orderInfo", "estimateWorks"],
  executor_wait_execute: [
    "orderInfo",
    "estimateWorks",
    "chat",
    "customerInfo",
    "customerExecutorContract",
    "executorCancelOrder",
  ],
  executor_in_progress: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "chat",
    "customerInfo",
    "customerExecutorContract",
    "payment",
    "executorCancelOrder",
    "complaints",
  ],
  executor_execute: [
    "orderInfo",
    "estimateWorks",
    "schedule",
    "chat",
    "customerInfo",
    "customerExecutorContract",
  ],
  executor_refused: ["orderInfo", "estimateWorks", "schedule"],
};

const GROUP_LABELS = {
  order: "Заказ",
  work: "Работа",
  people: "Участники",
  legal: "Документы",
  issues: "Разбор",
};

/**
 * @param {keyof TAB_PRESETS} presetKey
 * @param {{ badges?: Record<string, string|number>, chatLabel?: string }} [options]
 */
export function getWorkDetailTabs(presetKey, options = {}) {
  const { badges = {}, chatLabel } = options;
  const ids = TAB_PRESETS[presetKey] || [];

  return ids
    .map((id) => {
      const def = TAB_DEFS[id];
      if (!def) return null;

      const tab = { ...def };
      if (id === "chat" && chatLabel) {
        tab.label = chatLabel;
      }

      const badge = badges[id];
      if (badge != null && badge !== "" && badge !== 0 && badge !== "0") {
        tab.badge = String(badge);
      }

      return tab;
    })
    .filter(Boolean);
}

export function getDefaultWorkDetailTab(presetKey) {
  const ids = TAB_PRESETS[presetKey];
  return ids?.[0] || "orderInfo";
}

/** Вкладка из ?tab= или location.state.activeTab (уведомления «Перейти»). */
export function resolveWorkDetailTab(presetKey, location = {}) {
  const available = TAB_PRESETS[presetKey] || [];
  const defaultTab = getDefaultWorkDetailTab(presetKey);

  const fromState = location.state?.activeTab;
  if (fromState && available.includes(fromState)) {
    return fromState;
  }

  const search = location.search || "";
  if (search) {
    const tab = new URLSearchParams(search).get("tab");
    if (tab && available.includes(tab)) {
      return tab;
    }
  }

  return defaultTab;
}

export function useWorkDetailInitialTab(presetKey) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() =>
    resolveWorkDetailTab(presetKey, location),
  );

  useEffect(() => {
    setActiveTab(resolveWorkDetailTab(presetKey, location));
  }, [presetKey, location.pathname, location.search, location.state?.activeTab]);

  return [activeTab, setActiveTab];
}

export function getTabGroupLabel(groupId) {
  return GROUP_LABELS[groupId] || "";
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
