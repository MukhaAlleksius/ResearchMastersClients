import { useState, useMemo, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import NotificationsBell from "./NotificationsBell";
import { apiFetch, buildApiUrl } from "../../utils/api.js";
import { useStaffAccess } from "../../utils/userAccess.js";
import "./header.css";

const baseNavItems = [
  { to: "/home", label: "Главная", end: true },
  { to: "/catalog", label: "Исполнители" },
  { to: "/orders", label: "Заказы" },
  { to: "/add_order", label: "Разместить заказ" },
  { to: "/profile", label: "Личный кабинет" },
];

const adminNavItem = { to: "/admin", label: "Администратор" };

function NavLinks({ className, onNavigate, items }) {
  return items.map(({ to, label, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) =>
        `${className} ${isActive ? "site-header__link--active" : ""}`
      }
      onClick={onNavigate}
    >
      {label}
    </NavLink>
  ));
}

function formatUserName(profile) {
  if (!profile) return "";
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
}

export default function HeaderUser({ onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const { isStaff } = useStaffAccess();
  const navItems = useMemo(
    () => (isStaff ? [...baseNavItems, adminNavItem] : baseNavItems),
    [isStaff],
  );
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setUserName("");
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch(
          buildApiUrl(`/profile/?user_id=${userId}`),
        );
        if (!response.ok) return;
        const profile = await response.json();
        if (!cancelled) {
          setUserName(formatUserName(profile));
        }
      } catch (error) {
        console.error("Не удалось загрузить имя пользователя:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className={`site-header ${menuOpen ? "site-header--menu-open" : ""}`}
    >
      <div className="site-header__inner">
        <Link to="/home" className="site-header__brand" onClick={closeMenu}>
          <img
            src="https://cdn1.genspark.ai/user-upload-image/gpt_image_generated/bc223a8c-c500-4613-9853-0a21cc7f6196"
            alt="Fixer"
            className="site-header__logo"
          />
          <span className="site-header__title">Fixer</span>
        </Link>

        <nav className="site-header__nav" aria-label="Основная навигация">
          <NavLinks className="site-header__link" items={navItems} />
        </nav>

        <div className="site-header__actions">
          <NotificationsBell />
          {userName && (
            <span className="site-header__user" title={userName}>
              <span className="site-header__user-name">{userName}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="site-header__btn site-header__btn--ghost"
          >
            Выход
          </button>
        </div>

        <button
          type="button"
          className="site-header__menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
        >
          <span className="site-header__menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <nav
        className="site-header__mobile-panel"
        aria-label="Мобильная навигация"
      >
        {userName && (
          <span className="site-header__user site-header__user--mobile">
            <span className="site-header__user-name">{userName}</span>
          </span>
        )}
        <NavLinks className="site-header__link" onNavigate={closeMenu} items={navItems} />
        <button
          type="button"
          onClick={() => {
            closeMenu();
            onLogout();
          }}
          className="site-header__btn site-header__btn--primary"
        >
          Выход
        </button>
      </nav>
    </header>
  );
}
