import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "../../../Services/CommonComponent/ChatOrderMaster/chat_order_master.css";

export default function CustomerExecutorComplaints({ orderId, userType }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const messagesEndRef = useRef(null);

  const sender_id = localStorage.getItem("user_id");

  const fetchMessages = useCallback(async () => {
    if (!orderId) return;

    try {
      const res = await apiFetch(
        buildApiUrl(`/admin/complaint/order?order_id=${orderId}`),
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.messages && Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((msg) => ({
            id: msg.id,
            text: msg.content,
            sender: msg.sender_type === "admin" ? "admin" : "user",
            created_at: msg.created_at,
          })),
        );
        setLoadError(null);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error("Ошибка загрузки жалоб:", err);
      setLoadError("Не удалось загрузить переписку. Попробуйте позже.");
      setMessages([]);
    }
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages]);

  const sendMessage = async () => {
    if (!input.trim() || !sender_id || loading) return;

    setLoading(true);
    const trimmedInput = input.trim();
    const tempId = `temp-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: trimmedInput,
        sender: userType === "admin" ? "admin" : "user",
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");

    try {
      const res = await apiFetch(
        buildApiUrl(`/add_complaint_message/${sender_id}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: orderId,
            sender_type: userType,
            sender_id,
            admin_id: 1,
            content: trimmedInput,
            message_type: "text",
          }),
        },
      );

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Ошибка отправки сообщения");
      }

      const data = await res.json();
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return [
          ...withoutTemp,
          {
            id: data.id,
            text: data.content,
            sender: userType === "admin" ? "admin" : "user",
            created_at: data.created_at,
          },
        ];
      });
      setLoadError(null);
    } catch (err) {
      console.error("Ошибка отправки сообщения:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setLoadError(err.message || "Ошибка отправки сообщения");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="order-chat">
      <header className="order-chat__header">
        <div className="order-chat__header-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 4.5 6.5v4.2c0 4.6 3.2 8.9 7.5 10.3 4.3-1.4 7.5-5.7 7.5-10.3V6.5L12 3Z" />
            <path d="M9.5 12.2 11.2 14l3.5-4" />
          </svg>
        </div>
        <div className="order-chat__header-text">
          <h2 className="order-chat__title">Жалоба администратору</h2>
          <p className="order-chat__subtitle">
            Переписка по спорной ситуации
          </p>
        </div>
        <span className="order-chat__count" title="Сообщений в переписке">
          {sortedMessages.length}
        </span>
      </header>

      <div className="order-chat__messages">
        {loadError && (
          <div className="order-chat__empty" style={{ minHeight: "auto", paddingBottom: 8 }}>
            <p className="order-chat__empty-hint">{loadError}</p>
          </div>
        )}

        {sortedMessages.length === 0 && !loadError ? (
          <div className="order-chat__empty">
            <div className="order-chat__empty-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="order-chat__empty-title">Пока нет сообщений</p>
            <span className="order-chat__empty-hint">
              Опишите проблему — администратор ответит в этой переписке
            </span>
          </div>
        ) : (
          <ul className="order-chat__list">
            {sortedMessages.map((message, index) => {
              const isOwn = message.sender === "user";
              const time = message.created_at
                ? new Date(message.created_at).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <li
                  key={message.id || `complaint-${index}`}
                  className={`order-chat__item ${
                    isOwn ? "order-chat__item--own" : "order-chat__item--other"
                  }`}
                >
                  <article
                    className={`order-chat__bubble ${
                      isOwn
                        ? "order-chat__bubble--own"
                        : "order-chat__bubble--other"
                    }`}
                  >
                    <header className="order-chat__bubble-meta">
                      <span className="order-chat__bubble-author">
                        {isOwn ? "Вы" : "Администратор"}
                      </span>
                      {time && (
                        <time
                          className="order-chat__bubble-time"
                          dateTime={message.created_at}
                        >
                          {time}
                        </time>
                      )}
                    </header>
                    <p className="order-chat__bubble-text">{message.text}</p>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={messagesEndRef} className="order-chat__anchor" />
      </div>

      <footer className="order-chat__composer">
        <textarea
          className="order-chat__input"
          placeholder="Напишите администратору…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          rows={1}
          maxLength={500}
          aria-label="Текст жалобы"
        />
        <button
          type="button"
          className="order-chat__send"
          onClick={sendMessage}
          disabled={!canSend}
          aria-busy={loading}
        >
          {loading ? (
            <span className="order-chat__send-spinner" aria-hidden="true" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
          <span className="order-chat__send-label">
            {loading ? "Отправка" : "Отправить"}
          </span>
        </button>
      </footer>
    </div>
  );
}
