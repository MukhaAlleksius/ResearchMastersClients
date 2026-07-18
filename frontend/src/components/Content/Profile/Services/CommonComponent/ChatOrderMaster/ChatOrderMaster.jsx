import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./chat_order_master.css";
function normalizeMessages(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.data?.messages)) return data.data.messages;
  return [];
}

function normalizeConversation(data) {
  if (!data || Array.isArray(data)) {
    return { messages: normalizeMessages(data) };
  }
  return data;
}

export default function ChatOrderMaster({ order_id }) {
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const current_user_id = localStorage.getItem("user_id");

  const fetchConversation = useCallback(async () => {
    if (!order_id || !current_user_id) return;

    try {
      const response = await apiFetch(
        buildApiUrl(`/conversation/${order_id}/${current_user_id}`),
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setMessages(normalizeMessages(data));
      setConversation(normalizeConversation(data));
    } catch (error) {
      console.error("Ошибка загрузки чата:", error);
    }
  }, [order_id, current_user_id]);

  useEffect(() => {
    fetchConversation();
    const intervalId = setInterval(fetchConversation, 5000);
    return () => clearInterval(intervalId);
  }, [fetchConversation]);

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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !order_id || !current_user_id) return;

    const tempId = `temp-${Date.now()}`;
    const content = input.trim();
    const tempMessage = {
      id: tempId,
      sender_id: Number(current_user_id),
      content,
      message_type: "text",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await apiFetch(buildApiUrl("/add_message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: Number(order_id),
          sender_id: Number(current_user_id),
          content,
          message_type: "text",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Ошибка отправки сообщения:", errorText);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const saved = await response.json();
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (saved?.id && !withoutTemp.some((m) => m.id === saved.id)) {
          return [...withoutTemp, saved];
        }
        return withoutTemp;
      });

      await fetchConversation();
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsLoading(false);
    }
  }, [input, order_id, current_user_id, isLoading, fetchConversation]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isOwnMessage = (msg) => String(msg.sender_id) === current_user_id;

  const participantName =
    conversation?.participant_name ||
    conversation?.other_user_name ||
    "Собеседник";

  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="order-chat">
      <header className="order-chat__header">
        <div className="order-chat__header-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="order-chat__header-text">
          <h2 className="order-chat__title">Чат по заказу</h2>
          <p className="order-chat__subtitle">
            Заказ #{order_id}
            {participantName !== "Собеседник" && ` · ${participantName}`}
          </p>
        </div>
        <span className="order-chat__count" title="Сообщений в переписке">
          {sortedMessages.length}
        </span>
      </header>

      <div className="order-chat__messages" ref={messagesListRef}>
        {sortedMessages.length === 0 && !isLoading ? (
          <div className="order-chat__empty">
            <div className="order-chat__empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="order-chat__empty-title">Пока нет сообщений</p>
            <span className="order-chat__empty-hint">
              Напишите первое сообщение заказчику или исполнителю
            </span>
          </div>
        ) : (
          <ul className="order-chat__list">
            {sortedMessages.map((msg, index) => {
              const isOwn = isOwnMessage(msg);
              const time = msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "сейчас";

              return (
                <li
                  key={msg.id || `msg-${index}`}
                  className={`order-chat__item ${isOwn ? "order-chat__item--own" : "order-chat__item--other"}`}
                >
                  <article
                    className={`order-chat__bubble ${isOwn ? "order-chat__bubble--own" : "order-chat__bubble--other"}`}
                  >
                    <header className="order-chat__bubble-meta">
                      <span className="order-chat__bubble-author">
                        {isOwn ? "Вы" : participantName}
                      </span>
                      <time className="order-chat__bubble-time" dateTime={msg.created_at}>
                        {time}
                      </time>
                    </header>
                    <p className="order-chat__bubble-text">
                      {msg.content || "📎 Вложение"}
                    </p>
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
          placeholder="Введите сообщение…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
          rows={1}
          maxLength={1000}
          aria-label="Текст сообщения"
        />
        <button
          type="button"
          className="order-chat__send"
          onClick={sendMessage}
          disabled={!canSend}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <span className="order-chat__send-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
          <span className="order-chat__send-label">
            {isLoading ? "Отправка" : "Отправить"}
          </span>
        </button>
      </footer>
    </div>
  );
}
