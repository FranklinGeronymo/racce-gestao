// =============================================================================
// SOMENTE PARA TESTES. Um "Supabase" mínimo e local, rodando com Bun, que
// reproduz as rotas REST usadas pelo aplicativo e pela função admin-usuarios:
//   /auth/v1/*      → login, renovação, logout, usuário, administração (como o Supabase Auth)
//   /rest/v1/*      → leitura de tabelas e chamadas de função (como o PostgREST)
//   /functions/v1/admin-usuarios → a função de servidor de verdade (importada)
// O banco é o PostgreSQL local com a migração real aplicada: as regras de acesso
// (RLS e funções) testadas aqui são exatamente as que vão para produção.
//
// Uso: bun tests/servidor-falso/servidor.ts   (variáveis: PORTA, PGBANCO, PGHOST, PGPORT)
// =============================================================================
import { handler as adminUsuarios } from '../../supabase/functions/admin-usuarios/index.ts';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { join, normalize } from 'node:path';

const PORTA = Number(process.env.PORTA ?? 8787);
const BASE = `http://localhost:${PORTA}`;
const RAIZ = normalize(join(import.meta.dir, '../..'));
const SEGREDO_JWT = 'segredo-somente-para-testes-locais';
export const CHAVE_ANON = 'chave-publica-de-teste';
export const CHAVE_SERVICO = 'chave-secreta-de-teste';
const PG = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', process.env.PGHOST ?? '/tmp', '-p', process.env.PGPORT ?? '5499', '-U', 'postgres', '-d', process.env.PGBANCO ?? 'racce_e2e'];
const MAX_LINHAS = 1000; // mesmo limite padrão do Supabase

