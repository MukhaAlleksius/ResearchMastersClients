import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useParams, Link } from "react-router-dom";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaExclamationCircle,
  FaBalanceScale,
  FaTrashAlt,
} from "react-icons/fa";
import { uiConfirm } from "../../../../UiDialog/uiDialog.js";
import "./cancel_order_verdict_admin.css";

const STRATEGIES = {
  full_customer: {
    title: "Полный возврат",
    customer: 100,
    executor: 0,
    variant: "emerald",
  },
  partial: {
    title: "Частичный возврат",
    customer: 70,
    executor: 30,
    variant: "blue",
  },
  split: {
    title: "Равный возврат",
    customer: 50,
    executor: 50,
    variant: "purple",
  },
  no_refund: {
    title: "Без возврата",
    customer: 0,
    executor: 100,
    variant: "orange",
  },
};

function strategyFromAmounts(customerShare, executorShare) {
  const customer = Number(customerShare);
  const executor = Number(executorShare);
  if (Number.isNaN(customer) || Number.isNaN(executor)) return "full_customer";
  const match = Object.entries(STRATEGIES).find(
    ([, cfg]) => cfg.customer === customer && cfg.executor === executor,
  );
  return match?.[0] || "full_customer";
}

export default function CancelOrderVerdictAdmin() {
  const { source, cancel_order_customer_id } = useParams();
  const cancelSource = source === "executor" ? "executor" : "customer";
  const cancelId = cancel_order_customer_id;

  const [data, setData] = useState(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [strategy, setStrategy] = useState("full_customer");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [error, setError] = useState(null);

  const config = STRATEGIES[strategy] || STRATEGIES.full_customer;
  const isLocked = data?.status === "resolved";

  const loadCancellation = useCallback(async (id, disputeSource) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch(
        `${API.baseURL}/admin/cancel_dispute/${disputeSource}/${id}`,
      );

      if (!response.ok) {
        throw new Error("Не удалось загрузить данные отмены");
      }

      const cancellation = await response.json();
      setData(cancellation);
      setTotalAmount(parseFloat(cancellation.order_total_amount) || 0);
      setStrategy(
        strategyFromAmounts(
          cancellation.refund_amount_customer,
          cancellation.refund_amount_executor,
        ),
      );
      setComment(cancellation.admin_comment || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cancelId) {
      loadCancellation(cancelId, cancelSource);
    }
  }, [cancelId, cancelSource, loadCancellation]);

  const isValid = !!strategy && !!comment.trim() && !isSubmitting && !isLocked && !isDeleting;

  const handleDelete = useCallback(async () => {
    if (!cancelId || isDeleting) return;
    if (
      !(await uiConfirm(
        "Удалить этот отказ? Заявка исчезнет у заказчика и исполнителя.",
      ))
    ) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API.baseURL}/admin/cancel_dispute/${cancelSource}/${cancelId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Не удалось удалить отказ");
      }
      setIsDeleted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }, [cancelId, cancelSource, isDeleting]);

  const handleSubmit = useCallback(async () => {
    if (!isValid || !data || isLocked) return;

    setIsSubmitting(true);
    setError(null);

    const payload = {
      order_id: data.order_id,
      customer_id: data.customer_id,
      executor_id: data.executor_id,
      refund_amount_customer: String(config.customer),
      refund_amount_executor: String(config.executor),
      admin_comment: comment || "",
    };

    try {
      const response = await apiFetch(
        `${API.baseURL}/admin/${
          cancelSource === "executor"
            ? "add_verdict_cancel_executor"
            : "add_verdict_cancel_customer"
        }`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Не удалось сохранить решение");
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, isLocked, data, config, comment, cancelSource]);

  if (isLoading) {
    return (
      <div className="verdict-admin">
        <div className="status-screen status-loading">
          <span className="cancel-verdict-spinner" />
          <h1>Загрузка данных…</h1>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="verdict-admin">
        <div className="status-screen status-error">
          <span className="status-screen__icon">
            <FaExclamationCircle />
          </span>
          <h1>Ошибка</h1>
          <p>{error}</p>
          <Link to="/admin/cancel_orders" className="btn-back">
            <FaArrowLeft size={12} />
            К списку
          </Link>
        </div>
      </div>
    );
  }

  if (isDeleted) {
    return (
      <div className="verdict-admin">
        <div className="status-screen status-success">
          <span className="status-screen__icon">
            <FaCheckCircle />
          </span>
          <h1>Отказ удалён</h1>
          <p>Заявка на отказ снята. Заказчик и исполнитель получили уведомление.</p>
          <Link to="/admin/cancel_orders" className="btn-back">
            <FaArrowLeft size={12} />
            К списку
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="verdict-admin">
        <div className="status-screen status-success">
          <span className="status-screen__icon">
            <FaCheckCircle />
          </span>
          <h1>Решение сохранено</h1>
          <p>Вердикт по отказу успешно вынесен и отправлен участникам. Изменить его больше нельзя.</p>
          <Link to="/admin/cancel_orders" className="btn-back">
            <FaArrowLeft size={12} />
            К списку
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="verdict-admin">
      <Link to="/admin/cancel_orders" className="cancel-verdict-back">
        <FaArrowLeft size={12} />
        К списку отказов
      </Link>

      <header className="cancel-verdict-hero">
        <div>
          <span className="cancel-verdict-hero__badge">Админ · Вердикт</span>
          <h1 className="cancel-verdict-hero__title">
            Решение по{" "}
            {cancelSource === "executor"
              ? "отказу исполнителя"
              : "отказу заказчика"}{" "}
            #{data?.id}
          </h1>
          <p className="cancel-verdict-hero__subtitle">
            {isLocked
              ? "Решение уже вынесено. Повторно изменить его нельзя."
              : cancelSource === "executor"
                ? "Заказчик не согласился с отменой исполнителя"
                : "Исполнитель не согласился с отменой заказчика"}
          </p>
        </div>
      </header>

      <section className="order-info">
        <h2 className="order-info__title">Информация об отмене</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Заказ</span>
            <span className="info-value">
              {data?.order_title || data?.order_name || "—"}
            </span>
          </div>
          {totalAmount > 0 && (
            <div className="info-item">
              <span className="info-label">Сумма</span>
              <span className="info-value">{totalAmount.toFixed(2)} BYN</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Заказчик</span>
            <span className="info-value">ID {data?.customer_id}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Исполнитель</span>
            <span className="info-value">ID {data?.executor_id}</span>
          </div>
          {data?.reason_type && (
            <div className="info-item">
              <span className="info-label">Тип причины</span>
              <span className="info-value">{data.reason_type}</span>
            </div>
          )}
        </div>
        {data?.reason_text && (
          <div className="reason-card">
            <h3>Причина отказа</h3>
            <p>{data.reason_text}</p>
          </div>
        )}
        {data?.executor_comment && (
          <div className="reason-card">
            <h3>Комментарий исполнителя</h3>
            <p>{data.executor_comment}</p>
          </div>
        )}
      </section>

      <section className="strategy-section">
        <h2 className="strategy-section__title">
          <span className="strategy-section__title-icon">
            <FaBalanceScale size={16} />
          </span>
          Стратегия возврата
        </h2>
        <div className="strategy-grid">
          {Object.entries(STRATEGIES).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`strategy-card strategy-card--${cfg.variant} ${
                strategy === key ? "active" : ""
              }`}
              onClick={() => setStrategy(key)}
              disabled={isSubmitting || isLocked}
            >
              <h3>{cfg.title}</h3>
              <div className="strategy-card__split">
                {cfg.customer}% заказчику · {cfg.executor}% исполнителю
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="decision-form">
        <div className="form-group">
          <label>
            Комментарий решения <span>*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Объясните ваше решение участникам…"
            rows={4}
            maxLength={500}
            readOnly={isLocked}
            disabled={isLocked}
          />
          <div className="form-hint">{comment.length}/500</div>
        </div>
      </section>

      {error && <div className="cancel-verdict-alert">{error}</div>}

      <footer className="action-buttons">
        <Link to="/admin/cancel_orders" className="btn-secondary">
          {isLocked ? "К списку" : "Отмена"}
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isSubmitting || isDeleting}
          className="btn-danger"
        >
          <FaTrashAlt size={12} />
          {isDeleting ? "Удаление…" : "Удалить отказ"}
        </button>
        {!isLocked && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="btn-primary"
          >
            {isSubmitting ? "Сохранение…" : "Сохранить решение"}
          </button>
        )}
      </footer>
    </div>
  );
}
