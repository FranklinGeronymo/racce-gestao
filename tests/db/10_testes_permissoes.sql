-- =============================================================================
-- Testes de permissões e regras de negócio do banco (PostgreSQL local).
-- Rodar depois de 00_supabase_stub.sql e da migração. Para ao primeiro erro.
-- Cada bloco assume a identidade de um usuário (como faz a API do Supabase)
-- e confere o que ele consegue e o que não consegue fazer.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------- utilitários de teste (sessão atual) ----------
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;

-- Executa um comando que DEVE falhar; confere o código e um trecho da mensagem.
create or replace function pg_temp.deve_falhar(p_sql text, p_trecho text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_trecho) in lower(sqlerrm)) > 0 then raise notice 'ok  % (bloqueado: %)', p_msg, sqlerrm; return; end if;
    raise exception 'FALHOU: % — erro inesperado: % [%]', p_msg, sqlerrm, sqlstate;
  end;
  raise exception 'FALHOU: % — deveria ter sido bloqueado', p_msg;
end $$;

create or replace function pg_temp.conta(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || p_sql || ') x' into n; return n; end $$;

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
end $$;

-- ---------- usuários de teste ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste.com'),
  ('00000000-0000-0000-0000-00000000000b', 'gerente@teste.com'),
  ('00000000-0000-0000-0000-00000000000c', 'vendedor1@teste.com'),
  ('00000000-0000-0000-0000-00000000000d', 'vendedor2@teste.com'),
  ('00000000-0000-0000-0000-00000000000e', 'estoque@teste.com'),
  ('00000000-0000-0000-0000-00000000000f', 'financeiro@teste.com'),
  ('00000000-0000-0000-0000-000000000010', 'trocar@teste.com'),
  ('00000000-0000-0000-0000-000000000011', 'inativo@teste.com'),
  ('00000000-0000-0000-0000-000000000012', 'semperfil@teste.com'),
  ('00000000-0000-0000-0000-000000000013', 'personalizado@teste.com');

-- o primeiro administrador nasce pela função do SQL Editor
select public.criar_admin_inicial('admin@teste.com', 'Ana Admin');
select pg_temp.deve_falhar($$select public.criar_admin_inicial('gerente@teste.com', 'Outro')$$, 'Já existe um administrador', 'criar_admin_inicial só funciona uma vez');

insert into public.perfis (id, email, nome, papel, paginas, extras, ativo, trocar_senha) values
  ('00000000-0000-0000-0000-00000000000b', 'gerente@teste.com', 'Gil Gerente', 'gerente', '{}', '{}', true, false),
  ('00000000-0000-0000-0000-00000000000c', 'vendedor1@teste.com', 'Vera Vendas', 'vendedor', '{}', '{}', true, false),
  ('00000000-0000-0000-0000-00000000000d', 'vendedor2@teste.com', 'Vitor Vendas', 'vendedor', '{}', '{}', true, false),
  ('00000000-0000-0000-0000-00000000000e', 'estoque@teste.com', 'Edu Estoque', 'estoquista', '{}', '{}', true, false),
  ('00000000-0000-0000-0000-00000000000f', 'financeiro@teste.com', 'Fabi Financeiro', 'financeiro', '{}', '{}', true, false),
  ('00000000-0000-0000-0000-000000000010', 'trocar@teste.com', 'Tati Troca', 'gerente', '{}', '{}', true, true),
  ('00000000-0000-0000-0000-000000000011', 'inativo@teste.com', 'Ivo Inativo', 'gerente', '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000013', 'personalizado@teste.com', 'Paula Personalizada', 'personalizado', '{vendas}', '{editar}', true, false);

-- =============================================================================
-- 1. Visitante sem login (anon): não lê nem executa nada
-- =============================================================================
set role anon;
select pg_temp.deve_falhar('select * from public.produtos', 'permission denied', 'anon não lê produtos');
select pg_temp.deve_falhar('select * from public.perfis', 'permission denied', 'anon não lê perfis');
select pg_temp.deve_falhar('select public.meu_perfil()', 'permission denied', 'anon não executa funções');
select pg_temp.deve_falhar($$select public.registrar_venda('{}')$$, 'permission denied', 'anon não registra venda');
reset role;

-- =============================================================================
-- 2. Estoquista: produtos, fotos, entradas, ajustes e estornos
-- =============================================================================
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
set role authenticated;
select pg_temp.ok((public.meu_perfil() ->> 'ativo')::boolean and public.meu_perfil() ->> 'funcao' = 'Estoquista', 'meu_perfil devolve a função do estoquista');
select pg_temp.ok(public.meu_perfil() -> 'permissoes' = '["estoque"]'::jsonb, 'estoquista tem só a permissão de estoque');

create temp table if not exists ids (k text primary key, v uuid);
reset role; grant all on ids to authenticated; set role authenticated;

insert into ids values ('legging', public.salvar_produto(null,
  '{"nome":"Legging Ritmo","cor":"Preta","ref":"LG01","categoria":"Leggings","publico":"Feminino","descricao":"Cós alto","custo":4500,"preco":12990,"tamanhos":["P","M","G"],"minimo":2}',
  '{"P":5,"M":8,"G":0}'));
insert into ids values ('regata', public.salvar_produto(null,
  '{"nome":"Regata Dry","cor":"Volt","custo":2000,"preco":6990,"tamanhos":["P","M"]}', '{"P":2,"M":2}'));
select pg_temp.ok((select qtd from public.estoque_atual() where produto_id = (select v from ids where k = 'legging') and tam = 'M') = 8, 'estoque inicial da legging M = 8');
select pg_temp.ok(pg_temp.conta('select * from public.produtos_custo') = 2, 'estoquista lê os custos');
select pg_temp.deve_falhar($$select public.salvar_produto(null, '{"nome":"X","preco":0,"tamanhos":["P"]}')$$, 'preço', 'preço zero é recusado');
select pg_temp.deve_falhar($$select public.salvar_produto(null, '{"nome":"X","preco":100,"tamanhos":[]}')$$, 'tamanho', 'produto sem tamanho é recusado');
select pg_temp.deve_falhar($$select public.salvar_produto(null, '{"nome":"X","preco":100,"tamanhos":["P"],"publico":"Outro"}')$$, 'Público', 'público inválido é recusado');
select pg_temp.deve_falhar($$select public.salvar_produto(null, '{"nome":"X","preco":100,"tamanhos":["P"]}', '{"G":2}')$$, 'não foi escolhido', 'estoque inicial com tamanho fora da grade é recusado');
select pg_temp.deve_falhar($$select public.salvar_produto(null, '{"nome":"X","preco":100,"tamanhos":["P"]}', '{"P":1.5}')$$, 'inteiros', 'quantidade fracionada é recusada');

-- fotos: só JPEG em base64
select public.salvar_foto((select v from ids where k = 'legging'), 'data:image/jpeg;base64,/9j/AAAA', 'data:image/jpeg;base64,/9j/BBBB');
select pg_temp.ok(pg_temp.conta('select * from public.produto_fotos') = 1, 'foto JPEG aceita');
select pg_temp.deve_falhar($$select public.salvar_foto((select v from ids where k = 'legging'), 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/jpeg;base64,AAAA')$$, 'JPEG', 'arquivo que não é JPEG é recusado');
select pg_temp.deve_falhar($$select public.salvar_foto((select v from ids where k = 'legging'), 'data:image/jpeg;base64,AA"><script>', 'data:image/jpeg;base64,AAAA')$$, 'check constraint', 'base64 com caracteres estranhos é recusado pelo banco');

-- entradas, ajustes e estorno
insert into ids values ('entrada', public.registrar_entrada(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'qtds', '{"G":4}'::jsonb, 'custoUnit', 4800, 'data', to_char(app.hoje(), 'YYYY-MM-DD'), 'fornecedor', 'Confecção X', 'atualizarCusto', true)));
select pg_temp.ok((select custo from public.produtos_custo where produto_id = (select v from ids where k = 'legging')) = 4800, 'entrada atualizou o custo do produto');
select pg_temp.deve_falhar(format($$select public.registrar_entrada('{"produtoId":"%s","qtds":{"P":1},"custoUnit":100,"data":"%s","despesa":{"vencimento":"%s"}}')$$,
  (select v from ids where k = 'legging'), app.hoje(), app.hoje() + 30), 'não pode lançar contas a pagar', 'estoquista não lança conta a pagar junto com a entrada');
select pg_temp.deve_falhar(format($$select public.registrar_entrada('{"produtoId":"%s","qtds":{"P":-1},"data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'negativas', 'entrada negativa é recusada');
select pg_temp.deve_falhar(format($$select public.registrar_entrada('{"produtoId":"%s","qtds":{"P":1},"data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje() + 1), 'futura', 'entrada com data futura é recusada');
insert into ids values ('ajuste', public.registrar_ajuste(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'qtds', '{"P":-1}'::jsonb, 'motivo', 'Defeito', 'data', to_char(app.hoje(), 'YYYY-MM-DD'))));
select pg_temp.deve_falhar(format($$select public.registrar_ajuste('{"produtoId":"%s","qtds":{"P":1},"motivo":"Inventado","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'Motivo inválido', 'motivo de ajuste fora da lista é recusado');
select public.estornar_movimento((select v from ids where k = 'ajuste'));
select pg_temp.ok((select qtd from public.estoque_atual() where produto_id = (select v from ids where k = 'legging') and tam = 'P') = 5, 'estorno do ajuste devolveu a peça (P = 5)');
select pg_temp.deve_falhar(format($$select public.estornar_movimento('%s')$$, (select v from ids where k = 'ajuste')), 'já foi desfeito', 'estorno não pode ser repetido');

-- o que o estoquista NÃO pode
select pg_temp.deve_falhar($$insert into public.produtos (nome, preco, tamanhos) values ('Direto', 100, '{P}')$$, 'permission denied', 'gravação direta na tabela de produtos é negada');
select pg_temp.deve_falhar($$update public.produtos set preco = 1$$, 'permission denied', 'alteração direta de produtos é negada');
select pg_temp.deve_falhar($$delete from public.movimentos$$, 'permission denied', 'exclusão direta de movimentos é negada');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"P","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'não pode registrar vendas', 'estoquista não registra vendas');
select pg_temp.deve_falhar($$select public.salvar_config('{"estoqueMinimo":3}')$$, 'administradores', 'estoquista não altera os ajustes');
select pg_temp.deve_falhar($$select app.gravar_itens(gen_random_uuid(), '[]', null, true)$$, 'permission denied', 'funções internas não podem ser chamadas diretamente');
reset role;

-- produto inativo, para testar a venda
select pg_temp.como('00000000-0000-0000-0000-00000000000e'); set role authenticated;
insert into ids values ('inativo', public.salvar_produto(null, '{"nome":"Boné antigo","preco":3000,"tamanhos":["Único"]}', '{"Único":3}'));
select public.definir_ativo_produto((select v from ids where k = 'inativo'), false);
reset role;

-- =============================================================================
-- 3. Vendedores: registram vendas e veem só as próprias
-- =============================================================================
select pg_temp.como('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select pg_temp.ok(pg_temp.conta('select * from public.produtos') = 3, 'vendedor vê o catálogo');
select pg_temp.ok(pg_temp.conta('select * from public.produtos_custo') = 0, 'vendedor NÃO vê o custo dos produtos');
select pg_temp.ok(pg_temp.conta('select * from public.estoque_atual()') > 0, 'vendedor vê o estoque disponível');
-- o navegador tenta mandar subtotal e total falsos: o servidor ignora e recalcula
insert into ids select 'venda1', (public.registrar_venda(jsonb_build_object(
  'itens', jsonb_build_array(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'tam', 'M', 'qtd', 2, 'preco', 12990),
                             jsonb_build_object('produtoId', (select v from ids where k = 'regata'), 'tam', 'P', 'qtd', 1, 'preco', 5000)),
  'pagamento', 'Dinheiro', 'recebido', 40000, 'desconto', 980, 'subtotal', 1, 'total', 1, 'data', to_char(app.hoje(), 'YYYY-MM-DD'),
  'canal', 'Loja física', 'cliente', 'Maria <b>teste</b>', 'telefone', '(85) 99999-0000')) ->> 'id')::uuid;
select pg_temp.ok((select subtotal = 30980 and total = 30000 and recebido = 40000 and vendedor_nome = 'Vera Vendas' from public.vendas where id = (select v from ids where k = 'venda1')), 'servidor recalculou subtotal e total e gravou a vendedora');
select pg_temp.ok((select preco_tabela from public.venda_itens where venda_id = (select v from ids where k = 'venda1') and tam = 'P') = 6990, 'preço de tabela fica guardado quando o vendedor muda o preço');
select pg_temp.ok(pg_temp.conta('select * from public.venda_custos') = 0, 'vendedor NÃO vê o custo das peças vendidas');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje() + 1), 'futura', 'venda com data futura é recusada');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":100}],"pagamento":"Pix","desconto":200,"data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'desconto', 'desconto maior que o subtotal é recusado');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"Único","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'inativo'), app.hoje()), 'desativado', 'produto desativado não pode ser vendido');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"XGG","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'não está cadastrado', 'tamanho que não existe no produto é recusado');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":-5}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'preço unitário', 'preço negativo é recusado');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":100}],"pagamento":"Fiado","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'forma de pagamento', 'forma de pagamento desconhecida é recusada');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, gen_random_uuid(), app.hoje()), 'não existe', 'produto inexistente é recusado');
select pg_temp.deve_falhar($$select public.registrar_venda('{"itens":[],"pagamento":"Pix"}')$$, 'pelo menos um item', 'venda sem itens é recusada');
select pg_temp.deve_falhar(format($$select public.editar_venda('%s', 1, '{}', 'motivo longo o bastante')$$, (select v from ids where k = 'venda1')), 'não pode editar', 'vendedor não edita vendas');
select pg_temp.deve_falhar(format($$select public.cancelar_venda('%s', 1, 'motivo longo o bastante')$$, (select v from ids where k = 'venda1')), 'não pode cancelar', 'vendedor não cancela vendas');
select pg_temp.deve_falhar($$update public.vendas set total = 1$$, 'permission denied', 'vendedor não altera vendas direto na tabela');
select pg_temp.ok(pg_temp.conta('select * from public.movimentos') = 0, 'vendedor não vê entradas e ajustes');
select pg_temp.ok(pg_temp.conta('select * from public.despesas') = 0, 'vendedor não vê despesas');
select pg_temp.ok(pg_temp.conta('select * from public.auditoria') = 0, 'vendedor não vê a auditoria');
select pg_temp.ok(pg_temp.conta('select * from public.perfis') = 1, 'vendedor só vê o próprio perfil');
reset role;

select pg_temp.como('00000000-0000-0000-0000-00000000000d'); set role authenticated;
insert into ids select 'venda2', (public.registrar_venda(jsonb_build_object(
  'itens', jsonb_build_array(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'tam', 'P', 'qtd', 1, 'preco', 12990)),
  'pagamento', 'Crédito parcelado', 'parcelas', 3, 'data', to_char(app.hoje(), 'YYYY-MM-DD'))) ->> 'id')::uuid;
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 1, 'segundo vendedor vê só a própria venda');
select pg_temp.ok(pg_temp.conta(format($$select * from public.venda_itens where venda_id = '%s'$$, (select v from ids where k = 'venda1'))) = 0, 'itens da venda de outra pessoa ficam ocultos');
select pg_temp.ok((select numero from public.vendas) = 2, 'número da venda é sequencial e definido pelo servidor');
reset role;

-- =============================================================================
-- 4. Gerente: vê tudo, edita e cancela com motivo e controle de versão
-- =============================================================================
-- o custo da legging muda DEPOIS da venda (4800 -> 5200)
select pg_temp.como('00000000-0000-0000-0000-00000000000e'); set role authenticated;
select public.salvar_produto((select v from ids where k = 'legging'),
  '{"nome":"Legging Ritmo","cor":"Preta","ref":"LG01","categoria":"Leggings","publico":"Feminino","descricao":"Cós alto","custo":5200,"preco":12990,"tamanhos":["P","M","G"],"minimo":2}');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 2, 'gerente vê as vendas de toda a equipe');
select pg_temp.ok(pg_temp.conta('select * from public.venda_custos') = 3, 'gerente vê o custo das peças vendidas');
select pg_temp.deve_falhar(format($$select public.editar_venda('%s', 1, '{"itens":[]}', 'curto')$$, (select v from ids where k = 'venda1')), 'motivo', 'edição sem motivo suficiente é recusada');
select pg_temp.deve_falhar(format($$select public.editar_venda('%s', 9, '{"itens":[]}', 'motivo longo o bastante')$$, (select v from ids where k = 'venda1')), 'alterada por outra pessoa', 'edição com versão desatualizada é recusada');
select pg_temp.deve_falhar(format($$select public.editar_venda('%s', 1, %L, 'motivo longo o bastante')$$, (select v from ids where k = 'venda1'),
  (select jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'tam', 'M', 'qtd', 2, 'preco', 12990),
                             jsonb_build_object('produtoId', (select v from ids where k = 'regata'), 'tam', 'P', 'qtd', 1, 'preco', 5000)),
    'pagamento', 'Dinheiro', 'recebido', 40000, 'desconto', 980, 'data', to_char(app.hoje(), 'YYYY-MM-DD'), 'canal', 'Loja física', 'cliente', 'Maria <b>teste</b>', 'telefone', '(85) 99999-0000'))::text),
  'Nada foi alterado', 'edição sem nenhuma mudança é recusada');
