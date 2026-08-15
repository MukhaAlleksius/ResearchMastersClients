/** Типы контактов профиля: маски, фильтрация ввода и проверка перед сохранением. */

export const CONTACT_TYPES = [
  "Телефон",
  "Сайт",
  "Телеграм",
  "WhatsApp",
  "Другой",
];

const PHONE_TYPES = new Set(["Телефон", "WhatsApp"]);

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Национальная часть BY: 9 цифр после 375 → `+375 XX XXX-XX-XX`. */
export function formatByPhone(raw) {
  let digits = onlyDigits(raw);
  if (digits.startsWith("375")) digits = digits.slice(3);
  digits = digits.slice(0, 9);

  let out = "+375";
  if (digits.length > 0) out += ` ${digits.slice(0, 2)}`;
  if (digits.length > 2) out += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) out += `-${digits.slice(5, 7)}`;
  if (digits.length > 7) out += `-${digits.slice(7, 9)}`;
  return out;
}

export function formatTelegram(raw) {
  const nick = String(raw || "")
    .replace(/^@+/, "")
    .replace(/[^\w]/g, "")
    .slice(0, 32);
  return nick ? `@${nick}` : "";
}

/** Сайт: URL-символы; мягко подставляем https:// при вводе без схемы. */
export function formatWebsite(raw) {
  let value = String(raw || "")
    .trimStart()
    .replace(/\s/g, "")
    .slice(0, 100);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.slice(0, 100);
  if (value.includes("@") && !value.includes("/")) {
    // если ввели email-подобный текст — оставляем как есть (без схемы)
    return value.replace(/[^\w.@+-]/g, "").slice(0, 100);
  }
  return value.slice(0, 100);
}

export function formatOther(raw) {
  return String(raw || "").slice(0, 100);
}

export function maskContactValue(type, raw) {
  if (PHONE_TYPES.has(type)) return formatByPhone(raw);
  if (type === "Телеграм") return formatTelegram(raw);
  if (type === "Сайт") return formatWebsite(raw);
  return formatOther(raw);
}

export function contactPlaceholder(type) {
  if (PHONE_TYPES.has(type)) return "+375 XX XXX-XX-XX";
  if (type === "Телеграм") return "@name";
  if (type === "Сайт") return "https://example.com или name@mail.com";
  return "Введите контакт";
}

export function contactInputMode(type) {
  if (PHONE_TYPES.has(type)) return "tel";
  if (type === "Сайт") return "url";
  return "text";
}

export function contactAutoComplete(type) {
  if (PHONE_TYPES.has(type)) return "tel";
  if (type === "Сайт") return "url";
  if (type === "Телеграм") return "username";
  return "off";
}

/** Нормализованное значение для API (без «висячих» префиксов). */
export function normalizeContactForSave(type, value) {
  const masked = maskContactValue(type, value).trim();
  if (!masked) return "";
  if (PHONE_TYPES.has(type)) return masked;
  if (type === "Телеграм") return masked.startsWith("@") ? masked : `@${masked}`;
  if (type === "Сайт") {
    if (/^https?:\/\//i.test(masked) || masked.includes("@")) return masked;
    return `https://${masked}`;
  }
  return masked;
}

export function validateContact(type, value) {
  const normalized = normalizeContactForSave(type, value);
  if (!normalized) return "Заполните контакт";

  if (PHONE_TYPES.has(type)) {
    const digits = onlyDigits(normalized);
    if (!/^375\d{9}$/.test(digits)) {
      return "Укажите телефон в формате +375 XX XXX-XX-XX";
    }
    return null;
  }

  if (type === "Телеграм") {
    if (!/^@[A-Za-z0-9_]{5,32}$/.test(normalized)) {
      return "Telegram: @name (5–32 символа: латиница, цифры, _)";
    }
    return null;
  }

  if (type === "Сайт") {
    if (normalized.includes("@")) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return "Укажите email в формате name@mail.com или URL сайта";
      }
      return null;
    }
    try {
      const url = new URL(normalized);
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
        return "Укажите сайт, например https://example.com";
      }
    } catch {
      return "Укажите сайт, например https://example.com";
    }
    return null;
  }

  if (normalized.length < 2) return "Слишком короткий контакт";
  return null;
}

export function isContactDraftFilled(type, value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (PHONE_TYPES.has(type)) {
    let digits = onlyDigits(raw);
    if (digits.startsWith("375")) digits = digits.slice(3);
    return digits.length > 0;
  }
  if (type === "Телеграм") return raw.replace(/^@+/, "").length > 0;
  return raw.length > 0;
}
