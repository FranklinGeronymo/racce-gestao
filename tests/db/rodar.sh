#!/usr/bin/env bash
# Recria o banco de testes, aplica a migração e roda os testes de permissões.
# Uso: PGHOST=/tmp PGPORT=5499 tests/db/rodar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PGHOST:=/tmp}" "${PGPORT:=5499}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER
psql -q -c 'drop database if exists racce_teste' -c 'create database racce_teste' >/dev/null
psql -q -d racce_teste -v ON_ERROR_STOP=1 -f tests/db/00_supabase_stub.sql
psql -q -d racce_teste -v ON_ERROR_STOP=1 -f supabase/migrations/20261107000000_racce_gestao.sql
psql -q -t -d racce_teste -v ON_ERROR_STOP=1 -f tests/db/10_testes_permissoes.sql 2>&1 | grep -E "NOTICE|ERROR|FALHOU|PASSARAM|CONTEXT" | sed -e "s/^psql:[^ ]* //" -e "s/^NOTICE:  //"
exit "${PIPESTATUS[0]}"
