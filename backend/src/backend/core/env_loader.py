"""Minimal .env loader (no third-party dependency)."""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file() -> None:
    explicit = os.getenv("ENV_FILE")
    if explicit:
        path = Path(explicit)
        if path.is_file():
            _parse_env_file(path)
            return

    seen: set[Path] = set()
    candidates: list[Path] = []

    for start in (Path.cwd(), Path(__file__).resolve()):
        for directory in (start, *start.parents):
            if directory in seen:
                continue
            seen.add(directory)
            if (directory / ".env.example").is_file():
                env_path = directory / ".env"
                if env_path.is_file():
                    _parse_env_file(env_path)
                    return
                candidates.append(directory)

    for directory in candidates:
        env_path = directory / ".env"
        if env_path.is_file():
            _parse_env_file(env_path)
            return


def _parse_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ[key] = value
