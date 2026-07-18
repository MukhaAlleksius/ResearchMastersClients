import React, { useState, useMemo, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ProfileNavIcon from "./ProfileNavIcons";
import { useStaffAccess } from "../../../utils/userAccess.js";
import "./profile.css";

const baseTabs = [
  { id: "main_page", label: "Моя страница" },
  { id: "orders", label: "Мои заказы" },
  { id: "my_executors", label: "Исполнители" },
  { id: "services", label: "Мои услуги" },
  { id: "my_customers", label: "Заказчики" },
  { id: "specialization", label: "Специализация" },
  { id: "executor", label: "Профиль" },
  { id: "portfolio", label: "Портфолио" },
  { id: "analytics", label: "Аналитика" },
  { id: "executor_bank_account", label: "Счёт" },
];

const administratorTab = { id: "administrator", label: "Администратор" };

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isStaff } = useStaffAccess();

  const tabs = useMemo(
    () => (isStaff ? [...baseTabs, administratorTab] : baseTabs),
    [isStaff],
  );

  const profileSections = useMemo(
    () => new Set(tabs.map(({ id }) => id)),
    [tabs],
  );

  const activeTab = useMemo(() => {
    const section = location.pathname.split("/")[2];
    if (!section || section === "orders") {
      return "orders";
    }
    return profileSections.has(section) ? section : "orders";
  }, [location.pathname, profileSections]);

  useEffect(() => {
    if (!isStaff && location.pathname.startsWith("/profile/administrator")) {
      navigate("/profile", { replace: true });
    }
  }, [isStaff, location.pathname, navigate]);

  const handleMenuClick = (tabId) => {
    navigate(`/profile/${tabId}`);
    setIsMenuOpen(false);
  };

  const toggleMenu = () => setIsMenuOpen((open) => !open);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="profile-layout">
      <button
        type="button"
        className="profile-hamburger"
        onClick={toggleMenu}
        aria-label="Открыть меню профиля"
        aria-expanded={isMenuOpen}
      >
        ☰
      </button>

      <nav
        className={`profile-sidebar ${isMenuOpen ? "profile-sidebar--open" : ""}`}
        aria-label="Навигация профиля"
      >
        <div className="profile-sidebar__head">
          <h2 className="profile-sidebar__title">Личный кабинет</h2>
          <p className="profile-sidebar__subtitle">Управление аккаунтом</p>
          <button
            type="button"
            className="profile-sidebar__close"
            onClick={closeMenu}
            aria-label="Закрыть меню"
          >
            ✕
          </button>
        </div>

        <div className="profile-sidebar__nav">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleMenuClick(id)}
              className={`profile-nav-item ${activeTab === id ? "profile-nav-item--active" : ""}`}
            >
              <span className="profile-nav-icon" aria-hidden="true">
                <ProfileNavIcon id={id} />
              </span>
              <span className="profile-nav-label">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div
        className={`profile-overlay ${isMenuOpen ? "profile-overlay--visible" : ""}`}
        onClick={closeMenu}
        aria-hidden={!isMenuOpen}
      />

      <main className="profile-content">
        <Outlet />
      </main>
    </div>
  );
}
