const EMPTY_MARKERS = new Set(["", "не указано", "неизвестно", "—", "-"]);

function normalizeGeoPart(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (EMPTY_MARKERS.has(text.toLowerCase())) return "";
  return text;
}

/** @returns {{ country: string, region: string, town: string }} */
export function getGeoParts(source) {
  if (!source || typeof source !== "object") {
    return { country: "", region: "", town: "" };
  }
  return {
    country: normalizeGeoPart(source.country),
    region: normalizeGeoPart(source.region),
    town: normalizeGeoPart(source.town),
  };
}

/** Одна строка: «Страна, Область, Город» */
export function formatGeoAddress(source, fallback = "") {
  const { country, region, town } = getGeoParts(source);
  return [country, region, town].filter(Boolean).join(", ") || fallback;
}

export function hasGeoAddress(source) {
  const { country, region, town } = getGeoParts(source);
  return Boolean(country || region || town);
}
