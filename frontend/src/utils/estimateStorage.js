import { API, apiFetch } from "./api.js";

import {
  convertAmountWithRates,
  normalizeCurrencyCode,
} from "./currency.js";

export function getEstimateCurrencyStorageKey(userId, orderId) {
  return `estimate_currency_${userId}_${orderId}`;
}

export function saveEstimateCurrency(userId, orderId, currency) {
  if (!userId || !orderId) return;
  localStorage.setItem(
    getEstimateCurrencyStorageKey(userId, orderId),
    normalizeCurrencyCode(currency),
  );
}

export function loadEstimateCurrency(userId, orderId) {
  if (!userId || !orderId) return null;
  const value = localStorage.getItem(
    getEstimateCurrencyStorageKey(userId, orderId),
  );
  return value ? normalizeCurrencyCode(value) : null;
}

export function resolveEstimateCurrency(data, userId, orderId) {
  return normalizeCurrencyCode(
    data?.currency ||
      loadEstimateCurrency(userId, orderId) ||
      data?.works?.[0]?.currency ||
      "BYN",
  );
}

export function mapApiEstimateWork(work, worksCurrency) {
  const currency = normalizeCurrencyCode(work.currency || worksCurrency);
  return {
    id: work.id,
    workDescription: work.name_work || "Без названия",
    workQuantity: Number(work.quantity || 0),
    doneQuantity: Number(work.done_quantity || 0),
    workUnit: work.unit_measurement || "",
    workPricePerUnit: Number(work.cost_unit || 0),
    currency,
    materials: (work.materials || []).map((mat) => ({
      id: mat.id,
      materialDescription: mat.name_material,
      materialQuantity: Number(mat.quantity || 0),
      materialUnit: mat.unit_measurement || "",
      materialPricePerUnit: Number(mat.cost_unit || 0),
      currency: normalizeCurrencyCode(mat.currency || currency),
    })),
  };
}

export function worksNeedCurrencyConversion(flatWorks, targetCurrency) {
  const target = normalizeCurrencyCode(targetCurrency);
  return flatWorks.some(
    (work) =>
      normalizeCurrencyCode(work.currency) !== target ||
      (work.materials || []).some(
        (mat) => normalizeCurrencyCode(mat.currency) !== target,
      ),
  );
}

export function convertFlatWorksToCurrency(
  flatWorks,
  priceAnchors,
  targetCurrency,
  rates,
) {
  const target = normalizeCurrencyCode(targetCurrency);

  return flatWorks.map((work) => {
    const workAnchor = priceAnchors.works.get(work.id);
    const materials = (work.materials || []).map((mat) => {
      const matAnchor = priceAnchors.materials.get(mat.id);
      return {
        ...mat,
        currency: target,
        materialPricePerUnit: matAnchor
          ? matAnchor.priceForCurrency(target, rates)
          : convertAmountWithRates(
              mat.materialPricePerUnit,
              mat.currency,
              target,
              rates,
            ),
      };
    });

    return {
      ...work,
      currency: target,
      workPricePerUnit: workAnchor
        ? workAnchor.priceForCurrency(target, rates)
        : convertAmountWithRates(
            work.workPricePerUnit,
            work.currency,
            target,
            rates,
          ),
      materials,
    };
  });
}

function formatValidationDetail(detail) {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return JSON.stringify(detail);

  return detail
    .map((item) => {
      const field = Array.isArray(item?.loc)
        ? item.loc.filter((part) => part !== "body").join(".")
        : "";
      const message = item?.msg || item?.message || JSON.stringify(item);
      return field ? `${field}: ${message}` : message;
    })
    .join("; ");
}

