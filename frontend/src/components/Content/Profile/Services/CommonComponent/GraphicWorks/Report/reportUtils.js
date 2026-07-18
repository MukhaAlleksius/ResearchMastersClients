import { convertAmountWithRates } from "../../../../../../../utils/currency.js";

export const isoToDisplayDate = (isoDate) => {
  if (!isoDate) return "";
  const normalized = String(isoDate).split("T")[0];
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year.slice(-2)}`;
};

export const displayDateToIso = (displayValue) => {
  const raw = String(displayValue || "").trim();
  if (!raw) return "";

  const parts = raw.split(/[.\-/]/).map((part) => part.trim());
  if (parts.length !== 3) return "";

  const [day, month, yearPart] = parts;
  if (!day || !month || !yearPart) return "";

  const year =
    yearPart.length === 2 ? `20${yearPart}` : yearPart.padStart(4, "0");
  const dd = day.padStart(2, "0");
  const mm = month.padStart(2, "0");
  const iso = `${year}-${mm}-${dd}`;

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(mm) ||
    parsed.getDate() !== Number(dd)
  ) {
    return "";
  }

  return iso;
};

export const formatDate = (dateString) => isoToDisplayDate(dateString);

export function normalizeIsoDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (!raw) return "";

  const isoPart = raw.split(/[T\s]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) {
    return isoPart;
  }

  const displayMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (displayMatch) {
    const [, day, month, yearPart] = displayMatch;
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart.padStart(4, "0");
    return `${year}-${month}-${day}`;
  }

  return isoPart;
}

export function hasPeriodSelected(
  dateMode,
  singleDate,
  rangeStart,
  rangeEnd,
) {
  if (dateMode === "single") {
    return Boolean(normalizeIsoDate(singleDate));
  }
  return Boolean(normalizeIsoDate(rangeStart) && normalizeIsoDate(rangeEnd));
}

export function getPeriodLabel(
  dateMode,
  singleDate,
  rangeStart,
  rangeEnd,
) {
  if (dateMode === "single") {
    const date = normalizeIsoDate(singleDate);
    return date ? isoToDisplayDate(date) : "";
  }

  const start = normalizeIsoDate(rangeStart);
  const end = normalizeIsoDate(rangeEnd);
  if (!start || !end) return "";
  return `${isoToDisplayDate(start)} — ${isoToDisplayDate(end)}`;
}

export function filterRowsByPeriod(
  rows,
  { dateMode, singleDate, rangeStart, rangeEnd },
  { strict = false } = {},
) {
  const periodReady = hasPeriodSelected(
    dateMode,
    singleDate,
    rangeStart,
    rangeEnd,
  );

  if (!periodReady) {
    return strict ? [] : rows;
  }

  if (dateMode === "single") {
    const target = normalizeIsoDate(singleDate);
    return rows.filter((row) => normalizeIsoDate(row.date) === target);
  }

  let start = normalizeIsoDate(rangeStart);
  let end = normalizeIsoDate(rangeEnd);
  if (start > end) {
    [start, end] = [end, start];
  }

  return rows.filter((row) => {
    const rowDate = normalizeIsoDate(row.date);
    return rowDate >= start && rowDate <= end;
  });
}

export const formatMoney = (value, currency = "BYN") =>
  `${Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

export function buildPriceMap(estimateWorks) {
  const byId = new Map();
  const byName = new Map();
  (estimateWorks || []).forEach((w) => {
    const price = Number(w.cost_unit ?? w.cost ?? 0);
    if (w.id != null) byId.set(String(w.id), price);
    if (w.work_id != null) byId.set(String(w.work_id), price);
    const name = w.name_work;
    if (name) byName.set(name, price);
  });
  return { byId, byName };
}

export function buildPriceMapWithCurrency(estimateWorks) {
  const byId = new Map();
  const byName = new Map();
  (estimateWorks || []).forEach((w) => {
    const entry = {
      price: Number(w.cost_unit ?? w.cost ?? 0),
      currency: w.currency || "BYN",
    };
    if (w.id != null) byId.set(String(w.id), entry);
    if (w.work_id != null) byId.set(String(w.work_id), entry);
    const name = w.name_work;
    if (name) byName.set(name, entry);
  });
  return { byId, byName };
}

export function buildConvertedPriceMap(sourceMap, displayCurrency, ratesResponse) {
  const convertEntry = (entry) => {
    if (!entry) return 0;
    if (typeof entry === "number") return entry;
    return convertAmountWithRates(
      entry.price,
      entry.currency,
      displayCurrency,
      ratesResponse,
    );
  };

  const byId = new Map();
  const byName = new Map();
  sourceMap.byId.forEach((entry, key) => {
    byId.set(key, convertEntry(entry));
  });
  sourceMap.byName.forEach((entry, key) => {
    byName.set(key, convertEntry(entry));
  });
  return { byId, byName };
}

export function getPriceForWork(rawWork, priceMap) {
  const fromRow = Number(rawWork.cost_unit ?? rawWork.cost ?? rawWork.price ?? 0);
  if (fromRow > 0) return fromRow;

  const id = rawWork.work_id ?? rawWork.work_master_id;
  if (id != null && priceMap.byId.has(String(id))) {
    return priceMap.byId.get(String(id));
  }
  if (rawWork.name_work && priceMap.byName.has(rawWork.name_work)) {
    return priceMap.byName.get(rawWork.name_work);
  }
  return 0;
}

export function computeEarnings(rows, currency) {
  const byWork = {};
  let totalQty = 0;
  let totalEarned = 0;

  rows.forEach((row) => {
    const qty = Number(row.totalQuantity || 0);
    const earned = Number(row.earned || 0);
    totalQty += qty;
    totalEarned += earned;

    if (!byWork[row.workName]) {
      byWork[row.workName] = { quantity: 0, earned: 0, unit: row.unit };
    }
    byWork[row.workName].quantity += qty;
    byWork[row.workName].earned += earned;
  });

  return {
    currency,
    totalQty,
    totalEarned,
    breakdown: Object.entries(byWork)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.earned - a.earned),
  };
}

export const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 12,
    borderColor: state.isFocused ? "#2563eb" : "#e2e8f0",
    backgroundColor: "#fff",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    "&:hover": { borderColor: "#94a3b8" },
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 40,
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
  }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected
      ? "#2563eb"
      : state.isFocused
        ? "#eff6ff"
        : "#fff",
    color: state.isSelected ? "#fff" : "#0f172a",
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#1d4ed8",
    fontWeight: 600,
    fontSize: "0.8125rem",
  }),
};
