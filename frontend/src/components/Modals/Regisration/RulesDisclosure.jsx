import React from "react";

/** Сворачиваемый блок правил (город, пароль и т.п.). */
export default function RulesDisclosure({ id, title, children, drop = "down" }) {
  const dropClass =
    drop === "up" ? "reg-modal__rules reg-modal__rules--up" : "reg-modal__rules";

  return (
    <details id={id} className={dropClass}>
      <summary className="reg-modal__rules-summary">{title}</summary>
      <div className="reg-modal__rules-body">{children}</div>
    </details>
  );
}
