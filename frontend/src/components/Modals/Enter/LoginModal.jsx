import React, { useEffect, useRef, useState } from "react";
import {
  apiFetch, // fetch с базовым URL и обработкой auth
  buildApiUrl, // собрать полный URL эндпоинта
  persistAuthSession, // сохранить access/refresh токены в storage
  readApiError, // вытащить текст ошибки из ответа API
} from "../../../utils/api.js";
import { useNavigate } from "react-router-dom"; // возврат на страницу, с которой открыли вход
import { createPortal } from "react-dom"; // модалка поверх document.body
import RegisterModal from "../Regisration/RegisterModal"; // обычная регистрация email/пароль
import GoogleRegistrationModal from "../Regisration/GoogleRegistrationModal"; // добор географии после Google
import PasswordField from "../Regisration/PasswordField.jsx"; // пароль + глаз
import "../Regisration/registration_modal.css"; // общие стили модалок регистрации/входа
import "./login_modal.css"; // стили только для логина

/** Безопасный путь для возврата после входа (только внутренние URL). */
function resolveReturnPath(fallback = "/") {
  try {
    const saved = sessionStorage.getItem("auth_return_to");
    if (saved) sessionStorage.removeItem("auth_return_to");
    const candidate =
      saved || `${window.location.pathname}${window.location.search || ""}`;
    if (
      typeof candidate === "string" &&
      candidate.startsWith("/") &&
      !candidate.startsWith("//") &&
      !candidate.includes("://")
    ) {
      return candidate;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function rememberReturnPath() {
  try {
    const path = `${window.location.pathname}${window.location.search || ""}`;
    if (path.startsWith("/") && !path.startsWith("//")) {
      sessionStorage.setItem("auth_return_to", path);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Строка формы: подпись слева, поле справа, опциональная подсказка снизу.
 * children — сам input (или другой контрол).
 */
function FieldRow({ label, htmlFor, hint, children }) {
  return (
    <div className="reg-modal__row">
      <label className="reg-modal__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="reg-modal__control">{children}</div>
      {/* hint есть — показываем; иначе пустой span для сетки */}
      {hint ? <span className="reg-modal__hint">{hint}</span> : <span />}
    </div>
  );
}

/**
 * Модалка входа: email/пароль + кнопка Google.
 * После Google всегда открывает GoogleRegistrationModal (география).
 *
 * Props:
 * - onLogin(true) — сообщить родителю, что пользователь вошёл
 * - isOpen — показывать форму входа
 * - onClose — закрыть модалку
 */
export default function LoginModal({ onLogin, isOpen, onClose }) {
  const [email, setEmail] = useState(""); // логин (email)
  const [password, setPassword] = useState(""); // пароль
  const [register, setRegister] = useState(false); // true → показать RegisterModal вместо логина
  const [error, setError] = useState(""); // текст ошибки под заголовком
  const [loading, setLoading] = useState(false); // идёт запрос /token

  const [googleGeoOpen, setGoogleGeoOpen] = useState(false); // true → форма географии после Google
  const [googleIdToken, setGoogleIdToken] = useState(""); // credential (JWT) от Google
  const [googleProfile, setGoogleProfile] = useState(null); // email/имя из JWT для превью в geo-модалке

  const navigate = useNavigate();

  // Client ID из .env фронта; без него блок Google не рисуем
  const GOOGLE_CLIENT_ID = (process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
  const googleButtonContainerRef = useRef(null); // DOM-узел, куда GIS вставит кнопку
  const googleButtonRenderedRef = useRef(false); // чтобы не рендерить кнопку дважды

  const finishLogin = () => {
    onLogin(true);
    onClose();
    navigate(resolveReturnPath(), { replace: true });
  };

  // Запомнить страницу, с которой открыли вход
  useEffect(() => {
    if (isOpen) rememberReturnPath();
  }, [isOpen]);

  /**
   * Декодирует base64url-строку (часть JWT) в обычный текст.
   * JWT использует -/_ вместо +/ и без паддинга =.
   */
  const base64UrlDecode = (str) => {
    try {
      const base64 = str.replace(/-/g, "+").replace(/_/g, "/"); // base64url → base64
      const pad =
        base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4)); // добить длину до кратной 4
      const binary = atob(base64 + pad); // бинарная строка
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0)); // байты UTF-8
      return new TextDecoder().decode(bytes); // строка JSON payload
    } catch {
      return ""; // битый ввод — пустая строка
    }
  };

  /**
   * Достаёт payload JWT (вторая часть между точками) без проверки подписи.
   * Нужно только чтобы показать email/имя до запроса на бэкенд.
   */
  const decodeJwtPayload = (token) => {
    const part = token?.split?.(".")?.[1]; // средняя часть JWT: header.payload.sig
    if (!part) return {}; // не JWT — пустой объект
    try {
      return JSON.parse(base64UrlDecode(part)); // { email, given_name, ... }
    } catch {
      return {}; // JSON битый
    }
  };

  /** Сброс Google/регистрации и закрытие модалки входа. */
  const handleLoginClose = () => {
    setGoogleGeoOpen(false); // закрыть geo-форму
    setGoogleIdToken(""); // забыть Google token
    setGoogleProfile(null); // забыть превью профиля
    setRegister(false); // закрыть RegisterModal, если был открыт
    googleButtonRenderedRef.current = false; // разрешить снова вставить кнопку Google
    if (googleButtonContainerRef.current) {
      googleButtonContainerRef.current.innerHTML = ""; // очистить DOM кнопки GIS
    }
    onClose(); // колбэк родителя
  };

  /**
   * Успешная регистрация/вход через Google + география.
   * data — ответ /auth/google/register (токены + user_id).
   */
  const handleGoogleRegistered = (data) => {
    persistAuthSession(data);
    finishLogin();
  };

  /**
   * Когда открыт логин (и не register / не geo) — инициализировать Google Identity Services
   * и вставить кнопку «Продолжить с Google» в контейнер.
   * Интервал 300 мс: ждём, пока подгрузится script google.accounts.id.
   */
  useEffect(() => {
    // Нечего инициализировать: модалка закрыта / другая форма / нет client id
    if (!isOpen || register || googleGeoOpen || !GOOGLE_CLIENT_ID) return;

    let timerId = null; // id setInterval для очистки

    /** Попытка один раз инициализировать GIS и отрисовать кнопку. */
    const tryInit = () => {
      if (googleButtonRenderedRef.current) return; // уже отрисовали

      const google = window?.google; // объект SDK Google (из <script>)
      const container = googleButtonContainerRef.current; // куда вставлять кнопку
      if (!google?.accounts?.id || !container) return; // SDK ещё не готов или нет DOM

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID, // OAuth client id приложения
        callback: (response) => {
          // Google вернул credential (id_token JWT)
          const id_token = response?.credential;
          if (!id_token) {
            setError("Google авторизация не удалась");
            return;
          }

          const jwtPayload = decodeJwtPayload(id_token); // email/имя без запроса на бэк
          setGoogleIdToken(id_token); // на случай geo-формы
          setGoogleProfile({
            email: jwtPayload?.email || "",
            firstName: jwtPayload?.given_name || "",
            lastName: jwtPayload?.family_name || "",
          });
          setError("");

          // Сначала вход (если аккаунт уже есть); 404 → форма географии
          (async () => {
            try {
              setLoading(true);
              const loginRes = await apiFetch(buildApiUrl("/auth/google/login"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_token }),
              });

              if (loginRes.ok) {
                const data = await loginRes.json();
                persistAuthSession(data);
                googleButtonRenderedRef.current = false; // чтобы кнопка Google снова отрисовалась
                setGoogleIdToken("");
                setGoogleProfile(null);
                finishLogin();
                return;
              }

              if (loginRes.status === 404) {
                // Пользователя нет — добор географии + /auth/google/register
                setGoogleGeoOpen(true);
                return;
              }

              const detail = await readApiError(loginRes);
              setError(detail || "Ошибка входа через Google");
            } catch (err) {
              setError(err.message || "Ошибка входа через Google");
            } finally {
              setLoading(false);
            }
          })();
        },
      });

      container.innerHTML = ""; // чистое место под кнопку (после register/geo)
      google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "continue_with", // текст кнопки Google
        shape: "pill",
        width: 280,
        locale: "ru",
      });
      googleButtonRenderedRef.current = true; // больше не вызывать renderButton
    };

    tryInit(); // сразу, если SDK уже есть
    timerId = window.setInterval(tryInit, 300); // иначе повторять, пока script не загрузится

    return () => {
      if (timerId) window.clearInterval(timerId); // cleanup при закрытии / смене deps
      // Логин размонтируется при register/geo — иначе кнопка Google не появится снова
      googleButtonRenderedRef.current = false;
    };
  }, [isOpen, register, googleGeoOpen, GOOGLE_CLIENT_ID]);

  // Ничего не рендерим, если закрыты и логин, и register, и geo
  if (!isOpen && !register && !googleGeoOpen) return null;

  /**
   * Submit формы email/пароль → POST /token → сохранить сессию → /profile.
   */
  const handleUserEnter = async (e) => {
    e.preventDefault(); // не перезагружать страницу
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
        body: JSON.stringify({ email, password }), // схема UserLogin на бэке
      });

      if (!response.ok) {
        const detail = await readApiError(response); // detail из FastAPI
        throw new Error(detail || "Неверный логин или пароль");
      }

      const data = await response.json(); // { access_token, refresh_token, user_id, role }
      persistAuthSession(data);
      finishLogin();
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setLoading(false); // снять disabled с кнопок
    }
  };

  /** Переключить на модалку обычной регистрации. */
  const openRegisterModal = () => {
    setRegister(true);
  };

  /** Вернуться с RegisterModal (логин остаётся доступен через isOpen родителя). */
  const closeRegisterModal = () => {
    googleButtonRenderedRef.current = false; // перерисовать кнопку Google на форме входа
    setRegister(false);
  };

  return (
    <>
      {/* Логин: portal в body, чтобы overlay был поверх всего UI */}
      {isOpen &&
        !register &&
        !googleGeoOpen &&
        createPortal(
          <div
            className="reg-modal-overlay"
            onClick={handleLoginClose} // клик по фону — закрыть
            role="presentation"
          >
            <div
              className="reg-modal login-modal"
              onClick={(e) => e.stopPropagation()} // клик внутри не закрывает
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
                autoComplete="off"
              >
                <div className="reg-modal__body">
                  {/* Ловушка для менеджера паролей Firefox/Chrome */}
                  <div className="reg-modal__autofill-trap" aria-hidden="true">
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="username"
                      defaultValue=""
                      readOnly
                    />
                    <input
                      type="password"
                      tabIndex={-1}
                      autoComplete="current-password"
                      defaultValue=""
                      readOnly
                    />
                  </div>
                  {error && (
                    <p className="reg-modal__error" role="alert">
                      {error}
                    </p>
                  )}

                  <div className="reg-modal__fields">
                    <FieldRow label="Email *" htmlFor="login-email">
                      <input
                        id="login-email"
                        name="fixer_login_contact"
                        type="text"
                        inputMode="email"
                        className="reg-modal__input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        disabled={loading}
                        placeholder="name@example.com"
                        required
                      />
                    </FieldRow>

                    <FieldRow label="Пароль *" htmlFor="login-password">
                      <PasswordField
                        id="login-password"
                        name="fixer_login_secret"
                        className="reg-modal__input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        disabled={loading}
                        required
                      />
                    </FieldRow>
                  </div>

                  <div className="login-modal__forgot">
                    {/* Пока без обработчика — заглушка UI */}
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

                {/* Кнопка Google только если задан REACT_APP_GOOGLE_CLIENT_ID */}
                {GOOGLE_CLIENT_ID && (
                  <div className="login-modal__google">
                    <div className="login-modal__google-divider">или</div>
                    {/* Пустой div: GIS сам вставит iframe/кнопку сюда */}
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

      {/* Обычная регистрация поверх / вместо логина */}
      {register && (
        <RegisterModal isOpen={register} onClose={closeRegisterModal} />
      )}

      {/* После Google: добор страны/региона/города + POST /auth/google/register */}
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
