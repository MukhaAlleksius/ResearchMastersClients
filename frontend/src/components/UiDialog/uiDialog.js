let dialogHandler = null;

/**
 * Register the live dialog handler from UiDialogProvider.
 * @param {(request: object) => Promise<any>} handler
 */
export function registerUiDialogHandler(handler) {
  dialogHandler = handler;
}

function inferAlertVariant(message) {
  const msg = String(message ?? "");
  if (/ошибк|не удалось|❌|fail|истек/i.test(msg)) return "error";
  if (/успеш|готово|✅|добавлен|сохранен|отправлен|размещ|переведен/i.test(msg)) {
    return "success";
  }
  return "info";
}

/**
 * Show a designed alert modal (single OK button).
 * @param {string} message
 * @param {{ title?: string, variant?: 'info'|'warning'|'success'|'error' }} [options]
 * @returns {Promise<void>}
 */
export function uiAlert(message, options = {}) {
  if (!dialogHandler) {
    console.warn("UiDialogProvider is not mounted:", message);
    return Promise.resolve();
  }
  return dialogHandler({
    type: "alert",
    message: String(message ?? ""),
    title: options.title,
    variant: options.variant || inferAlertVariant(message),
  });
}

/** Предупреждение для форм регистрации (заголовок «Предупреждение»). */
export function uiWarn(message) {
  return uiAlert(message, { title: "Предупреждение", variant: "warning" });
}

/**
 * Show a designed confirm modal.
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export function uiConfirm(message, options = {}) {
  if (!dialogHandler) {
    console.warn("UiDialogProvider is not mounted:", message);
    return Promise.resolve(false);
  }
  const msg = String(message ?? "");
  const danger =
    options.danger !== undefined ? Boolean(options.danger) : /удал/i.test(msg);
  return dialogHandler({
    type: "confirm",
    message: msg,
    title: options.title,
    confirmLabel: options.confirmLabel || (danger ? "Удалить" : "Подтвердить"),
    cancelLabel: options.cancelLabel,
    danger,
  });
}
