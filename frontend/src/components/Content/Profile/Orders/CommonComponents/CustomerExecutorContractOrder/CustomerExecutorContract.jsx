import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import {
  isEstimateBudgetType,
} from "../../../../../../utils/budgetTypes.js";
import { uiAlert } from "../../../../../UiDialog/uiDialog.js";
import "../../../Services/CommonComponent/CustomerExecutorContractOrder/contract_order_executor.css";
import "../../../Services/CommonComponent/CustomerOrderInfo/customer_order_info.css";

const formatDateToRu = (dateString) => {
  if (!dateString || dateString === "дата окончания") return dateString;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateString;
  }
};

const formatDateToInput = (ruDateString) => {
  if (!ruDateString || ruDateString === "дата окончания") return "";
  try {
    const parts = ruDateString.split(".");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return "";
  } catch {
    return "";
  }
};

/** В договоре: либо сумма за работу, либо цена по смете (без отдельной «договорной»). */
const CONTRACT_PRICE_OPTIONS = [
  { value: "Фиксированная стоимость", label: "Сумма за работу" },
  { value: "Сметная цена", label: "Сметная" },
];

const CONTRACT_CURRENCY = "BYN";

function contractPriceMode(budgetType) {
  if (isEstimateBudgetType(budgetType)) return "Сметная цена";
  return "Фиксированная стоимость";
}

/**
 * role:
 * - "executor" — составляет и правит договор, подписывает как исполнитель
 * - "customer" — только просмотр и подпись заказчика
 * - "admin" — полный доступ (просмотр споров)
 */
