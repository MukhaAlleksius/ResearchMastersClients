import { API, apiFetch } from "./api.js";

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
