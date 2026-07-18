import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
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

const currencies = [
  { value: "руб.", label: "RUB — Российские рубли" },
  { value: "usd", label: "USD — Доллары США" },
  { value: "eur", label: "EUR — Евро" },
  { value: "byn", label: "BYN — Белорусские рубли" },
];

export default function ContractAgreement({
  order,
  order_response_executor,
  customer,
  executor_id: executorIdProp,
  onContractUpdated,
}) {
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
    currentCurrency: "руб.",
    budgetType: "",
    customerSigned: false,
    contractorSigned: false,
  });

  const [contractData, setContractData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const resolveExecutorId = useCallback(() => {
    const candidates = [
      order_response_executor?.executor_id,
      executorIdProp,
      order?.executor_id,
      contractData?.executor_id,
    ];

    for (const value of candidates) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }

    return null;
  }, [
    order_response_executor?.executor_id,
    executorIdProp,
    order?.executor_id,
    contractData?.executor_id,
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

          const budgetDisplay = serverContract.budget
            ? `${Number(serverContract.budget).toLocaleString()} ${
                serverContract.currency || "BYN"
              }${serverContract.budget_type ? ` (${serverContract.budget_type})` : ""}`
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
            currentCurrency: serverContract.currency || "BYN",
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

  const loadFromProps = useCallback(() => {
    const customerFullName = customer
      ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : "Не указано";

    const addressParts = [
      order?.country,
      order?.region,
      order?.town || order?.city,
      order?.location,
    ].filter(Boolean);
    const fullAddress = addressParts.join(", ") || "Адрес не указан";

    const executorFullName = getFullName(order_response_executor);

    const budget = order_response_executor?.proposed_price || order?.budget;
    const currency =
      order_response_executor?.currency || order?.currency || "BYN";
    const budgetType = order_response_executor?.budget_type || "";

    const budgetDisplay = budget
      ? `${Number(budget).toLocaleString()} ${currency}${
          budgetType ? ` (${budgetType})` : ""
        }`
      : "Не указана";

    setContract({
      title: order?.title || "Договор подряда на выполнение работ",
      customerName: customerFullName,
      addressWork: fullAddress,
      contractorName: executorFullName,
      subject: order?.description || order?.title || "",
      price: budgetDisplay,
      workPeriodFrom:
        formatDateToRu(order_response_executor?.start_time_work) || "",
      workPeriodTo: formatDateToRu(order?.end_time_work) || "дата окончания",
      currentCurrency: currency,
      budgetType,
      customerSigned: false,
      contractorSigned: false,
      city: "Минск",
      date: new Date().toLocaleDateString("ru-RU"),
    });
    setError("");
  }, [order, order_response_executor, customer, getFullName]);

  useEffect(() => {
    const initializeContract = async () => {
      if (!order?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const hasServerContract = await loadContractFromServer(order.id);

      if (!hasServerContract) {
        loadFromProps();
      }

      setIsLoading(false);
    };

    initializeContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

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

      if (numericPrice > 9999999999) {
        numericPrice = 9999999999;
        setContract((prev) => ({ ...prev, price: "9 999 999 999 руб." }));
        setError("Сумма ограничена 9 999 999 999");
        return;
      }

      if (numericPrice === 0 && snapshot.price !== "Не указана") {
        setError("Укажите корректную сумму");
        return;
      }

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
        budget: numericPrice,
        currency: snapshot.currentCurrency || "BYN",
        budget_type: snapshot.budgetType || null,
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
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const savedContract = await response.json();
      setContractData(savedContract);
      onContractUpdated?.();
      setSuccessMessage("Договор сохранён");
    } catch (saveError) {
      console.error("Ошибка сохранения:", saveError);
      setError(`Ошибка сохранения: ${saveError.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [order, customer, order_response_executor, contract, onContractUpdated, resolveExecutorId]);

  const handlePriceChange = (e) => {
    const numericValue = e.target.value.replace(/[^\d]/g, "");
    if (numericValue.length > 10) return;

    setContract((prev) => ({
      ...prev,
      price: numericValue
        ? `${Number(numericValue).toLocaleString()} ${prev.currentCurrency}${
            prev.budgetType ? ` (${prev.budgetType})` : ""
          }`
        : "Не указана",
    }));
    setError("");
    setSuccessMessage("");
  };

  const handleCurrencyChange = (e) => {
    const value = e.target.value;
    const numericPart = contract.price.replace(/[^\d]/g, "");

    setContract((prev) => ({
      ...prev,
      currentCurrency: value,
      price: numericPart
        ? `${Number(numericPart).toLocaleString()} ${value}${
            prev.budgetType ? ` (${prev.budgetType})` : ""
          }`
        : "Не указана",
    }));
  };

  const handleBudgetTypeChange = useCallback(
    (e) => {
      const newBudgetType = e.target.value;
      const numericPart = contract.price.replace(/[^\d]/g, "");

      setContract((prev) => ({
        ...prev,
        budgetType: newBudgetType,
        price: numericPart
          ? `${Number(numericPart).toLocaleString()} ${prev.currentCurrency}${
              newBudgetType ? ` (${newBudgetType})` : ""
            }`
          : "Не указана",
      }));
      setError("");
      setSuccessMessage("");
    },
    [contract.price, contract.currentCurrency],
  );

  const updateContractField = useCallback((field, value) => {
    setContract((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccessMessage("");
  }, []);

  const toggleSignature = useCallback(async () => {
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
        buildApiUrl(`/subscribe_customer_contract/${order.id}?subscribe_customer=true`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      setContract((prev) => ({ ...prev, customerSigned: true }));
      setSuccessMessage("Подпись заказчика добавлена");
      onContractUpdated?.();
    } catch (signError) {
      console.error("Ошибка:", signError);
      setError("Не удалось подтвердить подпись");
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
              <span className="oi-modal__field-label">Сумма</span>
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
              <select
                className="oi-modal__select"
                value={contract.currentCurrency}
                onChange={handleCurrencyChange}
              >
                {currencies.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="oi-modal__field">
              <span className="oi-modal__field-label">Тип бюджета</span>
              <select
                className="oi-modal__select"
                value={contract.budgetType || ""}
                onChange={handleBudgetTypeChange}
              >
                <option value="">Не указан</option>
                <option value="Фиксированная сумма">Фиксированная сумма</option>
                <option value="Почасовая оплата">Почасовая оплата</option>
                <option value="Договорная цена">Договорная цена</option>
              </select>
            </label>

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
            {contract.budgetType && (
              <p className="contract-doc__paragraph">
                2.2. Оплата производится по {contract.budgetType} после
                подписания акта выполненных работ.
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
          <h3 className="contract-doc__signatures-title">Подписи сторон</h3>
          <div className="contract-doc__signatures-grid">
            <div
              className={`contract-doc__sign-card ${
                contract.customerSigned
                  ? "contract-doc__sign-card--signed"
                  : ""
              }`}
            >
              <p className="contract-doc__sign-role">Заказчик</p>
              <p className="contract-doc__sign-line">{contract.customerName}</p>
              <button
                type="button"
                disabled={contract.customerSigned || isSaving}
                onClick={toggleSignature}
                className={`contract-doc__sign-btn ${
                  contract.customerSigned
                    ? "contract-doc__sign-btn--done"
                    : "contract-doc__sign-btn--primary"
                }`}
              >
                {isSaving
                  ? "Сохранение…"
                  : contract.customerSigned
                    ? "✓ Подписано"
                    : "Подтвердить подпись"}
              </button>
            </div>

            <div
              className={`contract-doc__sign-card ${
                contract.contractorSigned
                  ? "contract-doc__sign-card--signed"
                  : "contract-doc__sign-card--pending"
              }`}
            >
              <p className="contract-doc__sign-role">Исполнитель</p>
              <p className="contract-doc__sign-line">{contract.contractorName}</p>
              <button
                type="button"
                disabled
                className={`contract-doc__sign-btn ${
                  contract.contractorSigned
                    ? "contract-doc__sign-btn--done"
                    : "contract-doc__sign-btn--waiting"
                }`}
              >
                {contract.contractorSigned ? "✓ Подписано" : "Ожидает подписи"}
              </button>
            </div>
          </div>
        </footer>

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
      </article>

      {editModal}
    </div>
  );
}
