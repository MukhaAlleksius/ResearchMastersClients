from sqlalchemy import (
    DECIMAL,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    category_id = Column(Integer, ForeignKey("categories_works.id"))
    budget = Column(DECIMAL(10, 2))
    currency = Column(String(100))
    budget_type = Column(String(20))
    urgency_level = Column(String(20), default="normal")
    country = Column(String(100))
    region = Column(String(100))
    town = Column(String(100))
    location = Column(String(200))
    deadline = Column(String(100))
    insurance_required = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("User", back_populates="order")
    category = relationship("CategoryWork")
    complaint_conversation = relationship(
        "ComplaintConversation",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    executor_order = relationship("ExecutorOrder", back_populates="order")


class OrderResponseExecutor(Base):
    __tablename__ = "orders_responses_executors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    proposed_price = Column(Numeric)
    budget_type = Column(String(20))
    currency = Column(String(100))
    estimated_time = Column(String(100))
    start_time_work = Column(String(10))
    message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order")
    executor = relationship("User")


class ExecutorOrder(Base):
    __tablename__ = "executors_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

    executor = relationship("User", back_populates="executor_order")
    order = relationship("Order", back_populates="executor_order")


class StatusOrderCustomer(Base):
    __tablename__ = "statuses_orders_customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    status = Column(String(100))


class StatusOrderExecutor(Base):
    __tablename__ = "statuses_orders_executors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    status = Column(String(100))


class InformationAboutCustomer(Base):
    __tablename__ = "information_about_customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    executor_id = Column(Integer, ForeignKey("users.id"))
    customer_id = Column(Integer, ForeignKey("users.id"))
    phone = Column(String(100))
    notification = Column(Text)

    customer = relationship("User", foreign_keys=[customer_id])
    executor = relationship("User", foreign_keys=[executor_id])


class InformationAboutExecutor(Base):
    __tablename__ = "information_about_executors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("users.id"))
    executor_id = Column(Integer, ForeignKey("users.id"))
    phone = Column(String(100))
    notification = Column(Text)

    customer = relationship("User", foreign_keys=[customer_id])
    executor = relationship("User", foreign_keys=[executor_id])


class GraphicOrderMaster(Base):
    __tablename__ = "graphics_orders_masters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    order_id = Column(Integer, ForeignKey("orders.id"))
    date_start = Column(DateTime(timezone=True))


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    reviewee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    rating = Column(Integer)
    comment = Column(Text)
    criteria_quality = Column(Integer)
    criteria_timeliness = Column(Integer)
    criteria_communication = Column(Integer)
    criteria_price = Column(Integer)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    reviewee = relationship("User", foreign_keys=[reviewee_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)
    is_read = Column(Boolean, default=False)
    order_id = Column(Integer)
    order_title = Column(String(255))
    executor_reaction = Column(String(100))
    acknowledged_at = Column(DateTime(timezone=True))
    action_path = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class CustomerOrderCancellation(Base):
    __tablename__ = "customer_order_cancellations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    status = Column(String(20), default="pending_executor")
    executor_comment = Column(Text)
    reason_type = Column(String(50))
    reason_text = Column(Text)
    refund_amount_customer = Column(Numeric(10, 2))
    refund_amount_executor = Column(Numeric(10, 2))
    admin_comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True))


class ExecutorOrderCancellation(Base):
    __tablename__ = "executor_order_cancellations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"))
    executor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    status = Column(String(20), default="pending_executor")
    customer_comment = Column(Text)
    reason_type = Column(String(50))
    reason_text = Column(Text)
    refund_amount_customer = Column(Numeric(10, 2))
    refund_amount_executor = Column(Numeric(10, 2))
    admin_comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True))
