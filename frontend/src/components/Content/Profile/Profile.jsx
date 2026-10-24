import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, buildApiUrl, getStoredUserId } from "../../../utils/api.js";
import ProfileNavIcon from "./ProfileNavIcons";
import "./profile.css";

const SPECIALIZATIONS_CHANGED_EVENT = "fixer:specializations-changed";

const MASTER_TAB_IDS = new Set(["services", "portfolio"]);
const MASTER_SECTIONS = new Set(["services", "my_customers", "portfolio"]);

const baseTabs = [
  { id: "main_page", label: "Моя страница" },
  { id: "executor", label: "Профиль" },
  { id: "specialization", label: "Специализация" },
  { id: "orders", label: "Мои заказы" },
  { id: "services", label: "Мои услуги" },
  { id: "portfolio", label: "Портфолио" },
  { id: "analytics", label: "Аналитика" },
  // { id: "executor_bank_account", label: "Счёт" },
  { id: "administrator", label: "Администратор" },
];

export function emitSpecializationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SPECIALIZATIONS_CHANGED_EVENT));
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasSpecialization, setHasSpecialization] = useState(null);

  const refreshSpecializations = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId) {
      setHasSpecialization(false);
      return;
    }

    try {
      const response = await apiFetch(
        buildApiUrl(`/categories_works_master/${userId}`),
      );
      if (!response.ok) return;
      const data = await response.json();
      setHasSpecialization(Array.isArray(data) && data.length > 0);
    } catch (error) {
      console.error("Ошибка загрузки специализаций:", error);
    }
  }, []);

  useEffect(() => {
    refreshSpecializations();
    window.addEventListener(
      SPECIALIZATIONS_CHANGED_EVENT,
      refreshSpecializations,
    );
    return () => {
      window.removeEventListener(
        SPECIALIZATIONS_CHANGED_EVENT,
        refreshSpecializations,
      );
    };
  }, [refreshSpecializations]);

  const tabs = useMemo(
    () =>
      hasSpecialization
        ? baseTabs
        : baseTabs.filter((tab) => !MASTER_TAB_IDS.has(tab.id)),
    [hasSpecialization],
  );

  const profileSections = useMemo(
    () => new Set(baseTabs.map(({ id }) => id)),
    [],
  );

  const section = location.pathname.split("/")[2];
  const blockMasterSection =
    hasSpecialization === false && MASTER_SECTIONS.has(section);

  const activeTab = useMemo(() => {
    if (!section) {
      return "orders";
    }
    if (section === "my_executors") {
      return "orders";
    }
    if (section === "my_customers") {
      return "services";
    }
    return profileSections.has(section) ? section : "main_page";
  }, [section, profileSections]);

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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
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
        {blockMasterSection ? (
          <Navigate to="/profile/specialization" replace />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
