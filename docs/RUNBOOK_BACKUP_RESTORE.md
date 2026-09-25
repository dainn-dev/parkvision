# Backup & Restore Runbook — `pgdata` / `s3data`

Covers the two stateful volumes of `backend/docker-compose.yml`: Postgres
(`pgdata`) and the LocalStack S3 store (`s3data`, event images). Run all
commands from `backend/`.

## Backup

Logical backup (preferred — consistent, version-independent):

```bash
# Postgres: custom-format dump of the app database
docker compose exec -T postgres \
  pg_dump -U postgres -Fc vehicle_mgmt > backups/vehicle_mgmt_$(date +%Y%m%d_%H%M).dump

# S3 objects: tar the volume (small files, presigned-key layout)
docker compose exec -T localstack \
  tar czf - -C /var/lib/localstack . > backups/s3data_$(date +%Y%m%d_%H%M).tar.gz
```

Physical backup (fast, only when Postgres can be stopped or `pg_basebackup`
is configured): snapshot the `pgdata` volume directory directly; never copy it
while Postgres is writing.

Retention: keep nightly dumps 14 days + weekly 12 weeks off-host.

## Restore

```bash
# 1. Postgres — restore into a fresh database
docker compose up -d postgres
docker compose exec -T postgres dropdb -U postgres --if-exists vehicle_mgmt
docker compose exec -T postgres createdb -U postgres vehicle_mgmt
docker compose exec -T postgres \
  pg_restore -U postgres -d vehicle_mgmt < backups/vehicle_mgmt_YYYYMMDD_HHMM.dump

# 2. S3 — unpack into the volume, then restart
docker compose exec -T localstack \
  sh -c 'tar xzf - -C /var/lib/localstack' < backups/s3data_YYYYMMDD_HHMM.tar.gz
docker compose restart localstack

# 3. Verify
docker compose exec postgres psql -U postgres -d vehicle_mgmt \
  -c "select count(*) from access_events;"
curl -s http://localhost:8000/readyz
```

## Notes

- `pgdata` also contains RLS roles (`vehicle_app`); dump includes them via
  `pg_dumpall --roles-only` if a full-cluster restore is needed.
- Event image rows store object keys — restoring S3 without the matching DB
  leaves orphaned objects; always restore both from the same backup window.
- Monthly `enforce_retention` drops old partitions — restores of dropped
  periods must re-create the partitions manually.
