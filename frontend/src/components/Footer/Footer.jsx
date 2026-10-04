import React from "react";
import { Link } from "react-router-dom";
import "./footer.css";
import { LEGAL, LEGAL_LINKS } from "../Content/Legal/legalConfig";
import logoSrc from "../../assets/logo.png";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__content">
          <Link to="/home" className="site-footer__brand">
            <img
              src={logoSrc}
              alt={LEGAL.siteName}
              className="site-footer__logo"
            />
            <span className="site-footer__name">{LEGAL.siteName}</span>
          </Link>

          <p className="site-footer__about">
            Сервис поиска проверенных исполнителей. Помогаем заказчикам находить
            мастеров, а специалистам — получать новые заказы.
          </p>

          <nav className="site-footer__legal" aria-label="Юридические документы">
            {LEGAL_LINKS.map(({ path, label }) => (
              <Link key={path} to={path} className="site-footer__legal-link">
                {label}
              </Link>
            ))}
          </nav>

          <div className="site-footer__info">
            <span>{LEGAL.companyName}</span>
            <span>УНП {LEGAL.unp}</span>
            <span>
              <a href={`mailto:${LEGAL.email}`} className="site-footer__info-link">
                {LEGAL.email}
              </a>
            </span>
            <span>{LEGAL.phone}</span>
          </div>
        </div>

        <p className="site-footer__copy">
          © {year} {LEGAL.siteName}. Все права защищены.
        </p>
      </div>
    </footer>
  );
}
