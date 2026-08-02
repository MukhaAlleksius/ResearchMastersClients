import React, { useState } from "react";

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M7.1 7.2C5 8.6 3.4 10.5 2 12c1.7 2.6 5.1 7 10 7 1.7 0 3.3-.5 4.7-1.2" />
      <path d="M14.1 5.2C13.4 5.1 12.7 5 12 5c-4.9 0-8.3 4.4-10 7 .5.8 1.1 1.6 1.8 2.4" />
      <path d="M17.9 9.1c.9.9 1.7 1.9 2.1 2.9" />
    </svg>
  );
}

/**
 * Поле пароля с кнопкой «глаз»: показать / скрыть ввод.
 */
export default function PasswordField({
  id,
  name,
  value,
  onChange,
  disabled = false,
  autoComplete = "current-password",
  placeholder = "••••••••",
  className = "reg-modal__input",
  required = false,
  maxLength = 128,
  "aria-describedby": ariaDescribedBy,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="reg-modal__password">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        className={className}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        aria-describedby={ariaDescribedBy}
      />
      <button
        type="button"
        className="reg-modal__password-toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
