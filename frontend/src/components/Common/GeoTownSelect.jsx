import Select from "react-select";
import { isCityAsRegion } from "../../utils/geographyApi.js";

/**
 * Город только из справочника. Для региона-города (г. Минск) список без поиска,
 * при одном пункте поле фиксируется.
 */
export default function GeoTownSelect({
  regionLabel,
  options = [],
  value,
  onChange,
  isDisabled = false,
  isClearable = false,
  placeholder,
  ...rest
}) {
  const locked = isCityAsRegion(regionLabel);
  const singleLocked = locked && options.length === 1;
  const disabled = Boolean(isDisabled || singleLocked);
  const emptyPlaceholder = placeholder || "Сначала выберите область";

  return (
    <Select
      {...rest}
      options={options}
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      isClearable={locked ? false : isClearable}
      isSearchable={!locked}
      placeholder={
        locked
          ? regionLabel
            ? "Город задан справочником"
            : emptyPlaceholder
          : regionLabel
            ? "Выберите город"
            : emptyPlaceholder
      }
      noOptionsMessage={() =>
        regionLabel ? "Нет городов в справочнике" : "Сначала выберите область"
      }
    />
  );
}
