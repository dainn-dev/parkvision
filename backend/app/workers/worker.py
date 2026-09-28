"""arq worker entrypoint: `arq app.workers.worker.WorkerSettings`."""

from arq import cron

from app.workers import jobs


class WorkerSettings:
    functions = [
        jobs.send_invite_email,
        jobs.vehicle_import,
        jobs.audit_export,
    ]
    cron_jobs = [
        cron(jobs.create_future_partitions, hour=0, minute=30),
        cron(jobs.expire_stale_commands, minute=set(range(60)), second=10),
        # Runs every ~15s so a stale edge device is flagged within ~20-35s.
        cron(jobs.mark_offline_devices, second={0, 15, 30, 45}),
        cron(jobs.cleanup_expired_sessions, hour=3, minute=15),
    ]
    redis_settings = jobs.redis_settings()
    max_jobs = 10
    job_timeout = 300