select pg_temp.ok((public.editar_venda((select v from ids where k = 'venda1'), 1,
  jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('produtoId', (select v from ids where k = 'legging'), 'tam', 'G', 'qtd', 2, 'preco', 12990),
                             jsonb_build_object('produtoId', (select v from ids where k = 'regata'), 'tam', 'P', 'qtd', 1, 'preco', 5000)),
    'pagamento', 'Pix', 'desconto', 0, 'data', to_char(app.hoje(), 'YYYY-MM-DD'), 'canal', 'Loja física', 'cliente', 'Maria', 'telefone', ''),
  'Tamanho lançado errado: era G') ->> 'versao')::int = 2, 'edição válida sobe a versão');
select pg_temp.ok((select total from public.vendas where id = (select v from ids where k = 'venda1')) = 30980, 'total recalculado após a edição');
select pg_temp.ok((select custo from public.venda_custos c join public.venda_itens i on i.id = c.item_id where i.venda_id = (select v from ids where k = 'venda1') and i.tam = 'G') = 4800,
  'na edição, o custo do item continua o do dia da venda (4800), não o custo novo (5200)');
select pg_temp.ok((select count(*) from public.historico_vendas where venda_id = (select v from ids where k = 'venda1') and tipo = 'edicao' and antes -> 'itens' -> 0 ->> 'tam' = 'M' and depois -> 'itens' -> 0 ->> 'tam' = 'G') = 1,
  'histórico guardou o antes (M) e o depois (G)');
