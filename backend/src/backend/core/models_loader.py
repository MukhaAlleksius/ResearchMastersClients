"""Import all ORM models so Base.metadata is complete before create_all."""


def load_all_models() -> None:
    import models.contracts_models  # noqa: F401
    import models.conversations_models  # noqa: F401
    import models.currency_models  # noqa: F401
    import models.estimate_graphic_works_models  # noqa: F401
    import models.geography_models  # noqa: F401
    import models.orders_models  # noqa: F401
    import models.payments_models  # noqa: F401
    import models.prices_works_materials  # noqa: F401
    import models.users_models  # noqa: F401
    import models.works_materials_models  # noqa: F401
