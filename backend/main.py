"""
main.py
───────
FastAPI Entrypoint for the Legal Timeline Construction and Visualization API.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from api.routes import router as api_router
from config import settings
from db.base import engine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


# ── App Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: log configuration info
    logger.info("Starting Automatic Legal Timeline API...")
    logger.info("Database URL configured: %s", settings.database_url)
    yield
    # Shutdown: clean up engine pools
    logger.info("Shutting down API...")
    engine.dispose()


# ── App Initialization ────────────────────────────────────────────────────────

app = FastAPI(
    title="Automatic Legal Timeline API",
    description=(
        "Asynchronous REST API layer supporting text file ingestion, "
        "background temporal NLP processing, and visualizer-ready graph query."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ── CORS Middleware ───────────────────────────────────────────────────────────

# Permit requests from standard web app framework development servers
origins = [
    "http://localhost:3000",      # React (Create React App)
    "http://localhost:5173",      # Vite (React/Vue/Svelte)
    "http://localhost:8000",      # Swagger/Self
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception Handlers ────────────────────────────────────────────────────────

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error("Database error occurred: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "A database operation error occurred. Please verify transaction integrity.",
            "error_type": exc.__class__.__name__,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled server exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred.",
            "error_type": exc.__class__.__name__,
        },
    )


# ── Router Registration ───────────────────────────────────────────────────────

app.include_router(api_router)


# ── Root Endpoint ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "Welcome to the Automatic Legal Timeline Construction API",
        "documentation": "/docs",
        "status": "healthy",
    }
