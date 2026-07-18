import React, { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  buildApiUrl,
  persistAuthSession,
  readApiError,
} from "../../../utils/api.js";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import RegisterModal from "../Regisration/RegisterModal";
import GoogleRegistrationModal from "../Regisration/GoogleRegistrationModal";
import "../Regisration/registration_modal.css";
import "./login_modal.css";

function FieldRow({ label, htmlFor, hint, children }) {
  return (
    <div className="reg-modal__row">
      <label className="reg-modal__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="reg-modal__control">{children}</div>
      {hint ? <span className="reg-modal__hint">{hint}</span> : <span />}
    </div>
  );
}

export default function LoginModal({ onLogin, isOpen, onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [googleGeoOpen, setGoogleGeoOpen] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState("");
  const [googleProfile, setGoogleProfile] = useState(null);

  const navigate = useNavigate();

  const GOOGLE_CLIENT_ID = (process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
  const googleButtonContainerRef = useRef(null);
  const googleButtonRenderedRef = useRef(false);

  const base64UrlDecode = (str) => {
    try {
      const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
      const pad =
        base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
      const binary = atob(base64 + pad);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  };

  const decodeJwtPayload = (token) => {
    const part = token?.split?.(".")?.[1];
    if (!part) return {};
    try {
      return JSON.parse(base64UrlDecode(part));
    } catch {
      return {};
    }
  };

  const handleLoginClose = () => {
    setGoogleGeoOpen(false);
    setGoogleIdToken("");
    setGoogleProfile(null);
    setRegister(false);
    googleButtonRenderedRef.current = false;
    if (googleButtonContainerRef.current) {
      googleButtonContainerRef.current.innerHTML = "";
    }
    onClose();
  };

  const handleGoogleRegistered = (data) => {
    persistAuthSession(data);
    onLogin(true);
    navigate("/profile");
  };

  useEffect(() => {
    if (!isOpen || register || googleGeoOpen || !GOOGLE_CLIENT_ID) return;

    let timerId = null;

    const tryInit = () => {
      if (googleButtonRenderedRef.current) return;

      const google = window?.google;
      const container = googleButtonContainerRef.current;
      if (!google?.accounts?.id || !container) return;

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          const id_token = response?.credential;
          if (!id_token) {
            setError("Google авторизация не удалась");
            return;
          }

          const payload = decodeJwtPayload(id_token);
          setGoogleIdToken(id_token);
          setGoogleProfile({
            email: payload?.email || "",
            firstName: payload?.given_name || "",
            lastName: payload?.family_name || "",
          });
          setError("");
          setGoogleGeoOpen(true);
        },
      });

      google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 320,
        locale: "ru",
      });
      googleButtonRenderedRef.current = true;
    };

    tryInit();
    timerId = window.setInterval(tryInit, 300);

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
  }, [isOpen, register, googleGeoOpen, GOOGLE_CLIENT_ID]);

  if (!isOpen && !register && !googleGeoOpen) return null;

  const handleUserEnter = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Введите логин и пароль");
      return;
    }

    try {
      setLoading(true);
      const response = await apiFetch(buildApiUrl("/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const detail = await readApiError(response);
        throw new Error(detail || "Неверный логин или пароль");
      }

      const data = await response.json();
      persistAuthSession(data);
      onLogin(true);
      onClose();
      navigate("/profile");
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  const openRegisterModal = () => {
    setRegister(true);
  };

  const closeRegisterModal = () => {
    setRegister(false);
  };

  return (
    <>
      {isOpen &&
        !register &&
        !googleGeoOpen &&
        createPortal(
          <div
            className="reg-modal-overlay"
            onClick={handleLoginClose}
            role="presentation"
          >
            <div
              className="reg-modal login-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="loginModalTitle"
            >
              <header className="reg-modal__hero">
                <span className="reg-modal__badge">Fixer</span>
                <h2 id="loginModalTitle" className="reg-modal__title">
                  Вход в аккаунт
                </h2>
                <p className="reg-modal__subtitle">
                  Войдите, чтобы размещать заказы и управлять услугами
                </p>
                <button
                  type="button"
                  className="reg-modal__close"
                  onClick={handleLoginClose}
                  aria-label="Закрыть"
                  disabled={loading}
                >
                  ×
                </button>
              </header>

              <form
                className="reg-modal__form"
                onSubmit={handleUserEnter}
                noValidate
              >
                <div className="reg-modal__body">
                  {error && (
                    <p className="reg-modal__error" role="alert">
                      {error}
                    </p>
                  )}

                  <div className="reg-modal__fields">
                    <FieldRow label="Email *" htmlFor="login-email" hint="логин">
                      <input
                        id="login-email"
                        type="text"
                        className="reg-modal__input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        disabled={loading}
                        placeholder="name@example.com"
                        required
                      />
                    </FieldRow>

                    <FieldRow label="Пароль *" htmlFor="login-password">
                      <input
                        id="login-password"
                        type="password"
                        className="reg-modal__input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        disabled={loading}
                        placeholder="••••••••"
                        required
                      />
                    </FieldRow>
                  </div>

                  <div className="login-modal__forgot">
                    <button type="button" className="login-modal__forgot-btn">
                      Забыли пароль?
                    </button>
                  </div>
                </div>

                <footer className="reg-modal__footer login-modal__footer">
                  <button
                    type="submit"
                    className="reg-modal__submit"
                    disabled={loading}
                  >
                    {loading ? "Входим…" : "Войти"}
                  </button>
                  <button
                    type="button"
                    className="login-modal__secondary"
                    onClick={openRegisterModal}
                    disabled={loading}
                  >
                    Регистрация
                  </button>
                </footer>

                {GOOGLE_CLIENT_ID && (
                  <div className="login-modal__google">
                    <div className="login-modal__google-divider">или</div>
                    <div
                      ref={googleButtonContainerRef}
                      className="login-modal__google-button"
                    />
                  </div>
                )}
              </form>
            </div>
          </div>,
          document.body,
        )}

      {register && (
        <RegisterModal isOpen={register} onClose={closeRegisterModal} />
      )}

      {googleGeoOpen && (
        <GoogleRegistrationModal
          isOpen={googleGeoOpen}
          onClose={handleLoginClose}
          googleIdToken={googleIdToken}
          googleProfile={googleProfile}
          onRegistered={handleGoogleRegistered}
        />
      )}
    </>
  );
}
