import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function CommentsRating({ orderId, executorId }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Кастомные звёздочки
  const Star = ({ filled, onClick }) => (
    <span
      className={`text-2xl cursor-pointer transition-all ${
        filled
          ? "text-yellow-400 fill-yellow-400"
          : "text-gray-300 hover:text-yellow-400"
      }`}
      onClick={onClick}
    >
      ★
    </span>
  );

  const handleRatingClick = (value) => {
    setRating(value);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Выберите рейтинг");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executor_id: executorId,
          rating,
          comment: comment.trim() || null,
        }),
      });

      if (response.ok) {
        navigate(`/executor/${executorId}`); // Переход в профиль
      } else {
        setError("Ошибка отправки. Попробуйте позже.");
      }
    } catch (err) {
      setError("Нет связи с сервером");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="comments-rating max-w-md mx-auto p-6 bg-white rounded-2xl shadow-xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        Оцените исполнителя
      </h2>

      {/* Рейтинг звёздами */}
      <div className="flex justify-center gap-1 mb-8">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            filled={star <= rating}
            onClick={() => handleRatingClick(star)}
          />
        ))}
        <span className="ml-2 text-sm text-gray-500">{rating || 0}/5</span>
      </div>

      {/* Форма комментария */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Комментарий (необязательно)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Расскажите о качестве работы..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
            disabled={isSubmitting}
          />
          <p className="text-xs text-gray-500 mt-1">{comment.length}/1000</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-blue-600 
                     text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 
                     disabled:opacity-50 disabled:cursor-not-allowed 
                     shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
        >
          {isSubmitting
            ? "⏳ Сохраняем отзыв..."
            : `⭐ Оставить отзыв (${rating}/5)`}
        </button>
      </form>
    </div>
  );
}