select public.cancelar_venda((select v from ids where k = 'venda2'), 1, 'Cliente desistiu no caixa');
select pg_temp.ok((select status from public.vendas where id = (select v from ids where k = 'venda2')) = 'cancelada', 'cancelamento registrado');
select pg_temp.ok((select qtd from public.estoque_atual() where produto_id = (select v from ids where k = 'legging') and tam = 'P') = 5, 'peça da venda cancelada voltou ao estoque');
select pg_temp.deve_falhar(format($$select public.cancelar_venda('%s', 2, 'Cliente desistiu no caixa')$$, (select v from ids where k = 'venda2')), 'já está cancelada', 'venda cancelada não é cancelada de novo');
select pg_temp.deve_falhar($$select public.salvar_config('{"estoqueMinimo":3}')$$, 'administradores', 'gerente não altera os ajustes');
select pg_temp.ok(pg_temp.conta('select * from public.auditoria') = 0, 'gerente não vê a auditoria');
reset role;

-- usuário personalizado: só vendas + editar; edita apenas as próprias vendas
select pg_temp.como('00000000-0000-0000-0000-000000000013'); set role authenticated;
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 0, 'personalizado sem "equipe" não vê vendas dos outros');
select pg_temp.deve_falhar(format($$select public.editar_venda('%s', 2, '{"itens":[]}', 'motivo longo o bastante')$$, (select v from ids where k = 'venda1')), 'não tem acesso', 'não edita venda que não consegue ver');
reset role;

