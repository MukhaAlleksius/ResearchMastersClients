export function normalizeWorkName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function preferOwnSpecializationWorks(adminWorks = [], myselfWorks = []) {
  const ownNames = new Set(
    myselfWorks.map((work) => normalizeWorkName(work.name_work)).filter(Boolean),
  );
  return [
    ...myselfWorks,
    ...adminWorks.filter(
      (work) => !ownNames.has(normalizeWorkName(work.name_work)),
    ),
  ];
}

export function isCatalogWorkInSpecialization(catalogWork, masterWorks = []) {
  const catalogId = catalogWork?.work_id ?? catalogWork?.id;
  const catalogName = normalizeWorkName(catalogWork?.name_work);
  return masterWorks.some((work) => {
    const workId = work?.work_id ?? work?.id;
    if (
      catalogId != null &&
      workId != null &&
      String(catalogId) === String(workId)
    ) {
      return true;
    }
    return Boolean(catalogName) && normalizeWorkName(work?.name_work) === catalogName;
  });
}
