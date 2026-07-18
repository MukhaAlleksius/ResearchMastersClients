from sqlalchemy import (
    ARRAY,
    DECIMAL,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship
from core.database import Base
from models.geography_models import Town
from models.works_materials_models import CategoryWork, Work, Material


class User(Base):
    __tablename__ = "users"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Уникальный идентификатор пользователя
    first_name = Column(String(100), nullable=False)  # Имя пользователя
    last_name = Column(String(100), nullable=False)  # Фамилия пользователя
    country = Column(String(100), nullable=False)  # Страна
    region = Column(String(100), nullable=False)  # Регион
    town = Column(String(100), nullable=False)  # Город

    email = Column(
        String(255), unique=True, nullable=False
    )  # Электронная почта пользователя, уникальна и обязательна
    password_hash = Column(
        String(255), nullable=False
    )  # Хэш пароля, хранится в защищённом виде
    role = Column(
        String(50), default="user", nullable=False
    )  # Роль пользователя, обычный пользователь, модератор, администратор
    is_verified = Column(Boolean, default=False)  # Флаг подтверждения аккаунта
    is_active = Column(Boolean, default=True)  # Флаг активности аккаунта
    created_at = Column(
        DateTime(timezone=True), server_default=func.now()
    )  # Дата создания аккаунта
    last_login = Column(DateTime(timezone=True))  # Дата последнего входа в систему
    blocked = Column(Boolean, default=False)

    blocked_until = Column(DateTime(timezone=True), nullable=True)  # До какой даты

    warnings_count = Column(Integer, default=0)  # Счетчик предупреждений

    works = relationship("Work", back_populates="user")
    materials = relationship("Material", back_populates="user")
    business_info = relationship("UserBusiness", uselist=False, back_populates="user")
    profiles = relationship("UserProfile", back_populates="user")
    contacts = relationship("UserContact", back_populates="user")
    geography_execute_orders = relationship(
        "GeographyExecuteOrder", back_populates="user"
    )

    order = relationship("Order", back_populates="customer")
    executor_order = relationship("ExecutorOrder", back_populates="executor")


class BusinessForm(Base):
    __tablename__ = "business_forms"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Идентификатор формы бизнеса
    name = Column(
        String(100), nullable=False, unique=True
    )  # Название формы (например, "ИП", "ООО", "Самозанятый" и т.п.)
    description = Column(Text)  # Описание или дополнительные пояснения
    user_businesses = relationship("UserBusiness", back_populates="business_form")


class UserBusiness(Base):
    __tablename__ = "user_businesses"
    id = Column(Integer, primary_key=True, autoincrement=True)  # Идентификатор записи
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )  # Связь с пользователем
    business_form_id = Column(
        Integer, ForeignKey("business_forms.id")
    )  # Связь с формой бизнеса
    registration_number = Column(
        String(100), nullable=False
    )  # Номер регистрации / ИНН / ОГРНИП и т.п.
    name = Column(String(100), nullable=False)
    location = Column(String(100))  # Адрес

    user = relationship("User", back_populates="business_info")
    business_form = relationship("BusinessForm", back_populates="user_businesses")


class UserProfile(Base):
    __tablename__ = "user_profiles"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Уникальный идентификатор профиля
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # Связь с пользователем
    avatar_url = Column(String(500))  # Ссылка на аватар
    bio = Column(Text)  # Краткая биография или описание профиля
    short_review_master = Column(Text)
    operating_mode = Column(String(100))  # режим работы пользователя

    # is_mentor = Column(
    #     Boolean, default=False
    # )  # Флаг, является ли пользователь ментором
    # mentor_id = Column(Integer, ForeignKey("users.id"))  # Ссылка на ментора (если есть)

    user = relationship("User", back_populates="profiles")


class UserContact(Base):
    __tablename__ = "users_contacts"

    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Уникальный идентификатор контакта пользователя
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # Связь с пользователем
    name_contact = Column(String(100))  # название контакта
    contact = Column(String(100))  # контакт пользователя

    user = relationship("User", back_populates="contacts")


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Идентификатор элемента портфолио
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # Пользователь-автор портфолио
    title = Column(String(200), nullable=False)  # Название работы
    description = Column(Text)  # Описание работы
    category_id = Column(Integer, ForeignKey("categories_works.id"))  # Категория работы
    created_at = Column(
        DateTime(timezone=True), server_default=func.now()
    )  # Дата создания
    images = relationship(
        "PortfolioImage", back_populates="portfolio_item", cascade="all, delete-orphan"
    )

    user = relationship("User")
    category = relationship("CategoryWork")


class PortfolioImage(Base):
    __tablename__ = "portfolio_images"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_item_id = Column(
        Integer, ForeignKey("portfolio_items.id", ondelete="CASCADE")
    )
    image_url = Column(String(500), nullable=False)

    portfolio_item = relationship("PortfolioItem", back_populates="images")


class GeographyExecuteOrder(Base):
    __tablename__ = "geography_execute_orders"

    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Уникальный идентификатор географии выполнения заказа
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )  # Связь с пользователем
    town_id = Column(Integer, ForeignKey("towns.id"))

    user = relationship("User", back_populates="geography_execute_orders")
    town = relationship("Town")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    comment = Column(Text)


class RatingMaster(Base):
    __tablename__ = "ratings_masters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    master_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    mark = Column(Integer)
