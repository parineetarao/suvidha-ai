import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app

settings = get_settings()
TEST_DB_NAME = f"{settings.postgres_db}_test"
TEST_DATABASE_URL = settings.database_url.rsplit("/", 1)[0] + f"/{TEST_DB_NAME}"


def _ensure_test_database_exists() -> None:
    """Tests run against a dedicated `<db>_test` database, never the real
    dev/prod one. Postgres has no `CREATE DATABASE IF NOT EXISTS`, so check
    pg_database first."""
    admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": TEST_DB_NAME},
        ).first()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def engine():
    _ensure_test_database_exists()
    test_engine = create_engine(TEST_DATABASE_URL)
    with test_engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture()
def db_session(engine):
    """Each test gets its own transaction, rolled back on teardown — so
    tests never leak state into each other, even if the code under test
    calls session.commit() (create_savepoint keeps that from ending the
    outer transaction early)."""
    connection = engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(
        bind=connection, join_transaction_mode="create_savepoint"
    )
    session = TestingSessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    """TestClient with `get_db` overridden to the same per-test session."""

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
