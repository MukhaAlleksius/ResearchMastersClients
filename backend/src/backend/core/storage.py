"""File storage: local filesystem (dev / single node) or S3-compatible (prod / multi-instance)."""  # Хранилище файлов: диск или S3

from __future__ import annotations  # Отложенные аннотации

import logging  # Логи выбора бэкенда
import mimetypes  # Угадывание Content-Type
import os  # (оставлено для совместимости окружения)
from abc import ABC, abstractmethod  # Абстрактный интерфейс хранилища
from pathlib import Path  # Локальные пути
from typing import BinaryIO  # Тип тела ответа S3

logger = logging.getLogger(__name__)  # Логгер модуля


class StorageBackend(ABC):  # Общий интерфейс: save/read/delete/exists/list
    @abstractmethod
    def save(self, key: str, data: bytes) -> None: ...  # Сохранить байты по ключу

    @abstractmethod
    def read(self, key: str) -> bytes | None: ...  # Прочитать или None

    @abstractmethod
    def delete(self, key: str) -> None: ...  # Удалить

    @abstractmethod
    def exists(self, key: str) -> bool: ...  # Есть ли объект

    @abstractmethod
    def list_keys(self, prefix: str = "") -> list[str]: ...  # Список ключей с префиксом

    def guess_media_type(self, key: str) -> str:  # MIME по расширению ключа
        media_type, _ = mimetypes.guess_type(key)  # Стандартная таблица MIME
        return media_type or "application/octet-stream"  # Запасной бинарный тип


class LocalStorage(StorageBackend):  # Хранение на локальном диске
    def __init__(self, root: str | Path) -> None:  # Корневая папка хранилища
        self.root = Path(root).resolve()  # Абсолютный корень
        self.root.mkdir(parents=True, exist_ok=True)  # Создаём, если нет

    def _resolve(self, key: str) -> Path:  # Безопасный путь внутри root (без path traversal)
        key = key.replace("\\", "/").lstrip("/")  # Нормализуем ключ
        path = (self.root / key).resolve()  # Полный путь
        if self.root not in path.parents and path != self.root:  # Вышли за пределы root
            raise ValueError(f"Invalid storage key: {key}")  # Запрет
        return path  # Валидный путь

    def save(self, key: str, data: bytes) -> None:  # Запись файла
        path = self._resolve(key)  # Куда писать
        path.parent.mkdir(parents=True, exist_ok=True)  # Создаём подпапки
        path.write_bytes(data)  # Пишем байты

    def read(self, key: str) -> bytes | None:  # Чтение файла
        path = self._resolve(key)
        if not path.is_file():  # Нет файла
            return None
        return path.read_bytes()  # Содержимое

    def delete(self, key: str) -> None:  # Удаление
        path = self._resolve(key)
        if path.is_file():
            path.unlink()  # Удаляем файл

    def exists(self, key: str) -> bool:  # Проверка существования
        return self._resolve(key).is_file()

    def list_keys(self, prefix: str = "") -> list[str]:  # Все файлы под префиксом
        prefix = prefix.replace("\\", "/").lstrip("/")
        base = self._resolve(prefix) if prefix else self.root  # Базовая папка/файл
        if not base.exists():
            return []
        if base.is_file():  # Префикс указывает на один файл
            return [prefix]
        keys: list[str] = []
        for path in base.rglob("*"):  # Рекурсивно все пути
            if path.is_file():
                rel = path.relative_to(self.root).as_posix()  # Ключ относительно root
                keys.append(rel)
        return keys

    def iter_subdirs(self, prefix: str = "") -> list[str]:  # Имена подпапок одного уровня
        prefix = prefix.replace("\\", "/").lstrip("/")
        base = self._resolve(prefix) if prefix else self.root
        if not base.is_dir():
            return []
        return [p.name for p in base.iterdir() if p.is_dir()]  # Только директории


