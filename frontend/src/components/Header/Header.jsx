import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { isExecutorsNavActive, isOrdersNavActive } from "../../utils/navActive.js";
import logoSrc from "../../assets/logo.png";
import "./header.css";

const navItems = [
  { to: "/home", label: "Главная", end: true },
  { to: "/catalog", label: "Исполнители" },
  { to: "/orders", label: "Заказы" },
  { to: "/add_order", label: "Разместить заказ" },
];

function isNavItemActive(to, pathname, defaultActive) {
  if (to === "/catalog") return isExecutorsNavActive(pathname);
  if (to === "/orders") return isOrdersNavActive(pathname);
  return defaultActive;
}

function NavLinks({ className, onNavigate }) {
  const { pathname } = useLocation();

  return navItems.map(({ to, label, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) =>
        `${className} ${
          isNavItemActive(to, pathname, isActive)
            ? "site-header__link--active"
            : ""
        }`
      }
      onClick={onNavigate}
    >
      {label}
    </NavLink>
  ));
}

export default function Header({ openModal }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={`site-header ${menuOpen ? "site-header--menu-open" : ""}`}
    >
      <div className="site-header__inner">
        <Link to="/home" className="site-header__brand" onClick={closeMenu}>
          <img
            src={logoSrc}
            alt="Fixer"
            className="site-header__logo"
          />
          <span className="site-header__title">Fixer</span>
        </Link>

        <nav className="site-header__nav" aria-label="Основная навигация">
          <NavLinks className="site-header__link" />
        </nav>

        <div className="site-header__actions">
          <button
            type="button"
            onClick={() => openModal("registerModal")}
            className="site-header__btn site-header__btn--ghost"
          >
            Регистрация
          </button>
          <button
            type="button"
            onClick={() => openModal("loginModal")}
            className="site-header__btn site-header__btn--primary"
          >
            Вход
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
        <NavLinks className="site-header__link" onNavigate={closeMenu} />
        <button
          type="button"
          onClick={() => {
            closeMenu();
            openModal("registerModal");
          }}
          className="site-header__btn site-header__btn--ghost"
        >
          Регистрация
        </button>
        <button
          type="button"
          onClick={() => {
            closeMenu();
            openModal("loginModal");
          }}
          className="site-header__btn site-header__btn--primary"
        >
          Вход
        </button>
      </nav>
    </header>
  );
}
