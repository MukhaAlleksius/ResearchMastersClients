import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaUsers,
  FaClipboardList,
  FaWallet,
  FaTags,
  FaGlobeAmericas,
  FaBriefcase,
  FaGavel,
  FaBan,
  FaHeadset,
  FaShieldAlt,
} from "react-icons/fa";
import "./admin-sidebar.css";

const NAV_GROUPS = [
  {
    title: "Основное",
    items: [
      {
        key: "users",
        label: "Пользователи",
        path: "/admin/manage_users",
        match: "/admin/manage_users",
        icon: FaUsers,
      },
      {
        key: "orders",
        label: "Заказы",
        path: "/admin/manage_orders",
        match: "/admin/manage_orders",
        icon: FaClipboardList,
      },
      {
        key: "finances",
        label: "Финансы",
        path: "/admin/finances",
        match: "/admin/finances",
        icon: FaWallet,
      },
    ],
  },
  {
    title: "Справочники",
    items: [
      {
        key: "workCategoriesAndItems",
        label: "Категории и работы",
        path: "/admin/categories_works",
        match: "/admin/categories_works",
        icon: FaTags,
      },
      {
        key: "geography",
        label: "Страны и города",
        path: "/admin/geography",
        match: "/admin/geography",
        icon: FaGlobeAmericas,
      },
      {
        key: "business_forms",
        label: "Бизнес-формы",
        path: "/admin/business_forms",
        match: "/admin/business_forms",
        icon: FaBriefcase,
      },
    ],
  },
  {
    title: "Модерация",
    items: [
      {
        key: "complaints",
        label: "Жалобы",
        path: "/admin/complaints",
        match: "/admin/complaints",
        icon: FaGavel,
      },
      {
        key: "cancelOrders",
        label: "Отказы",
        path: "/admin/cancel_orders",
        match: "/admin/cancel_orders",
        icon: FaBan,
      },
      {
        key: "supports",
        label: "Поддержка",
        path: "/admin/supports",
        match: "/admin/supports",
        icon: FaHeadset,
      },
    ],
  },
];

const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (match) => location.pathname.startsWith(match);

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <div className="admin-sidebar__brand-icon" aria-hidden="true">
          <FaShieldAlt />
        </div>
        <div className="admin-sidebar__brand-text">
          <span className="admin-sidebar__badge">Fixer Admin</span>
          <h2 className="admin-sidebar__title">Панель управления</h2>
        </div>
      </div>

      <nav className="admin-sidebar__nav" aria-label="Админ-навигация">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="admin-sidebar__group">
            <div className="admin-sidebar__group-title">{group.title}</div>
            <div className="admin-sidebar__group-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.match);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-nav-item ${active ? "admin-nav-item--active" : ""}`}
                    onClick={() => navigate(item.path)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="admin-nav-item__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="admin-nav-item__label">{item.label}</span>
                    {active && (
                      <span className="admin-nav-item__indicator" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        <span className="admin-sidebar__footer-text">Администрирование платформы</span>
      </div>
    </aside>
  );
};

export default AdminSidebar;
