"""Compatibility wrapper for the participation-event backfill command.

Prefer running:

    uv run python -m app.core.backfill_participation_events [--window-days 7] [--apply]

This wrapper keeps the old script path usable when PYTHONPATH is configured.
"""

from app.core.backfill_participation_events import main


if __name__ == "__main__":
    main()
