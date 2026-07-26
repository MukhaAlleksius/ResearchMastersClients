import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerUiDialogHandler } from "./uiDialog.js";
import "./uiDialog.css";

const DEFAULT_TITLES = {
  info: "Сообщение",
  success: "Готово",
  error: "Ошибка",
  confirm: "Подтверждение",
};

function iconFor(variant) {
  if (variant === "success") return "✓";
  if (variant === "error" || variant === "danger") return "!";
  if (variant === "confirm") return "?";
  return "i";
}

export default function UiDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const closeWith = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolve) resolve(value);
  }, []);

  const openDialog = useCallback((request) => {
    return new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(request.type === "confirm" ? false : undefined);
      }
      resolverRef.current = resolve;
      setDialog(request);
    });
  }, []);

  useEffect(() => {
    registerUiDialogHandler(openDialog);
    return () => registerUiDialogHandler(null);
  }, [openDialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeWith(dialog.type === "confirm" ? false : undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, closeWith]);

  const isConfirm = dialog?.type === "confirm";
  const variant = isConfirm
    ? dialog.danger
      ? "danger"
      : "confirm"
    : dialog?.variant || "info";
  const title =
    dialog?.title ||
    DEFAULT_TITLES[isConfirm ? "confirm" : dialog?.variant || "info"];

  return (
    <>
      {children}
      {dialog &&
        createPortal(
          <div
            className="ui-dialog-overlay"
            role="presentation"
            onClick={() =>
              closeWith(isConfirm ? false : undefined)
            }
          >
            <div
              className="ui-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ui-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ui-dialog__header">
                <span
                  className={`ui-dialog__icon ui-dialog__icon--${variant}`}
                  aria-hidden="true"
                >
                  {iconFor(variant)}
                </span>
                <h2 id="ui-dialog-title" className="ui-dialog__title">
                  {title}
                </h2>
              </div>
              <div className="ui-dialog__body">
                <p className="ui-dialog__message">{dialog.message}</p>
              </div>
              <div className="ui-dialog__footer">
                {isConfirm ? (
                  <>
                    <button
                      type="button"
                      className="ui-dialog__btn ui-dialog__btn--ghost"
                      onClick={() => closeWith(false)}
                    >
                      {dialog.cancelLabel || "Отмена"}
                    </button>
                    <button
                      type="button"
                      className={`ui-dialog__btn ${
                        dialog.danger
                          ? "ui-dialog__btn--danger"
                          : "ui-dialog__btn--primary"
                      }`}
                      onClick={() => closeWith(true)}
                      autoFocus
                    >
                      {dialog.confirmLabel || "Подтвердить"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ui-dialog__btn ui-dialog__btn--primary"
                    onClick={() => closeWith(undefined)}
                    autoFocus
                  >
                    ОК
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
