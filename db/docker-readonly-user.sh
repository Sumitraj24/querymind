#!/bin/sh
# Run by docker-compose.yml on first start: creates the read-only user (dev password only).
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ro_password="'readonly_dev_password'" \
  -f /querymind/create-readonly-user.sql
