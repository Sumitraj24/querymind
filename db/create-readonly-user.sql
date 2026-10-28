-- Create a least-privilege, read-only PostgreSQL user for QueryMind.
-- Run as a database owner/admin while connected to the database QueryMind should read:
--   psql "$ADMIN_DATABASE_URL" -v ro_password="'choose-a-strong-password'" -f db/create-readonly-user.sql
-- (In psql the -v value must include the single quotes, as shown.)

CREATE ROLE querymind_readonly LOGIN PASSWORD :ro_password
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- Every session for this user is read-only by default.
ALTER ROLE querymind_readonly SET default_transaction_read_only = on;
ALTER ROLE querymind_readonly SET statement_timeout = '15s';

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO querymind_readonly', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO querymind_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO querymind_readonly;
-- Tables created later by the current user are readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO querymind_readonly;
