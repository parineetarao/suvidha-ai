import logging
import sys

from app.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    # force=True: uvicorn installs its own root-logger handlers (via
    # dictConfig) before this runs, which makes a plain basicConfig() a
    # silent no-op — basicConfig only touches the root logger if it has no
    # handlers yet. Without force=True, every app-level logger.info() call
    # (e.g. sms_service's mock-OTP log line, the one thing a dev relies on
    # to log in during local testing) gets swallowed below uvicorn's
    # default WARNING root level, with no error to indicate why.
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )
