"""Публичные GET-маршруты (без JWT на уровне API).

Политика доступа:
- Каталог и справочники — без авторизации.
- Профиль исполнителя и связанные данные — без JWT, доступ открыт всем.
- GET /order/{id} — без JWT только для заказов в каталоге; иначе участник/админ
  (см. core.access.assert_can_read_order).
- GET /contract/{id} — только JWT + участник договора (не в этом списке).

Синхронизируйте с frontend/src/utils/api.js (isPublicRequest).
"""  # Документация политики публичных GET

import re  # Регулярки для шаблонов путей

# Справочники, каталог, auth
PUBLIC_GET_EXACT = frozenset(  # Точные пути GET без JWT
    {
        "/",  # Корень API
        "/health",  # Healthcheck
        "/business_form",  # Формы бизнеса (справочник)
        "/categories_works",  # Категории работ
        "/categories_works_for_users",  # Категории для карточек пользователей
        "/countries",  # Список стран
        "/profiles_executors_for_cards",  # Карточки исполнителей в каталоге
        "/orders_customers",  # Заказы в поиске (каталог)
        "/profile/regions",  # Регионы профиля (справочник)
    }
)

# Публичные URL; фактический доступ может дополнительно проверяться в роутере
PUBLIC_GET_PATTERNS = (  # Шаблоны путей GET без JWT на уровне middleware
    re.compile(r"^/currency/"),  # Курсы валют
    re.compile(r"^/avatar/\d+$"),  # Аватар по id
    re.compile(r"^/information_about_user/\d+$"),  # Инфо о пользователе
    re.compile(r"^/profile$"),  # Профиль (с доп. проверками в роутере)
    re.compile(r"^/users/\d+/contacts$"),  # Контакты пользователя
    re.compile(r"^/users/\d+/reviews$"),  # Отзывы
    re.compile(r"^/users/\d+/geography_execute_orders$"),  # География исполнителя
    re.compile(r"^/countries/\d+/regions$"),  # Регионы страны
    re.compile(r"^/regions/\d+/towns$"),  # Города региона
    re.compile(r"^/order/\d+$"),  # Заказ (каталог или участник — в access)
    re.compile(r"^/project_images_portfolio_master/\d+$"),  # Картинки портфолио
    re.compile(r"^/projects_portfolio_master"),  # Проекты портфолио
    re.compile(r"^/works_for_category_work"),  # Работы категории
    re.compile(r"^/works_masters_for_category_work"),  # Работы мастеров категории
    re.compile(r"^/categories_works_master/\d+$"),  # Категории мастера
    re.compile(r"^/works_master_from_admin/\d+/\d+$"),  # Работы мастера (админ-вид)
    re.compile(r"^/works_master_myself/\d+/\d+$"),  # Свои работы мастера
    re.compile(r"^/verify-email$"),  # Подтверждение email по ссылке
    re.compile(r"^/portfolio"),  # Раздача файлов портфолио
)


def is_public_get(path: str) -> bool:  # True, если GET-путь считается публичным
    normalized = path.rstrip("/") or "/"  # Нормализация без хвостового слэша
    if normalized in PUBLIC_GET_EXACT:  # Точное совпадение
        return True  # Публичный
    return any(pattern.search(normalized) for pattern in PUBLIC_GET_PATTERNS)  # Или по regex
