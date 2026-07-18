import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import {
  FaHeadset,
  FaUsers,
  FaComments,
  FaPaperPlane,
  FaTimes,
  FaCommentDots,
  FaInbox,
} from "react-icons/fa";
import "./support_admin.css";

const SUPPORT = {
  SEND_MESSAGE: `${API.baseURL}/support/add_message`,
  GET_MESSAGES: `${API.baseURL}/support/conversation/{id}/messages`,
};

function SupportMessage({ msg }) {
  const isAdmin = msg.sender_type === "admin";
  return (
    <div className={`support-msg ${isAdmin ? "support-msg--admin" : "support-msg--user"}`}>
      <span className="support-msg__label">
        {isAdmin ? "Администратор" : "Пользователь"}
      </span>
      <div className="support-msg__bubble">{msg.content}</div>
    </div>
  );
}

export default function SupportAdminPanel() {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [allConversations, setAllConversations] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAllConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API.baseURL}/support/conversations`);
      if (res.ok) {
        const convs = await res.json();
        setAllConversations(convs || []);

        const usersMap = new Map();
        (convs || []).forEach((conv) => {
          if (!usersMap.has(conv.user_id)) {
            usersMap.set(conv.user_id, {
              user_id: conv.user_id,
              username: conv.user_name || `Пользователь #${conv.user_id}`,
            });
          }
        });
        setUsersList(Array.from(usersMap.values()));
      } else {
        const altRes = await apiFetch(`${API.baseURL}/support/all`);
        if (altRes.ok) {
          const convs = await altRes.json();
          setAllConversations(convs || []);
        }
      }
    } catch (err) {
      console.error("Ошибка загрузки бесед:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const url = SUPPORT.GET_MESSAGES.replace("{id}", conversationId);
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data || []);
      }
    } catch (err) {
      console.error("Ошибка сообщений:", err);
    }
  }, []);

  const userConversations = useMemo(
    () =>
      allConversations
        .filter((conv) => !selectedUserId || conv.user_id == selectedUserId)
        .sort((a, b) => (b.message_count || 0) - (a.message_count || 0)),
    [allConversations, selectedUserId],
  );

  const totalMessages = useMemo(
    () => allConversations.reduce((sum, c) => sum + (c.message_count || 0), 0),
    [allConversations],
  );

  const activeConversation = useMemo(
    () => allConversations.find((c) => c.id === convId) || null,
    [allConversations, convId],
  );

  const openConversation = (conversationId) => {
    setConvId(conversationId);
    loadMessages(conversationId);
  };

  const handleSend = async () => {
    if (!message.trim() || !convId) return;

    setIsSending(true);
    try {
      const adminId = Number(localStorage.getItem("admin_id")) || 1;
      const res = await apiFetch(SUPPORT.SEND_MESSAGE, {
        method: "POST",
        body: JSON.stringify({
          support_conversation_id: convId,
          sender_type: "admin",
          sender_id: adminId,
          content: message,
          message_type: "text",
        }),
      });

      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setMessage("");
      }
    } catch (err) {
      console.error("Ошибка отправки:", err);
    } finally {
      setIsSending(false);
    }
  };

  const closeChat = () => {
    setConvId(null);
    setMessages([]);
    setMessage("");
  };

  useEffect(() => {
    loadAllConversations();
    const interval = setInterval(loadAllConversations, 15000);
    return () => clearInterval(interval);
  }, [loadAllConversations]);

  useEffect(() => {
    if (!convId) return;
    loadMessages(convId);
    const interval = setInterval(() => loadMessages(convId), 3000);
    return () => clearInterval(interval);
  }, [convId, loadMessages]);

  return (
    <div className="support-page">
      <header className="support-hero">
        <div className="support-hero__text">
          <span className="support-hero__badge">Админ · Поддержка</span>
          <h1 className="support-hero__title">Поддержка пользователей</h1>
          <p className="support-hero__subtitle">
            Ответы на обращения, фильтрация по пользователям и ведение переписки
          </p>
        </div>
        <div className="support-hero__stats">
          <div className="support-stat">
            <span className="support-stat__value">{allConversations.length}</span>
            <span className="support-stat__label">бесед</span>
          </div>
          <div className="support-stat">
            <span className="support-stat__value">{usersList.length}</span>
            <span className="support-stat__label">пользователей</span>
          </div>
          <div className="support-stat">
            <span className="support-stat__value">{totalMessages}</span>
            <span className="support-stat__label">сообщений</span>
          </div>
        </div>
      </header>

      <div className="support-layout">
        <aside className="support-sidebar">
          <section className="support-panel">
            <div className="support-panel__head">
              <h2 className="support-panel__title">
                <span className="support-panel__title-icon">
                  <FaUsers size={14} />
                </span>
                Фильтр
              </h2>
            </div>
            <div className="support-panel__body">
              <select
                className="support-select"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setConvId(null);
                }}
                aria-label="Фильтр по пользователю"
              >
                <option value="">Все пользователи ({usersList.length})</option>
                {usersList.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.username} (ID: {user.user_id})
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="support-panel">
            <div className="support-panel__head">
              <h2 className="support-panel__title">
                <span className="support-panel__title-icon">
                  <FaComments size={14} />
                </span>
                Беседы
              </h2>
              <span className="support-panel__count">{userConversations.length}</span>
            </div>
            <div className="support-conv-list">
              {loading ? (
                <div className="support-loading">
                  <span className="support-spinner" />
                  Загрузка…
                </div>
              ) : userConversations.length === 0 ? (
                <div className="support-empty">
                  <span className="support-empty__icon">
                    <FaInbox size={32} />
                  </span>
                  <p>Нет активных бесед</p>
                </div>
              ) : (
                userConversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    className={`support-conv-item ${convId === conv.id ? "support-conv-item--active" : ""}`}
                    onClick={() => openConversation(conv.id)}
                  >
                    <span className="support-conv-item__topic">
                      {conv.topic || "Без темы"}
                    </span>
                    <span className="support-conv-item__user">
                      Пользователь #{conv.user_id}
                    </span>
                    <span className="support-conv-item__badge">
                      <FaCommentDots size={10} />
                      {conv.message_count || 0}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="support-chat-area">
          {convId ? (
            <div className="support-chat">
              <div className="support-chat__head">
                <div>
                  <h3 className="support-chat__head-title">
                    Беседа #{convId}
                  </h3>
                  <p className="support-chat__head-sub">
                    {activeConversation?.topic || "Тема не указана"}
                    {activeConversation?.user_id
                      ? ` · Пользователь #${activeConversation.user_id}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="support-chat__close"
                  onClick={closeChat}
                >
                  <FaTimes size={12} />
                  Закрыть
                </button>
              </div>

              <div className="support-chat__messages">
                {messages.length === 0 ? (
                  <div className="support-empty">
                    <span className="support-empty__icon">
                      <FaHeadset size={32} />
                    </span>
                    <p>Нет сообщений — напишите пользователю первым</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <SupportMessage key={msg.id} msg={msg} />
                  ))
                )}
              </div>

              <div className="support-chat__input">
                <textarea
                  className="support-chat__textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ответьте пользователю…"
                  disabled={isSending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  type="button"
                  className="support-chat__send"
                  onClick={handleSend}
                  disabled={isSending || !message.trim()}
                  aria-label="Отправить"
                >
                  <FaPaperPlane size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="support-chat__placeholder">
              <span className="support-chat__placeholder-icon">
                <FaHeadset />
              </span>
              <h2 className="support-chat__placeholder-title">Выберите беседу</h2>
              <p className="support-chat__placeholder-text">
                Используйте фильтр слева или нажмите на беседу из списка, чтобы открыть чат
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