-- =============================================================================
-- 5. Financeiro: despesas, resultado e custos; não vende
-- =============================================================================
select pg_temp.como('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select public.salvar_despesa(null, jsonb_build_object('descricao', 'Aluguel', 'categoria', 'Aluguel', 'valor', 280000, 'vencimento', '2026-01-31'), 3);
select pg_temp.ok((select array_agg(vencimento order by vencimento)::text from public.despesas where descricao = 'Aluguel') = '{2026-01-31,2026-02-28,2026-03-31}', 'conta fixa repete com o último dia do mês quando ele é mais curto');
select pg_temp.ok((select count(distinct grupo) from public.despesas where descricao = 'Aluguel') = 1, 'as parcelas da conta fixa ficam no mesmo grupo');
select public.pagar_despesa((select id from public.despesas where vencimento = '2026-01-31'), date '2026-01-30', 'Pix');
select pg_temp.deve_falhar(format($$select public.pagar_despesa('%s', '%s', 'Pix')$$, (select id from public.despesas where vencimento = '2026-02-28'), app.hoje() + 1), 'futura', 'pagamento com data futura é recusado');
select pg_temp.deve_falhar($$select public.salvar_despesa(null, '{"descricao":"X","categoria":"Outras","valor":0,"vencimento":"2026-01-01"}')$$, 'valor', 'despesa de valor zero é recusada');
select public.excluir_despesa((select id from public.despesas where vencimento = '2026-03-31'));
select pg_temp.ok(pg_temp.conta('select * from public.despesas') = 2, 'despesa excluída some das consultas');
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 2 and pg_temp.conta('select * from public.venda_custos') > 0, 'financeiro vê vendas e custos para o resultado');
select pg_temp.deve_falhar(format($$select public.registrar_venda('{"itens":[{"produtoId":"%s","tam":"M","qtd":1,"preco":100}],"pagamento":"Pix","data":"%s"}')$$, (select v from ids where k = 'legging'), app.hoje()), 'não pode registrar vendas', 'financeiro não registra vendas');
select pg_temp.ok(pg_temp.conta('select * from public.movimentos') = 0, 'financeiro não vê os movimentos de estoque');
reset role;

