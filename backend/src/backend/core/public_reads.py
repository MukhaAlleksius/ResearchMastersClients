"""Публичные GET-маршруты (без JWT на уровне API).

Политика доступа:
- Каталог и справочники — без авторизации.
- Профиль исполнителя и связанные данные — без JWT, но backend проверяет,
  что user_id относится к исполнителю (см. core.access.assert_can_view_executor_profile).
- GET /order/{id} — без JWT только для заказов в каталоге; иначе участник/админ
  (см. core.access.assert_can_read_order).
- GET /contract/{id} — только JWT + участник договора (не в этом списке).

Синхронизируйте с frontend/src/utils/api.js (isPublicRequest).
"""

import re

# Справочники, каталог, auth
PUBLIC_GET_EXACT = frozenset(
    {
        "/",
        "/health",
        "/business_form",
        "/categories_works",
        "/categories_works_for_users",
        "/countries",
        "/profiles_executors_for_cards",
        "/orders_customers",
        "/profile/regions",
    }
)

# Публичные URL; фактический доступ может дополнительно проверяться в роутере
PUBLIC_GET_PATTERNS = (
    re.compile(r"^/currency/"),
    re.compile(r"^/avatar/\d+$"),
    re.compile(r"^/information_about_user/\d+$"),
    re.compile(r"^/profile$"),
    re.compile(r"^/users/\d+/contacts$"),
    re.compile(r"^/users/\d+/geography_execute_orders$"),
    re.compile(r"^/countries/\d+/regions$"),
    re.compile(r"^/regions/\d+/towns$"),
    re.compile(r"^/order/\d+$"),
    re.compile(r"^/project_images_portfolio_master/\d+$"),
    re.compile(r"^/projects_portfolio_master"),
    re.compile(r"^/works_for_category_work"),
    re.compile(r"^/works_masters_for_category_work"),
    re.compile(r"^/categories_works_master/\d+$"),
    re.compile(r"^/works_master_from_admin/\d+/\d+$"),
    re.compile(r"^/works_master_myself/\d+/\d+$"),
    re.compile(r"^/verify-email$"),
    re.compile(r"^/portfolio"),
)


def is_public_get(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    if normalized in PUBLIC_GET_EXACT:
        return True
    return any(pattern.search(normalized) for pattern in PUBLIC_GET_PATTERNS)
