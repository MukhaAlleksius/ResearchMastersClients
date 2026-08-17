import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import {
  canCreateTownInRegion,
  isCityAsRegion,
} from "../../utils/geographyApi.js";
import { normalizeTownName } from "../../utils/townNameValidation.js";

/**
 * Город из справочника. Для региона-города (г. Минск) — только справочник,
 * без поиска и без свободного ввода; при одном пункте поле фиксируется.
 */
export default function GeoTownSelect({
  regionLabel,
  options = [],
  value,
  onChange,
  onCreateOption,
  isDisabled = false,
  ...rest
}) {
  const locked = isCityAsRegion(regionLabel);
  const singleLocked = locked && options.length === 1;
  const disabled = Boolean(isDisabled || singleLocked);

  if (locked) {
    return (
      <Select
        {...rest}
        options={options}
        value={value}
        onChange={onChange}
        isDisabled={disabled}
        isClearable={false}
        isSearchable={false}
        placeholder={
          regionLabel ? "Город задан справочником" : "Сначала выберите область"
        }
        noOptionsMessage={() => "Нет городов в справочнике"}
      />
    );
  }

  return (
    <CreatableSelect
      {...rest}
      options={options}
      value={value}
      onChange={onChange}
      onCreateOption={onCreateOption}
      isValidNewOption={(inputValue) =>
        canCreateTownInRegion(regionLabel) &&
        Boolean(normalizeTownName(inputValue))
      }
      formatCreateLabel={(inputValue) =>
        `Добавить город «${normalizeTownName(inputValue)}»`
      }
      isDisabled={isDisabled}
      placeholder={
        regionLabel
          ? "Выберите или введите город"
          : "Сначала выберите область"
      }
      noOptionsMessage={({ inputValue } = {}) =>
        !regionLabel
          ? "Сначала выберите область"
          : inputValue
            ? "Нет совпадений — можно добавить свой город"
            : "Нет городов — можно ввести свой"
      }
    />
  );
}