-- =============================================================================
-- 6. Usuário com troca de senha pendente, inativo ou sem perfil: nada
-- =============================================================================
select pg_temp.como('00000000-0000-0000-0000-000000000010'); set role authenticated;
select pg_temp.ok((public.meu_perfil() ->> 'trocarSenha')::boolean, 'meu_perfil avisa que a senha precisa ser trocada');
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 0 and pg_temp.conta('select * from public.produtos') = 0, 'com troca de senha pendente, nenhum dado é liberado');
select pg_temp.deve_falhar($$select public.salvar_despesa(null, '{"descricao":"X","categoria":"Outras","valor":10,"vencimento":"2026-01-01"}')$$, 'Sessão inválida', 'com troca de senha pendente, nenhuma ação é liberada');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000011'); set role authenticated;
select pg_temp.ok(pg_temp.conta('select * from public.vendas') = 0 and pg_temp.conta('select * from public.config') = 0, 'usuário inativo não vê nada');
select pg_temp.deve_falhar(format($$select public.cancelar_venda('%s', 2, 'motivo longo o bastante')$$, (select v from ids where k = 'venda1')), 'Sessão inválida', 'usuário inativo não age');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000012'); set role authenticated;
select pg_temp.ok(public.meu_perfil() ->> 'motivo' = 'sem_perfil', 'quem só tem conta no Auth, sem perfil, não entra');
select pg_temp.ok(pg_temp.conta('select * from public.produtos') = 0 and pg_temp.conta('select * from public.perfis') = 0, 'conta sem perfil não vê nada');
reset role;

