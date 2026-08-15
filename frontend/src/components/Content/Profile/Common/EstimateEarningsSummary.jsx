import { useCallback, useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
import { classifyBudgetType } from "../../../../utils/budgetTypes.js";
import {
  convertAmountWithRates,
  fetchNbrbRates,
  formatMoney,
  normalizeCurrencyCode,
} from "../../../../utils/currency.js";
import { resolveEstimateCurrency } from "../../../../utils/estimateStorage.js";
import "./estimate_earnings_summary.css";

/**
 * Totals from estimate works, same formulas as Смета:
 * total = Σ cost_unit × quantity
 * done  = Σ cost_unit × done_quantity
 */
export function computeEstimateEarnings(works = []) {
  return works.reduce(
    (acc, work) => {
      const unit = Number(work.cost_unit ?? work.workPricePerUnit ?? 0);
      const qty = Number(work.quantity ?? work.workQuantity ?? 0);
      const done = Number(work.done_quantity ?? work.doneQuantity ?? 0);
      return {
        totalEarnings: acc.totalEarnings + unit * qty,
        doneEarnings: acc.doneEarnings + unit * done,
      };
    },
    { totalEarnings: 0, doneEarnings: 0 },
  );
}

function normalizeDealCurrency(code) {
  const raw = String(code || "BYN").trim().toLowerCase();
  if (raw === "byn") return "BYN";
  if (raw === "руб." || raw === "руб" || raw === "rub") return "RUB";
  if (raw === "usd") return "USD";
  if (raw === "eur") return "EUR";
  return String(code || "BYN").toUpperCase();
}

function parseAmount(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function formatBudgetLine(amount, currency) {
  if (amount == null) return "Сумма неизвестна";
  return formatMoney(amount, currency);
}

function toBynAmount(amount, currency, rates) {
  if (amount == null) return null;
  const code = normalizeCurrencyCode(currency || "BYN");
  if (code === "BYN") return amount;
  if (!rates) return amount;
  try {
    return convertAmountWithRates(amount, code, "BYN", rates);
  } catch {
    return amount;
  }
}

/**
 * Собирает все бюджеты сделки для отображения рядом.
 */
export function useEstimateEarnings(
  orderId,
  estimateUserId,
  {
    proposedPrice = null,
    offerBudgetType = null,
    offerCurrency = null,
    orderBudget = null,
    orderCurrency = null,
  } = {},
) {
  const [state, setState] = useState({
    loading: false,
    estimateTotal: 0,
    doneEarnings: 0,
    estimateCurrency: "BYN",
    hasWorks: false,
    customerAmount: null,
    customerCurrency: "BYN",
    executorAmount: null,
    executorCurrency: "BYN",
    contractAmount: null,
    contractCurrency: "BYN",
    estimateAmount: null,
    dealType: "unknown",
    dealTypeLabel: "",
    hasContract: false,
    // legacy primary (для совместимости)
    budgetAmount: null,
    budgetCurrency: "BYN",
    budgetSource: "customer",
  });

  const load = useCallback(async () => {
    if (!orderId) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const [estimateRes, contractRes, offerRes] = await Promise.all([
        estimateUserId
          ? apiFetch(
              `${API.baseURL}/works_estimate_full/${estimateUserId}/${orderId}`,
            )
          : Promise.resolve(null),
        apiFetch(buildApiUrl(`/contract/${orderId}`)),
        estimateUserId
          ? apiFetch(
              buildApiUrl(
                `/order_response_executor/${estimateUserId}/${orderId}`,
              ),
            )
          : Promise.resolve(null),
      ]);

      let estimateTotal = 0;
      let doneEarnings = 0;
      let estimateCurrency = "BYN";
      let hasWorks = false;

      if (estimateRes && estimateRes.ok) {
        const data = await estimateRes.json();
        const works = data?.works || [];
        const totals = computeEstimateEarnings(works);
        estimateTotal = totals.totalEarnings;
        doneEarnings = totals.doneEarnings;
        estimateCurrency = resolveEstimateCurrency(
          data,
          estimateUserId,
          orderId,
        );
        hasWorks = works.length > 0;
      }

      let hasContract = false;
      let contractAmount = null;
      let contractCurrency = null;
      let contractBudgetType = null;

      if (contractRes && contractRes.ok && contractRes.status !== 404) {
        const contract = await contractRes.json();
        if (contract && Object.keys(contract).length > 0) {
          hasContract = true;
          contractAmount = parseAmount(contract.budget);
          contractCurrency = normalizeDealCurrency(contract.currency);
          contractBudgetType = contract.budget_type || null;
        }
      }

      let fetchedOfferAmount = null;
      let fetchedOfferCurrency = null;
      let fetchedOfferBudgetType = null;
      if (offerRes && offerRes.ok && offerRes.status !== 404) {
        const offer = await offerRes.json();
        if (offer && Object.keys(offer).length > 0) {
          fetchedOfferAmount = parseAmount(offer.proposed_price);
          fetchedOfferCurrency = normalizeDealCurrency(offer.currency);
          fetchedOfferBudgetType = offer.budget_type || null;
        }
      }

      const resolvedOfferBudgetType =
        offerBudgetType || fetchedOfferBudgetType || null;
      const dealTypeLabel = contractBudgetType || resolvedOfferBudgetType || "";
      const dealType = classifyBudgetType(dealTypeLabel);

      const customerAmount = parseAmount(orderBudget);
      const customerCurrency = normalizeDealCurrency(
        orderCurrency || estimateCurrency || "BYN",
      );
      const executorAmount =
        parseAmount(proposedPrice) ?? fetchedOfferAmount;
      const executorCurrency = normalizeDealCurrency(
        offerCurrency || fetchedOfferCurrency || customerCurrency,
      );
      const estimateAmount = hasWorks ? estimateTotal : null;

      // Primary (актуальная) для обратной совместимости
      let budgetAmount = customerAmount;
      let budgetCurrency = customerCurrency;
      let budgetSource = "customer";

      if (dealType === "fixed") {
        if (hasContract && contractAmount != null) {
          budgetAmount = contractAmount;
          budgetCurrency = contractCurrency || executorCurrency;
          budgetSource = "contract";
        } else if (executorAmount != null) {
          budgetAmount = executorAmount;
          budgetCurrency = executorCurrency;
          budgetSource = hasContract ? "contract" : "executor";
        } else if (hasContract) {
          budgetSource = "contract";
          budgetAmount = null;
        } else if (resolvedOfferBudgetType) {
          budgetSource = "executor";
          budgetAmount = null;
        }
      } else if (dealType === "estimate") {
        if (hasWorks) {
          budgetAmount = estimateTotal;
          budgetCurrency = estimateCurrency;
          budgetSource = "estimate";
        } else if (customerAmount == null) {
          budgetSource = "estimate";
          budgetAmount = null;
        }
      }

      setState({
        loading: false,
        estimateTotal,
        doneEarnings,
        estimateCurrency,
        hasWorks,
        customerAmount,
        customerCurrency,
        executorAmount,
        executorCurrency,
        contractAmount,
        contractCurrency: contractCurrency || customerCurrency,
        estimateAmount,
        dealType,
        dealTypeLabel,
        hasContract,
        budgetAmount,
        budgetCurrency,
        budgetSource,
      });
    } catch (err) {
      console.error("Ошибка загрузки стоимости сделки:", err);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [
    orderId,
    estimateUserId,
    proposedPrice,
    offerBudgetType,
    offerCurrency,
    orderBudget,
    orderCurrency,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export function budgetSourceLabel(budgetSource) {
  if (budgetSource === "executor") return "Бюджет от исполнителя";
  if (budgetSource === "contract") return "Договорная цена";
  if (budgetSource === "estimate") return "Сметная цена";
  return "Бюджет от заказчика";
}

function MetaBudgetLine({ label, amount, currency, emphasize = false }) {
  const unknown = amount == null;
  return (
    <span
      className={`estimate-earnings-meta${
        emphasize ? " estimate-earnings-meta--primary" : ""
      }${unknown ? " estimate-earnings-meta--muted" : ""}`}
    >
      {label}:{" "}
      <strong>{formatBudgetLine(amount, currency)}</strong>
    </span>
  );
}

/** Compact chips for work-detail meta strip (visible on all tabs). */
export function EstimateEarningsMeta({
  orderId,
  estimateUserId,
  proposedPrice = null,
  offerBudgetType = null,
  offerCurrency = null,
  orderBudget = null,
  orderCurrency = null,
}) {
  const {
    loading,
    doneEarnings,
    estimateCurrency,
    hasWorks,
    customerAmount,
    customerCurrency,
    executorAmount,
    executorCurrency,
    contractAmount,
    contractCurrency,
    estimateAmount,
    budgetSource,
  } = useEstimateEarnings(orderId, estimateUserId, {
    proposedPrice,
    offerBudgetType,
    offerCurrency,
    orderBudget,
    orderCurrency,
  });

  const [rates, setRates] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNbrbRates()
      .then((data) => {
        if (!cancelled) setRates(data);
      })
      .catch(() => {
        if (!cancelled) setRates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, estimateCurrency, customerCurrency, executorCurrency, contractCurrency]);

  if (!orderId) return null;
  if (
    loading &&
    customerAmount == null &&
    executorAmount == null &&
    contractAmount == null &&
    !hasWorks
  ) {
    return (
      <span className="estimate-earnings-meta estimate-earnings-meta--muted">
        Бюджет…
      </span>
    );
  }

  return (
    <>
      <MetaBudgetLine
        label="Бюджет от заказчика"
        amount={toBynAmount(customerAmount, customerCurrency, rates)}
        currency="BYN"
        emphasize={budgetSource === "customer"}
      />
      <MetaBudgetLine
        label="Бюджет от исполнителя"
        amount={toBynAmount(executorAmount, executorCurrency, rates)}
        currency="BYN"
        emphasize={budgetSource === "executor"}
      />
      <MetaBudgetLine
        label="Договорная цена"
        amount={toBynAmount(contractAmount, contractCurrency, rates)}
        currency="BYN"
        emphasize={budgetSource === "contract"}
      />
      <MetaBudgetLine
        label="Сметная цена"
        amount={toBynAmount(estimateAmount, estimateCurrency, rates)}
        currency="BYN"
        emphasize={budgetSource === "estimate"}
      />
      {hasWorks && (
        <span className="estimate-earnings-meta estimate-earnings-meta--done">
          Уже сделано:{" "}
          <strong>
            {formatMoney(toBynAmount(doneEarnings, estimateCurrency, rates), "BYN")}
          </strong>
        </span>
      )}
    </>
  );
}

function SummaryBudgetItem({ label, amount, currency, done = false }) {
  const unknown = amount == null;
  return (
    <div
      className={`estimate-earnings-summary__item${
        done ? " estimate-earnings-summary__item--done" : ""
      }`}
    >
      <span className="estimate-earnings-summary__label">{label}</span>
      <span
        className={`estimate-earnings-summary__value${
          unknown ? " estimate-earnings-summary__value--muted" : ""
        }`}
      >
        {formatBudgetLine(amount, currency)}
      </span>
    </div>
  );
}

/** Card block for order/service info tab. */
export default function EstimateEarningsSummary({
  orderId,
  estimateUserId,
  proposedPrice = null,
  offerBudgetType = null,
  offerCurrency = null,
  orderBudget = null,
  orderCurrency = null,
  className = "",
}) {
  const {
    loading,
    doneEarnings,
    estimateCurrency,
    hasWorks,
    customerAmount,
    customerCurrency,
    executorAmount,
    executorCurrency,
    contractAmount,
    contractCurrency,
    estimateAmount,
  } = useEstimateEarnings(orderId, estimateUserId, {
    proposedPrice,
    offerBudgetType,
    offerCurrency,
    orderBudget,
    orderCurrency,
  });

  const [rates, setRates] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNbrbRates()
      .then((data) => {
        if (!cancelled) setRates(data);
      })
      .catch(() => {
        if (!cancelled) setRates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, estimateCurrency, customerCurrency, executorCurrency, contractCurrency]);

  if (!orderId) return null;

  const stillLoading =
    loading &&
    customerAmount == null &&
    executorAmount == null &&
    contractAmount == null &&
    !hasWorks;

  return (
    <div
      className={`estimate-earnings-summary ${className}`.trim()}
      aria-label="Бюджеты сделки"
    >
      <h3 className="estimate-earnings-summary__title">Бюджеты</h3>
      {stillLoading ? (
        <p className="estimate-earnings-summary__loading">Загрузка…</p>
      ) : (
        <div className="estimate-earnings-summary__grid">
          <SummaryBudgetItem
            label="Бюджет от заказчика"
            amount={toBynAmount(customerAmount, customerCurrency, rates)}
            currency="BYN"
          />
          <SummaryBudgetItem
            label="Бюджет от исполнителя"
            amount={toBynAmount(executorAmount, executorCurrency, rates)}
            currency="BYN"
          />
          <SummaryBudgetItem
            label="Договорная цена"
            amount={toBynAmount(contractAmount, contractCurrency, rates)}
            currency="BYN"
          />
          <SummaryBudgetItem
            label="Сметная цена"
            amount={toBynAmount(estimateAmount, estimateCurrency, rates)}
            currency="BYN"
          />
          {hasWorks && (
            <SummaryBudgetItem
              label="Уже сделано"
              amount={toBynAmount(doneEarnings, estimateCurrency, rates)}
              currency="BYN"
              done
            />
          )}
        </div>
      )}
    </div>
  );
}
