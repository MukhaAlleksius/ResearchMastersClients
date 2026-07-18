import { API, apiFetch } from "./api.js";

let ratesCache = null;
let ratesCacheDate = null;

const isSameLocalDay = (isoOrTimestamp) => {
  if (!isoOrTimestamp) return false;
  const cached = new Date(isoOrTimestamp);
  const now = new Date();
  return (
    cached.getFullYear() === now.getFullYear() &&
    cached.getMonth() === now.getMonth() &&
    cached.getDate() === now.getDate()
  );
};

export const normalizeCurrencyCode = (code) => {
  const value = String(code || "")
    .trim()
    .toUpperCase();
  const aliases = {
    BYN: "BYN",
    BYR: "BYN",
    USD: "USD",
    "DOLLAR USA": "USD",
    EUR: "EUR",
    EURO: "EUR",
    RUB: "RUB",
    RUR: "RUB",
  };
  return aliases[value] || value;
};

export const CURRENCY_OPTIONS = [
  { value: "BYN", label: "BYN" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "RUB", label: "RUB" },
];

/** Округление денежной суммы до копеек (без цепочки float-ошибок). */
export function roundMoney(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function formatMoney(amount, currency = "BYN") {
  const code = normalizeCurrencyCode(currency);
  const num = roundMoney(amount);
  if (Number.isNaN(num)) return `— ${code}`;
  return `${num.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${code}`;
}

export function formatMoneyInput(amount) {
  return roundMoney(amount).toFixed(2);
}

export async function fetchNbrbRates(codes) {
  if (ratesCache && isSameLocalDay(ratesCacheDate)) {
    return ratesCache;
  }

  const query = codes?.length
    ? `?codes=${codes.map(normalizeCurrencyCode).join(",")}`
    : "";
  const response = await apiFetch(`${API.baseURL}/currency/rates${query}`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить курсы валют");
  }

  ratesCache = await response.json();
  ratesCacheDate = ratesCache.updated_at || new Date().toISOString();
  return ratesCache;
}

export async function convertCurrency(amount, fromCurrency, toCurrency) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const params = new URLSearchParams({
    amount: String(amount),
    from,
    to,
  });

  const response = await apiFetch(`${API.baseURL}/currency/convert?${params}`);
  if (!response.ok) {
    throw new Error("Не удалось выполнить конвертацию");
  }

  const data = await response.json();
  return {
    ...data,
    result: roundMoney(data.result),
  };
}

function getRateRecord(ratesResponse, code) {
  const normalized = normalizeCurrencyCode(code);
  if (normalized === "BYN") {
    return { code: "BYN", scale: 1, official_rate: 1, rate_per_unit: 1 };
  }
  return ratesResponse?.rates?.find((item) => item.code === normalized) || null;
}

export function getRatePerUnit(ratesResponse, code) {
  const rate = getRateRecord(ratesResponse, code);
  if (!rate) return null;
  if (normalizeCurrencyCode(code) === "BYN") return 1;
  return Number(rate.rate_per_unit);
}

/** Конвертация через BYN по формулам НБРБ (official_rate / scale), округление только в конце. */
export function convertAmountWithRates(
  amount,
  fromCurrency,
  toCurrency,
  ratesResponse,
) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  if (num <= 0 || from === to) return roundMoney(num);

  let amountInByn = num;
  if (from !== "BYN") {
    const fromRate = getRateRecord(ratesResponse, from);
    if (!fromRate) {
      throw new Error(`Курс для ${from} не найден`);
    }
    amountInByn =
      (num * Number(fromRate.official_rate)) / Number(fromRate.scale);
  }

  if (to === "BYN") {
    return roundMoney(amountInByn);
  }

  const toRate = getRateRecord(ratesResponse, to);
  if (!toRate) {
    throw new Error(`Курс для ${to} не найден`);
  }

  const result =
    (amountInByn * Number(toRate.scale)) / Number(toRate.official_rate);
  return roundMoney(result);
}

/** Якорь цены: хранит исходную сумму, конвертация всегда от якоря (без цепочки). */
export function createMoneyAnchor(initialAmount, initialCurrency) {
  let anchor = {
    amount: roundMoney(initialAmount),
    currency: normalizeCurrencyCode(initialCurrency || "BYN"),
  };

  return {
    get: () => ({ ...anchor }),
    set: (amount, currency) => {
      anchor = {
        amount: roundMoney(amount),
        currency: normalizeCurrencyCode(currency || "BYN"),
      };
    },
    priceForCurrency: (targetCurrency, ratesResponse) => {
      const target = normalizeCurrencyCode(targetCurrency);
      if (target === anchor.currency) {
        return anchor.amount;
      }
      return convertAmountWithRates(
        anchor.amount,
        anchor.currency,
        target,
        ratesResponse,
      );
    },
  };
}
