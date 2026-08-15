/** Типы цены заказа / отклика / договора. */

/** Варианты с обязательной суммой. */
export const FIXED_BUDGET_TYPES = [
  "Фиксированная стоимость",
  // Старые значения в БД
  "Фиксированная цена",
  "Фиксированная оплата",
  "Фиксированная сумма",
];

export const ESTIMATE_BUDGET_TYPES = ["Сметная цена"];

/** Договорная: сумма согласуется лично, поле суммы не показываем. */
export const NEGOTIABLE_BUDGET_TYPES = [
  "Договорная стоимость",
  // Старые значения в БД
  "Договорная цена",
];

/** Маска (плейсхолдер) для обязательного селекта — не значение в списке. */
export const BUDGET_TYPE_PLACEHOLDER = "Выберите тип бюджета";

/**
 * Три варианта типа бюджета.
 * value — что уходит в API / БД; label — короткая подпись в дропдауне.
 */
export const BUDGET_TYPE_OPTIONS = [
  { value: "Фиксированная стоимость", label: "Фиксированная" },
  { value: "Договорная стоимость", label: "Договорная" },
  { value: "Сметная цена", label: "Сметная" },
];

/** Варианты при размещении / редактировании заказа заказчиком. */
export const ORDER_BUDGET_TYPES = BUDGET_TYPE_OPTIONS.map((o) => o.value);

/** Варианты в отклике исполнителя. */
export const OFFER_BUDGET_TYPES = BUDGET_TYPE_OPTIONS.map((o) => o.value);

/** Варианты для договора. */
export const CONTRACT_BUDGET_TYPES = BUDGET_TYPE_OPTIONS.map((o) => o.value);

function normalizeBudgetType(type) {
  return String(type || "").trim().toLowerCase();
}

export function isFixedBudgetType(type) {
  if (FIXED_BUDGET_TYPES.includes(type)) return true;
  const value = normalizeBudgetType(type);
  if (!value || value.includes("сметн") || value.includes("договорн")) {
    return false;
  }
  return value.includes("фиксир");
}

export function isEstimateBudgetType(type) {
  if (ESTIMATE_BUDGET_TYPES.includes(type)) return true;
  return normalizeBudgetType(type).includes("сметн");
}

export function isNegotiableBudgetType(type) {
  if (NEGOTIABLE_BUDGET_TYPES.includes(type)) return true;
  const value = normalizeBudgetType(type);
  return value.includes("договорн");
}

export function classifyBudgetType(type) {
  const value = normalizeBudgetType(type);
  if (value.includes("сметн")) return "estimate";
  if (value.includes("фиксир")) return "fixed";
  if (value.includes("договорн")) return "negotiable";
  if (value.includes("почасов")) return "hourly";
  return "unknown";
}

export function budgetTypeShortLabel(dealType, dealTypeLabel = "") {
  if (dealType === "fixed") return "Фиксированная";
  if (dealType === "estimate") return "По смете";
  if (dealType === "negotiable") return "Договорная";
  if (dealType === "hourly") return "Почасовая";
  return dealTypeLabel || "";
}

/** Подсказка под типом бюджета, когда сумма не нужна. */
export function budgetTypeHint(type) {
  if (isEstimateBudgetType(type)) {
    return "Сумму заранее указывать не нужно — итоговая стоимость будет по смете.";
  }
  if (isNegotiableBudgetType(type)) {
    return "Стоимость будет согласована лично — сумму указывать не нужно.";
  }
  return "Сумму указывать не нужно.";
}

/** Приводит старые значения из БД к актуальным пунктам дропдауна. */
export function normalizeBudgetTypeForForm(type) {
  const value = String(type || "").trim();
  if (!value) return "";
  if (ORDER_BUDGET_TYPES.includes(value)) return value;
  if (isFixedBudgetType(value)) return "Фиксированная стоимость";
  if (isNegotiableBudgetType(value)) return "Договорная стоимость";
  if (isEstimateBudgetType(value)) return "Сметная цена";
  return value;
}