// ---------- PostgreSQL via psql ----------
function lit(v: unknown): string { return v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`; }
function ident(s: string): string { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new ErroApi(400, 'PGRST100', `identificador inválido: ${s}`); return s; }
class ErroApi extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

async function sql(consulta: string, papel: 'anon' | 'authenticated' | 'service_role' | 'postgres', claims: Record<string, unknown> | null): Promise<any> {
  const script = `\\set VERBOSITY verbose\nbegin;\n` +
    (claims ? `select set_config('request.jwt.claims', ${lit(JSON.stringify(claims))}, true) \\g /dev/null\n` : '') +
    (papel !== 'postgres' ? `set local role ${papel};\n` : '') + consulta + `;\ncommit;\n`;
  const p = Bun.spawn(['psql', ...PG], { stdin: new TextEncoder().encode(script), stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  await p.exited;
  const m = err.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
  if (m) {
    const code = m[1], msg = m[2].trim();
    const status = code === '42501' ? (papel === 'anon' ? 401 : 403) : code === 'P0001' || code.startsWith('22') || code.startsWith('23') ? 400 : 500;
    throw new ErroApi(status, code, msg);
  }
  if (p.exitCode !== 0) throw new ErroApi(500, 'XX000', err.trim() || 'erro no psql');
  const t = out.trim();
  return t === '' ? null : JSON.parse(t);
}

// ---------- JWT HS256 ----------
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function assinar(claims: Record<string, unknown>): string {
  const cab = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), corpo = b64(JSON.stringify(claims));
  return `${cab}.${corpo}.${b64(createHmac('sha256', SEGREDO_JWT).update(`${cab}.${corpo}`).digest())}`;
}
function verificar(token: string): Record<string, any> | null {
  const [cab, corpo, ass] = token.split('.');
  if (!cab || !corpo || !ass) return null;
  const esperado = createHmac('sha256', SEGREDO_JWT).update(`${cab}.${corpo}`).digest();
  const recebido = Buffer.from(ass, 'base64url');
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  const c = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  if (typeof c.exp !== 'number' || c.exp * 1000 < Date.now()) return null;
  if (!sessoes.has(c.session_id)) return null;
  return c;
}

// ---------- sessões do Auth (memória) ----------
const sessoes = new Map<string, string>();      // session_id -> user_id
const renovacoes = new Map<string, string>();   // refresh_token -> session_id
export const duracaoToken = { segundos: 3600 };

function novaSessao(user: { id: string; email: string }) {
  const sid = randomUUID(), refresh = randomUUID().replace(/-/g, '');
  sessoes.set(sid, user.id); renovacoes.set(refresh, sid);
  const exp = Math.floor(Date.now() / 1000) + duracaoToken.segundos;
  return { access_token: assinar({ sub: user.id, email: user.email, role: 'authenticated', session_id: sid, exp }), token_type: 'bearer',
    expires_in: duracaoToken.segundos, expires_at: exp, refresh_token: refresh, user: { id: user.id, email: user.email } };
}
function encerrar(sid: string, escopo: string) {
  const uid = sessoes.get(sid);
  for (const [s, u] of [...sessoes]) {
    if ((escopo === 'local' && s === sid) || (escopo === 'global' && u === uid) || (escopo === 'others' && u === uid && s !== sid)) {
      sessoes.delete(s); for (const [r, rs] of [...renovacoes]) if (rs === s) renovacoes.delete(r);
    }
  }
}

function resp(corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}
function chaveValida(req: Request) { const k = req.headers.get('apikey'); return k === CHAVE_ANON || k === CHAVE_SERVICO; }
function eServico(req: Request) { return (req.headers.get('Authorization') ?? '') === `Bearer ${CHAVE_SERVICO}`; }

// ---------- /auth/v1 ----------
async function auth(req: Request, url: URL): Promise<Response> {
  if (!chaveValida(req)) return resp({ message: 'No API key found in request' }, 401);
  const rota = url.pathname.replace('/auth/v1', '');
  const corpo = req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json().catch(() => ({}));

  if (rota === '/token' && url.searchParams.get('grant_type') === 'password') {
    const u = await sql(`select row_to_json(x) from (select id, email, banned_until > now() as banido from auth.users
      where lower(email) = lower(${lit(corpo.email)}) and encrypted_password = crypt(${lit(corpo.password)}, encrypted_password)) x`, 'postgres', null);
    if (!u) return resp({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    if (u.banido) return resp({ code: 400, error_code: 'user_banned', msg: 'User is banned' }, 400);
    await sql(`update auth.users set last_sign_in_at = now() where id = ${lit(u.id)}`, 'postgres', null);
    return resp(novaSessao(u));
  }
  if (rota === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const sid = renovacoes.get(corpo.refresh_token);
    if (!sid || !sessoes.has(sid)) return resp({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
    renovacoes.delete(corpo.refresh_token);
    const uid = sessoes.get(sid)!;
    const u = await sql(`select row_to_json(x) from (select id, email, banned_until > now() as banido from auth.users where id = ${lit(uid)}) x`, 'postgres', null);
    if (!u || u.banido) { encerrar(sid, 'global'); return resp({ code: 400, error_code: 'user_banned', msg: 'User is banned' }, 400); }
    sessoes.delete(sid);
    return resp(novaSessao(u));
  }
  if (rota.startsWith('/admin/users')) {
    if (!eServico(req)) return resp({ code: 403, msg: 'User not allowed' }, 403);
    const id = rota.split('/')[3];
    if (req.method === 'POST' && !id) {
      const existe = await sql(`select to_json(count(*)) from auth.users where lower(email) = lower(${lit(corpo.email)})`, 'postgres', null);
      if (existe > 0) return resp({ code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }, 422);
      const novo = await sql(`insert into auth.users as u (email, encrypted_password) values (lower(${lit(corpo.email)}), crypt(${lit(corpo.password)}, gen_salt('bf', 8)))
        returning row_to_json(u)`, 'postgres', null);
      return resp({ id: novo.id, email: novo.email });
    }
    if (req.method === 'PUT' && id) {
      const sets: string[] = [];
      if (corpo.password) sets.push(`encrypted_password = crypt(${lit(corpo.password)}, gen_salt('bf', 8))`);
      if (corpo.email) {
        const outro = await sql(`select to_json(count(*)) from auth.users where lower(email) = lower(${lit(corpo.email)}) and id <> ${lit(id)}`, 'postgres', null);
        if (outro > 0) return resp({ code: 422, error_code: 'email_exists', msg: 'email exists' }, 422);
        sets.push(`email = lower(${lit(corpo.email)})`);
      }
      if (corpo.ban_duration) sets.push(corpo.ban_duration === 'none' ? 'banned_until = null' : `banned_until = now() + interval '100 years'`);
      if (sets.length) await sql(`update auth.users set ${sets.join(', ')}, updated_at = now() where id = ${lit(id)}`, 'postgres', null);
      if (corpo.ban_duration && corpo.ban_duration !== 'none') for (const [s, u] of [...sessoes]) if (u === id) encerrar(s, 'global');
      return resp({ id });
    }
    if (req.method === 'DELETE' && id) { await sql(`delete from auth.users where id = ${lit(id)}`, 'postgres', null); return resp({}); }
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const c = verificar(token);
  if (rota === '/user' && req.method === 'GET') return c ? resp({ id: c.sub, email: c.email }) : resp({ code: 401, msg: 'invalid JWT' }, 401);
  if (rota === '/logout' && req.method === 'POST') { if (c) encerrar(c.session_id, url.searchParams.get('scope') ?? 'global'); return new Response(null, { status: 204 }); }
  return resp({ msg: 'not found' }, 404);
}

// ---------- /rest/v1 ----------
function papelDe(req: Request): { papel: 'anon' | 'authenticated' | 'service_role'; claims: Record<string, unknown> | null } {
  if (!chaveValida(req)) throw new ErroApi(401, 'PGRST301', 'No API key found in request');
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token === CHAVE_SERVICO) return { papel: 'service_role', claims: { role: 'service_role' } };
  if (!token || token === CHAVE_ANON) return { papel: 'anon', claims: { role: 'anon' } };
  const c = verificar(token);
  if (!c) throw new ErroApi(401, 'PGRST301', 'JWT expired');
  return { papel: 'authenticated', claims: c };
}

function filtros(url: URL): string {
  const conds: string[] = [];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const col = ident(k), i = v.indexOf('.'), op = v.slice(0, i), val = v.slice(i + 1);
    const mapa: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    if (mapa[op]) conds.push(`${col} ${mapa[op]} ${lit(val)}`);
    else if (op === 'is') conds.push(`${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    else if (op === 'in') conds.push(`${col} in (${val.replace(/^\(|\)$/g, '').split(',').map(lit).join(',')})`);
    else throw new ErroApi(400, 'PGRST100', `operador não suportado: ${op}`);
  }
  return conds.length ? ' where ' + conds.join(' and ') : '';
}

