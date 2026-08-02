"""Minimal .env loader (no third-party dependency)."""  # Описание модуля: простой загрузчик .env без сторонних пакетов

from __future__ import annotations  # Отложенная оценка аннотаций типов

import os  # Доступ к переменным окружения
from pathlib import Path  # Удобная работа с путями к файлам


def load_env_file() -> None:  # Ищет и загружает .env в os.environ
    explicit = os.getenv("ENV_FILE")  # Путь к .env, если задан явно
    if explicit:  # Если ENV_FILE указан
        path = Path(explicit)  # Превращаем строку в Path
        if path.is_file():  # Файл существует
            _parse_env_file(path)  # Читаем переменные из файла
            return  # Дальше не ищем

    seen: set[Path] = set()  # Уже просмотренные каталоги (без циклов)
    candidates: list[Path] = []  # Каталоги, где есть .env.example, но ещё нет .env

    for start in (Path.cwd(), Path(__file__).resolve()):  # Старт: текущая папка и папка этого файла
        for directory in (start, *start.parents):  # Идём вверх по родителям
            if directory in seen:  # Уже смотрели этот каталог
                continue  # Пропускаем
            seen.add(directory)  # Запоминаем каталог
            if (directory / ".env.example").is_file():  # Нашли корень проекта по .env.example
                env_path = directory / ".env"  # Ожидаемый путь к .env
                if env_path.is_file():  # .env есть — загружаем сразу
                    _parse_env_file(env_path)  # Парсим .env
                    return  # Готово
                candidates.append(directory)  # Иначе запомним как запасной вариант

    for directory in candidates:  # Повторный проход по кандидатам
        env_path = directory / ".env"  # Путь к .env в кандидате
        if env_path.is_file():  # Если файл появился/нашёлся
            _parse_env_file(env_path)  # Загружаем
            return  # Выходим после первой удачной загрузки


def _parse_env_file(path: Path) -> None:  # Внутренний парсер KEY=VALUE из файла
    for raw_line in path.read_text(encoding="utf-8").splitlines():  # Читаем файл построчно
        line = raw_line.strip()  # Убираем пробелы по краям
        if not line or line.startswith("#"):  # Пустая строка или комментарий
            continue  # Пропускаем
        if line.startswith("export "):  # Синтаксис shell: export KEY=...
            line = line[7:].strip()  # Срезаем префикс export
        if "=" not in line:  # Нет разделителя ключ=значение
            continue  # Невалидная строка
        key, _, value = line.partition("=")  # Делим на ключ и значение
        key = key.strip()  # Чистим ключ
        if not key or key in os.environ:  # Пустой ключ или уже задан в окружении (не перезаписываем)
            continue  # Пропускаем
        value = value.strip()  # Чистим значение
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:  # Значение в кавычках
            value = value[1:-1]  # Снимаем кавычки
        os.environ[key] = value  # Кладём переменную в окружение процесса
