import { API, apiFetch } from "./api.js";

export const DEFAULT_REGISTRATION_GEO = {
  country: "Беларусь",
  region: "Минская область",
  town: "Солигорск",
};

/** Defaults in code — work on any machine without DB seed. */
export function getFallbackRegistrationGeography() {
  const countries = [
    {
      value: DEFAULT_REGISTRATION_GEO.country,
      label: DEFAULT_REGISTRATION_GEO.country,
    },
  ];
  const regions = [
    {
      value: DEFAULT_REGISTRATION_GEO.region,
      label: DEFAULT_REGISTRATION_GEO.region,
    },
  ];
  const towns = [
    {
      value: DEFAULT_REGISTRATION_GEO.town,
      label: DEFAULT_REGISTRATION_GEO.town,
    },
  ];
  return {
    countries,
    regions,
    towns,
    countryId: DEFAULT_REGISTRATION_GEO.country,
    regionId: DEFAULT_REGISTRATION_GEO.region,
    townId: DEFAULT_REGISTRATION_GEO.town,
  };
}

export function formatCountry(country) {
  return {
    value: country.country_id || country.id,
    label: country.name_country || country.name,
  };
}

export function formatRegion(region) {
  return {
    value: region.region_id || region.id,
    label: region.name_region || region.name,
  };
}

export function formatTown(town) {
  return {
    value: town.town_id || town.id,
    label: town.name_town || town.name,
  };
}

export function findOptionByLabel(options, label) {
  if (!label || !Array.isArray(options)) return null;
  const normalized = String(label).trim().toLowerCase();
  return (
    options.find((item) => String(item.label).trim().toLowerCase() === normalized) ||
    null
  );
}

export async function fetchCountriesList() {
  const response = await apiFetch(`${API.baseURL}/countries`);
  if (!response.ok) throw new Error("Не удалось загрузить список стран");
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatCountry) : [];
}

export async function fetchRegionsList(countryId) {
  if (!countryId) return [];
  // Default string ids are not API keys — keep local defaults.
  if (!/^\d+$/.test(String(countryId))) {
    return getFallbackRegistrationGeography().regions;
  }
  const response = await apiFetch(`${API.baseURL}/countries/${countryId}/regions`);
  if (!response.ok) throw new Error("Не удалось загрузить список регионов");
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatRegion) : [];
}

export async function fetchTownsList(regionId) {
  if (!regionId) return [];
  if (!/^\d+$/.test(String(regionId))) {
    return getFallbackRegistrationGeography().towns;
  }
  const response = await apiFetch(`${API.baseURL}/regions/${regionId}/towns`);
  if (!response.ok) throw new Error("Не удалось загрузить список городов");
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatTown) : [];
}

/**
 * Prefer справочник when available; otherwise use hardcoded defaults
 * so registration always opens with Беларусь / Минская область / Солигорск.
 */
export async function loadDefaultRegistrationGeography() {
  const fallback = getFallbackRegistrationGeography();

  try {
    const countries = await fetchCountriesList();
    if (!countries.length) return fallback;

    const country =
      findOptionByLabel(countries, DEFAULT_REGISTRATION_GEO.country) ||
      countries[0];

    let regions = [];
    try {
      regions = await fetchRegionsList(country.value);
    } catch {
      regions = [];
    }
    if (!regions.length) {
      return {
        ...fallback,
        countries,
        countryId: String(country.value),
      };
    }

    const region =
      findOptionByLabel(regions, DEFAULT_REGISTRATION_GEO.region) || regions[0];

    let towns = [];
    try {
      towns = await fetchTownsList(region.value);
    } catch {
      towns = [];
    }
    const town =
      findOptionByLabel(towns, DEFAULT_REGISTRATION_GEO.town) ||
      towns[0] ||
      fallback.towns[0];

    return {
      countries,
      regions,
      towns: towns.length ? towns : fallback.towns,
      countryId: String(country.value),
      regionId: String(region.value),
      townId: town ? String(town.value) : fallback.townId,
    };
  } catch {
    return fallback;
  }
}
