"""Shared validation for uploaded image files."""

from __future__ import annotations

import io

from fastapi import HTTPException, status
from PIL import Image

ALLOWED_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
ALLOWED_IMAGE_FORMATS = frozenset({"PNG", "JPEG", "GIF", "WEBP"})
MAX_AVATAR_BYTES = 5 * 1024 * 1024
MAX_PORTFOLIO_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 4096 * 4096


def sanitize_filename(filename: str) -> str:
    safe = "".join(c for c in filename if c.isalnum() or c in ".-_ ").strip()
    if not safe:
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")
    return safe


def assert_allowed_image_extension(filename: str) -> None:
    lower = filename.lower()
    if not any(lower.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Допустимы только изображения: PNG, JPG, JPEG, WEBP, GIF",
        )


def validate_image_bytes(
    content: bytes,
    *,
    max_bytes: int,
    label: str = "Файл",
) -> None:
    if not content:
        raise HTTPException(status_code=400, detail=f"{label} пустой")
    if len(content) > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"{label} слишком большой (макс. {max_mb} МБ)",
        )

    try:
        Image.open(io.BytesIO(content)).verify()
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            if image.format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=400,
                    detail="Неподдерживаемый формат изображения",
                )
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=400,
                    detail="Изображение слишком большое по разрешению",
                )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректное изображение",
        ) from exc
