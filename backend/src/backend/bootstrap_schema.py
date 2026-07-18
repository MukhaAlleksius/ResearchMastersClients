"""Bootstrap empty Postgres for Docker when Alembic history has an empty initial revision."""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import inspect

from core.database import Base, engine
from core.models_loader import load_all_models


def _needs_bootstrap(sync_conn) -> bool:
    inspector = inspect(sync_conn)
    return not inspector.has_table("user_profiles")


async def main() -> int:
    load_all_models()
    async with engine.begin() as conn:
        if await conn.run_sync(_needs_bootstrap):
            await conn.run_sync(Base.metadata.create_all)
            print("created")
            return 0
    print("exists")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as exc:  # noqa: BLE001
        print(f"bootstrap failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