-- =============================================================================
-- 7. Administrador: ajustes validados e auditoria
-- =============================================================================
select pg_temp.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select public.salvar_config('{"taxas":{"Pix":0,"Débito":1.99,"Crédito parcelado":4.5},"estoqueMinimo":3,"canais":["Loja física","Instagram"],"metas":{"2026-11":2500000}}');
select pg_temp.ok((select dados -> 'taxas' ->> 'Débito' from public.config) = '1.99', 'administrador salvou as taxas');
select pg_temp.deve_falhar($$select public.salvar_config('{"loginAtivo":false}')$$, 'desconhecido', 'chave de ajuste desconhecida é recusada');
select pg_temp.deve_falhar($$select public.salvar_config('{"taxas":{"Pix":50}}')$$, 'entre 0% e 30%', 'taxa acima de 30% é recusada');
select pg_temp.deve_falhar($$select public.salvar_config('{"metas":{"2026-13":100}}')$$, 'Metas inválidas', 'mês de meta inválido é recusado');
select pg_temp.deve_falhar($$select public.salvar_config('{"loja":{"nome":"Racce","script":"x"}}')$$, 'campo inválido', 'campo desconhecido nos dados da loja é recusado');
select pg_temp.ok(pg_temp.conta('select * from public.auditoria') >= 3, 'administrador vê a auditoria (estorno, exclusão de despesa, ajustes)');
select pg_temp.ok(pg_temp.conta('select * from public.perfis') = 9, 'administrador vê todos os usuários');
-- a venda com o novo meio de pagamento usa a taxa do dia
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000c'); set role authenticated;
insert into ids select 'venda3', (public.registrar_venda(jsonb_build_object(
  'itens', jsonb_build_array(jsonb_build_object('produtoId', (select v from ids where k = 'regata'), 'tam', 'M', 'qtd', 1, 'preco', 6990)),
  'pagamento', 'Débito', 'data', to_char(app.hoje(), 'YYYY-MM-DD'))) ->> 'id')::uuid;
