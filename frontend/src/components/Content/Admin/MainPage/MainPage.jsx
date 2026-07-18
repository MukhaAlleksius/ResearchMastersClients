import React, { useState } from "react";

const TAB_ITEMS = [
  {
    key: "finances",
    label: "Финансы",
    content: <div>Содержимое: финансы</div>,
  },
  {
    key: "users",
    label: "Пользователи",
    content: <div>Содержимое: пользователи</div>,
  },
  { key: "orders", label: "Заказы", content: <div>Содержимое: заказы</div> },
  { key: "charts", label: "Графики", content: <div>Содержимое: графики</div> },
  {
    key: "notifications",
    label: "Уведомления системы",
    content: <div>Содержимое: уведомления системы</div>,
  },
];

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  tabs: {
    display: "flex",
    borderBottom: "2px solid #ccc",
    backgroundColor: "#f0f2f5",
  },
  tabButton: {
    padding: "14px 24px",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 16,
    userSelect: "none",
    borderBottom: "1px solid #ccc", // тонкая линия у всех вкладок
    transition: "color 0.3s, border-color 0.3s",
    outline: "none",
  },

  tabButtonActive: {
    borderBottom: "4px solid #2c72dc", // толстая линия у активной
    color: "#2c72dc",
    fontWeight: "700",
  },

  content: {
    flexGrow: 1,
    padding: 30,
    backgroundColor: "#fff",
    overflowY: "auto",
  },
};

const AdminMainPage = () => {
  const [activeTab, setActiveTab] = useState(TAB_ITEMS[0].key);

  return (
    <div style={styles.container}>
      {" "}
      <nav style={styles.tabs}>
        {" "}
        {TAB_ITEMS.map(({ key, label }) => {
          const isActive = key === activeTab;
          return (
            <button
              key={key}
              style={{
                ...styles.tabButton,
                ...(isActive ? styles.tabButtonActive : {}),
              }}
              onClick={() => setActiveTab(key)}
              aria-selected={isActive}
            >
              {label}{" "}
            </button>
          );
        })}{" "}
      </nav>{" "}
      <main style={styles.content}>
        {TAB_ITEMS.find((tab) => tab.key === activeTab)?.content}{" "}
      </main>{" "}
    </div>
  );
};

export default AdminMainPage;
