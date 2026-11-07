#!/usr/bin/env bash
# Recria o banco "racce_e2e" com a migração real e uma equipe de teste.
# Senha de todos: Racce2026teste (somente no banco local de testes).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5499}" PGUSER=postgres
psql -q -c 'drop database if exists racce_e2e' -c 'create database racce_e2e' >/dev/null
psql -q -d racce_e2e -v ON_ERROR_STOP=1 -f tests/db/00_supabase_stub.sql
for m in supabase/migrations/*.sql; do psql -q -d racce_e2e -v ON_ERROR_STOP=1 -f "$m"; done
psql -q -d racce_e2e -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, encrypted_password) values
  ('10000000-0000-0000-0000-000000000001', 'admin@racce.test', crypt('Racce2026teste', gen_salt('bf', 8))),
  ('10000000-0000-0000-0000-000000000002', 'vendas@racce.test', crypt('Racce2026teste', gen_salt('bf', 8))),
  ('10000000-0000-0000-0000-000000000003', 'estoque@racce.test', crypt('Racce2026teste', gen_salt('bf', 8))),
  ('10000000-0000-0000-0000-000000000004', 'financeiro@racce.test', crypt('Racce2026teste', gen_salt('bf', 8)));
select public.criar_admin_inicial('admin@racce.test', 'Franklin Admin');
insert into public.perfis (id, email, nome, papel, trocar_senha) values
  ('10000000-0000-0000-0000-000000000002', 'vendas@racce.test', 'Vera Vendas', 'vendedor', false),
  ('10000000-0000-0000-0000-000000000003', 'estoque@racce.test', 'Edu Estoque', 'estoquista', false),
  ('10000000-0000-0000-0000-000000000004', 'financeiro@racce.test', 'Fabi Financeiro', 'financeiro', false);
SQL
echo "banco racce_e2e pronto"