select pg_temp.ok((select taxa_pct from public.vendas where id = (select v from ids where k = 'venda3')) = 1.99, 'a taxa da maquininha do dia fica gravada na venda');
reset role;

-- =============================================================================
-- 8. Proteções que valem até para a chave de serviço (dona do banco)
-- =============================================================================
select pg_temp.deve_falhar($$update public.historico_vendas set motivo = 'reescrito pelo dono do banco'$$, 'não pode ser alterado', 'histórico não pode ser reescrito');
select pg_temp.deve_falhar($$delete from public.historico_vendas$$, 'não pode ser alterado', 'histórico não pode ser apagado');
select pg_temp.deve_falhar($$delete from public.vendas$$, 'não pode ser alterado', 'vendas não podem ser apagadas');
select pg_temp.deve_falhar($$delete from public.auditoria$$, 'não pode ser alterado', 'auditoria não pode ser apagada');
select pg_temp.deve_falhar($$update public.perfis set ativo = false where papel = 'admin'$$, 'pelo menos um administrador', 'o último administrador não pode ser desativado');
select pg_temp.deve_falhar($$update public.perfis set papel = 'gerente' where papel = 'admin'$$, 'pelo menos um administrador', 'o último administrador não pode perder a função');
set role service_role;
select pg_temp.deve_falhar($$select public.criar_admin_inicial('x@y.com', 'X')$$, 'permission denied', 'criar_admin_inicial não roda nem com a chave de serviço');
reset role;
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.deve_falhar($$select public.criar_admin_inicial('x@y.com', 'X')$$, 'permission denied', 'criar_admin_inicial não roda pela API');
reset role;

-- textos com caracteres de controle são limpos no servidor
select pg_temp.como('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select public.salvar_despesa(null, jsonb_build_object('descricao', E'Luz\u0007 da loja', 'categoria', 'Energia e água', 'valor', 1000, 'vencimento', '2026-02-10'), 1);
select pg_temp.ok((select count(*) from public.despesas where descricao = 'Luz da loja') = 1, 'caracteres de controle removidos da descrição');
reset role;

\echo '==================== TODOS OS TESTES DO BANCO PASSARAM ===================='
