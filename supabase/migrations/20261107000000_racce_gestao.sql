-- =============================================================================
-- Racce · Gestão da loja — banco de dados no Supabase (PostgreSQL 15+)
--
-- Princípios desta migração
-- 1. Nenhuma regra de acesso depende do navegador. Toda leitura passa pelas
--    políticas de RLS e toda gravação passa por funções do servidor
--    (SECURITY DEFINER) que conferem a permissão de quem chama e validam os dados.
-- 2. O papel "authenticated" não grava em nenhuma tabela diretamente:
--    INSERT, UPDATE e DELETE são revogados. O papel "anon" não lê nada.
-- 3. Vendas, histórico de alterações e auditoria não podem ser apagados nem
--    reescritos (gatilhos bloqueiam, inclusive para a chave de serviço).
-- 4. Valores em dinheiro são inteiros em centavos (R$ 1,00 = 100).
-- 5. Datas de negócio usam o fuso de Fortaleza (America/Fortaleza).
--
-- Como aplicar: Supabase > SQL Editor > cole este arquivo inteiro > Run.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- Esquema interno com as funções auxiliares (não é exposto pela API REST)
-- -----------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

-- Funções (perfis de acesso) prontas. "admin" tem tudo; "personalizado" usa as
-- listas gravadas no próprio usuário.
create table public.funcoes (
  papel     text primary key,
  nome      text not null,
  paginas   text[] not null default '{}',
  extras    text[] not null default '{}',
  descricao text not null default '',
  ordem     smallint not null default 0
);

insert into public.funcoes (papel, nome, paginas, extras, descricao, ordem) values
  ('admin',         'Administrador', '{}', '{}', 'Acesso total, inclusive usuários e ajustes.', 1),
  ('gerente',       'Gerente',       '{painel,vendas,estoque,despesas,resultado}', '{equipe,cancelar,editar,historico,custos}', 'Toda a operação da loja, sem mexer em usuários e ajustes.', 2),
  ('vendedor',      'Vendedor(a)',   '{vendas}', '{}', 'Registra vendas e vê só as vendas que registrou.', 3),
  ('estoquista',    'Estoquista',    '{estoque}', '{}', 'Cadastra produtos e fotos, lança entradas e contagens.', 4),
  ('financeiro',    'Financeiro',    '{painel,despesas,resultado}', '{equipe,custos,historico}', 'Despesas, resultado do mês, visão geral e histórico de alterações das vendas.', 5),
  ('personalizado', 'Personalizado', '{}', '{}', 'Painéis e permissões escolhidos um a um.', 6);

-- Usuários do sistema. A senha fica no Supabase Auth (auth.users), com hash
-- bcrypt; aqui só ficam o nome, a função e a situação.
create table public.perfis (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  nome           text not null check (char_length(btrim(nome)) between 2 and 60),
  papel          text not null references public.funcoes (papel),
  paginas        text[] not null default '{}' check (paginas <@ array['painel','vendas','estoque','despesas','resultado']::text[]),
  extras         text[] not null default '{}' check (extras <@ array['equipe','cancelar','editar','historico','custos']::text[]),
  ativo          boolean not null default true,
  trocar_senha   boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  ultimo_acesso  timestamptz
);
create unique index perfis_email_unico on public.perfis (lower(email));

-- Configurações da loja (uma linha só).
create table public.config (
  id             smallint primary key default 1 check (id = 1),
  dados          jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
insert into public.config (id, dados) values (1, '{}'::jsonb);

create table public.produtos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  cor            text not null default '' check (char_length(cor) <= 40),
  ref            text not null default '' check (char_length(ref) <= 30),
  categoria      text not null default '' check (char_length(categoria) <= 60),
  publico        text not null default 'Unissex' check (publico in ('Unissex','Feminino','Masculino')),
  descricao      text not null default '' check (char_length(descricao) <= 300),
  preco          integer not null check (preco > 0 and preco <= 100000000),
  tamanhos       text[] not null check (cardinality(tamanhos) between 1 and 30),
  minimo         integer check (minimo between 0 and 9999),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);

-- Custo separado do produto: só quem pode ver custos consegue ler esta tabela.
create table public.produtos_custo (
  produto_id     uuid primary key references public.produtos (id) on delete cascade,
  custo          integer not null default 0 check (custo between 0 and 100000000),
  atualizado_em  timestamptz not null default now()
);