class S3Storage(StorageBackend):  # S3-совместимое хранилище
    def __init__(
        self,
        *,
        bucket: str,  # Имя бакета
        prefix: str = "",  # Префикс «папки» внутри бакета
        endpoint_url: str | None = None,  # Кастомный endpoint (MinIO и т.п.)
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        use_path_style: bool = True,  # Path-style для совместимости
    ) -> None:
        import boto3  # Клиент AWS S3
        from botocore.config import Config  # Конфиг addressing_style

        self.bucket = bucket  # Бакет
        self.prefix = prefix.strip("/")  # Префикс без слэшей по краям
        self._client = boto3.client(  # Клиент S3
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(s3={"addressing_style": "path" if use_path_style else "auto"}),
        )

    def _object_key(self, key: str) -> str:  # Полный ключ объекта = prefix + key
        key = key.replace("\\", "/").lstrip("/")
        if self.prefix:
            return f"{self.prefix}/{key}"
        return key

    def save(self, key: str, data: bytes) -> None:  # put_object
        object_key = self._object_key(key)
        media_type = self.guess_media_type(key)  # Content-Type
        self._client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=data,
            ContentType=media_type,
        )

    def read(self, key: str) -> bytes | None:  # get_object или None если нет
        from botocore.exceptions import ClientError

        object_key = self._object_key(key)
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=object_key)
            body: BinaryIO = response["Body"]  # Поток тела
            return body.read()  # Байты
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:  # Нет объекта
                return None
            raise  # Другие ошибки S3 — наружу

    def delete(self, key: str) -> None:  # delete_object
        object_key = self._object_key(key)
        self._client.delete_object(Bucket=self.bucket, Key=object_key)

    def exists(self, key: str) -> bool:  # head_object
        object_key = self._object_key(key)
        try:
            self._client.head_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:  # Нет или ошибка доступа → считаем отсутствующим
            return False

    def list_keys(self, prefix: str = "") -> list[str]:  # Список ключей с пагинацией
        full_prefix = self._object_key(prefix)
        if full_prefix and not full_prefix.endswith("/"):
            full_prefix += "/"  # Как «папка»

        keys: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix):
            for item in page.get("Contents", []):
                object_key = item["Key"]
                if self.prefix and object_key.startswith(f"{self.prefix}/"):
                    rel = object_key[len(self.prefix) + 1 :]  # Отрезаем namespace prefix
                else:
                    rel = object_key
                keys.append(rel)
        return keys

    def iter_subdirs(self, prefix: str = "") -> list[str]:  # «Папки» через Delimiter=/
        full_prefix = self._object_key(prefix)
        if full_prefix and not full_prefix.endswith("/"):
            full_prefix += "/"

        names: set[str] = set()
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix, Delimiter="/"):
            for entry in page.get("CommonPrefixes", []):
                sub = entry["Prefix"][len(full_prefix) :].strip("/")  # Имя подпрефикса
                if sub:
                    names.add(sub.split("/")[0])  # Первый сегмент
        return sorted(names)


def _build_backend(local_root: str, namespace: str) -> StorageBackend:  # Фабрика local/s3 по конфигу
    from core.config import (
        FILE_STORAGE_BACKEND,
        S3_ACCESS_KEY,
        S3_BUCKET,
        S3_ENDPOINT_URL,
        S3_REGION,
        S3_SECRET_KEY,
        S3_USE_PATH_STYLE,
    )

    if FILE_STORAGE_BACKEND == "s3":  # Режим S3
        if not all([S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY]):  # Не хватает ключей
            raise RuntimeError(
                "FILE_STORAGE_BACKEND=s3 requires S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY"
            )
        logger.info("Using S3 storage for namespace=%s bucket=%s", namespace, S3_BUCKET)
        return S3Storage(
            bucket=S3_BUCKET,
            prefix=namespace,  # avatars / portfolio / uploads
            endpoint_url=S3_ENDPOINT_URL or None,
            access_key=S3_ACCESS_KEY,
            secret_key=S3_SECRET_KEY,
            region=S3_REGION,
            use_path_style=S3_USE_PATH_STYLE,
        )

    return LocalStorage(local_root)  # По умолчанию — локальная папка


def get_avatar_storage() -> StorageBackend:  # Хранилище аватаров
    from core.config import UPLOAD_DIR

    return _build_backend(UPLOAD_DIR, "avatars")


def get_portfolio_storage() -> StorageBackend:  # Хранилище портфолио
    from core.config import PORTFOLIO_DIR

    return _build_backend(PORTFOLIO_DIR, "portfolio")


def get_uploads_storage() -> StorageBackend:  # Общие uploads
    from core.config import UPLOADS_FOLDER

    return _build_backend(UPLOADS_FOLDER, "uploads")


def find_avatar_key(user_id: int) -> str | None:  # Найти ключ аватара пользователя
    storage = get_avatar_storage()
    prefix = f"{user_id}_"  # Файлы вида {id}_...
    for key in storage.list_keys(""):
        filename = key.rsplit("/", 1)[-1]  # Имя файла без папок
        if filename.startswith(prefix):
            return key  # Первый найденный
    return None


def delete_avatar_files(user_id: int) -> None:  # Удалить все аватары пользователя
    storage = get_avatar_storage()
    prefix = f"{user_id}_"
    for key in storage.list_keys(""):
        filename = key.rsplit("/", 1)[-1]
        if filename.startswith(prefix):
            storage.delete(key)  # Удаляем каждый подходящий ключ
