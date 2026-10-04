from datetime import date, datetime

from core.future_dates import is_listing_expired, listing_end_date, parse_user_date


def test_week_and_month_listing_end_from_start():
    started = datetime(2026, 9, 19, 12, 0, 0)
    assert listing_end_date("В течение недели", start_at=started) == date(2026, 9, 26)
    assert listing_end_date("В течение месяца", start_at=started) == date(2026, 10, 19)


def test_exact_date_listing_end():
    assert listing_end_date("25.09.2026") == date(2026, 9, 25)
    assert listing_end_date("2026-09-25") == date(2026, 9, 25)


def test_asap_has_no_listing_end():
    started = datetime(2026, 9, 19, 12, 0, 0)
    assert listing_end_date("Как можно скорее", start_at=started) is None
    assert is_listing_expired("Как можно скорее", start_at=started) is False


def test_listing_expires_the_day_after_end():
    started = datetime(2026, 9, 19, 12, 0, 0)
    assert (
        is_listing_expired(
            "В течение недели", start_at=started, today=date(2026, 9, 26)
        )
        is False
    )
    assert (
        is_listing_expired(
            "В течение недели", start_at=started, today=date(2026, 9, 27)
        )
        is True
    )
    assert is_listing_expired("20.09.2026", today=date(2026, 9, 20)) is False
    assert is_listing_expired("20.09.2026", today=date(2026, 9, 21)) is True


def test_parse_user_date_formats():
    assert parse_user_date("20.09.2026") == date(2026, 9, 20)
    assert parse_user_date("2026-09-20") == date(2026, 9, 20)
    assert parse_user_date("2026-09-20T12:00:00") == date(2026, 9, 20)
    assert parse_user_date("2026-09-20T12:00:00Z") == date(2026, 9, 20)
