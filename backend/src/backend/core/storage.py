"""File storage: local filesystem (dev / single node) or S3-compatible (prod / multi-instance)."""

from __future__ import annotations

import logging
import mimetypes
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def read(self, key: str) -> bytes | None: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def list_keys(self, prefix: str = "") -> list[str]: ...

    def guess_media_type(self, key: str) -> str:
        media_type, _ = mimetypes.guess_type(key)
        return media_type or "application/octet-stream"


class LocalStorage(StorageBackend):
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        key = key.replace("\\", "/").lstrip("/")
        path = (self.root / key).resolve()
        if self.root not in path.parents and path != self.root:
            raise ValueError(f"Invalid storage key: {key}")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes | None:
        path = self._resolve(key)
        if not path.is_file():
            return None
        return path.read_bytes()

    def delete(self, key: str) -> None:
        path = self._resolve(key)
        if path.is_file():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._resolve(key).is_file()

    def list_keys(self, prefix: str = "") -> list[str]:
        prefix = prefix.replace("\\", "/").lstrip("/")
        base = self._resolve(prefix) if prefix else self.root
        if not base.exists():
            return []
        if base.is_file():
            return [prefix]
        keys: list[str] = []
        for path in base.rglob("*"):
            if path.is_file():
                rel = path.relative_to(self.root).as_posix()
                keys.append(rel)
        return keys

    def iter_subdirs(self, prefix: str = "") -> list[str]:
        prefix = prefix.replace("\\", "/").lstrip("/")
        base = self._resolve(prefix) if prefix else self.root
        if not base.is_dir():
            return []
        return [p.name for p in base.iterdir() if p.is_dir()]


class S3Storage(StorageBackend):
    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = "",
        endpoint_url: str | None = None,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        use_path_style: bool = True,
    ) -> None:
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(s3={"addressing_style": "path" if use_path_style else "auto"}),
        )

    def _object_key(self, key: str) -> str:
        key = key.replace("\\", "/").lstrip("/")
        if self.prefix:
            return f"{self.prefix}/{key}"
        return key

    def save(self, key: str, data: bytes) -> None:
        object_key = self._object_key(key)
        media_type = self.guess_media_type(key)
        self._client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=data,
            ContentType=media_type,
        )

    def read(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        object_key = self._object_key(key)
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=object_key)
            body: BinaryIO = response["Body"]
            return body.read()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise

    def delete(self, key: str) -> None:
        object_key = self._object_key(key)
        self._client.delete_object(Bucket=self.bucket, Key=object_key)

    def exists(self, key: str) -> bool:
        object_key = self._object_key(key)
        try:
            self._client.head_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:
            return False

    def list_keys(self, prefix: str = "") -> list[str]:
        full_prefix = self._object_key(prefix)
        if full_prefix and not full_prefix.endswith("/"):
            full_prefix += "/"

        keys: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix):
            for item in page.get("Contents", []):
                object_key = item["Key"]
                if self.prefix and object_key.startswith(f"{self.prefix}/"):
                    rel = object_key[len(self.prefix) + 1 :]
                else:
                    rel = object_key
                keys.append(rel)
        return keys

    def iter_subdirs(self, prefix: str = "") -> list[str]:
        full_prefix = self._object_key(prefix)
        if full_prefix and not full_prefix.endswith("/"):
            full_prefix += "/"

        names: set[str] = set()
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix, Delimiter="/"):
            for entry in page.get("CommonPrefixes", []):
                sub = entry["Prefix"][len(full_prefix) :].strip("/")
                if sub:
                    names.add(sub.split("/")[0])
        return sorted(names)


def _build_backend(local_root: str, namespace: str) -> StorageBackend:
    from core.config import (
        FILE_STORAGE_BACKEND,
        S3_ACCESS_KEY,
        S3_BUCKET,
        S3_ENDPOINT_URL,
        S3_REGION,
        S3_SECRET_KEY,
        S3_USE_PATH_STYLE,
    )

    if FILE_STORAGE_BACKEND == "s3":
        if not all([S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY]):
            raise RuntimeError(
                "FILE_STORAGE_BACKEND=s3 requires S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY"
            )
        logger.info("Using S3 storage for namespace=%s bucket=%s", namespace, S3_BUCKET)
        return S3Storage(
            bucket=S3_BUCKET,
            prefix=namespace,
            endpoint_url=S3_ENDPOINT_URL or None,
            access_key=S3_ACCESS_KEY,
            secret_key=S3_SECRET_KEY,
            region=S3_REGION,
            use_path_style=S3_USE_PATH_STYLE,
        )

    return LocalStorage(local_root)


def get_avatar_storage() -> StorageBackend:
    from core.config import UPLOAD_DIR

    return _build_backend(UPLOAD_DIR, "avatars")


def get_portfolio_storage() -> StorageBackend:
    from core.config import PORTFOLIO_DIR

    return _build_backend(PORTFOLIO_DIR, "portfolio")


def get_uploads_storage() -> StorageBackend:
    from core.config import UPLOADS_FOLDER

    return _build_backend(UPLOADS_FOLDER, "uploads")


def find_avatar_key(user_id: int) -> str | None:
    storage = get_avatar_storage()
    prefix = f"{user_id}_"
    for key in storage.list_keys(""):
        filename = key.rsplit("/", 1)[-1]
        if filename.startswith(prefix):
            return key
    return None


def delete_avatar_files(user_id: int) -> None:
    storage = get_avatar_storage()
    prefix = f"{user_id}_"
    for key in storage.list_keys(""):
        filename = key.rsplit("/", 1)[-1]
        if filename.startswith(prefix):
            storage.delete(key)
