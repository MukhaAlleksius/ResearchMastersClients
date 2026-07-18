import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { useParams, Link } from "react-router-dom";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaExclamationCircle,
  FaBalanceScale,
} from "react-icons/fa";
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

export default function CancelOrderVerdictAdmin() {
  const { cancel_order_customer_id } = useParams();

  const [data, setData] = useState(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [strategy, setStrategy] = useState("full_customer");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(null);

  const config = STRATEGIES[strategy] || STRATEGIES.full_customer;

  const loadCancellation = useCallback(async (id) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch(
        `${API.baseURL}/admin/cancel_order_customer/${id}`,
      );

      if (!response.ok) {
        throw new Error("Не удалось загрузить данные отмены");
      }

      const cancellation = await response.json();
      setData(cancellation);
      setTotalAmount(parseFloat(cancellation.order_total_amount) || 0);
      setStrategy(cancellation.refund_strategy || "full_customer");
      setComment(cancellation.admin_comment || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cancel_order_customer_id) {
      loadCancellation(cancel_order_customer_id);
    }
  }, [cancel_order_customer_id, loadCancellation]);

  const isValid = !!strategy && !!comment.trim() && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!isValid || !data) return;

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
        `${API.baseURL}/admin/add_verdict_cancel_customer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error("Не удалось сохранить решение");
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, data, config, comment]);

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

  if (isSuccess) {
    return (
      <div className="verdict-admin">
        <div className="status-screen status-success">
          <span className="status-screen__icon">
            <FaCheckCircle />
          </span>
          <h1>Решение сохранено</h1>
          <p>Вердикт по отказу успешно вынесен и отправлен участникам.</p>
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
            Решение по отказу #{data?.id}
          </h1>
          <p className="cancel-verdict-hero__subtitle">
            Заказ #{data?.order_id} — распределите возврат между заказчиком и исполнителем
          </p>
        </div>
      </header>

      <section className="order-info">
        <h2 className="order-info__title">Информация об отмене</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Заказ</span>
            <span className="info-value">#{data?.order_id}</span>
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
              disabled={isSubmitting}
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
          />
          <div className="form-hint">{comment.length}/500</div>
        </div>
      </section>

      {error && <div className="cancel-verdict-alert">{error}</div>}

      <footer className="action-buttons">
        <Link to="/admin/cancel_orders" className="btn-secondary">
          Отмена
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className="btn-primary"
        >
          {isSubmitting ? "Сохранение…" : "Сохранить решение"}
        </button>
      </footer>
    </div>
  );
}
