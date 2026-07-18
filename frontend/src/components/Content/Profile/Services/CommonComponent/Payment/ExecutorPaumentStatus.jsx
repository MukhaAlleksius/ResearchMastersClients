import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../../utils/api.js";
import { Link } from "react-router-dom";
export default function ExecutorPayments({ orderId, executorId }) {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!executorId) return;

    setIsRefreshing(true);
    setIsLoading(payments.length === 0);
    setError(null);

    try {
      const response = await apiFetch(
        `${API.baseURL}/executor/${executorId}/order/${orderId}/payments`,
      );

      if (response.ok) {
        const data = await response.json();
        setPayments(Array.isArray(data) ? data : []);
      } else if (response.status === 404) {
        setPayments([]);
        setError("Платежей пока нет");
      } else {
        setError(`Ошибка ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Ошибка загрузки платежей:", error);
      setError("Не удалось загрузить платежи. Проверьте подключение.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [executorId, payments.length]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

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
      succeeded: { bg: "#ecfdf5", color: "#065f46", text: "✅ Выплачено" },
      failed: { bg: "#fef2f2", color: "#991b1b", text: "❌ Ошибка" },
      disputed: { bg: "#fef3c7", color: "#d97706", text: "⚖️ Спор" },
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

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #e2e8f0",
              borderTop: "3px solid #3b82f6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p>Загружаем платежи...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>История платежей</h2>
        <span style={styles.count}>Всего: {payments.length}</span>
      </div>

      <div style={styles.bankHint}>
        Чтобы получать выплаты на расчётный счёт, укажите IBAN в разделе{" "}
        <Link to="/profile/executor_bank_account" style={styles.bankLink}>
          Счёт
        </Link>{" "}
        в личном кабинете (один раз).
      </div>

      {error && (
        <div style={styles.error}>
          ⚠️ {error}
          <button onClick={fetchPayments} style={styles.retryBtn}>
            Попробовать снова
          </button>
        </div>
      )}

      {payments.length === 0 && !isLoading && !error ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💸</div>
          <h3 style={styles.emptyTitle}>Платежей пока нет</h3>
          <p style={styles.emptyText}>Заказчики еще не пополнили эскроу</p>
          <button
            onClick={fetchPayments}
            style={styles.btn}
            disabled={isRefreshing}
          >
            {isRefreshing ? "⏳ Проверка..." : "🔄 Проверить"}
          </button>
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {payments.map((payment, idx) => {
              const amount = parseFloat(payment.amount) || 0;
              const commission = amount * 0.1;
              const netAmount = amount - commission;

              return (
                <div
                  key={payment.id || payment.transaction_id || idx}
                  style={styles.item}
                >
                  <div style={styles.itemHeader}>
                    <span style={styles.date}>
                      {formatDate(payment.created_at)}
                    </span>
                    {getStatusBadge(payment.status)}
                  </div>

                  <div style={styles.amounts}>
                    <div style={styles.amountRow}>
                      <span>Сумма заказа:</span>
                      <span style={styles.amount}>
                        {amount.toLocaleString()} {payment.currency || "BYN"}
                      </span>
                    </div>
                    <div style={styles.amountRow}>
                      <span>Комиссия (10%):</span>
                      <span style={styles.commission}>
                        -{commission.toLocaleString()}
                      </span>
                    </div>
                    <div style={styles.divider} />
                    <div style={styles.totalRow}>
                      <span>Получу:</span>
                      <span style={styles.total}>
                        {netAmount.toLocaleString()} {payment.currency || "BYN"}
                      </span>
                    </div>
                  </div>

                  <div style={styles.meta}>
                    <div>Заказ #{payment.order_id}</div>
                    {payment.payment_method && (
                      <div>
                        {payment.payment_method === "test"
                          ? "Эскроу"
                          : payment.payment_method}
                      </div>
                    )}
                    {payment.transaction_id && (
                      <div style={styles.transaction}>
                        ID: {payment.transaction_id.slice(-8)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={fetchPayments}
            disabled={isRefreshing}
            style={styles.refreshBtn}
          >
            {isRefreshing ? "⏳ Обновление..." : "🔄 Обновить"}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 24,
    maxWidth: 500,
    backgroundColor: "#f8fafc",
    boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1e293b",
    margin: 0,
  },
  count: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: 500,
  },
  bankHint: {
    marginBottom: 16,
    padding: "12px 14px",
    borderRadius: 10,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    fontSize: 13,
    lineHeight: 1.5,
  },
  bankLink: {
    color: "#2563eb",
    fontWeight: 600,
    textDecoration: "underline",
  },
  loading: {
    textAlign: "center",
    padding: 40,
    color: "#64748b",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    color: "#991b1b",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 12,
    padding: "8px 16px",
    background: "#f87171",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
    fontSize: 14,
  },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "#64748b",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    marginBottom: 20,
  },
  list: {
    maxHeight: 600,
    overflowY: "auto",
    marginBottom: 20,
  },
  item: {
    background: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    border: "1px solid #e2e8f0",
    transition: "box-shadow 0.2s",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  date: {
    fontSize: 14,
    color: "#64748b",
  },
  amounts: {
    background: "#f1f5f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  amountRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 6,
    fontSize: 14,
  },
  amount: {
    fontWeight: 600,
    color: "#1e293b",
  },
  commission: {
    color: "#dc2626",
    fontWeight: 600,
  },
  divider: {
    height: 1,
    background: "#e2e8f0",
    margin: "8px 0",
  },
  totalRow: {
    paddingTop: 8,
    borderTop: "1px solid #e2e8f0",
    fontSize: 15,
  },
  total: {
    fontWeight: 700,
    color: "#059669",
    fontSize: 16,
  },
  meta: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.5,
  },
  transaction: {
    fontSize: 12,
    opacity: 0.8,
    fontFamily: "monospace",
    background: "#f1f5f9",
    padding: "2px 6px",
    borderRadius: 4,
    marginTop: 4,
  },
  btn: {
    width: "100%",
    padding: "12px",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  refreshBtn: {
    width: "100%",
    padding: "14px",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
    transition: "all 0.2s",
  },
};

// Добавляем CSS анимацию спиннера
const spinAnimation = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

const styleSheet = document.createElement("style");
styleSheet.textContent = spinAnimation;
document.head.appendChild(styleSheet);

export { styles };