async function readResponseError(response) {
  try {
    const data = await response.json();
    if (data?.detail) return formatValidationDetail(data.detail);
    return JSON.stringify(data);
  } catch {
    try {
      return await response.text();
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

async function saveEstimateCurrencyToServer(userId, orderId, currency) {
  try {
    const response = await apiFetch(
      `${API.baseURL}/update_estimate_currency/${userId}/${orderId}`,
      {
        method: "PUT",
        body: JSON.stringify({ currency: normalizeCurrencyCode(currency) }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function validationDetailMentionsField(detail, fieldName) {
  if (!Array.isArray(detail)) {
    return String(formatValidationDetail(detail))
      .toLowerCase()
      .includes(fieldName.toLowerCase());
  }

  return detail.some((item) => {
    const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
    return (
      loc.toLowerCase().includes(fieldName.toLowerCase()) ||
      String(item?.msg || "")
        .toLowerCase()
        .includes(fieldName.toLowerCase())
    );
  });
}

async function putWithCurrencyFallback(url, payloadWithCurrency, payloadWithoutCurrency) {
  let response = await apiFetch(url, {
    method: "PUT",
    body: JSON.stringify(payloadWithCurrency),
  });

  if (response.ok || !payloadWithoutCurrency || response.status !== 422) {
    return response;
  }

  try {
    const data = await response.clone().json();
    if (!validationDetailMentionsField(data.detail, "currency")) {
      return response;
    }
  } catch {
    return response;
  }

  return apiFetch(url, {
    method: "PUT",
    body: JSON.stringify(payloadWithoutCurrency),
  });
}

export function buildMaterialUpdatePayload(
  workEstimateId,
  material,
  targetCurrency,
) {
  return {
    work_estimate_id: Number(workEstimateId),
    name_material: material.materialDescription,
    quantity: Number(material.materialQuantity),
    unit_measurement: material.materialUnit || "",
    cost_unit: Number(material.materialPricePerUnit),
    currency: normalizeCurrencyCode(targetCurrency),
  };
}

export function buildMaterialCreatePayload(workEstimateId, material, targetCurrency) {
  return {
    work_estimate_id: Number(workEstimateId),
    name_material: material.materialDescription,
    quantity: Number(material.materialQuantity),
    unit_measurement: material.materialUnit || "",
    cost_unit: Number(material.materialPricePerUnit),
    currency: normalizeCurrencyCode(targetCurrency),
  };
}

export async function updateMaterialInEstimate(
  workEstimateId,
  material,
  targetCurrency,
) {
  if (!material?.id) {
    throw new Error("У материала нет id в базе данных");
  }

  const payload = buildMaterialUpdatePayload(
    workEstimateId,
    material,
    targetCurrency,
  );

  return apiFetch(
    `${API.baseURL}/update_material_into_estimate/${material.id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function persistEstimateCurrencyOnly(userId, orderId, currency) {
  const normalized = normalizeCurrencyCode(currency);
  saveEstimateCurrency(userId, orderId, normalized);
  if (!userId || !orderId) return;
  await saveEstimateCurrencyToServer(userId, orderId, normalized);
}

export async function persistEstimateWorks(userId, orderId, targetCurrency, works) {
  const currency = normalizeCurrencyCode(targetCurrency);
  saveEstimateCurrency(userId, orderId, currency);

  if (!userId || !orderId) {
    return { saved: false, errors: ["Не указан заказ или пользователь"] };
  }

  await saveEstimateCurrencyToServer(userId, orderId, currency);

  const errors = [];

  for (const work of works) {
    const workPayload = {
      name_work: work.workDescription,
      quantity: Number(work.workQuantity),
      unit_measurement: work.workUnit,
      cost_unit: Number(work.workPricePerUnit),
      currency,
    };
    const workPayloadWithoutCurrency = {
      name_work: work.workDescription,
      quantity: Number(work.workQuantity),
      unit_measurement: work.workUnit,
      cost_unit: Number(work.workPricePerUnit),
    };

    try {
      const workResponse = await putWithCurrencyFallback(
        `${API.baseURL}/update_work_into_estimate/${work.id}/${userId}/${orderId}`,
        workPayload,
        workPayloadWithoutCurrency,
      );

      if (!workResponse.ok) {
        errors.push(
          `Работа «${work.workDescription}»: ${await readResponseError(workResponse)}`,
        );
      }
    } catch (error) {
      errors.push(`Работа «${work.workDescription}»: ${error.message}`);
    }

    for (const mat of work.materials || []) {
      if (!mat?.id) {
        errors.push(
          `Материал «${mat.materialDescription || "без названия"}»: нет id в базе`,
        );
        continue;
      }

      try {
        const materialResponse = await updateMaterialInEstimate(
          work.id,
          mat,
          currency,
        );

        if (!materialResponse.ok) {
          errors.push(
            `Материал «${mat.materialDescription}»: ${await readResponseError(materialResponse)}`,
          );
        }
      } catch (error) {
        const message =
          error.message === "Failed to fetch" ||
          error.name === "TypeError"
            ? "нет связи с сервером (проверьте, что backend доступен)"
            : error.message;
        errors.push(`Материал «${mat.materialDescription}»: ${message}`);
      }
    }
  }

  if (errors.length > 0) {
    return { saved: false, errors };
  }

  return { saved: true, errors: [] };
}
