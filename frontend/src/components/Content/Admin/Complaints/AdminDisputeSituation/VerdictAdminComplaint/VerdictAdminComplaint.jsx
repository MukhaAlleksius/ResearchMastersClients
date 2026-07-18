import React, { useState, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./verdict_admin_complaint.css";
export default function VerdictAdminComplaint({
  complaintId,
  orderId,
  customer,
  executor,
}) {
  const [verdict, setVerdict] = useState("");
  const [comment, setComment] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [banDays, setBanDays] = useState("30");

  const verdictOptions = [
    {
      value: "verdict_refund",
      label: "💰 Вернуть деньги заказчику (VERDICT_REFUND)",
      description: "Полный возврат средств заказчику",
    },
    {
      value: "verdict_pay",
      label: "💼 Выплатить исполнителю (VERDICT_PAY)",
      description: "Перевод всех средств исполнителю",
    },
    {
      value: "verdict_split",
      label: "🤝 Разделить (VERDICT_SPLIT)",
      description: "Разделить сумму между сторонами",
    },
    {
      value: "warning",
      label: "⚡ Предупреждение (WARNING)",
      description: "Выдать предупреждение (требует пользователя + дней)",
    },
    {
      value: "ban",
      label: "⛔ Бан пользователя (BAN)",
      description: "Блокировка (требует пользователя + дней)",
    },
    {
      value: "verdict_close",
      label: "❌ Закрыть жалобу (VERDICT_CLOSE)",
      description: "Закрыть без выплат",
    },
  ];

  // ✅ Вся логика предпросмотра + payload здесь
  const getVerdictData = useCallback(() => {
    let amountCustomer = 0;
    let amountExecutor = 0;
    let durationDays = null;
    let blocked = false;

    switch (verdict) {
      case "verdict_refund":
        amountCustomer = 100;
        break;
      case "verdict_pay":
        amountExecutor = 100;
        break;
      case "verdict_split":
        amountCustomer = 50;
        amountExecutor = 50;
        break;
      case "warning":
      case "ban":
        durationDays = parseInt(banDays, 10) || 30;
        if (verdict === "ban") blocked = true;
        break;
    }

    return { amountCustomer, amountExecutor, durationDays, blocked };
  }, [verdict, banDays]);

  const previewData = getVerdictData();

  const handleVerdictChange = (value) => {
    setVerdict(value);
    setComment("");
  };

  const handleTargetUserChange = (userId) => {
    setTargetUserId(userId);
  };

  // ✅ Вся бизнес-логика отправки здесь
  const handleSubmitVerdict = async () => {
    // Frontend валидация
    if (!verdict || !targetUserId || comment.trim().length < 5) {
      alert("Заполните: решение, пользователя и комментарий (≥5 символов)");
      return;
    }

    if (verdict === "warning" || verdict === "ban") {
      const days = parseInt(banDays, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        alert("Для WARNING/BAN: 1-365 дней");
        return;
      }
    }

    setLoading(true);

    // Получаем данные вердикта
    const { amountCustomer, amountExecutor, durationDays, blocked } =
      getVerdictData();

    // Формируем payload
    const adminId = parseInt(localStorage.getItem("user_id"), 10);
    if (!adminId) {
      alert("ID администратора не найден");
      setLoading(false);
      return;
    }

    const payload = {
      complaint_id: complaintId,
      action_type: verdict,
      target_user_id: parseInt(targetUserId),
      amount_customer: amountCustomer,
      amount_executor: amountExecutor,
      duration_days: durationDays,
      comment: comment.trim(),
      admin_id: adminId,
      blocked: blocked,
      blocked_until: null,
    };

    try {
      console.log("📤 Отправка:", payload);

      const response = await apiFetch(buildApiUrl("/add_verdict_admin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка сервера");
      }

      console.log("✅ Вердикт сохранён!");
      alert(
        `✅ Вердикт "${verdictOptions.find((o) => o.value === verdict)?.label}" вынесен!`,
      );

      // Сброс формы
      setVerdict("");
      setTargetUserId("");
      setComment("");
      setBanDays("30");

    } catch (error) {
      console.error("❌ Ошибка:", error);
      alert("Ошибка: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setVerdict("");
    setTargetUserId("");
    setComment("");
    setBanDays("30");
  };

  return (
    <div className="verdict-admin-complaint">
      <h2 className="verdict-title">
        Вердикт по жалобе #{complaintId} (Заказ {orderId})
      </h2>

      {/* Выбор пользователя */}
      <div className="verdict-target-user">
        <h3>👤 Кому применить:</h3>
        <div className="user-select-grid">
          <label className="user-select-label">
            <input
              type="radio"
              name="target_user"
              checked={targetUserId === String(customer?.id)}
              onChange={() => handleTargetUserChange(String(customer?.id))}
            />
            <span>
              {customer?.first_name} {customer?.last_name} — заказчик
            </span>
          </label>

          <label className="user-select-label">
            <input
              type="radio"
              name="target_user"
              checked={targetUserId === String(executor?.id)}
              onChange={() => handleTargetUserChange(String(executor?.id))}
            />
            <span>
              {executor?.first_name} {executor?.last_name} — исполнитель
            </span>
          </label>
        </div>
      </div>

      {/* Выбор вердикта */}
      <div className="verdict-selector">
        <h3>🎯 Решение:</h3>
        <div className="verdict-grid">
          {verdictOptions.map((option) => (
            <button
              key={option.value}
              className={`verdict-btn ${verdict === option.value ? "verdict-btn-active" : ""}`}
              onClick={() => handleVerdictChange(option.value)}
              title={option.description}
            >
              <div className="verdict-label">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Дополнительные поля */}
      {(verdict === "warning" || verdict === "ban") && (
        <div className="verdict-custom">
          <label>📅 Длительность (дни):</label>
          <input
            type="number"
            min="1"
            max="365"
            value={banDays}
            onChange={(e) => setBanDays(e.target.value)}
            className="verdict-input"
            placeholder="30"
          />
        </div>
      )}

      {/* Комментарий */}
      <div className="verdict-comment">
        <label>💬 Комментарий (обязательно, ≥5 символов):</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Объясните своё решение..."
          className="verdict-textarea"
          rows="4"
          maxLength="1000"
        />
        <div className={`char-count ${comment.length < 5 ? "error" : ""}`}>
          {comment.length}/1000 {comment.length < 5 && "(минимум 5)"}
        </div>
      </div>

      {/* Кнопки */}
      <div className="verdict-actions">
        <button
          className="btn-submit"
          onClick={handleSubmitVerdict}
          disabled={
            !verdict || !targetUserId || comment.trim().length < 5 || loading
          }
        >
          {loading ? "⏳ Сохранение..." : "✅ Вынести вердикт"}
        </button>
        <button
          className="btn-cancel"
          onClick={handleCancel}
          disabled={loading}
        >
          ❌ Отмена
        </button>
      </div>

      {/* Предпросмотр */}
      {verdict && targetUserId && (
        <div className="verdict-preview">
          <h4>👀 Предпросмотр:</h4>
          <div className="preview-content">
            <strong>Действие:</strong>{" "}
            {verdictOptions.find((o) => o.value === verdict)?.label}
            <br />
            <strong>Пользователь:</strong>{" "}
            {targetUserId === String(customer?.id)
              ? `${customer?.first_name} ${customer?.last_name} (заказчик)`
              : `${executor?.first_name} ${executor?.last_name} (исполнитель)`}
            {previewData.durationDays && (
              <>
                <br />
                <strong>Дней:</strong> {previewData.durationDays}
              </>
            )}
            {(previewData.amountCustomer > 0 ||
              previewData.amountExecutor > 0) && (
              <>
                <br />
                <strong>Выплаты:</strong> Заказчику {previewData.amountCustomer}
                %, Исполнителю {previewData.amountExecutor}%
              </>
            )}
            {previewData.blocked && (
              <>
                <br />
                <strong>Блокировка:</strong> Да
              </>
            )}
            <br />
            <strong>Комментарий:</strong> {comment || "не указан"}
          </div>
        </div>
      )}
    </div>
  );
}
