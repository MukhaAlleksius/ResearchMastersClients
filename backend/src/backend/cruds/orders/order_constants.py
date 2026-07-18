from typing import Optional

HIDDEN_CUSTOMER_EXECUTOR_MARKER = "__hidden_from_list__"


def is_hidden_customer_executor_phone(phone: Optional[str]) -> bool:
    return phone == HIDDEN_CUSTOMER_EXECUTOR_MARKER
