import { useEffect, useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import "./profile_settings.css";
export default function ModalShowGeography({ onClose }) {
  const [userGeographyExecuteOrder, setUserGeographyExecuteOrders] = useState(
    {},
  );
  const [editing, setEditing] = useState({ type: null, keys: [] });
  const [editValue, setEditValue] = useState("");
  const [userId, setUserId] = useState(null);

  const fetchUserGeographyOrders = async (user_id) => {
    try {
      if (!user_id) throw new Error("User ID не найден");
      const response = await apiFetch(
        `${API.baseURL}/geography_execute_orders`,
      );
      if (!response.ok) {
        throw new Error("Не получили данных с сервера");
      }
      return await response.json();
    } catch (error) {
      console.log("Ошибка: ", error);
      return null;
    }
  };

  useEffect(() => {
    if (!userId) return;
    async function loadData() {
      const data = await fetchUserGeographyOrders(userId);
      if (data) {
        setUserGeographyExecuteOrders(data);
      }
    }
    loadData();
  }, [userId]);

  useEffect(() => {
    setUserId(localStorage.getItem("user_id"));
  }, []);

  const saveEdit = () => {
    const { type, keys } = editing;
    const newData = { ...userGeographyExecuteOrder };

    if (type === "country") {
      const [oldKey] = keys;
      const country = newData.countries[oldKey];
      delete newData.countries[oldKey];
      country.name_country = editValue;
      newData.countries[editValue] = country;
    } else if (type === "region") {
      const [countryKey, oldRegionKey] = keys;
      const region = newData.countries[countryKey].regions[oldRegionKey];
      delete newData.countries[countryKey].regions[oldRegionKey];
      region.name_region = editValue;
      newData.countries[countryKey].regions[editValue] = region;
    } else if (type === "town") {
      const [countryKey, regionKey, oldTownName] = keys;
      const towns = newData.countries[countryKey].regions[regionKey].towns;
      const idx = towns.findIndex(
        (t) => (typeof t === "object" ? t.name_town : t) === oldTownName,
      );
      if (idx !== -1) {
        towns[idx] =
          typeof towns[idx] === "object"
            ? { ...towns[idx], name_town: editValue }
            : editValue;
      }
    }
    setUserGeographyExecuteOrders(newData);
    setEditing({ type: null, keys: [] });
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditing({ type: null, keys: [] });
    setEditValue("");
  };

  const deleteTown = async (countryKey, regionKey, town, user_id) => {
    const townId = town.town_id || town.id;
    if (!townId) {
      console.error("town_id не найден для города", town);
      return;
    }
    if (
      !window.confirm(
        `Удалить город ${town.name_town || town} в регионе ${regionKey}?`,
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(
        `${API.baseURL}/delete_town_geography_execute_orders?town_id=${townId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        console.log("Удаление не произошло");
        return;
      }

      const newData = { ...userGeographyExecuteOrder };
      const towns = newData.countries[countryKey].regions[regionKey].towns;
      newData.countries[countryKey].regions[regionKey].towns = towns.filter(
        (t) => (t.name_town || t) !== (town.name_town || town),
      );
      setUserGeographyExecuteOrders(newData);
    } catch (error) {
      console.error("Ошибка при удалении:", error);
    }
  };

  const hasCountries =
    userGeographyExecuteOrder?.countries &&
    Object.keys(userGeographyExecuteOrder.countries).length > 0;

  return (
    <div
      className="ps-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="ps-modal ps-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="ps-geo-modal-title"
        aria-modal="true"
      >
        <div className="ps-modal__header">
          <h3 id="ps-geo-modal-title" className="ps-modal__title">
            География выполнения работ
          </h3>
        </div>
        <div className="ps-modal__body">
          {hasCountries ? (
            Object.entries(userGeographyExecuteOrder.countries).map(
              ([countryKey, countryData]) => (
                <div key={countryKey} className="ps-geo-country">
                  {editing.type === "country" &&
                  editing.keys[0] === countryKey ? (
                    <div className="ps-geo-edit-row">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="ps-input"
                      />
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary ps-btn--sm"
                        onClick={saveEdit}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="ps-btn ps-btn--ghost ps-btn--sm"
                        onClick={cancelEdit}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <h4 className="ps-geo-country__title">
                      {countryData.name_country || countryKey}
                    </h4>
                  )}

                  {countryData.regions &&
                  Object.entries(countryData.regions).length > 0 ? (
                    Object.entries(countryData.regions).map(
                      ([regionKey, regionData]) => {
                        const townsArray = Array.isArray(regionData.towns)
                          ? regionData.towns
                          : Object.values(regionData.towns || []);
                        return (
                          <div key={regionKey} className="ps-geo-region">
                            {editing.type === "region" &&
                            editing.keys[0] === countryKey &&
                            editing.keys[1] === regionKey ? (
                              <div className="ps-geo-edit-row">
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) =>
                                    setEditValue(e.target.value)
                                  }
                                  className="ps-input"
                                />
                                <button
                                  type="button"
                                  className="ps-btn ps-btn--primary ps-btn--sm"
                                  onClick={saveEdit}
                                >
                                  Сохранить
                                </button>
                                <button
                                  type="button"
                                  className="ps-btn ps-btn--ghost ps-btn--sm"
                                  onClick={cancelEdit}
                                >
                                  Отмена
                                </button>
                              </div>
                            ) : (
                              <h5 className="ps-geo-region__title">
                                {regionData.name_region || regionKey}
                              </h5>
                            )}

                            {townsArray.length > 0 ? (
                              <ul className="ps-geo-towns">
                                {townsArray.map((town, idx) => (
                                  <li
                                    key={town.name_town || idx}
                                    className="ps-geo-town"
                                  >
                                    {editing.type === "town" &&
                                    editing.keys[0] === countryKey &&
                                    editing.keys[1] === regionKey &&
                                    (editing.keys[2] ===
                                      (town.name_town || town) ||
                                      editing.keys[2] === town) ? (
                                      <div className="ps-geo-edit-row">
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={(e) =>
                                            setEditValue(e.target.value)
                                          }
                                          className="ps-input"
                                        />
                                        <button
                                          type="button"
                                          className="ps-btn ps-btn--primary ps-btn--sm"
                                          onClick={saveEdit}
                                        >
                                          OK
                                        </button>
                                        <button
                                          type="button"
                                          className="ps-btn ps-btn--ghost ps-btn--sm"
                                          onClick={cancelEdit}
                                        >
                                          Отмена
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className="ps-geo-town__name">
                                          {typeof town === "object"
                                            ? town.name_town
                                            : town.toString()}
                                        </span>
                                        <button
                                          type="button"
                                          className="ps-btn ps-btn--ghost ps-btn--sm"
                                          onClick={() =>
                                            deleteTown(
                                              countryKey,
                                              regionKey,
                                              town,
                                              userId,
                                            )
                                          }
                                          title="Удалить город"
                                          aria-label="Удалить город"
                                        >
                                          Удалить
                                        </button>
                                      </>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="ps-geo-empty">Города не найдены</p>
                            )}
                          </div>
                        );
                      },
                    )
                  ) : (
                    <p className="ps-geo-empty">Регионы не найдены</p>
                  )}
                </div>
              ),
            )
          ) : (
            <p className="ps-modal__empty">Данные географии не найдены</p>
          )}
        </div>
        <div className="ps-modal__footer">
          <button
            type="button"
            className="ps-btn ps-btn--primary"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
