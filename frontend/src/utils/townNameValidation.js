/** Правила названия города при ручном вводе (кириллица). */
const TOWN_NAME_RE = /^[А-ЯЁ][а-яё]*(?:[-\s][А-ЯЁа-яё]+)*$/;

export function normalizeTownName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @returns {string|null} текст ошибки или null, если ок
 */
export function validateTownName(value) {
  const name = normalizeTownName(value);
  if (!name) return "Укажите название города";
  if (name.length > 255) return "Название города слишком длинное";
  if (!TOWN_NAME_RE.test(name)) {
    return "Город: с заглавной буквы, только кириллица (можно пробел и дефис), например: Минск";
  }
  return null;
}

export function isValidTownName(value) {
  return validateTownName(value) === null;
}
