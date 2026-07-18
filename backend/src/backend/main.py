import logging
import os
import time

try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager

from fastapi.staticfiles import StaticFiles

from routers import estimate_graphic_works_router, payments_router
from routers import works_materials_router
from routers import geography_router
from core.config import (
    AUTO_CREATE_DB,
    CORS_ORIGINS,
    ENVIRONMENT,
    FILE_STORAGE_BACKEND,
    IS_PRODUCTION,
    LOG_LEVEL,
    LOG_VERBOSE_REQUESTS,
    PORTFOLIO_DIR,
    SENTRY_DSN,
    SENTRY_TRACES_SAMPLE_RATE,
)
from core.database import check_connection, init_db
from core.error_responses import public_exception_detail, public_http_detail
from core.logging_setup import configure_logging, init_sentry, log_request_end, log_request_start
from core.uptime_alerts import maybe_send_health_alert
from core.models_loader import load_all_models
from core.rate_limit import check_rate_limit
from routers import users_router
from routers import contracts_router
from routers import conversations_router

from routers.analitycs import analitycs_router
from routers import currency_router, notifications_router
from cruds.currency.nbrb_rates import preload_nbrb_rates
from core.database import async_session_maker
from routers.orders import (
    delete_orders_routers,
    get_orders_routers,
    post_orders_routers,
    put_orders_routers,
)  # noqa: F401

configure_logging(level_name=LOG_LEVEL, is_production=IS_PRODUCTION)
init_sentry(
    dsn=SENTRY_DSN,
    environment=ENVIRONMENT,
    traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
)
logger = logging.getLogger(__name__)
_APP_STARTED_AT = time.monotonic()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        load_all_models()
        if AUTO_CREATE_DB:
            await init_db()
            logger.info("Database tables ensured via create_all (development only).")
        else:
            logger.info(
                "AUTO_CREATE_DB=false; schema is managed by Alembic migrations."
            )

        async with async_session_maker() as session:
            await preload_nbrb_rates(session)
            await session.commit()
    except Exception as e:
        logger.error("Database initialization failed: %s", e)
        raise

    yield
    logger.info("Application shutdown complete.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router.router)
app.include_router(post_orders_routers.router)
app.include_router(get_orders_routers.router)
app.include_router(put_orders_routers.router)
app.include_router(delete_orders_routers.router)
app.include_router(geography_router.router)
app.include_router(works_materials_router.router)
app.include_router(estimate_graphic_works_router.router)
app.include_router(contracts_router.router)
app.include_router(conversations_router.router)
app.include_router(payments_router.router)
app.include_router(analitycs_router.router)
app.include_router(currency_router.router)
app.include_router(notifications_router.router)

os.makedirs(PORTFOLIO_DIR, exist_ok=True)

if FILE_STORAGE_BACKEND == "local":
    app.mount("/portfolio", StaticFiles(directory=PORTFOLIO_DIR), name="portfolio")
else:
    from core.storage import get_portfolio_storage

    @app.get("/portfolio/{file_path:path}")
    async def serve_portfolio_from_object_storage(file_path: str):
        storage = get_portfolio_storage()
        data = storage.read(file_path)
        if data is None:
            raise HTTPException(status_code=404, detail="File not found")
        return Response(
            content=data,
            media_type=storage.guess_media_type(file_path),
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        logger.error(
            "HTTP %s on %s %s: %s",
            exc.status_code,
            request.method,
            request.url.path,
            exc.detail,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": public_http_detail(exc.status_code, exc.detail)},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error for %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": public_exception_detail(exc)},
    )


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    check_rate_limit(request)
    verbose = LOG_VERBOSE_REQUESTS and not IS_PRODUCTION
    log_request_start(request, verbose=verbose)
    response = await call_next(request)
    log_request_end(request, response, verbose=verbose)
    return response


@app.get("/health")
async def health():
    db_ok = await check_connection()
    healthy = db_ok
    status_code = 200 if healthy else 503
    detail = "ok" if healthy else "database unavailable"
    maybe_send_health_alert(healthy=healthy, detail=detail)
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if healthy else "degraded",
            "database": db_ok,
            "environment": ENVIRONMENT,
            "uptime_seconds": int(time.monotonic() - _APP_STARTED_AT),
        },
    )


@app.get("/")
async def root():
    return {"status": "ok"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error on %s: %s", request.url.path, exc.errors())
    body = exc.body if not IS_PRODUCTION else None
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder({"detail": exc.errors(), "body": body}),
    )
