import React, { useCallback, useEffect, useState } from "react";
import { apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./comments_rating.css";

function Stars({
  value,
  onChange,
  readOnly = false,
  ariaLabel = "Оценка",
}) {
  return (
    <div className="review-tab__criteria-stars" role="group" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`review-tab__star${star <= value ? " review-tab__star--on" : ""}`}
          disabled={readOnly}
          aria-label={`${star} из 5`}
          onClick={() => onChange?.(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CommentsRating({ orderId, executorId }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [existing, setExisting] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const applyReviewToForm = useCallback((data) => {
    setRating(Number(data.rating) || 0);
    setComment(data.comment || "");
  }, []);

  const loadReview = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(buildApiUrl(`/order/${orderId}/review`));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Не удалось загрузить отзыв");
      }
      const data = await response.json();
      if (!data) {
        setExisting(null);
        setIsEditing(false);
        return;
      }
      setExisting(data);
      applyReviewToForm(data);
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Ошибка загрузки отзыва");
    } finally {
      setLoading(false);
    }
  }, [orderId, applyReviewToForm]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  const startEditing = () => {
    if (existing) applyReviewToForm(existing);
    setSuccess("");
    setError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (existing) applyReviewToForm(existing);
    setError("");
    setSuccess("");
    setIsEditing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderId || !executorId) {
      setError("Не указан заказ или исполнитель");
      return;
    }
    if (rating < 1) {
      setError("Выберите оценку");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    const payload = {
      executor_id: Number(executorId),
      rating: Number(rating),
      comment: comment.trim() || null,
    };

    const isUpdate = Boolean(existing);
    try {
      const response = await apiFetch(buildApiUrl(`/order/${orderId}/review`), {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || d).join(", ")
              : isUpdate
                ? "Не удалось обновить отзыв"
                : "Не удалось сохранить отзыв";
        throw new Error(detail);
      }
      setExisting(data);
      applyReviewToForm(data);
      setIsEditing(false);
      setSuccess(isUpdate ? "Отзыв обновлён" : "Отзыв сохранён");
    } catch (err) {
      setError(err.message || "Нет связи с сервером");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="review-tab review-tab--loading">Загрузка отзыва...</div>
    );
  }

  const showForm = !existing || isEditing;

  if (!showForm) {
    return (
      <div className="review-tab">
        <div className="review-tab__card">
          <h2 className="review-tab__title">Ваш отзыв об исполнителе</h2>
          {existing.created_at && (
            <p className="review-tab__saved-meta">
              Сохранён {formatDate(existing.created_at)}
            </p>
          )}
          <div className="review-tab__stars">
            <Stars
              value={existing.rating || 0}
              readOnly
              ariaLabel="Оценка"
            />
            <span className="review-tab__star-label">
              {existing.rating || 0}/5
            </span>
          </div>
          {existing.comment ? (
            <p className="review-tab__comment-text">{existing.comment}</p>
          ) : (
            <p className="review-tab__subtitle">Без комментария</p>
          )}
          {success && (
            <div
              className="review-tab__alert review-tab__alert--success"
              role="status"
            >
              {success}
            </div>
          )}
          <button
            type="button"
            className="review-tab__submit review-tab__submit--secondary"
            onClick={startEditing}
          >
            Редактировать отзыв
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="review-tab">
      <div className="review-tab__card">
        <h2 className="review-tab__title">
          {existing ? "Редактировать отзыв" : "Оцените исполнителя"}
        </h2>
        <p className="review-tab__subtitle">
          {existing
            ? "Изменения сохранятся и отобразятся в профиле исполнителя"
            : "Поставьте оценку от 1 до 5"}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="review-tab__stars">
            <Stars
              value={rating}
              onChange={(v) => {
                setRating(v);
                setError("");
              }}
              ariaLabel="Оценка"
            />
            <span className="review-tab__star-label">{rating || 0}/5</span>
          </div>

          <div className="review-tab__field">
            <label className="review-tab__label" htmlFor="review-comment">
              Комментарий (необязательно)
            </label>
            <textarea
              id="review-comment"
              className="review-tab__textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Расскажите о качестве работы..."
              disabled={isSubmitting}
            />
            <p className="review-tab__hint">{comment.length}/2000</p>
          </div>

          {error && (
            <div
              className="review-tab__alert review-tab__alert--error"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="review-tab__actions">
            {existing && (
              <button
                type="button"
                className="review-tab__submit review-tab__submit--secondary"
                onClick={cancelEditing}
                disabled={isSubmitting}
              >
                Отмена
              </button>
            )}
            <button
              type="submit"
              className="review-tab__submit"
              disabled={isSubmitting || rating < 1 || !executorId}
            >
              {isSubmitting
                ? "Сохраняем..."
                : existing
                  ? "Сохранить изменения"
                  : "Оставить отзыв"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
