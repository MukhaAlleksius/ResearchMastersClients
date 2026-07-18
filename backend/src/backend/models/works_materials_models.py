# для внесения изменений администратором
from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from core.database import Base


class CategoryWork(Base):
    __tablename__ = "categories_works"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )  # Идентификатор категории
    name = Column(String(100), nullable=False)  # Название категории
    description = Column(Text)  # Описание категории
    icon_name = Column(String(500))  # Название иконки категории
    icon_color = Column(String(20), nullable=False, default="#2c72dc")
    access_users = Column(Boolean)
    slug = Column(String(100), nullable=False)

    works = relationship("Work", back_populates="category_work")


# для внесения изменений администратором
# колонка user_id сделана для того, чтобы контролировать какие работы вносятся пользователями
class Work(Base):
    __tablename__ = "works"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name_work = Column(Text)
    unit_measurement = Column(String(100))
    cost = Column(Numeric)
    currency = Column(String(100))
    category_work_id = Column(Integer, ForeignKey("categories_works.id"))

    user = relationship("User", back_populates="works")
    category_work = relationship("CategoryWork", back_populates="works")


# для внесения изменений администратором и пользователем
# колонка user_id сделана для того, чтобы контролировать какие работы вносятся пользователями
class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name_material = Column(String(255))
    unit_measuremant = Column(String(100))

    user = relationship("User", back_populates="materials")


class CategoryWorkMaster(Base):
    __tablename__ = "categories_works_masters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    master_id = Column(Integer, ForeignKey("users.id"))
    category_work_id = Column(Integer, ForeignKey("categories_works.id"))
    description = Column(Text, nullable=True)
    experience = Column(Numeric, nullable=True)
    cost_hour = Column(Numeric, nullable=True)

    category_work = relationship("CategoryWork")


class WorkMasterFromAdmin(Base):
    __tablename__ = "works_masters_from_admin"

    id = Column(Integer, primary_key=True, autoincrement=True)
    master_id = Column(Integer, ForeignKey("users.id"))
    work_id = Column(Integer, ForeignKey("works.id"))
    cost = Column(Numeric)
    currency = Column(String(100))


class WorkMasterMyself(Base):
    __tablename__ = "works_masters_myself"

    id = Column(Integer, primary_key=True, autoincrement=True)
    master_id = Column(Integer, ForeignKey("users.id"))
    category_work_id = Column(Integer, ForeignKey("categories_works.id"))
    name_work = Column(Text)
    unit_measurement = Column(String(100))
    cost = Column(Numeric)
    currency = Column(String(100))
