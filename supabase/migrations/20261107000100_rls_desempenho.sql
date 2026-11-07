-- =============================================================================
-- Racce · Gestão — ajuste de desempenho das regras de acesso (RLS)
--
-- O consultor de desempenho do Supabase apontou que duas políticas chamavam
-- auth.uid() diretamente, o que faz o PostgreSQL recalcular a função a cada
-- linha lida. Envolver a chamada em (select ...) faz o valor ser calculado uma
-- vez por consulta. As regras continuam exatamente as mesmas.
-- Também cria o índice da chave estrangeira perfis.papel.
-- =============================================================================
begin;

drop policy perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select app.pode('usuarios')));

drop policy vendas_ler on public.vendas;
create policy vendas_ler on public.vendas for select to authenticated
  using ((select app.ativo()) and ((select app.ver_todas_vendas()) or vendedor_id = (select auth.uid())));

create index if not exists perfis_papel on public.perfis (papel);

commit;
