import bcrypt

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(
        plain_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def _looks_like_bcrypt(stored: str) -> bool:
    return stored.startswith(_BCRYPT_PREFIXES)


def verify_password(plain_password: str, stored_hash: str) -> tuple[bool, str | None]:
    """Verify password. Returns (ok, upgraded_hash) for legacy plain-text migration."""
    if not stored_hash:
        return False, None

    if _looks_like_bcrypt(stored_hash):
        try:
            ok = bcrypt.checkpw(
                plain_password.encode("utf-8"),
                stored_hash.encode("utf-8"),
            )
        except ValueError:
            return False, None
        return ok, None

    # Legacy: password stored as plain text — accept once and return bcrypt hash.
    if stored_hash == plain_password:
        return True, hash_password(plain_password)

    return False, None
