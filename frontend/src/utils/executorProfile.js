export function buildExecutorProfileSlug({ firstName = "", lastName = "" } = {}) {
  const slug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  return slug || "executor";
}

export function buildExecutorProfileSlugFromFullName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "executor";

  return buildExecutorProfileSlug({
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || parts[0],
  });
}

export function getExecutorProfileLink(executorId, nameSource) {
  if (!executorId) {
    return null;
  }

  let slug = "executor";

  if (typeof nameSource === "string") {
    slug = buildExecutorProfileSlugFromFullName(nameSource);
  } else if (nameSource && typeof nameSource === "object") {
    slug = buildExecutorProfileSlug({
      firstName: nameSource.first_name || nameSource.firstName || "",
      lastName:
        nameSource.second_name ||
        nameSource.last_name ||
        nameSource.lastName ||
        "",
    });
  }

  const id = Number(executorId) || executorId;

  return {
    pathname: `/profile/${slug}`,
    search: `?id=${id}`,
    state: {
      executorId: id,
    },
  };
}

export function getCustomerProfileLink(customerId, nameSource) {
  if (!customerId) {
    return null;
  }

  const link = getExecutorProfileLink(customerId, nameSource);
  if (!link) {
    return null;
  }

  const id = Number(customerId) || customerId;
  return {
    ...link,
    state: { customerId: id, executorId: id },
  };
}
