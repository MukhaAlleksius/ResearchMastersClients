import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import "./support_contact_panel.css";
const SUPPORT = {
  START_CONVERSATION: `${API.baseURL}/support/add_conversation`,
  SEND_MESSAGE: `${API.baseURL}/support/add_message`,
  GET_MESSAGES: `${API.baseURL}/support/conversation/{id}/messages`,
};

const TOPICS = [
  { value: "bug", label: "Сообщить о баге", desc: "Ошибка в работе сервиса" },
  { value: "payment", label: "Вопрос по оплате", desc: "Выплаты, комиссии, счёт" },
  { value: "feature", label: "Предложение", desc: "Идея по улучшению" },
  { value: "other", label: "Другое", desc: "Любой другой вопрос" },
];

function TopicIcon({ type }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    "aria-hidden": true,
  };

  switch (type) {
    case "bug":
      return (
        <svg {...props}>
          <path d="M8 2v2M16 2v2M12 6v2M5 10h14M6 14h.01M10 14h.01M14 14h.01M18 14h.01M7 18h10M9 22h6" strokeLinecap="round" />
          <rect x="7" y="6" width="10" height="12" rx="2" />
        </svg>
      );
    case "payment":
      return (
        <svg {...props}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20M6 15h4" strokeLinecap="round" />
        </svg>
      );
    case "feature":
      return (
        <svg {...props}>
          <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.2 6L15 18H9l-.8-3C6.3 13.7 5 11.5 5 9a7 7 0 017-7z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const getTopic = (topicValue) =>
  TOPICS.find((t) => t.value === topicValue) || {
    value: topicValue,
    label: topicValue,
    desc: "",
  };

function formatMessageTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ChatMessage({ msg }) {
  const isUser = msg.sender_type === "user";
  const time = formatMessageTime(msg.created_at);

  return (
    <div className={`sup-msg ${isUser ? "sup-msg--user" : "sup-msg--admin"}`}>
      <div className="sup-msg__meta">
        <span className="sup-msg__author">{isUser ? "Вы" : "Администратор"}</span>
        {time && <time className="sup-msg__time" dateTime={msg.created_at}>{time}</time>}
      </div>
      <div className="sup-msg__bubble">{msg.content}</div>
    </div>
  );
}

export default function SupportContactPanel() {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userConversations, setUserConversations] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef(null);
  const userId = useMemo(() => Number(localStorage.getItem("user_id")), []);

  const activeConversation = userConversations.find((c) => c.id === convId);
  const activeTopic = activeConversation ? getTopic(activeConversation.topic) : null;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadUserConversations = useCallback(async () => {
    try {
      const res = await apiFetch(`${API.baseURL}/support/conversations`);
      if (res.ok) {
        const allConvs = await res.json();
        const userConvs = allConvs.filter((conv) => conv.user_id === userId);
        setUserConversations(userConvs);
      }
    } catch (err) {
      console.error("Ошибка загрузки бесед:", err);
    }
  }, [userId]);

  const loadMessages = useCallback(async (conversationId, silent = false) => {
    if (!conversationId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const url = SUPPORT.GET_MESSAGES.replace("{id}", conversationId);
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Ошибка загрузки сообщений:", err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  const openConversation = (conversationId) => {
    setConvId(conversationId);
    setMessage("");
    loadMessages(conversationId);
  };

  const getOrCreateConversation = async (topicValue) => {
    if (!topicValue) return;

    try {
      const existing = userConversations.find((conv) => conv.topic === topicValue);
      if (existing) {
        openConversation(existing.id);
        return;
      }

      const res = await apiFetch(SUPPORT.START_CONVERSATION, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, topic: topicValue }),
      });

      if (res.ok) {
        const conv = await res.json();
        setUserConversations((prev) => [conv, ...prev]);
        openConversation(conv.id);
      }
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !convId || !userId) return;

    setIsSending(true);
    try {
      const res = await apiFetch(SUPPORT.SEND_MESSAGE, {
        method: "POST",
        body: JSON.stringify({
          support_conversation_id: convId,
          sender_type: "user",
          sender_id: userId,
          content: message.trim(),
          message_type: "text",
        }),
      });

      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setMessage("");
      }
    } catch (err) {
      alert("Ошибка отправки: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    loadUserConversations();
  }, [loadUserConversations]);

  useEffect(() => {
    if (convId) {
      loadMessages(convId, true);
      const interval = setInterval(() => loadMessages(convId, true), 5000);
      return () => clearInterval(interval);
    }
  }, [convId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const closeChat = () => {
    setConvId(null);
    setMessages([]);
    setMessage("");
  };

  return (
    <div className="sup-page">
      <header className="sup-header">
        <div className="sup-header__icon">
          <ChatIcon />
        </div>
        <div className="sup-header__text">
          <h1 className="sup-header__title">Связь с администратором</h1>
          <p className="sup-header__subtitle">
            Задайте вопрос, сообщите о проблеме или предложите улучшение — ответ
            придёт в этот чат
          </p>
        </div>
      </header>

      <div className="sup-layout">
        <aside className="sup-sidebar">
          <h2 className="sup-section-title">Тема обращения</h2>
          <div className="sup-topic-cards">
            {TOPICS.map((topic) => {
              const hasDialog = userConversations.some(
                (conv) => conv.topic === topic.value,
              );
              const isActive =
                convId != null && activeConversation?.topic === topic.value;

              return (
                <button
                  key={topic.value}
                  type="button"
                  className={`sup-topic-card ${isActive ? "sup-topic-card--active" : ""}`}
                  onClick={() => getOrCreateConversation(topic.value)}
                >
                  <span className="sup-topic-card__icon">
                    <TopicIcon type={topic.value} />
                  </span>
                  <span className="sup-topic-card__text">
                    <span className="sup-topic-card__label">{topic.label}</span>
                    <span className="sup-topic-card__desc">{topic.desc}</span>
                  </span>
                  {hasDialog && !isActive && (
                    <span className="sup-topic-card__dot" title="Есть переписка" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="sup-main">
          {convId ? (
            <div className="sup-chat">
              <header className="sup-chat__head">
                <div className="sup-chat__head-main">
                  {activeTopic && (
                    <span className="sup-chat__topic-icon">
                      <TopicIcon type={activeTopic.value} />
                    </span>
                  )}
                  <div className="sup-chat__head-text">
                    <span className="sup-chat__label">Активный диалог</span>
                    <h3 className="sup-chat__title">
                      {activeTopic ? activeTopic.label : `Диалог #${convId}`}
                    </h3>
                  </div>
                </div>
                <button type="button" className="sup-chat__close" onClick={closeChat}>
                  Закрыть
                </button>
              </header>

              <div className="sup-chat__messages">
                {loadingMessages ? (
                  <div className="sup-chat__loading">
                    <span className="sup-chat__loading-spinner" aria-hidden="true" />
                    Загрузка сообщений…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="sup-chat__empty">
                    <span className="sup-chat__empty-icon">
                      <ChatIcon />
                    </span>
                    <p className="sup-chat__empty-title">Начните диалог</p>
                    <p className="sup-chat__empty-text">
                      Опишите ситуацию — администратор увидит сообщение и ответит
                      в этом чате
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatMessage key={msg.id} msg={msg} />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <footer className="sup-chat__composer">
                <div className="sup-chat__composer-inner">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Напишите сообщение…"
                    disabled={isSending}
                    className="sup-chat__input"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isSending || !message.trim()}
                    className="sup-chat__send"
                    aria-label="Отправить"
                  >
                    {isSending ? (
                      <span className="sup-chat__send-spinner" aria-hidden="true" />
                    ) : (
                      <SendIcon />
                    )}
                  </button>
                </div>
                <p className="sup-chat__hint">Enter — отправить · Shift+Enter — новая строка</p>
              </footer>
            </div>
          ) : (
            <div className="sup-placeholder">
              <span className="sup-placeholder__icon">
                <ChatIcon />
              </span>
              <p className="sup-placeholder__title">Выберите тему обращения</p>
              <p className="sup-placeholder__text">
                Выберите тему слева — откроется чат с администратором по этому
                вопросу
              </p>
              <ul className="sup-placeholder__tips">
                <li>Один диалог на каждую тему</li>
                <li>Повторный клик по теме открывает существующий чат</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
