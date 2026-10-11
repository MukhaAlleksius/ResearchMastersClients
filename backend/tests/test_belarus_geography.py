import json
from pathlib import Path


GEOGRAPHY_PATH = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "backend"
    / "data"
    / "belarus_geography.json"
)


def test_belarus_geography_lists_cities_and_urban_settlements():
    data = json.loads(GEOGRAPHY_PATH.read_text(encoding="utf-8"))
    belarus = data["Беларусь"]

    assert list(belarus) == [
        "г. Минск",
        "Брестская область",
        "Витебская область",
        "Гомельская область",
        "Гродненская область",
        "Минская область",
        "Могилёвская область",
    ]
    assert belarus["г. Минск"] == ["Минск"]
    assert len(belarus["Брестская область"]) == 29
    assert len(belarus["Витебская область"]) == 41
    assert len(belarus["Гомельская область"]) == 33
    assert len(belarus["Гродненская область"]) == 31
    assert len(belarus["Минская область"]) == 42
    assert len(belarus["Могилёвская область"]) == 23

    flat = [name for towns in belarus.values() for name in towns]
    assert len(flat) == 200
    assert "Борисов" in belarus["Минская область"]
    assert "Антополь" in belarus["Брестская область"]
    assert "Боровуха" not in flat
    assert "Костюковка" not in flat

    for towns in belarus.values():
        keys = [name.lower().replace("ё", "е") for name in towns]
        assert len(keys) == len(set(keys))
