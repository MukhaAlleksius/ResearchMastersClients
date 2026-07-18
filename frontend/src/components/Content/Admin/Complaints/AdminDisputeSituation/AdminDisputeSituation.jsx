import React, { useState, useEffect, useRef } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import { Link, useParams } from "react-router-dom";
import {
  FaComments,
  FaClipboardList,
  FaBalanceScale,
  FaArrowLeft,
} from "react-icons/fa";
import "./disputes.css";
import VerdictAdminComplaint from "./VerdictAdminComplaint/VerdictAdminComplaint";
import OrderComplaintInspector from "./OrderComplaintInspector/OrderComplaintInspector";

export default function AdminDisputeSituation() {
  const { complaint_id, order_id } = useParams();
  const [messages, setMessages] = useState([]);
  const [chatData, setChatData] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [verdictSubmitted, setVerdictSubmitted] = useState(false);
  const messagesEndRef = useRef(null);

  const adminId = localStorage.getItem("user_id");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!order_id) return;

    const fetchMessages = async () => {
      try {
        const res = await apiFetch(
          `${API.baseURL}/admin/complaint/order?order_id=${order_id}`,
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        setChatData(data);

        if (data.messages && Array.isArray(data.messages)) {
          const mappedMessages = data.messages.map((msg) => ({
            id: msg.id,
            text: msg.content,
            sender_type: msg.sender_type,
            created_at: msg.created_at || new Date().toISOString(),
          }));
          setMessages(mappedMessages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error("Ошибка загрузки:", err);
        setMessages([
          {
            id: Date.now(),
            text: "Ошибка загрузки спора",
            sender_type: "system",
          },
        ]);
      }
    };

    fetchMessages();
  }, [order_id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setLoading(true);

    try {
      const res = await apiFetch(
        `${API.baseURL}/add_complaint_message/${adminId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: chatData?.order_id || order_id,
            complaint_id: chatData?.id || complaint_id,
            sender_type: "admin",
            sender_id: adminId,
            admin_id: adminId,
            content: input.trim(),
            message_type: "text",
          }),
        },
      );

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Ошибка отправки");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          text: data.content,
          sender_type: "admin",
          created_at: data.created_at,
        },
      ]);
      setInput("");
    } catch (err) {
      console.error("Ошибка отправки:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Ошибка отправки",
          sender_type: "system",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dispute-detail-page">
      <Link to="/admin/complaints" className="dispute-back">
        <FaArrowLeft size={12} />
        К списку жалоб
      </Link>

      <div className="disputes-chat">
        <div className="dispute-tabs">
          <button
            type="button"
            className={`tab ${activeTab === "chat" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <FaComments size={13} />
            Чат ({messages.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "order" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("order")}
          >
            <FaClipboardList size={13} />
            Изучить заказ
          </button>
          {!verdictSubmitted && chatData && (
            <button
              type="button"
              className={`tab ${activeTab === "verdict" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("verdict")}
            >
              <FaBalanceScale size={13} />
              Вердикт
            </button>
          )}
        </div>

        {activeTab === "chat" && (
          <>
            <div className="disputes-header">
              <div className="disputes-title">Спор по заказу #{order_id}</div>
              <div className="disputes-subtitle">
                Общение с заказчиком, исполнителем и администратором
              </div>
            </div>

            <div className="messages-container">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message message-${msg.sender_type}`}
                >
                  <div className="message-bubble">
                    {msg.text || "Пустое сообщение"}
                    <div className="message-meta">
                      <span className="message-sender">
                        {msg.sender_type === "customer" && "Заказчик"}
                        {msg.sender_type === "executor" && "Исполнитель"}
                        {msg.sender_type === "admin" && "Администратор"}
                        {msg.sender_type === "system" && "Система"}
                      </span>
                      <span className="message-time">
                        {msg.created_at
                          ? new Date(msg.created_at).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
                placeholder="Напишите участникам спора…"
                className="message-input"
                maxLength={500}
                disabled={loading}
              />
              <button
                type="button"
                onClick={sendMessage}
                className="send-btn"
                disabled={!input.trim() || loading}
              >
                {loading ? "…" : "➤"}
              </button>
            </div>
          </>
        )}

        {activeTab === "order" && chatData && (
          <OrderComplaintInspector orderId={order_id} />
        )}

        {activeTab === "verdict" && chatData && !verdictSubmitted && (
          <VerdictAdminComplaint
            complaintId={chatData.id}
            orderId={order_id}
            customer={chatData.customer}
            executor={chatData.executor}
          />
        )}

        {verdictSubmitted && (
          <div className="verdict-complete">
            <div className="verdict-icon">✓</div>
            <h3>Вердикт успешно вынесен</h3>
            <p>Решение отправлено участникам спора.</p>
            <button
              type="button"
              className="btn-back"
              onClick={() => {
                setActiveTab("chat");
                setVerdictSubmitted(false);
              }}
            >
              Вернуться к чату
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
