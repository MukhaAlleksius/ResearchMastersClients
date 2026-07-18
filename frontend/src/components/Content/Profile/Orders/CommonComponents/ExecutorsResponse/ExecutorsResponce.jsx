import React, { useState } from "react";

function ExecutorResponseCard({
  executor,
  startDate = "не указано",
  workDuration = "не указано",
  workCost = "не указана",
  initialMessage,
  onAccept,
  onReject,
}) {
  // Сообщение фиксированное
  const [responseText] = useState(initialMessage);

  const handleAccept = () => {
    if (onAccept) onAccept(executor, responseText);
  };

  const handleReject = () => {
    if (onReject) onReject(executor, responseText);
  };

  const labelStyle = {
    fontWeight: "bold",
    marginBottom: 4,
    display: "block",
    color: "#333",
  };
  const readonlyFieldStyle = {
    backgroundColor: "#f0f0f0",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #ccc",
    marginBottom: 12,
    whiteSpace: "pre-wrap",
  };

  const cardStyle = {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    maxWidth: 600,
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  };

  const executorInfoStyle = {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: "1px solid #eee",
  };

  return (
    <div style={cardStyle}>
      <div style={executorInfoStyle}>
        <h3 style={{ margin: "0 0 8px 0" }}>{executor.name}</h3>
        <p style={{ margin: 0, color: "#666" }}>
          {executor.profession}, опыт {executor.experience} лет
        </p>
        <p style={{ margin: "4px 0 0 0", color: "#666" }}>
          Контакты: {executor.email}, {executor.phone}
        </p>
      </div>

      <div>
        <label style={labelStyle}>Дата начала работы:</label>
        <div style={readonlyFieldStyle}>{startDate}</div>
      </div>

      <div>
        <label style={labelStyle}>Сроки выполнения:</label>
        <div style={readonlyFieldStyle}>{workDuration}</div>
      </div>

      <div>
        <label style={labelStyle}>Стоимость работы:</label>
        <div style={readonlyFieldStyle}>{workCost}</div>
      </div>

      <div>
        <label style={labelStyle}>Сообщение</label>
        <div style={readonlyFieldStyle}>{responseText}</div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          style={{
            padding: "10px 20px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            cursor: "pointer",
            flexGrow: 1,
          }}
          onClick={handleAccept}
        >
          Принять предложение
        </button>

        <button
          style={{
            padding: "10px 20px",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            cursor: "pointer",
            flexGrow: 1,
          }}
          onClick={handleReject}
        >
          Отказать
        </button>
      </div>
    </div>
  );
}

// Главный компонент, показывающий карточки разных исполнителей
export default function ExecutorsResponsesList({
  responses,
  onAccept,
  onReject,
}) {
  /*
   responses = [
     {
       executor: { name, profession, experience, email, phone },
       startDate,
       workDuration,
       workCost,
       initialMessage,
     },
     ...
   ]
  */

  return (
    <div style={{ padding: 20 }}>
      <h2>Ответы исполнителей</h2>
      {responses.length === 0 && <p>Нет ответов от исполнителей.</p>}
      {responses.map((resp, idx) => (
        <ExecutorResponseCard
          key={idx}
          executor={resp.executor}
          startDate={resp.startDate}
          workDuration={resp.workDuration}
          workCost={resp.workCost}
          initialMessage={resp.initialMessage}
          onAccept={(text) => onAccept && onAccept(resp.executor, text)}
          onReject={(text) => onReject && onReject(resp.executor, text)}
        />
      ))}
    </div>
  );
}