-- Fotos em JPEG, já reduzidas no navegador. O formato e o tamanho são
-- conferidos aqui, no banco: nada além de uma imagem JPEG em base64 é aceito.
create table public.produto_fotos (
  produto_id     uuid primary key references public.produtos (id) on delete cascade,
  thumb          text not null check (char_length(thumb) <= 80000 and thumb ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'),
  foto           text not null check (char_length(foto) <= 700000 and foto ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);

-- Entradas e ajustes de estoque. "qtds" = {"P": 3, "M": -1, ...}.
create table public.movimentos (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid not null references public.produtos (id),
  tipo           text not null check (tipo in ('entrada','ajuste')),
  data           date not null,
  qtds           jsonb not null check (jsonb_typeof(qtds) = 'object'),
  custo_unit     integer check (custo_unit between 0 and 100000000),
  fornecedor     text not null default '' check (char_length(fornecedor) <= 80),
  motivo         text not null default '' check (char_length(motivo) <= 60),
  obs            text not null default '' check (char_length(obs) <= 200),
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  estornado_em   timestamptz,
  estornado_por  uuid
);
create index movimentos_produto on public.movimentos (produto_id);

-- O número da venda só é atribuído quando ela é concluída: tentativas recusadas
-- não deixam buracos na numeração dos recibos.
create sequence public.vendas_numero_seq;
create table public.vendas (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint unique,
  data               date not null,
  criado_em          timestamptz not null default now(),
  vendedor_id        uuid,
  vendedor_nome      text not null default '',
  subtotal           integer not null check (subtotal >= 0),
  desconto           integer not null default 0 check (desconto >= 0),
  total              integer not null check (total >= 0),
  taxa_pct           numeric(5,2) not null default 0 check (taxa_pct between 0 and 30),
  pagamento          text not null check (pagamento in ('Pix','Dinheiro','Débito','Crédito à vista','Crédito parcelado')),
  parcelas           smallint not null default 1 check (parcelas between 1 and 12),
  recebido           integer not null default 0 check (recebido >= 0),
  canal              text not null default '' check (char_length(canal) <= 40),
  cliente            text not null default '' check (char_length(cliente) <= 80),
  telefone           text not null default '' check (char_length(telefone) <= 20),
  obs                text not null default '' check (char_length(obs) <= 200),
  status             text not null default 'ok' check (status in ('ok','cancelada')),
  versao             integer not null default 1,
  editada_em         timestamptz,
  editada_por_nome   text,
  cancelada_em       timestamptz,
  cancelada_por_nome text,
  motivo_cancel      text,
  check (desconto <= subtotal),
  check (total = subtotal - desconto)
);
create index vendas_data on public.vendas (data);
create index vendas_vendedor on public.vendas (vendedor_id);

create table public.venda_itens (
  id            uuid primary key default gen_random_uuid(),
  venda_id      uuid not null references public.vendas (id) on delete cascade,
  ordem         smallint not null,
  produto_id    uuid not null references public.produtos (id),
  nome          text not null,
  cor           text not null default '',
  tam           text not null check (char_length(tam) between 1 and 12),
  qtd           integer not null check (qtd between 1 and 9999),
  preco         integer not null check (preco between 0 and 100000000),
  preco_tabela  integer not null check (preco_tabela >= 0)
);
create index venda_itens_venda on public.venda_itens (venda_id);
create index venda_itens_produto on public.venda_itens (produto_id);

-- Custo de cada item no dia da venda (separado: só quem pode ver custos lê).
create table public.venda_custos (
  item_id   uuid primary key references public.venda_itens (id) on delete cascade,
  venda_id  uuid not null references public.vendas (id) on delete cascade,
  custo     integer not null default 0 check (custo >= 0)
);
create index venda_custos_venda on public.venda_custos (venda_id);

-- Histórico de edições e cancelamentos. "antes" e "depois" são montados pelo
-- servidor, a partir do que está gravado; ninguém consegue reescrevê-los.
create table public.historico_vendas (
  id         uuid primary key default gen_random_uuid(),
  venda_id   uuid not null references public.vendas (id),
  seq        integer not null,
  tipo       text not null check (tipo in ('edicao','cancelamento')),
  em         timestamptz not null default now(),
  por_id     uuid,
  por_nome   text not null,
  por_funcao text not null default '',
  motivo     text not null check (char_length(motivo) between 10 and 300),
  antes      jsonb not null,
  depois     jsonb not null,
  unique (venda_id, seq)
);

create table public.despesas (
  id             uuid primary key default gen_random_uuid(),
  descricao      text not null check (char_length(btrim(descricao)) between 1 and 120),
  categoria      text not null check (char_length(categoria) between 1 and 60),
  valor          integer not null check (valor > 0 and valor <= 1000000000),
  vencimento     date not null,
  paga_em        date,
  forma          text not null default '' check (char_length(forma) <= 40),
  obs            text not null default '' check (char_length(obs) <= 200),
  grupo          uuid,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  excluida_em    timestamptz,
  excluida_por   uuid
);
create index despesas_vencimento on public.despesas (vencimento);

-- Registro de ações sensíveis (usuários, ajustes, estornos, exclusões).
create table public.auditoria (
  id        bigint generated always as identity primary key,
  em        timestamptz not null default now(),
  por_id    uuid,
  por_nome  text not null default '',
  acao      text not null,
  alvo      text not null default '',
  detalhes  jsonb not null default '{}'::jsonb
);

-- Tentativas erradas de confirmar a senha atual (usada pela função de troca de
-- senha para limitar tentativas por usuário). Só a chave de serviço acessa.
create table public.tentativas_senha (
  id       bigint generated always as identity primary key,
  user_id  uuid not null,
  em       timestamptz not null default now()
);
create index tentativas_senha_user on public.tentativas_senha (user_id, em);

-- -----------------------------------------------------------------------------
-- Funções auxiliares (esquema app)
-- -----------------------------------------------------------------------------

create or replace function app.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Fortaleza')::date
$$;

-- Perfil de quem chama, apenas se estiver ativo e sem troca de senha pendente.
create or replace function app.perfil() returns public.perfis
language sql stable security definer set search_path = '' as $$
  select p.* from public.perfis p
  where p.id = auth.uid() and p.ativo and not p.trocar_senha
$$;

create or replace function app.permissoes() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when p.id is null then '{}'::text[]
    when p.papel = 'admin' then array['painel','vendas','estoque','despesas','resultado','equipe','cancelar','editar','historico','custos','usuarios','ajustes']
    when p.papel = 'personalizado' then p.paginas || p.extras
    else f.paginas || f.extras
  end
  from (select 1) um
  left join public.perfis p on p.id = auth.uid() and p.ativo and not p.trocar_senha
  left join public.funcoes f on f.papel = p.papel
$$;

create or replace function app.ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo and not p.trocar_senha)
$$;

create or replace function app.pode(p_perm text) returns boolean
language sql stable set search_path = '' as $$
  select p_perm = any (app.permissoes())
$$;

-- Custos e lucro: liberados para quem cuida do estoque ou dos números da loja.
create or replace function app.ver_custos() returns boolean
language sql stable set search_path = '' as $$
  select app.permissoes() && array['custos','estoque','resultado','painel']
$$;

-- Todas as vendas: quem vê a equipe, a visão geral, o resultado ou o histórico.
-- Os demais veem só as vendas que registraram.
create or replace function app.ver_todas_vendas() returns boolean
language sql stable set search_path = '' as $$
  select app.permissoes() && array['equipe','painel','resultado','historico']
$$;

create or replace function app.exigir(p_cond boolean, p_msg text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_cond is not true then raise exception using errcode = 'P0001', message = p_msg; end if;
end $$;

create or replace function app.exigir_perm(p_perm text, p_msg text default null) returns public.perfis
language plpgsql stable security definer set search_path = '' as $$
declare v public.perfis;
begin
  v := app.perfil();
  if v.id is null then
    raise exception using errcode = '42501', message = 'Sessão inválida ou usuário inativo. Entre novamente.';
  end if;
  if p_perm is not null and not app.pode(p_perm) then
    raise exception using errcode = '42501', message = coalesce(p_msg, 'Seu usuário não tem permissão para esta ação.');
  end if;
  return v;
end $$;

create or replace function app.nome_funcao(p_papel text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from public.funcoes where papel = p_papel), '')
$$;

create or replace function app.auditar(p_acao text, p_alvo text, p_detalhes jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.auditoria (por_id, por_nome, acao, alvo, detalhes)
  values (auth.uid(), coalesce((select nome from public.perfis where id = auth.uid()), ''), p_acao, coalesce(p_alvo, ''), coalesce(p_detalhes, '{}'::jsonb))
$$;

-- Texto limpo e com tamanho máximo. Rejeita (em vez de cortar) o que passa do limite.
create or replace function app.texto(p jsonb, p_chave text, p_max int, p_obrig boolean default false, p_rotulo text default null) returns text
language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  v := btrim(coalesce(p ->> p_chave, ''));
  v := regexp_replace(v, '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g');
  if p_obrig and v = '' then raise exception using errcode = 'P0001', message = 'Informe ' || coalesce(p_rotulo, p_chave) || '.'; end if;
  if char_length(v) > p_max then raise exception using errcode = 'P0001', message = 'O campo ' || coalesce(p_rotulo, p_chave) || ' passa do limite de ' || p_max || ' caracteres.'; end if;
  return v;
end $$;

create or replace function app.inteiro(p jsonb, p_chave text, p_min bigint, p_max bigint, p_rotulo text, p_padrao bigint default null) returns bigint
language plpgsql immutable set search_path = '' as $$
declare v jsonb := p -> p_chave; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if p_padrao is null then raise exception using errcode = 'P0001', message = 'Informe ' || p_rotulo || '.'; end if;
    return p_padrao;
  end if;
  if jsonb_typeof(v) <> 'number' then raise exception using errcode = 'P0001', message = 'Valor inválido em ' || p_rotulo || '.'; end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) or n < p_min or n > p_max then raise exception using errcode = 'P0001', message = 'Valor inválido em ' || p_rotulo || '.'; end if;
  return n::bigint;
end $$;

create or replace function app.data(p jsonb, p_chave text, p_rotulo text) returns date
language plpgsql stable set search_path = '' as $$
declare v text := p ->> p_chave; d date;
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode = 'P0001', message = 'Informe ' || p_rotulo || '.'; end if;
  begin d := v::date; exception when others then raise exception using errcode = 'P0001', message = 'Data inválida em ' || p_rotulo || '.'; end;
  if d < date '2000-01-01' or d > app.hoje() + 3650 then raise exception using errcode = 'P0001', message = 'Data inválida em ' || p_rotulo || '.'; end if;
  return d;
end $$;

-- {"P": 2, "M": 0, ...} → só tamanhos válidos e quantidades inteiras.
create or replace function app.qtds(p jsonb, p_positivas boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; n numeric; out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception using errcode = 'P0001', message = 'Quantidades inválidas.'; end if;
  for k, v in select * from jsonb_each(p) loop
    if char_length(k) not between 1 and 12 then raise exception using errcode = 'P0001', message = 'Tamanho inválido.'; end if;
    if jsonb_typeof(v) <> 'number' then raise exception using errcode = 'P0001', message = 'As quantidades precisam ser números inteiros.'; end if;
    n := (v #>> '{}')::numeric;
    if n <> trunc(n) or abs(n) > 99999 then raise exception using errcode = 'P0001', message = 'As quantidades precisam ser números inteiros.'; end if;
    if p_positivas and n < 0 then raise exception using errcode = 'P0001', message = 'As quantidades de entrada não podem ser negativas.'; end if;
    if n <> 0 then out := out || jsonb_build_object(k, n::int); end if;
  end loop;
  if out = '{}'::jsonb then raise exception using errcode = 'P0001', message = 'Informe a quantidade de pelo menos um tamanho.'; end if;
  return out;
end $$;

-- Retrato da venda usado no histórico (sem custos).
create or replace function app.snap_venda(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'data', to_char(v.data, 'YYYY-MM-DD'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('produtoId', i.produto_id, 'nome', i.nome, 'cor', i.cor, 'tam', i.tam, 'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
                       from public.venda_itens i where i.venda_id = v.id), '[]'::jsonb),
    'subtotal', v.subtotal, 'desconto', v.desconto, 'total', v.total, 'pagamento', v.pagamento, 'parcelas', v.parcelas,
    'recebido', v.recebido, 'canal', v.canal, 'cliente', v.cliente, 'telefone', v.telefone, 'obs', v.obs, 'status', v.status)
  from public.vendas v where v.id = p_id
$$;

-- Pode ver esta venda? (todas, ou só as próprias)
create or replace function app.ve_venda(p_vendedor uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.ativo() and (app.ver_todas_vendas() or p_vendedor = auth.uid())
$$;

-- Grava os itens da venda. O nome, a cor, o preço de tabela e o custo vêm do
-- cadastro (ou da versão anterior da venda, na edição); o navegador só informa
-- produto, tamanho, quantidade e preço unitário praticado.
create or replace function app.gravar_itens(p_venda uuid, p_itens jsonb, p_antigos jsonb, p_nova boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; n int := 0; sub bigint := 0; pid uuid; tam text; qtd bigint; preco bigint;
  pr public.produtos; custo int; antigo jsonb; item_id uuid;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'A venda precisa ter pelo menos um item.';
  end if;
  if jsonb_array_length(p_itens) > 100 then raise exception using errcode = 'P0001', message = 'A venda tem itens demais (máximo de 100).'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    n := n + 1;
    begin pid := (it ->> 'produtoId')::uuid; exception when others then pid := null; end;
    select * into pr from public.produtos where id = pid;
    if pr.id is null then raise exception using errcode = 'P0001', message = 'Um dos produtos da venda não existe mais.'; end if;
    tam := btrim(coalesce(it ->> 'tam', ''));
    qtd := app.inteiro(it, 'qtd', 1, 9999, 'a quantidade');
    preco := app.inteiro(it, 'preco', 0, 100000000, 'o preço unitário');
    antigo := (select a from jsonb_array_elements(coalesce(p_antigos, '[]'::jsonb)) a where a ->> 'produtoId' = pid::text limit 1);
    if tam = '' or char_length(tam) > 12 then raise exception using errcode = 'P0001', message = 'Tamanho inválido em ' || pr.nome || '.'; end if;
    if not (tam = any (pr.tamanhos)) and not exists (
      select 1 from jsonb_array_elements(coalesce(p_antigos, '[]'::jsonb)) a where a ->> 'produtoId' = pid::text and a ->> 'tam' = tam) then
      raise exception using errcode = 'P0001', message = 'O tamanho ' || tam || ' não está cadastrado em ' || pr.nome || '.';
    end if;
    if p_nova and not pr.ativo then raise exception using errcode = 'P0001', message = pr.nome || ' está desativado e não pode ser vendido.'; end if;
    if antigo is not null then
      custo := coalesce((antigo ->> 'custo')::int, 0);
    else
      custo := coalesce((select c.custo from public.produtos_custo c where c.produto_id = pid), 0);
    end if;
    insert into public.venda_itens (venda_id, ordem, produto_id, nome, cor, tam, qtd, preco, preco_tabela)
    values (p_venda, n, pid, coalesce(antigo ->> 'nome', pr.nome), coalesce(antigo ->> 'cor', pr.cor), tam, qtd, preco, coalesce((antigo ->> 'precoTabela')::int, pr.preco))
    returning id into item_id;
    insert into public.venda_custos (item_id, venda_id, custo) values (item_id, p_venda, custo);
    sub := sub + qtd * preco;
  end loop;
  if sub > 2000000000 then raise exception using errcode = 'P0001', message = 'O total da venda passa do limite permitido.'; end if;
  return sub::int;
end $$;

-- Campos de cabeçalho da venda, validados.
create or replace function app.cabecalho_venda(p jsonb, p_subtotal int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pag text := p ->> 'pagamento'; parc bigint; desc_ bigint; rec bigint; d date; tot int; taxa numeric; cfg jsonb;
begin
  if pag is null or pag not in ('Pix','Dinheiro','Débito','Crédito à vista','Crédito parcelado') then
    raise exception using errcode = 'P0001', message = 'Escolha a forma de pagamento.';
  end if;
  parc := case when pag = 'Crédito parcelado' then app.inteiro(p, 'parcelas', 2, 12, 'as parcelas') else 1 end;
  desc_ := app.inteiro(p, 'desconto', 0, 2000000000, 'o desconto', 0);
  if desc_ > p_subtotal then raise exception using errcode = 'P0001', message = 'O desconto não pode ser maior que o subtotal.'; end if;
  tot := p_subtotal - desc_;
  rec := case when pag = 'Dinheiro' then app.inteiro(p, 'recebido', 0, 2000000000, 'o valor recebido', 0) else 0 end;
  if rec < tot then rec := 0; end if;
  d := app.data(p, 'data', 'a data da venda');
  if d > app.hoje() then raise exception using errcode = 'P0001', message = 'A data da venda não pode ser futura.'; end if;
  select dados into cfg from public.config where id = 1;
  taxa := coalesce(nullif(cfg -> 'taxas' ->> pag, '')::numeric, 0);
  if taxa < 0 or taxa > 30 then taxa := 0; end if;
  return jsonb_build_object('pagamento', pag, 'parcelas', parc, 'desconto', desc_, 'total', tot, 'recebido', rec, 'data', d, 'taxa', taxa,
    'canal', app.texto(p, 'canal', 40, false, 'canal'), 'cliente', app.texto(p, 'cliente', 80, false, 'cliente'),
    'telefone', app.texto(p, 'telefone', 20, false, 'WhatsApp do cliente'), 'obs', app.texto(p, 'obs', 200, false, 'observação'));
end $$;

-- -----------------------------------------------------------------------------
-- Gatilhos de proteção
-- -----------------------------------------------------------------------------

create or replace function app.bloquear_alteracao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'Este registro não pode ser alterado nem apagado.';
end $$;

create trigger historico_imutavel before update or delete on public.historico_vendas for each row execute function app.bloquear_alteracao();
create trigger auditoria_imutavel before update or delete on public.auditoria for each row execute function app.bloquear_alteracao();
create trigger vendas_sem_exclusao before delete on public.vendas for each row execute function app.bloquear_alteracao();

-- Sempre precisa existir pelo menos um administrador ativo.
create or replace function app.garantir_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.perfis where papel = 'admin' and ativo) and exists (select 1 from public.perfis) then
    raise exception using errcode = 'P0001', message = 'É preciso manter pelo menos um administrador ativo.';
  end if;
  return null;
end $$;
create trigger perfis_um_admin after update or delete on public.perfis for each statement execute function app.garantir_admin();

create or replace function app.tocar_atualizado() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger perfis_atualizado before update on public.perfis for each row execute function app.tocar_atualizado();

-- -----------------------------------------------------------------------------
-- Segurança em nível de linha (RLS) e privilégios
-- -----------------------------------------------------------------------------
alter table public.funcoes          enable row level security;
alter table public.perfis           enable row level security;
alter table public.config           enable row level security;
alter table public.produtos         enable row level security;
alter table public.produtos_custo   enable row level security;
alter table public.produto_fotos    enable row level security;
alter table public.movimentos       enable row level security;
alter table public.vendas           enable row level security;
alter table public.venda_itens      enable row level security;
alter table public.venda_custos     enable row level security;
alter table public.historico_vendas enable row level security;
alter table public.despesas         enable row level security;
alter table public.auditoria        enable row level security;
alter table public.tentativas_senha enable row level security;  -- sem política: só a chave de serviço

-- Ninguém de fora lê nada; os usuários logados só leem (as gravações são feitas pelas funções abaixo).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.funcoes, public.perfis, public.config, public.produtos, public.produtos_custo, public.produto_fotos,
  public.movimentos, public.vendas, public.venda_itens, public.venda_custos, public.historico_vendas, public.despesas, public.auditoria
  to authenticated;

create policy funcoes_ler on public.funcoes for select to authenticated using (true);
create policy perfis_ler on public.perfis for select to authenticated using (id = auth.uid() or (select app.pode('usuarios')));
create policy config_ler on public.config for select to authenticated using ((select app.ativo()));
create policy produtos_ler on public.produtos for select to authenticated using ((select app.ativo()));
create policy produtos_custo_ler on public.produtos_custo for select to authenticated using ((select app.ver_custos()));
create policy fotos_ler on public.produto_fotos for select to authenticated using ((select app.ativo()));
create policy movimentos_ler on public.movimentos for select to authenticated using ((select app.pode('estoque')));
create policy vendas_ler on public.vendas for select to authenticated
  using ((select app.ativo()) and ((select app.ver_todas_vendas()) or vendedor_id = auth.uid()));
create policy itens_ler on public.venda_itens for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id));
create policy custos_venda_ler on public.venda_custos for select to authenticated
  using ((select app.ver_custos()) and exists (select 1 from public.vendas v where v.id = venda_id));
create policy historico_ler on public.historico_vendas for select to authenticated
  using ((select app.pode('historico')) or exists (select 1 from public.vendas v where v.id = venda_id));
create policy despesas_ler on public.despesas for select to authenticated
  using (excluida_em is null and (select app.permissoes()) && array['despesas','resultado','painel']);
create policy auditoria_ler on public.auditoria for select to authenticated using ((select app.pode('usuarios')));

-- -----------------------------------------------------------------------------
-- Funções chamadas pelo aplicativo (API: /rest/v1/rpc/<nome>)
-- -----------------------------------------------------------------------------

-- Perfil de quem entrou, com as permissões efetivas. Registra o último acesso.
create or replace function public.meu_perfil() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.perfis;
begin
  select * into p from public.perfis where id = auth.uid();
  if p.id is null then return jsonb_build_object('ativo', false, 'motivo', 'sem_perfil'); end if;
  if p.ativo and not p.trocar_senha then update public.perfis set ultimo_acesso = now() where id = p.id; end if;
  return jsonb_build_object('id', p.id, 'email', p.email, 'nome', p.nome, 'papel', p.papel, 'funcao', app.nome_funcao(p.papel),
    'paginas', to_jsonb(p.paginas), 'extras', to_jsonb(p.extras), 'ativo', p.ativo, 'trocarSenha', p.trocar_senha,
    'permissoes', to_jsonb(app.permissoes()), 'hoje', to_char(app.hoje(), 'YYYY-MM-DD'));
end $$;

-- Estoque atual por produto e tamanho, calculado no servidor (entradas + ajustes − vendas concluídas).
create or replace function public.estoque_atual() returns table (produto_id uuid, tam text, qtd integer)
language sql stable security definer set search_path = '' as $$
  select x.produto_id, x.tam, sum(x.q)::int
  from (
    select m.produto_id, e.key as tam, (e.value)::int as q
      from public.movimentos m, jsonb_each_text(m.qtds) e where m.estornado_em is null
    union all
    select i.produto_id, i.tam, -i.qtd from public.venda_itens i join public.vendas v on v.id = i.venda_id where v.status = 'ok'
  ) x
  where app.ativo()
  group by x.produto_id, x.tam
$$;

-- Produto: cadastro e edição. p_estoque_inicial só vale no cadastro.
create or replace function public.salvar_produto(p_id uuid, p_dados jsonb, p_estoque_inicial jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  eu public.perfis; v_id uuid; tams text[]; t text; v_minimo bigint; v_preco bigint; v_custo bigint; pub text; ini jsonb;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode cadastrar produtos.');
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception using errcode = 'P0001', message = 'Dados do produto inválidos.'; end if;
  if jsonb_typeof(p_dados -> 'tamanhos') <> 'array' then raise exception using errcode = 'P0001', message = 'Escolha pelo menos um tamanho.'; end if;
  select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}') into tams from jsonb_array_elements_text(p_dados -> 'tamanhos') x;
  perform app.exigir(cardinality(tams) between 1 and 30, 'Escolha de 1 a 30 tamanhos.');
  foreach t in array tams loop perform app.exigir(char_length(t) <= 12, 'O tamanho "' || left(t, 20) || '" é longo demais (máximo de 12 caracteres).'); end loop;
  -- mantém a ordem em que os tamanhos foram enviados
  select array_agg(x order by o) into tams from (
    select btrim(x) x, min(o) o from jsonb_array_elements_text(p_dados -> 'tamanhos') with ordinality a(x, o) where btrim(x) <> '' group by btrim(x)) s;
  v_preco := app.inteiro(p_dados, 'preco', 1, 100000000, 'o preço de venda');
  v_custo := app.inteiro(p_dados, 'custo', 0, 100000000, 'o custo', 0);
  v_minimo := case when p_dados -> 'minimo' is null or jsonb_typeof(p_dados -> 'minimo') = 'null' then null else app.inteiro(p_dados, 'minimo', 0, 9999, 'o estoque mínimo') end;
  pub := coalesce(nullif(p_dados ->> 'publico', ''), 'Unissex');
  perform app.exigir(pub in ('Unissex','Feminino','Masculino'), 'Público inválido.');
  if p_id is null then
    insert into public.produtos (nome, cor, ref, categoria, publico, descricao, preco, tamanhos, minimo, criado_por, atualizado_por)
    values (app.texto(p_dados, 'nome', 80, true, 'o nome do produto'), app.texto(p_dados, 'cor', 40), app.texto(p_dados, 'ref', 30, false, 'código'),
      app.texto(p_dados, 'categoria', 60), pub, app.texto(p_dados, 'descricao', 300, false, 'descrição'), v_preco, tams, v_minimo, eu.id, eu.id)
    returning id into v_id;
    insert into public.produtos_custo (produto_id, custo) values (v_id, v_custo);
    if p_estoque_inicial is not null and jsonb_typeof(p_estoque_inicial) = 'object' and p_estoque_inicial <> '{}'::jsonb then
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into ini from jsonb_each(p_estoque_inicial) e(k, v) where v <> '0'::jsonb;
      if ini <> '{}'::jsonb then
        ini := app.qtds(ini, true);
        perform app.exigir((select bool_and(k = any (tams)) from jsonb_object_keys(ini) k), 'O estoque inicial tem um tamanho que não foi escolhido.');
        insert into public.movimentos (produto_id, tipo, data, qtds, custo_unit, fornecedor, criado_por)
        values (v_id, 'entrada', app.hoje(), ini, v_custo, 'Estoque inicial', eu.id);
      end if;
    end if;
  else
    update public.produtos set nome = app.texto(p_dados, 'nome', 80, true, 'o nome do produto'), cor = app.texto(p_dados, 'cor', 40),
      ref = app.texto(p_dados, 'ref', 30, false, 'código'), categoria = app.texto(p_dados, 'categoria', 60), publico = pub,
      descricao = app.texto(p_dados, 'descricao', 300, false, 'descrição'), preco = v_preco, tamanhos = tams, minimo = v_minimo,
      atualizado_em = now(), atualizado_por = eu.id
    where id = p_id returning id into v_id;
    perform app.exigir(v_id is not null, 'Este produto não existe mais.');
    insert into public.produtos_custo (produto_id, custo) values (v_id, v_custo)
      on conflict (produto_id) do update set custo = excluded.custo, atualizado_em = now();
  end if;
  return v_id;
end $$;

create or replace function public.definir_ativo_produto(p_id uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode alterar produtos.');
  update public.produtos set ativo = coalesce(p_ativo, true), atualizado_em = now(), atualizado_por = eu.id where id = p_id;
  perform app.exigir(found, 'Este produto não existe mais.');
end $$;

create or replace function public.salvar_foto(p_produto uuid, p_thumb text, p_foto text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode alterar fotos.');
  perform app.exigir(exists (select 1 from public.produtos where id = p_produto), 'Este produto não existe mais.');
  perform app.exigir(p_thumb ~ '^data:image/jpeg;base64,' and p_foto ~ '^data:image/jpeg;base64,', 'A foto precisa estar em JPEG.');
  perform app.exigir(char_length(p_foto) <= 700000 and char_length(p_thumb) <= 80000, 'A foto é grande demais. Use uma imagem menor.');
  insert into public.produto_fotos (produto_id, thumb, foto, atualizado_por) values (p_produto, p_thumb, p_foto, eu.id)
    on conflict (produto_id) do update set thumb = excluded.thumb, foto = excluded.foto, atualizado_em = now(), atualizado_por = eu.id;
end $$;

create or replace function public.remover_foto(p_produto uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_perm('estoque', 'Seu usuário não pode alterar fotos.');
  delete from public.produto_fotos where produto_id = p_produto;
end $$;

-- Entrada de mercadoria (e, opcionalmente, a conta a pagar ao fornecedor).
create or replace function public.registrar_entrada(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  eu public.perfis; pr public.produtos; q jsonb; v_custo bigint; d date; v_id uuid; n bigint; forn text; v_obs text; desp jsonb; venc date; paga boolean;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode lançar entradas de mercadoria.');
  select * into pr from public.produtos where id = (p_dados ->> 'produtoId')::uuid;
  perform app.exigir(pr.id is not null, 'Escolha o produto.');
  q := app.qtds(p_dados -> 'qtds', true);
  v_custo := app.inteiro(p_dados, 'custoUnit', 0, 100000000, 'o custo', 0);
  d := app.data(p_dados, 'data', 'a data da chegada');
  perform app.exigir(d <= app.hoje(), 'A data da chegada não pode ser futura.');
  forn := app.texto(p_dados, 'fornecedor', 80, false, 'fornecedor');
  v_obs := app.texto(p_dados, 'obs', 200, false, 'observação');
  insert into public.movimentos (produto_id, tipo, data, qtds, custo_unit, fornecedor, obs, criado_por)
  values (pr.id, 'entrada', d, q, v_custo, forn, v_obs, eu.id) returning id into v_id;
  if coalesce((p_dados ->> 'atualizarCusto')::boolean, false) then
    insert into public.produtos_custo (produto_id, custo) values (pr.id, v_custo)
      on conflict (produto_id) do update set custo = excluded.custo, atualizado_em = now();
  end if;
  desp := p_dados -> 'despesa';
  if desp is not null and jsonb_typeof(desp) = 'object' then
    perform app.exigir_perm('despesas', 'Seu usuário não pode lançar contas a pagar. Registre só a entrada.');
    select sum(value::int) into n from jsonb_each_text(q);
    if v_custo * n > 0 then
      paga := coalesce((desp ->> 'paga')::boolean, false);
      venc := case when paga then d else app.data(desp, 'vencimento', 'o vencimento da conta') end;
      insert into public.despesas (descricao, categoria, valor, vencimento, paga_em, obs, criado_por, atualizado_por)
      values (left('Mercadoria: ' || pr.nome || case when pr.cor <> '' then ' · ' || pr.cor else '' end || ' (' || n || case when n = 1 then ' peça)' else ' peças)' end || case when forn <> '' then ' · ' || forn else '' end, 120),
        'Compra de mercadoria', v_custo * n, venc, case when paga then d end, v_obs, eu.id, eu.id);
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.registrar_ajuste(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; pr public.produtos; q jsonb; d date; v_id uuid; mot text;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode ajustar o estoque.');
  select * into pr from public.produtos where id = (p_dados ->> 'produtoId')::uuid;
  perform app.exigir(pr.id is not null, 'Escolha o produto.');
  q := app.qtds(p_dados -> 'qtds', false);
  d := app.data(p_dados, 'data', 'a data');
  perform app.exigir(d <= app.hoje(), 'A data do ajuste não pode ser futura.');
  mot := app.texto(p_dados, 'motivo', 60, true, 'o motivo');
  perform app.exigir(mot in ('Contagem do estoque','Defeito','Perda ou furto','Troca com cliente','Brinde ou uso da loja','Devolução ao fornecedor','Correção de lançamento'), 'Motivo inválido.');
  insert into public.movimentos (produto_id, tipo, data, qtds, motivo, obs, criado_por)
  values (pr.id, 'ajuste', d, q, mot, app.texto(p_dados, 'obs', 200, false, 'observação'), eu.id) returning id into v_id;
  return v_id;
end $$;

-- "Desfazer" uma entrada ou ajuste: o lançamento é estornado (continua registrado).
create or replace function public.estornar_movimento(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; m public.movimentos;
begin
  eu := app.exigir_perm('estoque', 'Seu usuário não pode desfazer lançamentos de estoque.');
  select * into m from public.movimentos where id = p_id for update;
  perform app.exigir(m.id is not null and m.estornado_em is null, 'Este lançamento já foi desfeito.');
  update public.movimentos set estornado_em = now(), estornado_por = eu.id where id = p_id;
  perform app.auditar('estoque.estorno', p_id::text, jsonb_build_object('produtoId', m.produto_id, 'tipo', m.tipo, 'qtds', m.qtds, 'data', m.data));
end $$;

-- Nova venda.
create or replace function public.registrar_venda(p_venda jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; v_id uuid := gen_random_uuid(); sub int; c jsonb; num bigint;
begin
  eu := app.exigir_perm('vendas', 'Seu usuário não pode registrar vendas.');
  perform app.exigir(p_venda is not null and jsonb_typeof(p_venda) = 'object', 'Dados da venda inválidos.');
  -- a venda é criada primeiro com valores provisórios e atualizada depois dos itens
  insert into public.vendas (id, data, vendedor_id, vendedor_nome, subtotal, desconto, total, pagamento)
  values (v_id, app.hoje(), eu.id, eu.nome, 0, 0, 0, 'Pix');
  sub := app.gravar_itens(v_id, p_venda -> 'itens', null, true);
  c := app.cabecalho_venda(p_venda, sub);
  update public.vendas set data = (c ->> 'data')::date, subtotal = sub, desconto = (c ->> 'desconto')::int, total = (c ->> 'total')::int,
    taxa_pct = (c ->> 'taxa')::numeric, pagamento = c ->> 'pagamento', parcelas = (c ->> 'parcelas')::int, recebido = (c ->> 'recebido')::int,
    canal = c ->> 'canal', cliente = c ->> 'cliente', telefone = c ->> 'telefone', obs = c ->> 'obs',
    numero = nextval('public.vendas_numero_seq')
  where id = v_id
  returning numero into num;
  return jsonb_build_object('id', v_id, 'numero', num);
end $$;

-- Edição de venda: exige motivo, confere a versão (ninguém editou ao mesmo tempo)
-- e grava o antes e o depois no histórico.
create or replace function public.editar_venda(p_id uuid, p_versao integer, p_venda jsonb, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; v public.vendas; antes jsonb; depois jsonb; antigos jsonb; sub int; c jsonb; mot text := btrim(coalesce(p_motivo, ''));
begin
  eu := app.exigir_perm('editar', 'Seu usuário não pode editar vendas.');
  select * into v from public.vendas where id = p_id for update;
  perform app.exigir(v.id is not null and app.ve_venda(v.vendedor_id), 'Esta venda não existe ou você não tem acesso a ela.');
  perform app.exigir(v.status = 'ok', 'Uma venda cancelada não pode ser editada.');
  perform app.exigir(v.versao = p_versao, 'Esta venda foi alterada por outra pessoa enquanto você editava. Feche e abra a venda de novo.');
  perform app.exigir(char_length(mot) between 10 and 300, 'Informe o motivo da alteração, com 10 a 300 caracteres.');
  antes := app.snap_venda(p_id);
  select coalesce(jsonb_agg(jsonb_build_object('produtoId', i.produto_id, 'tam', i.tam, 'nome', i.nome, 'cor', i.cor, 'precoTabela', i.preco_tabela, 'custo', c2.custo)), '[]'::jsonb)
    into antigos from public.venda_itens i left join public.venda_custos c2 on c2.item_id = i.id where i.venda_id = p_id;
  delete from public.venda_itens where venda_id = p_id;
  sub := app.gravar_itens(p_id, p_venda -> 'itens', antigos, false);
  c := app.cabecalho_venda(p_venda, sub);
  update public.vendas set data = (c ->> 'data')::date, subtotal = sub, desconto = (c ->> 'desconto')::int, total = (c ->> 'total')::int,
    taxa_pct = case when c ->> 'pagamento' = v.pagamento then v.taxa_pct else (c ->> 'taxa')::numeric end,
    pagamento = c ->> 'pagamento', parcelas = (c ->> 'parcelas')::int, recebido = (c ->> 'recebido')::int,
    canal = c ->> 'canal', cliente = c ->> 'cliente', telefone = c ->> 'telefone', obs = c ->> 'obs',
    versao = versao + 1, editada_em = now(), editada_por_nome = eu.nome
  where id = p_id;
  depois := app.snap_venda(p_id);
  perform app.exigir(antes <> depois, 'Nada foi alterado. Corrija o que estiver errado antes de salvar.');
  insert into public.historico_vendas (venda_id, seq, tipo, por_id, por_nome, por_funcao, motivo, antes, depois)
  values (p_id, coalesce((select max(seq) from public.historico_vendas where venda_id = p_id), 0) + 1, 'edicao', eu.id, eu.nome, app.nome_funcao(eu.papel), mot, antes, depois);
  return jsonb_build_object('versao', v.versao + 1);
end $$;

create or replace function public.cancelar_venda(p_id uuid, p_versao integer, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; v public.vendas; antes jsonb; mot text := btrim(coalesce(p_motivo, ''));
begin
  eu := app.exigir_perm('cancelar', 'Seu usuário não pode cancelar vendas.');
  select * into v from public.vendas where id = p_id for update;
  perform app.exigir(v.id is not null and app.ve_venda(v.vendedor_id), 'Esta venda não existe ou você não tem acesso a ela.');
  perform app.exigir(v.status = 'ok', 'Esta venda já está cancelada.');
  perform app.exigir(v.versao = p_versao, 'Esta venda foi alterada por outra pessoa. Feche e abra a venda de novo.');
  perform app.exigir(char_length(mot) between 10 and 300, 'Informe o motivo do cancelamento, com 10 a 300 caracteres.');
  antes := app.snap_venda(p_id);
  update public.vendas set status = 'cancelada', versao = versao + 1, cancelada_em = now(), cancelada_por_nome = eu.nome, motivo_cancel = mot where id = p_id;
  insert into public.historico_vendas (venda_id, seq, tipo, por_id, por_nome, por_funcao, motivo, antes, depois)
  values (p_id, coalesce((select max(seq) from public.historico_vendas where venda_id = p_id), 0) + 1, 'cancelamento', eu.id, eu.nome, app.nome_funcao(eu.papel), mot, antes, app.snap_venda(p_id));
end $$;

-- Despesas: lançamento (com repetição mensal) e edição.
create or replace function public.salvar_despesa(p_id uuid, p_dados jsonb, p_meses integer default 1) returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu public.perfis; v_descr text; v_cat text; v_valor bigint; v_venc date; v_paga date; v_forma text; v_obs text; v_grupo uuid; i int; vv date;
begin
  eu := app.exigir_perm('despesas', 'Seu usuário não pode lançar despesas.');
  v_descr := app.texto(p_dados, 'descricao', 120, true, 'a descrição');
  v_cat := app.texto(p_dados, 'categoria', 60, true, 'a categoria');
  v_valor := app.inteiro(p_dados, 'valor', 1, 1000000000, 'o valor');
  v_venc := app.data(p_dados, 'vencimento', 'o vencimento');
  v_paga := case when p_dados ->> 'pagaEm' is null or p_dados ->> 'pagaEm' = '' then null else app.data(p_dados, 'pagaEm', 'a data do pagamento') end;
  perform app.exigir(v_paga is null or v_paga <= app.hoje(), 'A data do pagamento não pode ser futura.');
  v_forma := app.texto(p_dados, 'forma', 40, false, 'forma de pagamento');
  v_obs := app.texto(p_dados, 'obs', 200, false, 'observação');
  if p_id is not null then
    update public.despesas set descricao = v_descr, categoria = v_cat, valor = v_valor, vencimento = v_venc, paga_em = v_paga, forma = v_forma, obs = v_obs,
      atualizado_em = now(), atualizado_por = eu.id
    where id = p_id and excluida_em is null;
    perform app.exigir(found, 'Esta despesa não existe mais.');
    return;
  end if;
  perform app.exigir(coalesce(p_meses, 1) between 1 and 24, 'Informe de 2 a 24 meses.');
  v_grupo := case when coalesce(p_meses, 1) > 1 then gen_random_uuid() end;
  for i in 0 .. coalesce(p_meses, 1) - 1 loop
    -- mesmo dia de vencimento; em meses mais curtos, o último dia do mês
    vv := least((date_trunc('month', v_venc) + make_interval(months => i))::date + (extract(day from v_venc)::int - 1),
                ((date_trunc('month', v_venc) + make_interval(months => i + 1))::date - 1));
    insert into public.despesas (descricao, categoria, valor, vencimento, paga_em, forma, obs, grupo, criado_por, atualizado_por)
    values (v_descr, v_cat, v_valor, vv, case when i = 0 then v_paga end, v_forma, v_obs, v_grupo, eu.id, eu.id);
  end loop;
end $$;

create or replace function public.pagar_despesa(p_id uuid, p_data date, p_forma text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis;
begin
  eu := app.exigir_perm('despesas', 'Seu usuário não pode pagar despesas.');
  perform app.exigir(p_data is not null and p_data <= app.hoje(), 'Informe a data do pagamento (não pode ser futura).');
  perform app.exigir(char_length(coalesce(p_forma, '')) <= 40, 'Forma de pagamento inválida.');
  update public.despesas set paga_em = p_data, forma = coalesce(btrim(p_forma), ''), atualizado_em = now(), atualizado_por = eu.id
  where id = p_id and excluida_em is null;
  perform app.exigir(found, 'Esta despesa não existe mais.');
end $$;

create or replace function public.excluir_despesa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu public.perfis; d public.despesas;
begin
  eu := app.exigir_perm('despesas', 'Seu usuário não pode excluir despesas.');
  update public.despesas set excluida_em = now(), excluida_por = eu.id where id = p_id and excluida_em is null returning * into d;
  perform app.exigir(d.id is not null, 'Esta despesa não existe mais.');
  perform app.auditar('despesa.exclusao', p_id::text, jsonb_build_object('descricao', d.descricao, 'valor', d.valor, 'vencimento', d.vencimento));
end $$;

-- Ajustes da loja (somente administrador). Cada chave é validada.
create or replace function public.salvar_config(p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu public.perfis; atual jsonb; novo jsonb; k text; v jsonb; x jsonb; n numeric;
  permitidas text[] := array['taxas','categoriasProduto','categoriasDespesa','canais','estoqueMinimo','meta','metas','loja'];
begin
  eu := app.exigir_perm('ajustes', 'Somente administradores alteram os ajustes da loja.');
  perform app.exigir(p_dados is not null and jsonb_typeof(p_dados) = 'object', 'Ajustes inválidos.');
  select dados into atual from public.config where id = 1 for update;
  novo := coalesce(atual, '{}'::jsonb);
  for k, v in select * from jsonb_each(p_dados) loop
    perform app.exigir(k = any (permitidas), 'Ajuste desconhecido: ' || left(k, 40) || '.');
    if k = 'taxas' then
      perform app.exigir(jsonb_typeof(v) = 'object', 'Taxas inválidas.');
      for x in select value from jsonb_each(v) loop
        perform app.exigir(jsonb_typeof(x) = 'number' and (x #>> '{}')::numeric between 0 and 30, 'Cada taxa precisa estar entre 0% e 30%.');
      end loop;
      perform app.exigir(coalesce((select bool_and(key in ('Pix','Dinheiro','Débito','Crédito à vista','Crédito parcelado')) from jsonb_each(v)), true), 'Forma de pagamento desconhecida nas taxas.');
    elsif k in ('categoriasProduto','categoriasDespesa','canais') then
      perform app.exigir(jsonb_typeof(v) = 'array' and jsonb_array_length(v) between 1 and 60, 'Cada lista precisa ter de 1 a 60 itens.');
      perform app.exigir((select bool_and(jsonb_typeof(e) = 'string' and char_length(btrim(e #>> '{}')) between 1 and case when k = 'canais' then 40 else 60 end) from jsonb_array_elements(v) e),
        'Os itens das listas precisam ter de 1 a 60 caracteres.');
    elsif k = 'estoqueMinimo' then
      perform app.exigir(jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 9999 and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric), 'O estoque mínimo precisa ser um número inteiro.');
    elsif k = 'meta' then
      perform app.exigir(jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 100000000000, 'Meta inválida.');
    elsif k = 'metas' then
      perform app.exigir(jsonb_typeof(v) = 'object', 'Metas inválidas.');
      perform app.exigir(coalesce((select bool_and(key ~ '^\d{4}-(0[1-9]|1[0-2])$' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 100000000000) from jsonb_each(v)), true), 'Metas inválidas.');
    elsif k = 'loja' then
      perform app.exigir(jsonb_typeof(v) = 'object', 'Dados da loja inválidos.');
      perform app.exigir(coalesce((select bool_and(key in ('nome','cnpj','endereco','cidade','whatsapp','instagram','horario','troca','mensagem') and jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= 300) from jsonb_each(v)), true),
        'Os dados da loja têm um campo inválido ou longo demais.');
      perform app.exigir(btrim(coalesce(v ->> 'nome', '')) <> '', 'Informe o nome da loja.');
    end if;
    novo := novo || jsonb_build_object(k, v);
  end loop;
  update public.config set dados = novo, atualizado_em = now(), atualizado_por = eu.id where id = 1;
  perform app.auditar('config.alteracao', 'config', jsonb_build_object('chaves', (select jsonb_agg(key) from jsonb_object_keys(p_dados) key)));
end $$;

-- Cria o primeiro administrador. Só funciona enquanto não houver nenhum e só
-- pode ser executada pelo SQL Editor do Supabase (não pela API).
create or replace function public.criar_admin_inicial(p_email text, p_nome text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if exists (select 1 from public.perfis where papel = 'admin') then
    raise exception 'Já existe um administrador. Cadastre os demais usuários pelo aplicativo.';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'Crie antes o usuário % em Authentication > Users > Add user.', p_email; end if;
  insert into public.perfis (id, email, nome, papel, ativo, trocar_senha) values (uid, lower(btrim(p_email)), btrim(p_nome), 'admin', true, false);
  return 'Administrador criado: ' || p_email;
end $$;

-- -----------------------------------------------------------------------------
-- Quem pode executar cada função
-- -----------------------------------------------------------------------------
revoke all on all functions in schema app from public, anon, authenticated;
-- As políticas de RLS rodam como "authenticated" e precisam destas funções; as demais
-- só são chamadas de dentro das funções públicas (que rodam como dona do banco).
grant execute on function app.ativo(), app.permissoes(), app.pode(text), app.ver_custos(), app.ver_todas_vendas(), app.hoje() to authenticated;
grant execute on all functions in schema app to service_role;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.meu_perfil(), public.estoque_atual(),
  public.salvar_produto(uuid, jsonb, jsonb), public.definir_ativo_produto(uuid, boolean),
  public.salvar_foto(uuid, text, text), public.remover_foto(uuid),
  public.registrar_entrada(jsonb), public.registrar_ajuste(jsonb), public.estornar_movimento(uuid),
  public.registrar_venda(jsonb), public.editar_venda(uuid, integer, jsonb, text), public.cancelar_venda(uuid, integer, text),
  public.salvar_despesa(uuid, jsonb, integer), public.pagar_despesa(uuid, date, text), public.excluir_despesa(uuid),
  public.salvar_config(jsonb)
  to authenticated;
-- criar_admin_inicial: nenhum papel da API pode executar (somente o SQL Editor).
revoke all on function public.criar_admin_inicial(text, text) from public, anon, authenticated, service_role;

-- Funções criadas no futuro não ficam executáveis por padrão.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;
