"""Shared validation for uploaded image files."""  # Общая проверка загружаемых картинок

from __future__ import annotations  # Отложенные аннотации

import io  # BytesIO для Pillow

from fastapi import HTTPException, status  # HTTP-ошибки 400
from PIL import Image  # Проверка, что байты — реальное изображение

ALLOWED_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})  # Разрешённые расширения
ALLOWED_IMAGE_FORMATS = frozenset({"PNG", "JPEG", "GIF", "WEBP"})  # Разрешённые форматы Pillow
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # Макс. размер аватара — 5 МБ
MAX_PORTFOLIO_BYTES = 10 * 1024 * 1024  # Макс. размер картинки портфолио — 10 МБ
MAX_IMAGE_PIXELS = 4096 * 4096  # Макс. ширина*высота (защита от decompression bomb)


def sanitize_filename(filename: str) -> str:  # Очищает имя файла от опасных символов
    safe = "".join(c for c in filename if c.isalnum() or c in ".-_ ").strip()  # Только безопасные символы
    if not safe:  # После очистки пусто
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")  # Ошибка клиенту
    return safe  # Безопасное имя


def assert_allowed_image_extension(filename: str) -> None:  # Проверяет расширение файла
    lower = filename.lower()  # Имя в нижнем регистре
    if not any(lower.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS):  # Расширение не из списка
        raise HTTPException(  # 400
            status_code=400,
            detail="Допустимы только изображения: PNG, JPG, JPEG, WEBP, GIF",
        )


def validate_image_bytes(  # Проверяет размер и содержимое изображения
    content: bytes,  # Байты файла
    *,
    max_bytes: int,  # Лимит размера
    label: str = "Файл",  # Подпись в тексте ошибки
) -> None:
    if not content:  # Пустой файл
        raise HTTPException(status_code=400, detail=f"{label} пустой")
    if len(content) > max_bytes:  # Слишком большой
        max_mb = max_bytes // (1024 * 1024)  # Лимит в мегабайтах для сообщения
        raise HTTPException(
            status_code=400,
            detail=f"{label} слишком большой (макс. {max_mb} МБ)",
        )

    try:
        Image.open(io.BytesIO(content)).verify()  # Быстрая проверка целостности файла
        with Image.open(io.BytesIO(content)) as image:  # Открываем снова для чтения метаданных
            image.load()  # Полная загрузка в память
            if image.format not in ALLOWED_IMAGE_FORMATS:  # Формат не из whitelist
                raise HTTPException(
                    status_code=400,
                    detail="Неподдерживаемый формат изображения",
                )
            width, height = image.size  # Размеры
            if width * height > MAX_IMAGE_PIXELS:  # Слишком много пикселей
                raise HTTPException(
                    status_code=400,
                    detail="Изображение слишком большое по разрешению",
                )
    except HTTPException:  # Наши 400 пробрасываем как есть
        raise
    except Exception as exc:  # Любая ошибка Pillow/парсинга
        raise HTTPException(  # Отдаём клиенту «некорректное изображение»
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректное изображение",
        ) from exc
