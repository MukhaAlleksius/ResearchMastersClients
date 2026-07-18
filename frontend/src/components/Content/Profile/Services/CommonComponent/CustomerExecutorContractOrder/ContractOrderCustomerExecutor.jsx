import React, { useCallback, useState } from "react";
import { apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import {
  CONTRACT_POLL_MS,
  useLiveContract,
} from "../../../Common/useContractStatus.js";

import "./contract_order_executor.css";

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

export default function ContractExecutor({
  order,
  onContractUpdated,
  pollForUpdates = true,
  pollIntervalMs = CONTRACT_POLL_MS,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const {
    contract,
    exists,
    isLoading,
    isPolling,
    refetch,
  } = useLiveContract(order?.id, {
    enabled: Boolean(order?.id),
    pollIntervalMs,
    pollWhileIncomplete: pollForUpdates,
    onUpdated: onContractUpdated,
  });

  const saveContractSignature = useCallback(async () => {
    if (!contract?.orderId) return;

    setIsSaving(true);
    setError("");

    try {
      const response = await apiFetch(
        buildApiUrl(
          `/subscribe_executor_contract/${contract.orderId}?subscribe_executor=true`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Ошибка сервера:", response.status, errorText);
        setError("Ошибка сохранения подписи исполнителя");
        return;
      }

      const updatedContractData = await response.json();
      if (updatedContractData) {
        onContractUpdated?.();
        await refetch({ silent: true });
      }
    } catch (err) {
      console.error("Ошибка сохранения:", err);
      setError("Ошибка сохранения подписи");
    } finally {
      setIsSaving(false);
    }
  }, [contract?.orderId, onContractUpdated, refetch]);

  const toggleSignature = useCallback(() => {
    saveContractSignature();
  }, [saveContractSignature]);

  if (isLoading) {
    return (
      <div className="contract-doc contract-doc--loading">
        <div className="contract-doc__spinner" aria-hidden="true" />
        <p className="contract-doc__loading-text">Загрузка договора…</p>
      </div>
    );
  }

  if (!exists || !contract) {
    return (
      <div className="contract-doc contract-doc--empty">
        <div className="contract-doc__empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="contract-doc__empty-title">Договор пока не создан</h2>
        <p className="contract-doc__empty-text">
          Договор подряда появится здесь автоматически, как только заказчик его
          сохранит или подпишет.
        </p>
        {pollForUpdates && (
          <p className="contract-doc__empty-meta">
            {isPolling ? "Проверяем обновления…" : "Ожидаем договор от заказчика"}
          </p>
        )}
        <p className="contract-doc__empty-meta">
          Заказ #{order?.id || "не указан"}
        </p>
      </div>
    );
  }

  const periodFrom = formatDateToRu(contract.workPeriodFrom);
  const periodTo = formatDateToRu(contract.workPeriodTo);

  return (
    <div className="contract-doc">
      {error && (
        <div className="contract-doc__alert" role="alert">
          {error}
        </div>
      )}

      <article className="contract-doc__shell">
        <header className="contract-doc__hero">
          <span className="contract-doc__badge">Договор подряда</span>
          <h1 className="contract-doc__title">{contract.title}</h1>
          <p className="contract-doc__meta-line">
            <strong>{contract.city}</strong>, «{contract.date}» · заказ #
            {contract.orderId}
            {pollForUpdates && isPolling ? " · обновляется" : ""}
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
                  : "contract-doc__sign-card--pending"
              }`}
            >
              <p className="contract-doc__sign-role">Заказчик</p>
              <p className="contract-doc__sign-line">{contract.customerName}</p>
              <button
                type="button"
                disabled
                className={`contract-doc__sign-btn ${
                  contract.customerSigned
                    ? "contract-doc__sign-btn--done"
                    : "contract-doc__sign-btn--waiting"
                }`}
              >
                {contract.customerSigned ? "✓ Подписано" : "Ожидает подписи"}
              </button>
            </div>

            <div
              className={`contract-doc__sign-card ${
                contract.contractorSigned
                  ? "contract-doc__sign-card--signed"
                  : ""
              }`}
            >
              <p className="contract-doc__sign-role">Исполнитель</p>
              <p className="contract-doc__sign-line">{contract.contractorName}</p>
              <button
                type="button"
                disabled={contract.contractorSigned || isSaving}
                onClick={toggleSignature}
                className={`contract-doc__sign-btn ${
                  contract.contractorSigned
                    ? "contract-doc__sign-btn--done"
                    : "contract-doc__sign-btn--primary"
                }`}
              >
                {isSaving
                  ? "Сохранение…"
                  : contract.contractorSigned
                    ? "✓ Подписано"
                    : "Подтвердить подпись"}
              </button>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
