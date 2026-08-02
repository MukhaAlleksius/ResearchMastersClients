"""Import all ORM models so Base.metadata is complete before create_all."""  # Подтягивает все модели, чтобы create_all знал все таблицы


def load_all_models() -> None:  # Импортирует модули моделей ради побочного эффекта регистрации в Base.metadata
    import models.works_materials_models  # noqa: F401  # до users (CategoryWork/Work/Material)
    import models.users_models  # noqa: F401  # до geography (Town.created_by → User)
    import models.geography_models  # noqa: F401  # Страны/регионы/города
    import models.contracts_models  # noqa: F401  # Модели договоров
    import models.conversations_models  # noqa: F401  # Модели чатов/сообщений
    import models.currency_models  # noqa: F401  # Модели курсов валют
    import models.estimate_graphic_works_models  # noqa: F401  # Модели сметной графики
    import models.orders_models  # noqa: F401  # Заказы и статусы
    import models.payments_models  # noqa: F401  # Платежи
    import models.prices_works_materials  # noqa: F401  # Цены работ/материалов
