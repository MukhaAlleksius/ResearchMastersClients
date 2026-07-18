import React from "react";
import { Link } from "react-router-dom";
import { LEGAL, LEGAL_LINKS } from "./legalConfig";
import "./legal.css";

export default function LegalPageLayout({
  title,
  showDraftNotice = false,
  children,
}) {
  return (
    <div className="legal-page">
      <article className="legal-page__article">
        <header className="legal-page__header">
          <h1 className="legal-page__title">{title}</h1>
          <p className="legal-page__meta">
            Сервис {LEGAL.siteName} · редакция от {LEGAL.documentDate}
          </p>
        </header>

        <nav className="legal-page__nav" aria-label="Юридические документы">
          {LEGAL_LINKS.map(({ path, label }) => (
            <Link key={path} to={path} className="legal-page__nav-link">
              {label}
            </Link>
          ))}
        </nav>

        {showDraftNotice && (
          <p className="legal-page__notice" role="note">
            Перед подключением интернет-эквайринга (WebPay) и началом приёма
            платежей заполните реквизиты компании и согласуйте тексты с юристом.
          </p>
        )}

        {children}
      </article>
    </div>
  );
}
