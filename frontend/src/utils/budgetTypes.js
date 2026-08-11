/** Типы цены: у заказа — фиксированная/смета; у отклика и договора — договорная/смета. */

/** Все варианты «есть конкретная сумма» (для валидации поля суммы). */
export const FIXED_BUDGET_TYPES = [
  "Фиксированная цена",
  "Договорная цена",
  // Старые значения в БД
  "Фиксированная оплата",
  "Фиксированная сумма",
];

export const ESTIMATE_BUDGET_TYPES = ["Сметная цена"];

/** Варианты при размещении / редактировании заказа заказчиком. */
export const ORDER_BUDGET_TYPES = [
  "Договорная цена",
  "Сметная цена",
];

/** Варианты в отклике исполнителя. */
export const OFFER_BUDGET_TYPES = [
  "Договорная цена",
  "Сметная цена",
];

/** Варианты для договора. */
export const CONTRACT_BUDGET_TYPES = [
  "Договорная цена",
  "Сметная цена",
];

function normalizeBudgetType(type) {
  return String(type || "").trim().toLowerCase();
}

export function isFixedBudgetType(type) {
  if (FIXED_BUDGET_TYPES.includes(type)) return true;
  const value = normalizeBudgetType(type);
  if (!value || value.includes("сметн")) return false;
  if (value.includes("фиксир")) return true;
  // «Договорная цена» = согласованная сумма; голое «Договорная» — старый неизвестный тип
  if (value.includes("договорн") && value.includes("цен")) return true;
  return false;
}

export function isEstimateBudgetType(type) {
  if (ESTIMATE_BUDGET_TYPES.includes(type)) return true;
  return normalizeBudgetType(type).includes("сметн");
}

export function classifyBudgetType(type) {
  const value = normalizeBudgetType(type);
  if (value.includes("сметн")) return "estimate";
  if (value.includes("фиксир")) return "fixed";
  if (value.includes("договорн") && value.includes("цен")) return "fixed";
  // Старые записи «Договорная» без суммы
  if (value.includes("договорн")) return "legacy_negotiable";
  if (value.includes("почасов")) return "hourly";
  return "unknown";
}

export function budgetTypeShortLabel(dealType, dealTypeLabel = "") {
  if (dealType === "fixed") {
    const value = normalizeBudgetType(dealTypeLabel);
    if (value.includes("фиксир")) return "Фиксированная";
    return "Договорная";
  }
  if (dealType === "estimate") return "По смете";
  if (dealType === "legacy_negotiable") return "Договорная";
  if (dealType === "hourly") return "Почасовая";
  return dealTypeLabel || "";
}
