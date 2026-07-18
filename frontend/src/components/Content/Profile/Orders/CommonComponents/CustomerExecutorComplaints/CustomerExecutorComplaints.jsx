import React, { useState, useEffect, useRef } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import "./complaints.css";
export default function CustomerExecutorComplaints({ orderId, userType }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const sender_id = localStorage.getItem("user_id");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Загрузка сообщений
  useEffect(() => {
    const fetchMessages = async () => {
      if (!orderId) return;
      try {
        console.log(`📡 Загружаем заказ #${orderId}`);
        const res = await apiFetch(
          buildApiUrl(`/admin/complaint/order?order_id=${orderId}`), // ✅ Ваш рабочий URL
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log("🔍 Backend структура:", data);

        // Backend: {id:1, messages: [{id:1, content:"...", sender_type:"customer"}]}
        if (data.messages && Array.isArray(data.messages)) {
          const mappedMessages = data.messages.map((msg) => ({
            id: msg.id,
            text: msg.content, // ✅ content → text
            sender: msg.sender_type === "admin" ? "admin" : "user", // ✅ sender_type → sender
            time: new Date(msg.created_at).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }));
          console.log(`✅ Загружено ${mappedMessages.length} сообщений`);
          setMessages(mappedMessages);
        } else {
          console.warn("⚠️ data.messages отсутствует:", data);
          setMessages([]);
        }
      } catch (err) {
        console.error("❌ Ошибка загрузки:", err);
        setMessages([
          {
            id: 1,
            text: "Ошибка загрузки переписки. Попробуйте позже.",
            sender: "admin",
            time: "12:00",
          },
        ]);
      }
    };
    fetchMessages();
  }, [orderId]);

  const sendMessage = async () => {
    if (!input.trim() || !sender_id) {
      return;
    }

    setLoading(true);

    try {
      const trimmedInput = input.trim();

      const res = await apiFetch(
        buildApiUrl(`/add_complaint_message/${sender_id}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: orderId,
            sender_type: userType,
            sender_id: sender_id,
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

      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          text: data.content,
          sender: userType === "admin" ? "admin" : "user",
          time: new Date(data.created_at).toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      setInput("");
    } catch (err) {
      console.error("Ошибка отправки сообщения:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Ошибка отправки сообщения. Попробуйте ещё раз.",
          sender: "admin",
          time: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } finally {
      setLoading(false);
    }

    // имитация ответа админа
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "Понял вашу жалобу, проверю и сообщу результат.",
          sender: "admin",
          time: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }, 1500);
  };

  return (
    <div className="admin-chat">
      <div className="chat-header">
        <div className="admin-avatar">👨‍💼</div>
        <div>
          <div className="admin-name">Администратор</div>
          <div className="online-status">онлайн</div>
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.sender === "admin" ? "admin" : "user"}`}
          >
            <div className="message-bubble">
              {message.text}
              <div className="message-time">{message.time}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !loading && sendMessage()}
          placeholder="Напишите администратору..."
          className="message-input"
          maxLength={500}
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          className="send-btn"
          disabled={!input.trim() || loading}
        >
          {loading ? "Отправка..." : "➤"}
        </button>
      </div>
    </div>
  );
}