export default function ContractAgreement({
  order,
  order_response_executor: orderResponseExecutorProp,
  customer: customerProp,
  executor_id: executorIdProp,
  onContractUpdated,
  role = "executor",
}) {
  const isAuthor = role === "executor" || role === "admin";
  const canSignAsCustomer = role === "customer" || role === "admin";
  const canSignAsExecutor = role === "executor";

  const [contract, setContract] = useState({
    title: "Договор подряда на выполнение работ",
    city: "Минск",
    date: new Date().toLocaleDateString("ru-RU"),
    customerName: "",
    addressWork: "",
    contractorName: "",
    subject: "",
    price: "Не указана",
    workPeriodFrom: "",
    workPeriodTo: "дата окончания",
    currentCurrency: CONTRACT_CURRENCY,
    budgetType: "",
    customerSigned: false,
    contractorSigned: false,
  });

  const [contractData, setContractData] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(
    orderResponseExecutorProp || null,
  );
  const [customer, setCustomer] = useState(customerProp || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setOrderResponseExecutor(orderResponseExecutorProp || null);
  }, [orderResponseExecutorProp]);

  useEffect(() => {
    setCustomer(customerProp || null);
  }, [customerProp]);

  const resolveExecutorId = useCallback(() => {
    const storedUserId = Number(
      localStorage.getItem("user_id") || localStorage.getItem("id"),
    );
    const candidates = [
      orderResponseExecutor?.executor_id,
      executorIdProp,
      order?.executor_id,
      contractData?.executor_id,
      role === "executor" ? storedUserId : null,
    ];

    for (const value of candidates) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }

    return null;
  }, [
    orderResponseExecutor?.executor_id,
    executorIdProp,
    order?.executor_id,
    contractData?.executor_id,
    role,
  ]);

  const getFullName = useCallback((data) => {
    if (data?.executor_name?.first_name) {
      const first = data.executor_name.first_name;
      const second = data.executor_name.second_name || "";
      return `${first} ${second}`.trim();
    }
    if (data?.first_name) {
      return (
        `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
        "Не указано"
      );
    }
    return "Не указано";
  }, []);

  const loadContractFromServer = async (orderId) => {
    if (!orderId) return false;

    try {
      const response = await apiFetch(buildApiUrl(`/contract/${orderId}`));

      if (response.ok) {
        const serverContract = await response.json();

        if (serverContract && Object.keys(serverContract).length > 0) {
          setContractData(serverContract);

          const isEstimate = String(serverContract.budget_type || "")
            .toLowerCase()
            .includes("сметн");
          const budgetDisplay =
            serverContract.budget != null && serverContract.budget !== ""
              ? `${Number(serverContract.budget).toLocaleString()} ${CONTRACT_CURRENCY}`
              : isEstimate
                ? "По смете"
                : "Не указана";

          setContract({
            title:
              serverContract.title_work ||
              "Договор подряда на выполнение работ",
            subject: serverContract.name_work || "",
            addressWork: serverContract.address_work || "",
            workPeriodFrom:
              formatDateToRu(serverContract.date_start_work) || "",
            workPeriodTo:
              formatDateToRu(serverContract.date_end_work) || "дата окончания",
            price: budgetDisplay,
            currentCurrency: CONTRACT_CURRENCY,
            budgetType: serverContract.budget_type || "",
            customerName: serverContract.customer_name || "Не указано",
            contractorName: serverContract.executor_name || "Не указано",
            customerSigned: serverContract.subscribe_customer || false,
            contractorSigned: serverContract.subscribe_executor || false,
            city: "Минск",
            date: new Date().toLocaleDateString("ru-RU"),
          });

          setError("");
          return true;
        }
      }
    } catch (err) {
      console.error("Ошибка загрузки контракта:", err);
    }
    return false;
  };

  const loadFromProps = useCallback(
    (offer = orderResponseExecutor, customerData = customer) => {
      const customerFullName = customerData
        ? `${customerData.first_name || ""} ${customerData.last_name || ""}`.trim() ||
          "Не указано"
        : "Не указано";

      const addressParts = [
        order?.country,
        order?.region,
        order?.town || order?.city,
        order?.location,
      ].filter(Boolean);
      const fullAddress = addressParts.join(", ") || "Адрес не указан";

      const executorFullName = getFullName(offer);

      const budget = offer?.proposed_price || order?.budget;
      const budgetType = offer?.budget_type || order?.budget_type || "";

      const budgetDisplay = budget
        ? `${Number(budget).toLocaleString()} ${CONTRACT_CURRENCY}`
        : isEstimateBudgetType(budgetType)
          ? "По смете"
          : "Не указана";

      setContract({
        title: order?.title || "Договор подряда на выполнение работ",
        customerName: customerFullName,
        addressWork: fullAddress,
        contractorName: executorFullName,
        subject: order?.description || order?.title || "",
        price: budgetDisplay,
        workPeriodFrom: formatDateToRu(offer?.start_time_work) || "",
        workPeriodTo: formatDateToRu(order?.end_time_work) || "дата окончания",
        currentCurrency: CONTRACT_CURRENCY,
        budgetType,
        customerSigned: false,
        contractorSigned: false,
        city: "Минск",
        date: new Date().toLocaleDateString("ru-RU"),
      });
      setError("");
    },
    [order, orderResponseExecutor, customer, getFullName],
  );

  useEffect(() => {
    const initializeContract = async () => {
      if (!order?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      let offer = orderResponseExecutorProp || null;
      let customerData = customerProp || null;
      const executorId =
        Number(executorIdProp) ||
        Number(localStorage.getItem("user_id") || localStorage.getItem("id")) ||
        null;

      try {
        if (!offer && executorId) {
          const offerRes = await apiFetch(
            buildApiUrl(`/order_response_executor/${executorId}/${order.id}`),
          );
          if (offerRes.ok) {
            offer = await offerRes.json();
            setOrderResponseExecutor(offer);
          }
        }

        const customerId = Number(customerData?.id ?? order?.customer_id);
        if (
          (!customerData || !customerData.first_name) &&
          Number.isFinite(customerId) &&
          customerId > 0
        ) {
          const profileRes = await apiFetch(
            buildApiUrl(`/profile?user_id=${customerId}`),
          );
          if (profileRes.ok) {
            customerData = await profileRes.json();
            setCustomer(customerData);
          }
        }

        if (role === "executor" && executorId) {
          const selfRes = await apiFetch(
            buildApiUrl(`/profile?user_id=${executorId}`),
          );
          if (selfRes.ok) {
            const selfProfile = await selfRes.json();
            if (!offer) offer = {};
            if (!offer.executor_name && !offer.first_name) {
              offer = {
                ...offer,
                executor_id: executorId,
                first_name: selfProfile.first_name,
                last_name: selfProfile.last_name,
              };
              setOrderResponseExecutor(offer);
            }
          }
        }
      } catch (err) {
        console.error("Ошибка подготовки данных договора:", err);
      }

      const hasServerContract = await loadContractFromServer(order.id);

      if (!hasServerContract) {
        if (isAuthor) {
          loadFromProps(offer, customerData);
        } else {
          setContractData(null);
        }
      }

      setIsLoading(false);
    };

    initializeContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, role]);

  // Заказчик ждёт договор от исполнителя — периодически проверяем появление
  useEffect(() => {
    if (isAuthor || !order?.id || contractData) return undefined;

    const timer = setInterval(async () => {
      const loaded = await loadContractFromServer(order.id);
      if (loaded) {
        onContractUpdated?.();
      }
    }, 5000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthor, order?.id, contractData]);

  const saveContract = useCallback(async () => {
    if (!order?.id) {
      setError("Нет ID заказа");
      setSuccessMessage("");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const snapshot = { ...contract };

      let numericPrice = parseInt(snapshot.price.replace(/[^\d]/g, ""), 10) || 0;
      const estimateBased = isEstimateBudgetType(snapshot.budgetType);
      const priceMode = contractPriceMode(snapshot.budgetType);

      if (!estimateBased && numericPrice > 9999999999) {
        numericPrice = 9999999999;
        setContract((prev) => ({ ...prev, price: `9 999 999 999 ${CONTRACT_CURRENCY}` }));
        setError("Сумма ограничена 9 999 999 999");
        return;
      }

      if (!estimateBased && numericPrice <= 0) {
        setError("Укажите сумму за работу");
        return;
      }

      // Сметная цена: сумму в БД не сохраняем — она определяется сметой
      const budgetToSave = estimateBased ? null : numericPrice;

      const resolvedExecutorId = resolveExecutorId();
      if (!resolvedExecutorId) {
        setError(
          "Не удалось определить исполнителя. Обновите страницу или выберите исполнителя в заказе.",
        );
        return;
      }

      const resolvedCustomerId = Number(customer?.id ?? order?.customer_id);
      if (!Number.isFinite(resolvedCustomerId) || resolvedCustomerId <= 0) {
        setError("Не удалось определить заказчика");
        return;
      }

      const contractDataToSave = {
        order_id: order.id,
        customer_id: resolvedCustomerId,
        executor_id: resolvedExecutorId,
        address_work: snapshot.addressWork || "",
        title_work: snapshot.title || "",
        name_work: snapshot.subject || "",
        date_start_work: snapshot.workPeriodFrom,
        date_end_work: snapshot.workPeriodTo || "",
        budget: budgetToSave,
        currency: CONTRACT_CURRENCY,
        budget_type: priceMode,
        subscribe_customer: snapshot.customerSigned || false,
        subscribe_executor: snapshot.contractorSigned || false,
      };

      const token =
        localStorage.getItem("access_token") || localStorage.getItem("token");
      const response = await apiFetch(buildApiUrl("/add_contract"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(contractDataToSave),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let detail = errorText;
        try {
          const parsed = JSON.parse(errorText);
          detail = parsed.detail || parsed.message || errorText;
          if (Array.isArray(detail)) {
            detail = detail
              .map((item) => item.msg || JSON.stringify(item))
              .join("; ");
          }
        } catch {
          /* raw text */
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const savedContract = await response.json();
      setContractData(savedContract);
      if (savedContract) {
        const isEstimate = isEstimateBudgetType(
          savedContract.budget_type || snapshot.budgetType,
        );
        const budgetDisplay =
          savedContract.budget != null && savedContract.budget !== ""
            ? `${Number(savedContract.budget).toLocaleString()} ${CONTRACT_CURRENCY}`
            : isEstimate
              ? "По смете"
              : "Не указана";
        setContract((prev) => ({
          ...prev,
          price: budgetDisplay,
          budgetType: savedContract.budget_type || prev.budgetType,
          currentCurrency: CONTRACT_CURRENCY,
          customerSigned: Boolean(savedContract.subscribe_customer),
          contractorSigned: Boolean(savedContract.subscribe_executor),
        }));
      }
      onContractUpdated?.();
      setIsModalOpen(false);
      setSuccessMessage("Договор сохранён");
      await uiAlert("Договор сохранён");
    } catch (saveError) {
      console.error("Ошибка сохранения:", saveError);
      setError(`Ошибка сохранения: ${saveError.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [order, customer, orderResponseExecutor, contract, onContractUpdated, resolveExecutorId]);

  const handlePriceChange = (e) => {
    const numericValue = e.target.value.replace(/[^\d]/g, "");
    if (numericValue.length > 10) return;

    setContract((prev) => ({
      ...prev,
      price: numericValue
        ? `${Number(numericValue).toLocaleString()} ${CONTRACT_CURRENCY}`
        : "Не указана",
      currentCurrency: CONTRACT_CURRENCY,
    }));
    setError("");
    setSuccessMessage("");
  };

  const handleBudgetTypeChange = useCallback(
    (e) => {
      const newBudgetType = e.target.value;
      const estimateBased = isEstimateBudgetType(newBudgetType);
      const numericPart = contract.price.replace(/[^\d]/g, "");

      setContract((prev) => ({
        ...prev,
        budgetType: newBudgetType,
        currentCurrency: CONTRACT_CURRENCY,
        price: estimateBased
          ? "По смете"
          : numericPart
            ? `${Number(numericPart).toLocaleString()} ${CONTRACT_CURRENCY}`
            : "Не указана",
      }));
      setError("");
      setSuccessMessage("");
    },
    [contract.price],
  );

  const updateContractField = useCallback((field, value) => {
    setContract((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccessMessage("");
  }, []);

  const toggleCustomerSignature = useCallback(async () => {
    if (!order?.id) {
      setError("Нет ID заказа");
      setSuccessMessage("");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        buildApiUrl(
          `/subscribe_customer_contract/${order.id}?subscribe_customer=true`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      setContract((prev) => ({ ...prev, customerSigned: true }));
      setSuccessMessage("Согласие заказчика добавлено");
      onContractUpdated?.();
    } catch (signError) {
      console.error("Ошибка:", signError);
      setError("Не удалось подтвердить согласие");
    } finally {
      setIsSaving(false);
    }
  }, [order?.id, onContractUpdated]);

  const toggleExecutorSignature = useCallback(async () => {
    if (!order?.id) {
      setError("Нет ID заказа");
      setSuccessMessage("");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(
        buildApiUrl(
          `/subscribe_executor_contract/${order.id}?subscribe_executor=true`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      setContract((prev) => ({ ...prev, contractorSigned: true }));
      setSuccessMessage("Согласие исполнителя добавлено");
      onContractUpdated?.();
    } catch (signError) {
      console.error("Ошибка:", signError);
      setError("Не удалось подтвердить согласие");
    } finally {
      setIsSaving(false);
    }
  }, [order?.id, onContractUpdated]);

  if (isLoading) {
    return (
      <div className="contract-doc contract-doc--loading">
        <div className="contract-doc__spinner" aria-hidden="true" />
        <p className="contract-doc__loading-text">Загрузка договора…</p>
      </div>
    );
  }

  if (!isAuthor && !contractData) {
    return (
      <div className="contract-doc contract-doc--empty">
        <div className="contract-doc__empty-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="contract-doc__empty-title">Договор пока не создан</h2>
        <p className="contract-doc__empty-text">
          Договор подряда появится здесь автоматически, как только исполнитель
          его сохранит или подпишет.
        </p>
        <p className="contract-doc__empty-meta">
          Ожидаем договор от исполнителя
        </p>
        <p className="contract-doc__empty-meta">{order?.title || "Заказ"}</p>
      </div>
    );
  }

  const periodFrom = formatDateToRu(contract.workPeriodFrom);
  const periodTo = formatDateToRu(contract.workPeriodTo);

  const editModal =
    isModalOpen &&
    createPortal(
      <div
        className="oi-modal-overlay"
        onClick={() => setIsModalOpen(false)}
        role="presentation"
      >
        <div
          className="oi-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-contract-title"
        >
          <header className="oi-modal__header">
            <h3 id="edit-contract-title" className="oi-modal__title">
              Редактировать договор
            </h3>
            <button
              type="button"
              className="oi-modal__close"
              onClick={() => setIsModalOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </header>

          <div className="oi-modal__body">
            {error && (
              <div className="order-info__alert" role="alert">
                {error}
              </div>
            )}

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">Предмет договора</span>
              <input
                type="text"
                className="oi-modal__input"
                value={contract.subject}
                onChange={(e) => updateContractField("subject", e.target.value)}
                placeholder="Выполнение ремонтных работ"
              />
            </label>

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">Адрес работ</span>
              <input
                type="text"
                className="oi-modal__input"
                value={contract.addressWork}
                onChange={(e) =>
                  updateContractField("addressWork", e.target.value)
                }
                placeholder="г. Минск, ул. Притыцкого 123"
              />
            </label>

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">Оплата</span>
              <select
                className="oi-modal__select"
                value={contractPriceMode(contract.budgetType)}
                onChange={handleBudgetTypeChange}
              >
                {CONTRACT_PRICE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {!isEstimateBudgetType(contract.budgetType) ? (
              <>
                <label className="oi-modal__field">
                  <span className="oi-modal__field-label">Сумма за работу</span>
                  <input
                    type="text"
                    className="oi-modal__input"
                    value={contract.price.replace(/[^\d]/g, "").trim() || ""}
                    onChange={handlePriceChange}
                    placeholder="45000"
                  />
                </label>
                <label className="oi-modal__field">
                  <span className="oi-modal__field-label">Валюта</span>
                  <p className="oi-modal__input" style={{ margin: 0 }}>
                    {CONTRACT_CURRENCY}
                  </p>
                </label>
              </>
            ) : (
              <p className="oi-modal__hint">
                Сумму в договор не сохраняем — итоговая стоимость определится по
                смете работ.
              </p>
            )}

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">Срок выполнения с</span>
              <input
                type="date"
                className="oi-modal__input"
                value={formatDateToInput(contract.workPeriodFrom)}
                onChange={(e) =>
                  updateContractField(
                    "workPeriodFrom",
                    formatDateToRu(e.target.value),
                  )
                }
              />
            </label>

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">по</span>
              <input
                type="date"
                className="oi-modal__input"
                value={formatDateToInput(contract.workPeriodTo)}
                onChange={(e) =>
                  updateContractField(
                    "workPeriodTo",
                    formatDateToRu(e.target.value),
                  )
                }
              />
            </label>
          </div>

          <footer className="oi-modal__footer">
            <button
              type="button"
              className="oi-modal__btn-cancel"
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving}
            >
              Отмена
            </button>
            <button
              type="button"
              className="oi-modal__btn-submit"
              disabled={isSaving}
              onClick={async () => {
                setIsModalOpen(false);
                await saveContract();
              }}
            >
              {isSaving ? "Сохранение…" : "Сохранить изменения"}
            </button>
          </footer>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="contract-doc">
      {error && (
        <div className="contract-doc__alert" role="alert">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="contract-doc__alert contract-doc__alert--success" role="status">
          {successMessage}
        </div>
      )}

      <article className="contract-doc__shell">
        <header className="contract-doc__hero">
          <span className="contract-doc__badge">Договор подряда</span>
          <h1 className="contract-doc__title">{contract.title}</h1>
          <p className="contract-doc__meta-line">
            <strong>{contract.city}</strong>, «{contract.date}» · заказ #
            {order?.id}
            {contractData ? " · сохранён" : " · черновик"}
          </p>
        </header>

        <div className="contract-doc__summary">
          <div className="contract-doc__summary-card">
            <span className="contract-doc__summary-label">Заказчик</span>
            <span className="contract-doc__summary-value contract-doc__summary-value--customer">
              {contract.customerName}
            </span>
          </div>
          <div className="contract-doc__summary-card">
            <span className="contract-doc__summary-label">Исполнитель</span>
            <span className="contract-doc__summary-value contract-doc__summary-value--executor">
              {contract.contractorName}
            </span>
          </div>
          <div className="contract-doc__summary-card">
            <span className="contract-doc__summary-label">Стоимость</span>
            <span className="contract-doc__summary-value contract-doc__summary-value--price">
              {contract.price}
            </span>
          </div>
          <div className="contract-doc__summary-card">
            <span className="contract-doc__summary-label">Сроки работ</span>
            <span className="contract-doc__summary-value">
              {periodFrom} — {periodTo}
            </span>
          </div>
          {contract.subject && (
            <div className="contract-doc__summary-card">
              <span className="contract-doc__summary-label">Предмет</span>
              <span className="contract-doc__summary-value">
                {contract.subject}
              </span>
            </div>
          )}
          {contract.addressWork && (
            <div className="contract-doc__summary-card">
              <span className="contract-doc__summary-label">Адрес</span>
              <span className="contract-doc__summary-value">
                {contract.addressWork}
              </span>
            </div>
          )}
        </div>

        <div className="contract-doc__body">
          <p className="contract-doc__preamble">
            <span className="contract-doc__party contract-doc__party--customer">
              {contract.customerName}
            </span>
            , именуемый в дальнейшем «Заказчик», с одной стороны, и{" "}
            <span className="contract-doc__party contract-doc__party--executor">
              {contract.contractorName}
            </span>
            , именуемый в дальнейшем «Исполнитель», с другой стороны, заключили
            настоящий договор о нижеследующем:
          </p>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">1</span>
              Предмет договора
            </h2>
            <p className="contract-doc__paragraph">
              1.1. Исполнитель обязуется выполнить работы по{" "}
              <strong>{contract.subject}</strong> по адресу:{" "}
              <strong>{contract.addressWork}</strong> для Заказчика, а Заказчик
              обязуется принять и оплатить выполненные работы в порядке и сроки,
              установленные настоящим договором.
            </p>
          </section>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">2</span>
              Стоимость и порядок оплаты
            </h2>
            <p className="contract-doc__paragraph">
              2.1. Общая стоимость работ составляет{" "}
              <strong>{contract.price}</strong>.
            </p>
            {isEstimateBudgetType(contract.budgetType) ? (
              <p className="contract-doc__paragraph">
                2.2. Оплата производится по смете после подписания акта
                выполненных работ.
              </p>
            ) : (
              <p className="contract-doc__paragraph">
                2.2. Оплата производится после подписания акта выполненных
                работ.
              </p>
            )}
          </section>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">3</span>
              Сроки выполнения работ
            </h2>
            <p className="contract-doc__paragraph">
              3.1. Работы должны быть выполнены в период с «
              <strong>{periodFrom}</strong>» по «<strong>{periodTo}</strong>».
            </p>
            <p className="contract-doc__paragraph">
              3.2. Возможные изменения сроков согласовываются сторонами в
              письменной форме.
            </p>
          </section>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">4</span>
              Обязанности сторон
            </h2>
            <p className="contract-doc__subheading">4.1. Исполнитель обязуется:</p>
            <ul className="contract-doc__list">
              <li>Выполнить работы качественно и в установленные сроки</li>
              <li>Соблюдать технику безопасности</li>
              <li>Предоставить акты выполненных работ</li>
            </ul>
            <p className="contract-doc__subheading">4.2. Заказчик обязуется:</p>
            <ul className="contract-doc__list">
              <li>Обеспечить доступ к объекту работ</li>
              <li>Принять работы по акту</li>
              <li>Оплатить выполненные работы вовремя</li>
            </ul>
          </section>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">5</span>
              Ответственность сторон
            </h2>
            <p className="contract-doc__paragraph">
              5.1. За нарушение сроков и качества работ стороны несут
              ответственность согласно действующему законодательству РБ.
            </p>
            <p className="contract-doc__paragraph">
              5.2. Все споры решаются путём переговоров или в судебном порядке по
              месту нахождения Заказчика.
            </p>
          </section>

          <section className="contract-doc__section">
            <h2 className="contract-doc__section-title">
              <span className="contract-doc__section-num">6</span>
              Заключительные положения
            </h2>
            <p className="contract-doc__paragraph">
              6.1. Настоящий договор вступает в силу с момента подписания.
            </p>
            <p className="contract-doc__paragraph">
              6.2. Договор составлен в двух экземплярах, имеющих равную
              юридическую силу.
            </p>
          </section>
        </div>

        <footer className="contract-doc__signatures">
          <h3 className="contract-doc__signatures-title">Согласия пользователей</h3>
          <div className="contract-doc__signatures-grid">
            <div
              className={`contract-doc__sign-card ${
                contract.customerSigned
                  ? "contract-doc__sign-card--signed"
                  : canSignAsCustomer
                    ? ""
                    : "contract-doc__sign-card--pending"
              }`}
            >
              <p className="contract-doc__sign-role">Заказчик</p>
              <p className="contract-doc__sign-line">{contract.customerName}</p>
              {canSignAsCustomer ? (
                <button
                  type="button"
                  disabled={contract.customerSigned || isSaving || !contractData}
                  onClick={toggleCustomerSignature}
                  className={`contract-doc__sign-btn ${
                    contract.customerSigned
                      ? "contract-doc__sign-btn--done"
                      : "contract-doc__sign-btn--primary"
                  }`}
                >
                  {isSaving
                    ? "Сохранение…"
                    : contract.customerSigned
                      ? "Согласие дано"
                      : "Подтвердить согласие"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className={`contract-doc__sign-btn ${
                    contract.customerSigned
                      ? "contract-doc__sign-btn--done"
                      : "contract-doc__sign-btn--waiting"
                  }`}
                >
                  {contract.customerSigned ? "Согласие дано" : "Ожидает согласия"}
                </button>
              )}
            </div>

            <div
              className={`contract-doc__sign-card ${
                contract.contractorSigned
                  ? "contract-doc__sign-card--signed"
                  : canSignAsExecutor
                    ? ""
                    : "contract-doc__sign-card--pending"
              }`}
            >
              <p className="contract-doc__sign-role">Исполнитель</p>
              <p className="contract-doc__sign-line">{contract.contractorName}</p>
              {canSignAsExecutor ? (
                <button
                  type="button"
                  disabled={
                    contract.contractorSigned || isSaving || !contractData
                  }
                  onClick={toggleExecutorSignature}
                  className={`contract-doc__sign-btn ${
                    contract.contractorSigned
                      ? "contract-doc__sign-btn--done"
                      : "contract-doc__sign-btn--primary"
                  }`}
                >
                  {isSaving
                    ? "Сохранение…"
                    : contract.contractorSigned
                      ? "Согласие дано"
                      : "Подтвердить согласие"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className={`contract-doc__sign-btn ${
                    contract.contractorSigned
                      ? "contract-doc__sign-btn--done"
                      : "contract-doc__sign-btn--waiting"
                  }`}
                >
                  {contract.contractorSigned ? "Согласие дано" : "Ожидает согласия"}
                </button>
              )}
            </div>
          </div>
        </footer>

        {isAuthor && (
          <div className="contract-doc__actions">
            <button
              type="button"
              className="contract-doc__action-btn contract-doc__action-btn--primary"
              onClick={saveContract}
              disabled={isSaving}
            >
              {isSaving ? "Сохранение…" : "Сохранить договор"}
            </button>
            <button
              type="button"
              className="contract-doc__action-btn contract-doc__action-btn--secondary"
              onClick={() => setIsModalOpen(true)}
              disabled={isSaving}
            >
              Изменить условия
            </button>
          </div>
        )}
      </article>

      {isAuthor ? editModal : null}
    </div>
  );
}
