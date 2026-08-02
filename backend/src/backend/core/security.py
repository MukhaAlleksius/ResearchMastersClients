import bcrypt  # Библиотека хеширования паролей

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")  # Типичные префиксы bcrypt-хешей


def hash_password(plain_password: str) -> str:  # Хеширует пароль для хранения в БД
    return bcrypt.hashpw(  # Считает bcrypt-хеш
        plain_password.encode("utf-8"), bcrypt.gensalt()  # Пароль в байты + случайная соль
    ).decode("utf-8")  # Возвращаем строку UTF-8


def _looks_like_bcrypt(stored: str) -> bool:  # Проверяет, похожа ли строка на bcrypt-хеш
    return stored.startswith(_BCRYPT_PREFIXES)  # True, если начинается с известного префикса


def verify_password(plain_password: str, stored_hash: str) -> tuple[bool, str | None]:  # Сверяет пароль с сохранённым значением
    """Verify password. Returns (ok, upgraded_hash) for legacy plain-text migration."""  # ok + новый хеш при миграции со старого plain-текста
    if not stored_hash:  # В БД пусто
        return False, None  # Пароль неверный

    if _looks_like_bcrypt(stored_hash):  # Обычный современный случай — bcrypt
        try:
            ok = bcrypt.checkpw(  # Сравниваем пароль с хешем
                plain_password.encode("utf-8"),  # Введённый пароль
                stored_hash.encode("utf-8"),  # Хеш из БД
            )
        except ValueError:  # Битый/невалидный хеш
            return False, None  # Считаем ошибкой проверки
        return ok, None  # ok=True/False, апгрейд не нужен

    # Legacy: password stored as plain text — accept once and return bcrypt hash.
    if stored_hash == plain_password:  # Старый формат: пароль лежал открытым текстом
        return True, hash_password(plain_password)  # Пускаем и отдаём новый bcrypt для записи в БД

    return False, None  # Не совпало
