import { API, apiFetch } from "./api.js";

export const DEFAULT_REGISTRATION_GEO = {
  country: "Беларусь",
  region: "Минская область",
  town: "Солигорск",
};

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
  const response = await apiFetch(`${API.baseURL}/countries/${countryId}/regions`);
  if (!response.ok) throw new Error("Не удалось загрузить список регионов");
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatRegion) : [];
}

export async function fetchTownsList(regionId) {
  if (!regionId) return [];
  const response = await apiFetch(`${API.baseURL}/regions/${regionId}/towns`);
  if (!response.ok) throw new Error("Не удалось загрузить список городов");
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatTown) : [];
}

/**
 * Load geography and preselect Беларусь / Минская область / Солигорск.
 * If exact names are missing, falls back to the first available options
 * so registration never stays blocked on an empty selection.
 */
export async function loadDefaultRegistrationGeography() {
  const countries = await fetchCountriesList();
  if (!countries.length) {
    return {
      countries,
      regions: [],
      towns: [],
      countryId: "",
      regionId: "",
      townId: "",
    };
  }

  const country =
    findOptionByLabel(countries, DEFAULT_REGISTRATION_GEO.country) || countries[0];

  const regions = await fetchRegionsList(country.value);
  if (!regions.length) {
    return {
      countries,
      regions,
      towns: [],
      countryId: String(country.value),
      regionId: "",
      townId: "",
    };
  }

  const region =
    findOptionByLabel(regions, DEFAULT_REGISTRATION_GEO.region) || regions[0];

  const towns = await fetchTownsList(region.value);
  const town =
    findOptionByLabel(towns, DEFAULT_REGISTRATION_GEO.town) || towns[0] || null;

  return {
    countries,
    regions,
    towns,
    countryId: String(country.value),
    regionId: String(region.value),
    townId: town ? String(town.value) : "",
  };
}
