import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
const HELD_STATUSES = new Set(["escrow", "released", "paid", "completed"]);
const RELEASED_STATUSES = new Set(["released", "paid", "completed"]);
/** Как в prod WebPay: redirect на шлюз. Локально — mock_web_pay.py на :8001 */
const PAYMENT_METHOD = "webpay";

export default function Payment({ order, customerId, executorId, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [customAmount, setCustomAmount] = useState("");

  const fetchPayments = useCallback(async () => {
    if (!order?.id || !customerId) return;

    try {
      const response = await apiFetch(
        `${API.baseURL}/payment_for_order/${order.id}/${customerId}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const paymentsList = Array.isArray(data) ? data : [];
      setPayments(paymentsList);

      const sum = paymentsList
        .filter((p) => HELD_STATUSES.has(p.status))
        .reduce((acc, p) => acc + (parseFloat(p.executor_amount) || 0), 0);
      setTotalPaid(sum);
    } catch (error) {
      console.error("Ошибка загрузки платежей:", error);
    }
  }, [order?.id, customerId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const executorAmountBase = parseFloat(order.budget) || 0;
  const commissionBase = executorAmountBase * 0.1;
  const totalToPay = executorAmountBase + commissionBase;
  const remainingExecutorAmount = Math.max(0, executorAmountBase - totalPaid);

  const paymentExecutorAmount = customAmount
    ? parseFloat(customAmount) || 0
    : remainingExecutorAmount;

  const paymentCommission = paymentExecutorAmount * 0.1;
  const paymentTotal = paymentExecutorAmount + paymentCommission;

  const handleAmountChange = (e) => {
    setCustomAmount(e.target.value.replace(/[^0-9.]/g, ""));
  };

  const hasActiveEscrow = payments.some((p) => p.status === "escrow");
  const hasPending = payments.some((p) => p.status === "pending");
  const latestEscrowPayment = payments
    .filter((p) => p.status === "escrow")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  const submitPayment = async (paymentMethod) => {
    if (paymentExecutorAmount <= 0) {
      alert("Введите сумму для оплаты");
      return;
    }
    if (paymentExecutorAmount > remainingExecutorAmount + 0.001) {
      alert("Сумма превышает остаток по бюджету заказа");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        executor_amount: paymentExecutorAmount,
        payment_method: paymentMethod,
      };
      if (executorId) {
        payload.executor_id = Number(executorId);
      }

      const response = await apiFetch(
        `${API.baseURL}/order/${order.id}/pay_escrow`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || item).join(", ")
          : data.detail;
        alert(detail || "Не удалось создать платёж");
        return;
      }

      if (data.test_mode) {
        await fetchPayments();
        onSuccess?.(data);
        setCustomAmount("");
        alert(
          `Тестовая оплата: ${data.amount} ${data.currency} заморожено в эскроу.`,
        );
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      if (data.status === "escrow") {
        await fetchPayments();
        onSuccess?.(data);
        setCustomAmount("");
        alert(
          `Оплата прошла. ${data.amount} ${data.currency} заморожено в эскроу.`,
        );
        return;
      }

      await fetchPayments();
      alert(
        "Платёж создан и ожидает подтверждения. Нажмите «Обновить» после оплаты на странице шлюза.",
      );
    } catch (error) {
      alert(error.message || "Ошибка сети. Войдите в аккаунт и повторите.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePay = () => submitPayment(PAYMENT_METHOD);

  const handleReleasePayment = async () => {
    if (!latestEscrowPayment) {
      alert("Нет активного эскроу для перевода");
      return;
    }

    const agreed = window.confirm(
      `Перевести ${latestEscrowPayment.executor_amount} ${
        latestEscrowPayment.currency || order.currency
      } исполнителю?`,
    );
    if (!agreed) return;

    setIsLoading(true);
    try {
      const response = await apiFetch(
        `${API.baseURL}/order/${order.id}/payment/${latestEscrowPayment.id}/pay_executor`,
        { method: "POST" },
      );

      const payment = await response.json();
      if (response.ok) {
        await fetchPayments();
        onSuccess?.(payment);
        alert("Деньги переведены исполнителю");
      } else {
        alert(payment.detail || "Ошибка перевода");
      }
    } catch (error) {
      alert(error.message || "Ошибка сети");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Не указано";
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: "#fef3c7", color: "#92400e", text: "⏳ Ожидает оплаты" },
      escrow: { bg: "#eff6ff", color: "#1e40af", text: "🛡️ В эскроу" },
      released: { bg: "#ecfdf5", color: "#065f46", text: "✅ Переведено" },
      paid: { bg: "#ecfdf5", color: "#065f46", text: "✅ Переведено" },
      completed: { bg: "#ecfdf5", color: "#065f46", text: "✅ Завершено" },
      failed: { bg: "#fef2f2", color: "#991b1b", text: "❌ Ошибка" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          background: s.bg,
          color: s.color,
        }}
      >
        {s.text}
      </span>
    );
  };

  const allReleased =
    payments.length > 0 &&
    payments.every((p) => RELEASED_STATUSES.has(p.status) || p.status === "failed");

  return (
    <div
      className="payment-order"
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 24,
        backgroundColor: "#f8fafc",
        boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          Оплата заказа #{order.id}
        </div>
        <button
          type="button"
          onClick={fetchPayments}
          disabled={isLoading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Обновить
        </button>
      </div>

      <div
        style={{
          background: "#f1f5f9",
          padding: 16,
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            fontSize: 14,
          }}
        >
          <span style={{ color: "#64748b" }}>Примерная сумма заказа:</span>
          <span style={{ fontWeight: 700 }}>
            {executorAmountBase.toLocaleString()} {order.currency}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            fontSize: 14,
          }}
        >
          <span style={{ color: "#64748b" }}>Комиссия (10%):</span>
          <span style={{ fontWeight: 600, color: "#f59e0b" }}>
            {commissionBase.toLocaleString()} {order.currency}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px solid #cbd5e1",
            fontSize: 16,
          }}
        >
          <span style={{ fontWeight: 700 }}>Итого к оплате:</span>
          <span style={{ fontWeight: 700, color: "#1e40af" }}>
            {totalToPay.toLocaleString()} {order.currency}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontSize: 14,
          }}
        >
          <span style={{ color: "#059669" }}>Зачислено исполнителю:</span>
          <span style={{ fontWeight: 700, color: "#059669" }}>
            {totalPaid.toLocaleString()} {order.currency}
          </span>
        </div>
        {remainingExecutorAmount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
            }}
          >
            <span style={{ color: "#dc2626" }}>Осталось (исполнителю):</span>
            <span style={{ fontWeight: 700, color: "#dc2626" }}>
              {remainingExecutorAmount.toLocaleString()} {order.currency}
            </span>
          </div>
        )}
      </div>

      {hasPending && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontSize: 14,
          }}
        >
          Платёж обрабатывается на стороне шлюза. После оплаты вернитесь сюда и
          нажмите «Обновить».
        </div>
      )}

      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1e40af",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Оплата через платёжный шлюз (локально — mock WebPay на порту 8001).
        После нажатия «Оплатить» откроется страница шлюза; средства попадут в
        эскроу после подтверждения, затем вы переведёте их исполнителю.
        {executorId ? (
          <> Исполнитель: #{executorId}.</>
        ) : (
          <>
            {" "}
            Укажите исполнителя на заказе или выберите заказ с назначенным
            исполнителем.
          </>
        )}
      </div>

      {payments.length > 0 && (
        <div style={{ marginBottom: 20, maxHeight: 300, overflowY: "auto" }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
              color: "#1e293b",
            }}
          >
            История платежей
          </h3>
          {payments.map((payment) => (
            <div
              key={payment.id}
              style={{
                background: "#fff",
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, color: "#64748b" }}>
                  {formatDate(payment.created_at)}
                </span>
                {getStatusBadge(payment.status)}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 15,
                }}
              >
                <span style={{ color: "#555" }}>К оплате:</span>
                <span style={{ fontWeight: 700 }}>
                  {parseFloat(payment.amount).toLocaleString()}{" "}
                  {payment.currency || order.currency}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                <span style={{ color: "#64748b" }}>Исполнителю:</span>
                <span>
                  {parseFloat(payment.executor_amount).toLocaleString()}{" "}
                  {payment.currency || order.currency}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasActiveEscrow && (
        <button
          type="button"
          onClick={handleReleasePayment}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "14px",
            background: "#059669",
            color: "white",
            border: "none",
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 16,
            cursor: isLoading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 12px rgba(5,150,105,0.3)",
            marginBottom: 20,
          }}
        >
          {isLoading
            ? "⏳ Переводим..."
            : `💰 Перевести исполнителю ${latestEscrowPayment?.executor_amount?.toLocaleString() || ""} ${order.currency}`}
        </button>
      )}

      {allReleased && !hasActiveEscrow && (
        <div
          style={{
            background: "#ecfdf5",
            padding: 16,
            borderRadius: 12,
            marginBottom: 20,
            border: "2px solid #6ee7b7",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700, color: "#065f46" }}>
            Оплата по заказу завершена
          </div>
        </div>
      )}

      {remainingExecutorAmount > 0 && (
        <div
          style={{
            background: "#fff",
            padding: 20,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            <span>Сумма исполнителю:</span>
            <span style={{ color: "#3b82f6" }}>
              {paymentExecutorAmount.toLocaleString()} {order.currency}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              Сумма исполнителю ({order.currency})
            </label>
            <input
              type="text"
              value={customAmount}
              onChange={handleAmountChange}
              placeholder={remainingExecutorAmount.toLocaleString()}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "2px solid #e2e8f0",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
              }}
              disabled={isLoading}
            />
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              border: "1px solid #e2e8f0",
              fontSize: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span>Комиссия 10%:</span>
              <span>{paymentCommission.toLocaleString()} {order.currency}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                color: "#1e40af",
              }}
            >
              <span>К оплате:</span>
              <span>
                {paymentTotal.toLocaleString()} {order.currency}
              </span>
            </div>
          </div>

          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#f0fdf4",
              borderRadius: 10,
              fontSize: 14,
              color: "#166534",
              border: "1px solid #bbf7d0",
            }}
          >
            Вы будете перенаправлены на страницу оплаты (mock WebPay). Запустите
            mock_web_pay.py на порту 8001, если шлюз ещё не поднят.
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={isLoading || paymentExecutorAmount <= 0}
            style={{
              width: "100%",
              padding: "16px",
              background:
                isLoading || paymentExecutorAmount <= 0 ? "#e2e8f0" : "#059669",
              color:
                isLoading || paymentExecutorAmount <= 0 ? "#64748b" : "#fff",
              border: "none",
              borderRadius: 14,
              fontSize: 17,
              fontWeight: 600,
              cursor:
                isLoading || paymentExecutorAmount <= 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {isLoading
              ? "⏳ Обрабатываем..."
              : `Оплатить ${paymentTotal.toLocaleString()} ${order.currency}`}
          </button>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "#ecfdf5",
          borderRadius: 8,
          fontSize: 14,
          color: "#166534",
          textAlign: "center",
        }}
      >
        Деньги поступают в эскроу после успешной оплаты и переводятся
        исполнителю после вашего подтверждения.
      </div>
    </div>
  );
}
