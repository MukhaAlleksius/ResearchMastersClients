import React, { useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl, formatApiDetail } from "../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import GeoTownSelect from "../../../Common/GeoTownSelect.jsx";
import ModalShowContacts from "./ModalShowContacts";
import ModalShowGeography from "./ModalShowGeography";
import {
  IconUser,
  IconBriefcase,
  IconPhone,
  IconMap,
  IconDoc,
} from "../ProfileIcons.jsx";
import {
  canCreateTownInRegion,
  createTownByUser,
  isCityAsRegion,
  townFieldHint,
} from "../../../../utils/geographyApi.js";
import {
  normalizeTownName,
  validateTownName,
} from "../../../../utils/townNameValidation.js";
import { uiAlert, uiWarn } from "../../../UiDialog/uiDialog.js";
import {
  CONTACT_TYPES,
  contactAutoComplete,
  contactInputMode,
  contactPlaceholder,
  isContactDraftFilled,
  maskContactValue,
  normalizeContactForSave,
  validateContact,
} from "../../../../utils/contactMasks.js";
import "./profile_settings.css";
const selectMenuProps = {
  menuPortalTarget: document.body,
  menuPosition: "fixed",
};

export default function ProfileSettings() {
  // Состояния
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [geoCountry, setGeoCountry] = useState(null);
  const [geoRegion, setGeoRegion] = useState(null);
  const [geoTown, setGeoTown] = useState(null);
  const [businessFormName, setBusinessFormName] = useState(null);
  const [descriptionBusinessFormName, setDescriptionBusinessFormName] =
    useState("");
  const [nameOerganization, setNameOrganization] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [location, setLocation] = useState("");
  const [contactType, setContactType] = useState("Телефон");
  const [contactValue, setContactValue] = useState(() =>
    maskContactValue("Телефон", ""),
  );
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showGeoModal, setShowGeoModal] = useState(false);
  const [bio, setBio] = useState("");
  const [geoCountryOrder, setGeoCountryOrder] = useState(null);
  const [geoRegionOrder, setGeoRegionOrder] = useState(null);
  const [geoTownOrder, setGeoTownOrder] = useState(null);
  const [shortReviewMaster, setShortReviewMaster] = useState("");
  const [operatingMode, setOperatingMode] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [towns, setTowns] = useState([]);
  const [countriesOrders, setCountriesOrders] = useState([]);
  const [regionsOrders, setRegionsOrders] = useState([]);
  const [townsOrders, setTownsOrders] = useState([]);

  const [businessForm, setBusinessForm] = useState([]);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Формируем данные для отправки
  const userIdNum = Number(localStorage.getItem("user_id"));
  const userCommonCustomizationData = {
    user_id: userIdNum,
    first_name: firstName,
    last_name: lastName,
    town_id: geoTown ? Number(geoTown.value) : null,
  };

  const userBusinessCustomizationData = {
    user_id: userIdNum,
    business_form_name: businessFormName ? businessFormName.value : null,
    registration_number: registrationNumber,
    location: location,
  };

  const userProfileCustomizationData = {
    user_id: userIdNum,
    // Relative path works behind Docker nginx /api; never store absolute host URLs.
    avatar_url: userIdNum ? `/avatar/${userIdNum}` : null,
    bio: bio,
    short_review_master: shortReviewMaster,
    operating_mode: operatingMode || null,
  };

  // Обработчик выбора страны с динамической загрузкой регионов
  const handleSelectCountriesAndAddRegions = async (selectedOption) => {
    setGeoCountry(selectedOption);
    setGeoRegion(null);
    setGeoTown(null);
    setTowns([]);
    if (selectedOption) {
      await fetchRegionsCountry(selectedOption.value);
    } else {
      setRegions([]);
      setTowns([]);
    }
  };

  // Обработчик выбора региона с динамической загрузкой городов
  const handleSelectRegionsAndAddTowns = async (selectedOption) => {
    setGeoRegion(selectedOption);
    setGeoTown(null);
    if (selectedOption) {
      const loadedTowns = await fetchTownsRegion(selectedOption.value);
      if (
        isCityAsRegion(selectedOption.label) &&
        Array.isArray(loadedTowns) &&
        loadedTowns.length === 1
      ) {
        setGeoTown(loadedTowns[0]);
      }
    } else {
      setTowns([]);
    }
  };

  // Обработчик выбора страны с динамической загрузкой регионов
  const handleSelectCountriesAndAddRegionsForGeo = async (selectedOption) => {
    setGeoCountryOrder(selectedOption);
    setGeoRegionOrder(null);
    setGeoTownOrder(null);
    setTownsOrders([]);
    if (selectedOption) {
      await fetchRegionsCountryForOrders(selectedOption.value);
    } else {
      setRegionsOrders([]);
      setTownsOrders([]);
    }
  };

  // Обработчик выбора региона с динамической загрузкой городов
  const handleSelectRegionsAndAddTownsForGeo = async (selectedOption) => {
    setGeoRegionOrder(selectedOption);
    setGeoTownOrder(null);
    if (selectedOption) {
      const loadedTowns = await fetchTownsRegionForOrders(selectedOption.value);
      if (
        isCityAsRegion(selectedOption.label) &&
        Array.isArray(loadedTowns) &&
        loadedTowns.length === 1
      ) {
        setGeoTownOrder(loadedTowns[0]);
      }
    } else {
      setTownsOrders([]);
    }
  };

  /** Создать город в справочнике (адрес профиля), если его нет в списке. */
  const handleCreateTown = async (inputValue) => {
    if (!canCreateTownInRegion(geoRegion?.label)) {
      await uiWarn(
        "Для выбранного региона город задаётся только из справочника",
      );
      return;
    }
    const name = normalizeTownName(inputValue);
    const nameError = validateTownName(name);
    if (nameError) {
      await uiWarn(nameError);
      return;
    }
    if (!geoRegion?.value) {
      await uiWarn("Сначала выберите регион из справочника");
      return;
    }
    try {
      const created = await createTownByUser(geoRegion.value, name);
      setTowns((prev) => {
        if (prev.some((t) => String(t.value) === String(created.value))) {
          return prev;
        }
        return [...prev, created];
      });
      setGeoTown(created);
    } catch (err) {
      await uiAlert(err.message || "Не удалось добавить город");
    }
  };

  /** Создать город в справочнике (география работ), если его нет в списке. */
  const handleCreateTownForOrders = async (inputValue) => {
    if (!canCreateTownInRegion(geoRegionOrder?.label)) {
      await uiWarn(
        "Для выбранного региона город задаётся только из справочника",
      );
      return;
    }
    const name = normalizeTownName(inputValue);
    const nameError = validateTownName(name);
    if (nameError) {
      await uiWarn(nameError);
      return;
    }
    if (!geoRegionOrder?.value) {
      await uiWarn("Сначала выберите регион из справочника");
      return;
    }
    try {
      const created = await createTownByUser(geoRegionOrder.value, name);
      setTownsOrders((prev) => {
        if (prev.some((t) => String(t.value) === String(created.value))) {
          return prev;
        }
        return [...prev, created];
      });
      setGeoTownOrder(created);
    } catch (err) {
      await uiAlert(err.message || "Не удалось добавить город");
    }
  };

  const handleBusinessFormChange = (selectedOption) => {
    setBusinessFormName(selectedOption);
    const bf = businessForm.find((bf) => bf.name === selectedOption.value);
    setDescriptionBusinessFormName(bf ? bf.description : "");
  };

  // Загрузка стран в список для выбора страны при установке адреса пользователя
  const fetchCountries = async () => {
    try {
      const response_countries = await apiFetch(buildApiUrl("/countries"));
      if (!response_countries.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const countries_data = await response_countries.json();

      // Формируем для react-select: [{value: id, label: name}, ...]
      const formattedCountries = countries_data.map((country) => ({
        value: country.country_id || country.id,
        label: country.name_country || country.name,
      }));

      setCountries(formattedCountries);
      return formattedCountries;
    } catch (error) {
      console.log("Ошибка: ", error);
      setCountries([]);
      return [];
    }
  };

  // Загрузка стран в список для выбора страны при установке географии производства работ пользователя
  const fetchCountriesForOrders = async () => {
    try {
      const response_countries = await apiFetch(buildApiUrl("/countries"));
      if (!response_countries.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const countries_data = await response_countries.json();

      // Формируем для react-select: [{value: id, label: name}, ...]
      const formattedCountries = countries_data.map((country) => ({
        value: country.country_id || country.id,
        label: country.name_country || country.name,
      }));

      setCountriesOrders(formattedCountries);
    } catch (error) {
      console.log("Ошибка: ", error);
      setCountries([]);
    }
  };

  // Загрузка регионов в список для выбора региона при установке адреса пользователя
  const fetchRegionsCountry = async (countryId) => {
    try {
      const response_regions = await apiFetch(
        buildApiUrl(`/countries/${countryId}/regions`),
      );
      if (!response_regions.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const regions_data = await response_regions.json();

      // Формируем для react-select: [{value: id, label: name}, ...]
      const formattedRegions = regions_data.map((region) => ({
        value: region.region_id || region.id,
        label: region.name_region || region.name,
      }));

      setRegions(formattedRegions);
      return formattedRegions;
    } catch (error) {
      console.log("Ошибка: ", error);
      setRegions([]);
      setTowns([]);
      return [];
    }
  };

  // Загрузка регионов в список для выбора региона при установке географии производства работ пользователя
  const fetchRegionsCountryForOrders = async (countryId) => {
    try {
      const response_regions = await apiFetch(
        buildApiUrl(`/countries/${countryId}/regions`),
      );
      if (!response_regions.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const regions_data = await response_regions.json();

      // Формируем для react-select: [{value: id, label: name}, ...]
      const formattedRegions = regions_data.map((region) => ({
        value: region.region_id || region.id,
        label: region.name_region || region.name,
      }));

      setRegionsOrders(formattedRegions);
    } catch (error) {
      console.log("Ошибка: ", error);
      setRegions([]);
    }
  };

  // Загрузка городов в список для выбора города при установке адреса пользователя
  const fetchTownsRegion = async (regionId) => {
    if (!regionId) {
      setTowns([]);
      return [];
    }
    try {
      const response_towns = await apiFetch(
        buildApiUrl(`/regions/${regionId}/towns`),
      );
      if (!response_towns.ok) throw new Error("Не получили данных с сервера");
      const towns_data = await response_towns.json();

      const formattedTowns = towns_data.map((town) => ({
        value: town.town_id || town.id || town,
        label: town.name_town || town.name || town,
      }));

      setTowns(formattedTowns);
      return formattedTowns;
    } catch (error) {
      setTowns([]);
      console.log("Ошибка: ", error);
      return [];
    }
  };

  // Загрузка городов в список для выбора города при установке географии производства работ пользователя
  const fetchTownsRegionForOrders = async (regionId) => {
    if (!regionId) {
      setTownsOrders([]);
      return [];
    }
    try {
      const response_towns = await apiFetch(
        buildApiUrl(`/regions/${regionId}/towns`),
      );
      if (!response_towns.ok) throw new Error("Не получили данных с сервера");
      const towns_data = await response_towns.json();

      const formattedTowns = towns_data.map((town) => ({
        value: town.town_id || town.id || town,
        label: town.name_town || town.name || town,
      }));

      setTownsOrders(formattedTowns);
      return formattedTowns;
    } catch (error) {
      setTownsOrders([]);
      console.log("Ошибка: ", error);
      return [];
    }
  };

  const fetchBusinessForm = async () => {
    try {
      const response_business_form = await apiFetch(
        buildApiUrl("/business_form"),
      );
      if (!response_business_form.ok) {
        throw new Error("Не получили данных с сервера");
      }
      const business_form_data = await response_business_form.json();
      setBusinessForm(business_form_data);
    } catch (error) {
      console.log("Ошибка: ", error);
    }
  };

  const fetchUserCustomization = async (route) => {
    try {
      const user_id = localStorage.getItem("user_id");
      if (!user_id) throw new Error("User ID не найден");

      const url =
        route === "profile"
          ? buildApiUrl(`/profile?user_id=${user_id}`)
          : route === "user_business"
            ? buildApiUrl("/user_business")
            : `${API.baseURL}/${route}`;

      const response_user = await apiFetch(url);
      if (!response_user.ok) {
        throw new Error("Не получили данных с сервера");
      }
      return await response_user.json();
    } catch (error) {
      console.log("Ошибка: ", error);
      return null;
    }
  };

  // Получение пользовательских данных
  const fetchUserPhotoAvatar = async () => {
    try {
      const user_id = localStorage.getItem("user_id");
      if (!user_id) throw new Error("User ID не найден");

      const probe = await apiFetch(buildApiUrl(`/avatar/${user_id}`), {
        method: "GET",
      });
      if (!probe.ok) {
        setAvatarUrl("");
        return;
      }
      setAvatarUrl(buildApiUrl(`/avatar/${user_id}?t=${Date.now()}`));
    } catch (error) {
      console.log("Ошибка: ", error);
      setAvatarUrl("");
    }
  };

  const refreshAvatarPreview = (userId) => {
    const id = userId || localStorage.getItem("user_id");
    if (!id) return;
    setAvatarUrl(buildApiUrl(`/avatar/${id}?t=${Date.now()}`));
    setPreviewUrl("");
    setSelectedPhoto(null);
  };

  const uploadAvatarFile = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiFetch(buildApiUrl("/upload_avatar"), {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const message =
        typeof detail.detail === "string"
          ? detail.detail
          : "Ошибка загрузки фото";
      throw new Error(message);
    }
    return response.json().catch(() => null);
  };

  const uploadAvatar = async () => {
    if (!selectedPhoto) return;
    await uploadAvatarFile(selectedPhoto);
    refreshAvatarPreview();
  };

  useEffect(() => {
    const loadData = async () => {
      const loadedCountries = await fetchCountries();
      await fetchCountriesForOrders();

      const common = await fetchUserCustomization("profile");
      setFirstName(common?.first_name || "");
      setLastName(common?.last_name || "");

      const countryOpt =
        (common?.country &&
          loadedCountries.find((c) => c.label === common.country)) ||
        null;
      if (countryOpt) {
        setGeoCountry(countryOpt);
        const loadedRegions = await fetchRegionsCountry(countryOpt.value);
        const regionOpt =
          (common?.region &&
            loadedRegions.find((r) => r.label === common.region)) ||
          null;
        if (regionOpt) {
          setGeoRegion(regionOpt);
          const loadedTowns = await fetchTownsRegion(regionOpt.value);
          const townOpt =
            (common?.town_id &&
              loadedTowns.find(
                (t) => Number(t.value) === Number(common.town_id),
              )) ||
            (common?.town &&
              loadedTowns.find((t) => t.label === common.town)) ||
            (isCityAsRegion(regionOpt.label) && loadedTowns.length === 1
              ? loadedTowns[0]
              : null);
          setGeoTown(townOpt);
        } else {
          setGeoRegion(null);
          setGeoTown(null);
        }
      } else {
        setGeoCountry(null);
        setGeoRegion(null);
        setGeoTown(null);
      }

      setBio(common?.bio || "");
      setShortReviewMaster(common?.short_review_master || "");
      setOperatingMode(common?.operating_mode || "");

      const business = await fetchUserCustomization("user_business");
      setBusinessFormName(
        business?.business_form_name
          ? {
              value: business.business_form_name,
              label: business.business_form_name,
            }
          : null,
      );
      setDescriptionBusinessFormName(business?.description || "");
      setRegistrationNumber(business?.registration_number || "");
      setLocation(business?.location || "");

      await fetchBusinessForm();

      await fetchUserPhotoAvatar();
    };
    loadData();
    setPreviewUrl("");
  }, []);

  // Выбор фото: сразу грузим на сервер (удобно в Docker / без отдельного «Сохранить» только ради фото).
  const handlePhotoChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setSelectedPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      await uploadAvatarFile(file);
      refreshAvatarPreview();
    } catch (error) {
      console.error("Ошибка загрузки фото:", error);
    } finally {
      event.target.value = "";
    }
  };

  const handleContactTypeChange = (type) => {
    setContactType(type);
    setContactValue(maskContactValue(type, ""));
  };

  const handleContactValueChange = (raw) => {
    setContactValue(maskContactValue(contactType, raw));
  };

  const addContact = async (e) => {
    e.preventDefault();
    if (!isContactDraftFilled(contactType, contactValue)) {
      await uiWarn("Заполните поле контакта");
      return;
    }

    const error = validateContact(contactType, contactValue);
    if (error) {
      await uiWarn(error);
      return;
    }

    const payload = {
      user_id: localStorage.getItem("user_id"),
      name_contact: contactType,
      contact: normalizeContactForSave(contactType, contactValue),
    };

    try {
      const response = await apiFetch(buildApiUrl("/add_user_contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          formatApiDetail(errorData.detail, "Не удалось добавить контакт"),
        );
      }
      setContactType("Телефон");
      setContactValue(maskContactValue("Телефон", ""));
      await uiAlert("Контакт добавлен");
    } catch (error) {
      console.error("Ошибка:", error);
      await uiWarn(error.message || "Не удалось добавить контакт");
    }
  };

  const addGeoExecuteOrder = async (e) => {
    e.preventDefault();
    if (!geoCountryOrder || !geoRegionOrder || !geoTownOrder) {
      await uiWarn("Выберите страну, регион и город (населённый пункт)");
      return;
    }

    const townName = geoTownOrder.label;
    const payload = {
      user_id: localStorage.getItem("user_id"),
      country: geoCountryOrder.label,
      region: geoRegionOrder.label,
      town: townName,
    };

    try {
      const response = await apiFetch(
        buildApiUrl("/add_user_geography_execute_order"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          formatApiDetail(
            errorData.detail,
            "Не удалось добавить город в географию работ",
          ),
        );
      }

      await uiAlert(
        `Город (населённый пункт) «${townName}» добавлен в географию работ`,
        { title: "География работ", variant: "success" },
      );
    } catch (error) {
      console.error("Ошибка:", error);
      await uiWarn(error.message || "Не удалось добавить город в географию работ");
    }
  };

  const handleAddUserCustomization = async (route, userData) => {
    const response = await apiFetch(buildApiUrl(`/${route}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Ошибка сохранения профиля:", errorData);
      throw new Error("Ошибка сохранения данных профиля");
    }
    return response.json().catch(() => null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await handleAddUserCustomization(
        "add_user_common",
        userCommonCustomizationData,
      );

      // Бизнес-блок опционален: без ОПФ не шлём запрос (раньше он валил всё сохранение).
      if (businessFormName?.value) {
        await handleAddUserCustomization(
          "add_user_business",
          userBusinessCustomizationData,
        );
      }

      await handleAddUserCustomization(
        "add_profile",
        userProfileCustomizationData,
      );
      await uploadAvatar();
      await uiAlert("Профиль сохранён");
    } catch (error) {
      console.error("Ошибка при сохранении:", error);
      await uiAlert(
        error?.message || "Не удалось сохранить профиль. Попробуйте ещё раз.",
      );
    }
  };

  // Опции для селектов
  const countryOptions = countries;
  const areaOptions = regions;
  const townOptions = towns;

  const countryOrderOptions = countriesOrders;
  const areaOrderOptions = regionsOrders;
  const townOrderOptions = townsOrders;

  const businessFormOptions = businessForm.map((bf) => ({
    value: bf.name,
    label: bf.name,
  }));

  const avatarSrc = previewUrl || avatarUrl;

  return (
    <div className="ps-page">
      <header className="ps-page__header">
        <h1 className="ps-page__title">Настройки профиля</h1>
        <p className="ps-page__subtitle">
          Личные данные, бизнес-информация, контакты и география выполнения работ
        </p>
      </header>

      <form className="ps-form" onSubmit={handleSubmit}>
        <section className="ps-section" aria-labelledby="ps-general">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              <IconUser />
            </span>
            <div>
              <h2 id="ps-general" className="ps-section__title">
                Общие настройки
              </h2>
              <p className="ps-section__hint">Имя и адрес проживания</p>
            </div>
          </div>
          <div className="ps-section__body">
            <div className="ps-grid ps-grid--2">
              <div className="ps-field">
                <label htmlFor="firstName" className="ps-label">
                  Имя
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="ps-input"
                />
              </div>
              <div className="ps-field">
                <label htmlFor="lastName" className="ps-label">
                  Фамилия
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="ps-input"
                />
              </div>
            </div>
            <div className="ps-grid">
              <div className="ps-select-wrap">
                <span className="ps-label">Страна</span>
                <Select
                  {...selectMenuProps}
                  options={countryOptions}
                  value={geoCountry}
                  onChange={handleSelectCountriesAndAddRegions}
                  isClearable
                  styles={selectStyles}
                  placeholder="Выберите страну"
                  noOptionsMessage={() => "Нет стран в справочнике"}
                />
              </div>
              <div className="ps-select-wrap">
                <span className="ps-label">Область / регион</span>
                <Select
                  {...selectMenuProps}
                  options={areaOptions}
                  value={geoRegion}
                  onChange={handleSelectRegionsAndAddTowns}
                  isClearable
                  styles={selectStyles}
                  placeholder="Выберите область"
                  isDisabled={!geoCountry}
                  noOptionsMessage={() =>
                    geoCountry
                      ? "Нет регионов для выбранной страны"
                      : "Сначала выберите страну"
                  }
                />
              </div>
              <div className="ps-select-wrap">
                <span className="ps-label">Город</span>
                <GeoTownSelect
                  {...selectMenuProps}
                  regionLabel={geoRegion?.label}
                  options={townOptions}
                  value={geoTown}
                  onChange={setGeoTown}
                  onCreateOption={handleCreateTown}
                  isClearable={!isCityAsRegion(geoRegion?.label)}
                  styles={selectStyles}
                  isDisabled={!geoRegion}
                />
                {isCityAsRegion(geoRegion?.label) && (
                  <p className="ps-section__hint" style={{ marginTop: 6 }}>
                    {townFieldHint(geoRegion.label, { hasRegion: true })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-business">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              <IconBriefcase />
            </span>
            <div>
              <h2 id="ps-business" className="ps-section__title">
                Бизнес
              </h2>
              <p className="ps-section__hint">Форма деятельности и реквизиты</p>
            </div>
          </div>
          <div className="ps-section__body">
            <div className="ps-select-wrap ps-field--full">
              <span className="ps-label">Форма бизнеса</span>
              <CreatableSelect
                {...selectMenuProps}
                options={businessFormOptions}
                value={businessFormName}
                onChange={handleBusinessFormChange}
                isClearable
                styles={selectStyles}
                placeholder="Выберите или добавьте форму"
              />
            </div>
            <div className="ps-grid">
              <div className="ps-field">
                <label htmlFor="description" className="ps-label">
                  Пояснения
                </label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  value={descriptionBusinessFormName}
                  onChange={(e) =>
                    setDescriptionBusinessFormName(e.target.value)
                  }
                  className="ps-input"
                />
              </div>
              <div className="ps-field">
                <label htmlFor="name_organization" className="ps-label">
                  Название организации
                </label>
                <input
                  id="name_organization"
                  name="name_organization"
                  type="text"
                  value={nameOerganization}
                  onChange={(e) => setNameOrganization(e.target.value)}
                  className="ps-input"
                />
              </div>
              <div className="ps-field">
                <label htmlFor="register_number" className="ps-label">
                  Регистрационный номер
                </label>
                <input
                  id="register_number"
                  name="register_number"
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="ps-input"
                />
              </div>
              <div className="ps-field">
                <label htmlFor="location" className="ps-label">
                  Адрес
                </label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="ps-input"
                />
              </div>
              <div className="ps-field">
                <label htmlFor="operatingMode" className="ps-label">
                  Режим работы
                </label>
                <input
                  id="operatingMode"
                  name="operatingMode"
                  type="text"
                  value={operatingMode}
                  onChange={(e) => setOperatingMode(e.target.value)}
                  className="ps-input"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-contacts">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              <IconPhone />
            </span>
            <div>
              <h2 id="ps-contacts" className="ps-section__title">
                Контакты
              </h2>
              <p className="ps-section__hint">Телефон, мессенджеры, сайт</p>
            </div>
          </div>
          <div className="ps-section__body">
            <div className="ps-contact-row">
              <select
                value={contactType}
                onChange={(e) => handleContactTypeChange(e.target.value)}
                className="ps-select"
                aria-label="Тип контакта"
              >
                {CONTACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode={contactInputMode(contactType)}
                autoComplete={contactAutoComplete(contactType)}
                placeholder={contactPlaceholder(contactType)}
                value={contactValue}
                onChange={(e) => handleContactValueChange(e.target.value)}
                className="ps-input"
                maxLength={100}
                aria-label="Значение контакта"
              />
            </div>
            <div className="ps-actions ps-actions--inline">
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={addContact}
              >
                Добавить контакт
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setShowContactsModal(true)}
              >
                Показать контакты
              </button>
            </div>
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-geo">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              <IconMap />
            </span>
            <div>
              <h2 id="ps-geo" className="ps-section__title">
                География работ
              </h2>
              <p className="ps-section__hint">
                Где вы готовы выполнять заказы
              </p>
            </div>
          </div>
          <div className="ps-section__body">
            <div className="ps-grid">
              <div className="ps-select-wrap">
                <span className="ps-label">Страна</span>
                <Select
                  {...selectMenuProps}
                  isClearable
                  options={countryOrderOptions}
                  value={geoCountryOrder}
                  onChange={handleSelectCountriesAndAddRegionsForGeo}
                  placeholder="Выберите страну"
                  styles={selectStyles}
                  noOptionsMessage={() => "Нет стран в справочнике"}
                />
              </div>
              <div className="ps-select-wrap">
                <span className="ps-label">Область / регион</span>
                <Select
                  {...selectMenuProps}
                  isClearable
                  options={areaOrderOptions}
                  value={geoRegionOrder}
                  onChange={handleSelectRegionsAndAddTownsForGeo}
                  placeholder="Выберите область"
                  styles={selectStyles}
                  isDisabled={!geoCountryOrder}
                  noOptionsMessage={() =>
                    geoCountryOrder
                      ? "Нет регионов для выбранной страны"
                      : "Сначала выберите страну"
                  }
                />
              </div>
              <div className="ps-select-wrap">
                <span className="ps-label">Город</span>
                <GeoTownSelect
                  {...selectMenuProps}
                  regionLabel={geoRegionOrder?.label}
                  options={townOrderOptions}
                  value={geoTownOrder}
                  onChange={(newValue) => setGeoTownOrder(newValue)}
                  onCreateOption={handleCreateTownForOrders}
                  isClearable={!isCityAsRegion(geoRegionOrder?.label)}
                  placeholder={
                    geoRegionOrder
                      ? "Выберите или введите город"
                      : "Сначала выберите область"
                  }
                  isDisabled={!geoRegionOrder}
                  styles={selectStyles}
                />
                {isCityAsRegion(geoRegionOrder?.label) && (
                  <p className="ps-section__hint" style={{ marginTop: 6 }}>
                    {townFieldHint(geoRegionOrder.label, { hasRegion: true })}
                  </p>
                )}
              </div>
            </div>
            <div className="ps-actions ps-actions--inline">
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={addGeoExecuteOrder}
              >
                Добавить
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setShowGeoModal(true)}
              >
                Показать географию
              </button>
            </div>
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-about">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              <IconDoc />
            </span>
            <div>
              <h2 id="ps-about" className="ps-section__title">
                О себе
              </h2>
              <p className="ps-section__hint">
                Описание и фото для публичного профиля
              </p>
            </div>
          </div>
          <div className="ps-section__body">
            <div className="ps-field ps-field--full">
              <label htmlFor="about" className="ps-label">
                Биография
              </label>
              <textarea
                id="about"
                name="about"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Расскажите о своём опыте, навыках и подходе..."
                className="ps-textarea"
              />
            </div>
            <div className="ps-field ps-field--full">
              <label htmlFor="shortDescription" className="ps-label">
                Короткое описание
              </label>
              <input
                id="shortDescription"
                name="shortDescription"
                type="text"
                value={shortReviewMaster}
                onChange={(e) => setShortReviewMaster(e.target.value)}
                placeholder="Например: Опытный специалист с 5-летним стажем"
                className="ps-input"
              />
            </div>
            <div className="ps-field ps-field--full">
              <span className="ps-label">Фото профиля</span>
              <div className="ps-avatar-row">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt="Фото профиля"
                    className="ps-avatar-preview"
                    onError={() => {
                      setAvatarUrl("");
                      setPreviewUrl("");
                    }}
                  />
                ) : (
                  <div
                    className="ps-avatar-preview ps-avatar-preview--empty"
                    aria-hidden="true"
                  >
                    <IconUser width={28} height={28} />
                  </div>
                )}
                <div className="ps-file-wrap">
                  <input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="ps-file-input"
                  />
                  <span className="ps-section__hint">
                    JPG или PNG, до загрузки на сервер — предпросмотр
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="ps-form__footer">
          <button type="submit" className="ps-btn ps-btn--primary">
            Сохранить изменения
          </button>
        </footer>
      </form>

      {showContactsModal && (
        <ModalShowContacts onClose={() => setShowContactsModal(false)} />
      )}
      {showGeoModal && (
        <ModalShowGeography onClose={() => setShowGeoModal(false)} />
      )}
    </div>
  );
}

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    height: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? "#93c5fd" : "#e2e8f0",
    backgroundColor: "#f8fafc",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    fontSize: "0.875rem",
    "&:hover": { borderColor: "#93c5fd" },
  }),
  valueContainer: (base) => ({
    ...base,
    height: 40,
    padding: "0 8px",
    flexWrap: "nowrap",
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: 40,
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
  }),
  singleValue: (base) => ({
    ...base,
    color: "#0f172a",
    maxWidth: "calc(100% - 8px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
    border: "1px solid #e2e8f0",
    zIndex: 9999,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected
      ? "#2563eb"
      : state.isFocused
        ? "#eff6ff"
        : "#fff",
    color: state.isSelected ? "#fff" : "#0f172a",
    cursor: "pointer",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};
