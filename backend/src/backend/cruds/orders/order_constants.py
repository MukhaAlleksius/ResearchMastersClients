from typing import Optional  # Тип для необязательной строки

HIDDEN_CUSTOMER_EXECUTOR_MARKER = "__hidden_from_list__"  # Маркер скрытого телефона исполнителя в списке


def is_hidden_customer_executor_phone(phone: Optional[str]) -> bool:  # Проверка, что телефон — служебный маркер
    return phone == HIDDEN_CUSTOMER_EXECUTOR_MARKER  # Сравнение с константой-маркером
