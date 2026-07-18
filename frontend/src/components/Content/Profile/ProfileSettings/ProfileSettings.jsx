import React, { useEffect, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import ModalShowContacts from "./ModalShowContacts";
import ModalShowGeography from "./ModalShowGeography";
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
  const [contactValue, setContactValue] = useState("");
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
  const userCommonCustomizationData = {
    user_id: localStorage.getItem("user_id"),
    first_name: firstName,
    last_name: lastName,
    country: geoCountry ? geoCountry.label : null,
    region: geoRegion ? geoRegion.label : null,
    town: geoTown ? geoTown.label : null,
  };

  const userBusinessCustomizationData = {
    user_id: localStorage.getItem("user_id"),
    business_form_name: businessFormName ? businessFormName.value : null,
    registration_number: registrationNumber,
    location: location,
  };

  const userProfileCustomizationData = {
    user_id: localStorage.getItem("user_id"),
    avatar_url: avatarUrl,
    bio: bio,
    short_review_master: shortReviewMaster,
    operating_mode: operatingMode,
  };

  const userContactsData = {
    user_id: localStorage.getItem("user_id"),
    name_contact: contactType ? contactType.toString() : null,
    contact: contactValue ? contactValue.toString() : null,
  };

  const userGeographyOrderData = {
    user_id: localStorage.getItem("user_id"),
    country: geoCountryOrder ? geoCountryOrder.label : null,
    region: geoRegionOrder ? geoRegionOrder.label : null,
    town: geoTownOrder ? geoTownOrder.label : null,
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
      await fetchTownsRegion(selectedOption.value);
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
      await fetchTownsRegionForOrders(selectedOption.value);
    } else {
      setTownsOrders([]);
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
    } catch (error) {
      console.log("Ошибка: ", error);
      setCountries([]);
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
    } catch (error) {
      console.log("Ошибка: ", error);
      setRegions([]);
      setTowns([]);
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
      return;
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
    } catch (error) {
      setTowns([]);
      console.log("Ошибка: ", error);
    }
  };

  // Загрузка городов в список для выбора города при установке географии производства работ пользователя
  const fetchTownsRegionForOrders = async (regionId) => {
    if (!regionId) {
      setTowns([]);
      return;
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
    } catch (error) {
      setTowns([]);
      console.log("Ошибка: ", error);
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

      // Просто формируем URL, не пытаемся читать как JSON
      const avatar_url = buildApiUrl(`/avatar/${user_id}?t=${new Date().getTime()}`);
      setAvatarUrl(avatar_url);
    } catch (error) {
      console.log("Ошибка: ", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchCountries();
      await fetchCountriesForOrders();

      const common = await fetchUserCustomization("profile");
      setFirstName(common?.first_name || "");
      setLastName(common?.last_name || "");

      if (common?.country) {
        setGeoCountry({
          value: common.country,
          label: common.country,
        });
        // await fetchTownsRegion(
        //   common.region.region_id || common.region.id || common.region
        // );
      } else {
        setGeoCountry(null);
      }

      if (common?.region) {
        setGeoRegion({
          value: common.region,
          label: common.region,
        });
        // await fetchTownsRegion(
        //   common.region.region_id || common.region.id || common.region
        // );
      } else {
        setGeoRegion(null);
      }

      if (common?.town) {
        setGeoTown({
          value: common.town,
          label: common.town,
        });
      } else {
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
    setPreviewUrl(""); // Сбрасываем preview, если есть
  }, []);

  // Обработчик выбора фото с местным предпросмотром
  const handlePhotoChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedPhoto(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch(buildApiUrl("/add_user_contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userContactsData),
      });

      console.log("Отправляем на скрвер: ", userContactsData.contact);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Ошибка добавления географии заказа:", errorData);
        throw new Error("Ошибка добавления географии заказа");
      }
    } catch (error) {
      console.error("Ошибка: ", error);
    }
  };

  const addGeoExecuteOrder = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch(
        buildApiUrl("/add_user_geography_execute_order"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userGeographyOrderData),
        },
      );

      console.log("Отправляем на скрвер: ", userGeographyOrderData.country);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Ошибка добавления географии заказа:", errorData);
        throw new Error("Ошибка добавления географии заказа");
      }
    } catch (error) {
      console.error("Ошибка: ", error);
    }
  };

  const handleAddUserCustomization = async (e, route, userData) => {
    e.preventDefault();
    try {
      const response = await apiFetch(buildApiUrl(`/${route}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Ошибка добавления заказа:", errorData);
        throw new Error("Ошибка добавления заказа");
      }
      const data = await response.json();
      alert("Заказ размещён!");
      console.log(data);
    } catch (error) {
      console.error("Ошибка: ", error);
    }
  };

  const uploadAvatar = async () => {
    if (!selectedPhoto) return;
    const formData = new FormData();
    formData.append("file", selectedPhoto);
    formData.append("user_id", localStorage.getItem("user_id")); // если нужно

    try {
      const response = await apiFetch(buildApiUrl("/upload_avatar"), {
        method: "POST",
        body: formData,
        // Никаких заголовков Content-Type вручную
      });
      if (!response.ok) throw new Error("Ошибка загрузки фото");
      const data = await response.json();
      setAvatarUrl(data.avatar_url); // если в ответе новый URL
      setPreviewUrl(URL.createObjectURL(selectedPhoto)); // исправлено, чтобы использовать selectedPhoto

      alert("Фото успешно загружено!");
    } catch (error) {
      alert("Ошибка загрузки фото");
      console.error(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await handleAddUserCustomization(
        e,
        "add_user_common",
        userCommonCustomizationData,
      );
      await handleAddUserCustomization(
        e,
        "add_user_business",
        userBusinessCustomizationData,
      );
      await handleAddUserCustomization(
        e,
        "add_profile",
        userProfileCustomizationData,
      );
      await uploadAvatar();
      alert("Данные успешно сохранены!");
    } catch (error) {
      console.error("Ошибка при сохранении:", error);
      alert("Ошибка при сохранении данных.");
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
              👤
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
                <Select
                  {...selectMenuProps}
                  options={townOptions}
                  value={geoTown}
                  onChange={setGeoTown}
                  isClearable
                  styles={selectStyles}
                  placeholder="Выберите город"
                  isDisabled={!geoRegion}
                  noOptionsMessage={() =>
                    geoRegion
                      ? "Нет городов для выбранной области"
                      : "Выберите город"
                  }
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ps-section" aria-labelledby="ps-business">
          <div className="ps-section__head">
            <span className="ps-section__icon" aria-hidden="true">
              🏢
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
              📞
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
                onChange={(e) => setContactType(e.target.value)}
                className="ps-select"
                aria-label="Тип контакта"
              >
                <option>Телефон</option>
                <option>Сайт</option>
                <option>Телеграм</option>
                <option>WhatsApp</option>
                <option>Другой</option>
              </select>
              <input
                type="text"
                placeholder="Введите контакт"
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                className="ps-input"
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
              🗺️
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
                <Select
                  {...selectMenuProps}
                  isClearable
                  options={townOrderOptions}
                  value={geoTownOrder}
                  onChange={(newValue) => setGeoTownOrder(newValue)}
                  placeholder="Выберите город"
                  isDisabled={!geoRegionOrder}
                  noOptionsMessage={() =>
                    geoRegionOrder
                      ? "Нет городов для выбранной области"
                      : "Выберите город"
                  }
                  styles={selectStyles}
                />
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
              ✨
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
                  />
                ) : (
                  <div
                    className="ps-avatar-preview ps-avatar-preview--empty"
                    aria-hidden="true"
                  >
                    👤
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
    minHeight: 40,
    borderRadius: 10,
    borderColor: state.isFocused ? "#93c5fd" : "#e2e8f0",
    backgroundColor: "#f8fafc",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
    fontSize: "0.875rem",
    "&:hover": { borderColor: "#93c5fd" },
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
  }),
  singleValue: (base) => ({
    ...base,
    color: "#0f172a",
  }),
};