async function rest(req: Request, url: URL): Promise<Response> {
  const { papel, claims } = papelDe(req);
  const partes = url.pathname.replace('/rest/v1/', '').split('/');
  if (partes[0] === 'rpc') {
    const fn = ident(partes[1]);
    const args = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const sig = await sql(`select row_to_json(x) from (select p.proretset as conjunto, coalesce(p.proargnames, '{}') as nomes,
      array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = ${lit(fn)} limit 1) x`, 'postgres', null);
    if (!sig) throw new ErroApi(404, 'PGRST202', `função ${fn} não encontrada`);
    const params = (sig.nomes as string[]).map((nome, i) => {
      if (!(nome in args)) return null;
      const v = args[nome], tipo = sig.tipos[i];
      if (v === null) return `${nome} => null::${tipo}`;
      if (tipo === 'jsonb' || tipo === 'json') return `${nome} => ${lit(JSON.stringify(v))}::${tipo}`;
      return `${nome} => ${lit(v)}::${tipo}`;
    }).filter(Boolean).join(', ');
    const consulta = sig.conjunto ? `select coalesce(json_agg(r), '[]'::json) from public.${fn}(${params}) r` : `select to_json(public.${fn}(${params}))`;
    const r = await sql(consulta, papel, claims);
    return resp(r);
  }
  const tabela = ident(partes[0]);
  if (req.method === 'GET') {
    const cols = (url.searchParams.get('select') ?? '*').split(',').map((c) => (c === '*' ? '*' : ident(c.trim()))).join(', ');
    const ordem = url.searchParams.get('order');
    const orderBy = ordem ? ' order by ' + ordem.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ') : '';
    const limite = Math.min(Number(url.searchParams.get('limit') ?? MAX_LINHAS), MAX_LINHAS), desloc = Number(url.searchParams.get('offset') ?? 0);
    const r = await sql(`select coalesce(json_agg(t), '[]'::json) from (select ${cols} from public.${tabela}${filtros(url)}${orderBy} limit ${limite} offset ${desloc}) t`, papel, claims);
    return resp(r);
  }
  const corpo = await req.json();
  const chaves = Object.keys(corpo).map(ident);
  if (req.method === 'POST') {
    await sql(`insert into public.${tabela} (${chaves.join(', ')}) select ${chaves.join(', ')} from json_populate_record(null::public.${tabela}, ${lit(JSON.stringify(corpo))}::json)`, papel, claims);
    return new Response(null, { status: 201 });
  }
  if (req.method === 'PATCH') {
    await sql(`update public.${tabela} set (${chaves.join(', ')}) = (select ${chaves.join(', ')} from json_populate_record(null::public.${tabela}, ${lit(JSON.stringify(corpo))}::json))${filtros(url)}`, papel, claims);
    return new Response(null, { status: 204 });
  }
  throw new ErroApi(405, 'PGRST000', 'método não suportado');
}

// ---------- arquivos do aplicativo ----------
const TIPOS: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json', txt: 'text/plain', ico: 'image/x-icon' };
async function estatico(url: URL): Promise<Response> {
  if (url.pathname === '/js/config.js') {
    return new Response(`window.RACCE_CONFIG = { supabaseUrl: ${JSON.stringify(BASE)}, supabaseChavePublica: ${JSON.stringify(CHAVE_ANON)} };\n`, { headers: { 'Content-Type': TIPOS.js } });
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const caminho = normalize(join(RAIZ, rel));
  if (!caminho.startsWith(RAIZ) || /(^|\/)\.|node_modules|tests\/|supabase\//.test(rel)) return new Response('não encontrado', { status: 404 });
  const f = Bun.file(caminho);
  if (!(await f.exists())) return new Response('não encontrado', { status: 404 });
  return new Response(f, { headers: { 'Content-Type': TIPOS[rel.split('.').pop() ?? ''] ?? 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

const ambienteFuncao = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: CHAVE_ANON, SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO, ALLOWED_ORIGINS: BASE };

export const servidor = Bun.serve({
  port: PORTA,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/auth/v1/')) return await auth(req, url);
      if (url.pathname.startsWith('/rest/v1/')) return await rest(req, url);
      if (url.pathname === '/functions/v1/admin-usuarios') return await adminUsuarios(req, ambienteFuncao);
      return await estatico(url);
    } catch (e) {
      if (e instanceof ErroApi) return resp({ code: e.code, message: e.message, details: null, hint: null }, e.status);
      console.error(e);
      return resp({ code: 'XX000', message: 'erro interno do servidor de teste' }, 500);
    }
  },
});
console.log(`Supabase falso em ${BASE} (banco ${PG[PG.length - 1]})`);
