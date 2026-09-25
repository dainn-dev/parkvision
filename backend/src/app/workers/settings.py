"""arq worker settings — `arq app.workers.settings.WorkerSettings`."""

from typing import ClassVar

from arq import cron
from arq.connections import RedisSettings

from app.config import get_settings
from app.workers import jobs

settings = get_settings()


class WorkerSettings:
    functions: ClassVar[list] = [
        jobs.send_email,
        jobs.process_vehicle_import,
        jobs.audit_export,
        jobs.device_offline_check,
        jobs.image_retention,
    ]
    cron_jobs: ClassVar[list] = [
        cron(jobs.create_future_partitions, hour=3, minute=0),
        cron(jobs.device_offline_check, minute={0, 15, 30, 45}),
        cron(jobs.image_retention, hour=4, minute=30, weekday=0),
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 8
    job_timeout = 600
