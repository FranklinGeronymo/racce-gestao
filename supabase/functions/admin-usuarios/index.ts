// =============================================================================
// Racce · Gestão — função de servidor "admin-usuarios" (Supabase Edge Function)
//
// Faz o que o navegador NÃO pode fazer com segurança, porque exige a chave
// secreta do projeto (que fica só aqui, no servidor):
//   • criar usuários (com senha temporária gerada aqui);
//   • redefinir a senha de alguém (o administrador recebe uma senha temporária);
//   • mudar nome, e-mail, função, permissões e situação (ativo/inativo);
//   • trocar a própria senha, confirmando a senha atual.
//
// Toda chamada é conferida aqui: a sessão é validada no Supabase Auth e as ações
// de administração exigem um perfil de administrador ativo no banco.
// Sem dependências externas: usa só fetch e as APIs REST do Supabase.
// =============================================================================

export type Ambiente = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;          // chave pública (publishable "sb_publishable_..." ou a antiga "anon")
  SUPABASE_SERVICE_ROLE_KEY: string;  // chave secreta (secret "sb_secret_..." ou a antiga "service_role")
  ALLOWED_ORIGINS: string; // origens do aplicativo, separadas por vírgula
};

/**
 * Cabeçalhos para uma chave do projeto. As chaves novas (sb_publishable_/sb_secret_) não são JWT e
 * vão SÓ no cabeçalho apikey (no Authorization o Supabase as recusa com "Invalid JWT").
 * As chaves antigas (JWT, começam com "eyJ") também vão no Authorization, como sempre foi.
 */
export function cabecalhosChave(chave: string): Record<string, string> {
  return chave.startsWith('eyJ') ? { apikey: chave, Authorization: `Bearer ${chave}` } : { apikey: chave };
}

/** Lê a chave nova (JSON por nome, "default") e, se não houver, a antiga. */
export function lerChave(novas: string | undefined, antiga: string | undefined): string {
  if (novas) { try { const o = JSON.parse(novas); if (o && typeof o.default === 'string' && o.default) return o.default; } catch { /* segue para a antiga */ } }
  return antiga ?? '';
}

type Perfil = { id: string; email: string; nome: string; papel: string; paginas: string[]; extras: string[]; ativo: boolean; trocar_senha: boolean };

const PAPEIS = ['admin', 'gerente', 'vendedor', 'estoquista', 'financeiro', 'personalizado'];
const PAGINAS = ['painel', 'vendas', 'estoque', 'despesas', 'resultado'];
const EXTRAS = ['equipe', 'cancelar', 'editar', 'historico', 'custos'];
const MAX_TENTATIVAS = 5;          // senhas atuais erradas…
const JANELA_TENTATIVAS_MIN = 15;  // …a cada 15 minutos, por usuário
const BAN_PERMANENTE = '876000h';  // ~100 anos: o Supabase Auth recusa novos logins e renovações

class ErroHttp extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---------- utilidades ----------
function json(corpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function texto(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max + 1);
}

function validarEmail(v: unknown): string {
  const e = texto(v, 254).toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new ErroHttp(400, 'Informe um e-mail válido.');
  return e;
}

function validarNome(v: unknown): string {
  const n = texto(v, 60);
  if (n.length < 2 || n.length > 60) throw new ErroHttp(400, 'O nome deve ter de 2 a 60 caracteres.');
  return n;
}

function validarLista(v: unknown, permitidos: string[], rotulo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !permitidos.includes(x))) throw new ErroHttp(400, `Lista de ${rotulo} inválida.`);
  return [...new Set(v as string[])];
}

/** Política de senha: pelo menos 10 caracteres, com letras e números, e sem repetir o e-mail. */
export function problemaSenha(senha: string, email: string): string | null {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'A senha precisa ter letras e números.';
  const local = (email.split('@')[0] || '').toLowerCase();
  if (local.length >= 4 && senha.toLowerCase().includes(local)) return 'A senha não pode conter o seu e-mail.';
  if (/^(.)\1+$/.test(senha) || /^(0123456789|1234567890|abcdefghij)/i.test(senha)) return 'Escolha uma senha menos previsível.';
  return null;
}

/** Senha temporária forte (14 caracteres, sem caracteres parecidos como 0/O e 1/l). */
export function senhaTemporaria(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789', todos = letras + numeros;
  const r = new Uint32Array(14);
  crypto.getRandomValues(r);
  const s = Array.from(r, (n, i) => (i === 0 ? letras : i === 1 ? numeros : todos)[n % (i === 0 ? letras.length : i === 1 ? numeros.length : todos.length)]);
  // embaralha para letra e número não ficarem sempre no início
  const t = new Uint32Array(s.length);
  crypto.getRandomValues(t);
  for (let i = s.length - 1; i > 0; i--) { const j = t[i] % (i + 1); [s[i], s[j]] = [s[j], s[i]]; }
  return s.join('');
}

// ---------- clientes das APIs do Supabase ----------
function apis(env: Ambiente, f: typeof fetch) {
  const servico = cabecalhosChave(env.SUPABASE_SERVICE_ROLE_KEY);

  async function chamar(url: string, init: RequestInit): Promise<{ status: number; corpo: any }> {
    const r = await f(url, init);
    const txt = await r.text();
    let corpo: any = null;
    try { corpo = txt ? JSON.parse(txt) : null; } catch { corpo = txt; }
    return { status: r.status, corpo };
  }

  return {
    /** Usuário dono do token (o Supabase Auth confere assinatura, validade e se a sessão ainda existe). */
    async usuarioDoToken(token: string) {
      const r = await chamar(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
      if (r.status !== 200 || !r.corpo?.id) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.');
      return r.corpo as { id: string; email: string };
    },
    async conferirSenha(email: string, senha: string): Promise<string | null> {
      const r = await chamar(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
      if (r.status === 200 && r.corpo?.access_token) return r.corpo.access_token as string;
      if (r.status === 429) throw new ErroHttp(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      return null;
    },
    async encerrarSessoes(token: string, escopo: 'local' | 'others' | 'global') {
      await chamar(`${env.SUPABASE_URL}/auth/v1/logout?scope=${escopo}`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    },
    async criarUsuarioAuth(email: string, senha: string) {
      const r = await chamar(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: { ...servico, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha, email_confirm: true }) });
      if (r.status === 422 || r.status === 409 || /already|registered|exists/i.test(JSON.stringify(r.corpo ?? ''))) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.');
      if (r.status >= 300 || !r.corpo?.id) throw new Error(`auth create ${r.status}`);
      return r.corpo.id as string;
    },
    async atualizarUsuarioAuth(id: string, dados: Record<string, unknown>) {
      const r = await chamar(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { ...servico, 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
      if (r.status === 422 && dados.email) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.');
      if (r.status >= 300) throw new Error(`auth update ${r.status}`);
    },
    async apagarUsuarioAuth(id: string) {
      await chamar(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: servico });
    },
    async perfil(id: string): Promise<Perfil | null> {
      const r = await chamar(`${env.SUPABASE_URL}/rest/v1/perfis?id=eq.${encodeURIComponent(id)}&select=id,email,nome,papel,paginas,extras,ativo,trocar_senha`, { headers: servico });
      if (r.status !== 200) throw new Error(`perfil ${r.status}`);
      return Array.isArray(r.corpo) && r.corpo[0] ? r.corpo[0] : null;
    },
    async gravarPerfil(metodo: 'POST' | 'PATCH', dados: Record<string, unknown>, id?: string) {
      const url = `${env.SUPABASE_URL}/rest/v1/perfis` + (metodo === 'PATCH' ? `?id=eq.${encodeURIComponent(id!)}` : '');
      const r = await chamar(url, { method: metodo, headers: { ...servico, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(dados) });
      if (r.status >= 300) {
        const msg = String(r.corpo?.message ?? '');
        if (/administrador ativo/.test(msg)) throw new ErroHttp(409, 'É preciso manter pelo menos um administrador ativo.');
        if (/perfis_email_unico|duplicate/.test(msg)) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.');
        throw new Error(`perfil ${metodo} ${r.status} ${msg}`);
      }
    },
    async auditar(por: Perfil | null, acao: string, alvo: string, detalhes: Record<string, unknown>) {
      await chamar(`${env.SUPABASE_URL}/rest/v1/auditoria`, {
        method: 'POST', headers: { ...servico, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ por_id: por?.id ?? null, por_nome: por?.nome ?? '', acao, alvo, detalhes }) });
    },
    async tentativasRecentes(userId: string): Promise<number> {
      const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60000).toISOString();
      const r = await chamar(`${env.SUPABASE_URL}/rest/v1/tentativas_senha?user_id=eq.${encodeURIComponent(userId)}&em=gte.${encodeURIComponent(desde)}&select=id`, { headers: servico });
      return Array.isArray(r.corpo) ? r.corpo.length : 0;
    },
    async registrarTentativa(userId: string) {
      await chamar(`${env.SUPABASE_URL}/rest/v1/tentativas_senha`, {
        method: 'POST', headers: { ...servico, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: userId }) });
    },
  };
}

// ---------- ações ----------
async function trocarPropriaSenha(api: ReturnType<typeof apis>, token: string, usuario: { id: string; email: string }, corpo: any) {
  const atual = String(corpo?.senha_atual ?? ''), nova = String(corpo?.nova_senha ?? '');
  if (!atual) throw new ErroHttp(400, 'Informe a senha atual.');
  const prob = problemaSenha(nova, usuario.email);
  if (prob) throw new ErroHttp(400, prob);
  if (nova === atual) throw new ErroHttp(400, 'A nova senha precisa ser diferente da atual.');
  if (await api.tentativasRecentes(usuario.id) >= MAX_TENTATIVAS) throw new ErroHttp(429, `Muitas tentativas com a senha errada. Aguarde ${JANELA_TENTATIVAS_MIN} minutos.`);
  const tokenConferencia = await api.conferirSenha(usuario.email, atual);
  if (!tokenConferencia) { await api.registrarTentativa(usuario.id); throw new ErroHttp(400, 'A senha atual está incorreta.'); }
  await api.encerrarSessoes(tokenConferencia, 'local'); // a sessão aberta só para conferir a senha é descartada
  await api.atualizarUsuarioAuth(usuario.id, { password: nova });
  const p = await api.perfil(usuario.id);
  if (p) await api.gravarPerfil('PATCH', { trocar_senha: false }, usuario.id);
  await api.encerrarSessoes(token, 'others'); // desconecta outros aparelhos
  await api.auditar(p, 'usuario.troca_senha', usuario.id, {});
  return { ok: true };
}

async function criarUsuario(api: ReturnType<typeof apis>, eu: Perfil, corpo: any) {
  const email = validarEmail(corpo?.email), nome = validarNome(corpo?.nome), papel = String(corpo?.papel ?? '');
  if (!PAPEIS.includes(papel)) throw new ErroHttp(400, 'Função inválida.');
  const paginas = papel === 'personalizado' ? validarLista(corpo?.paginas, PAGINAS, 'painéis') : [];
  const extras = papel === 'personalizado' ? validarLista(corpo?.extras, EXTRAS, 'permissões') : [];
  if (papel === 'personalizado' && !paginas.length) throw new ErroHttp(400, 'Escolha pelo menos um painel.');
  const senha = senhaTemporaria();
  const id = await api.criarUsuarioAuth(email, senha);
  try {
    await api.gravarPerfil('POST', { id, email, nome, papel, paginas, extras, ativo: true, trocar_senha: true });
  } catch (e) {
    await api.apagarUsuarioAuth(id); // desfaz: não deixa conta sem perfil
    throw e;
  }
  await api.auditar(eu, 'usuario.criacao', id, { email, nome, papel, paginas, extras });
  return { ok: true, id, senha_temporaria: senha };
}

async function atualizarUsuario(api: ReturnType<typeof apis>, eu: Perfil, corpo: any) {
  const id = String(corpo?.id ?? '');
  const alvo = await api.perfil(id);
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  const nome = validarNome(corpo?.nome), papel = String(corpo?.papel ?? '');
  if (!PAPEIS.includes(papel)) throw new ErroHttp(400, 'Função inválida.');
  const paginas = papel === 'personalizado' ? validarLista(corpo?.paginas, PAGINAS, 'painéis') : [];
  const extras = papel === 'personalizado' ? validarLista(corpo?.extras, EXTRAS, 'permissões') : [];
  if (papel === 'personalizado' && !paginas.length) throw new ErroHttp(400, 'Escolha pelo menos um painel.');
  const ativo = corpo?.ativo !== false;
  const email = corpo?.email === undefined ? alvo.email : validarEmail(corpo.email);
  if (id === eu.id && !ativo) throw new ErroHttp(400, 'Você não pode desativar o próprio usuário.');
  if (id === eu.id && papel !== 'admin') throw new ErroHttp(400, 'Você não pode tirar a função de administrador de si mesmo. Peça a outro administrador.');
  // e-mail primeiro no Auth (pode recusar por duplicidade); se o perfil falhar depois, volta o e-mail
  if (email !== alvo.email) await api.atualizarUsuarioAuth(id, { email, email_confirm: true });
  try {
    // o banco recusa (gatilho) se a mudança deixar a loja sem administrador ativo
    await api.gravarPerfil('PATCH', { nome, papel, paginas, extras, ativo, email }, id);
  } catch (e) {
    if (email !== alvo.email) await api.atualizarUsuarioAuth(id, { email: alvo.email, email_confirm: true }).catch(() => null);
    throw e;
  }
  if (ativo !== alvo.ativo) await api.atualizarUsuarioAuth(id, { ban_duration: ativo ? 'none' : BAN_PERMANENTE });
  await api.auditar(eu, 'usuario.alteracao', id, {
    antes: { nome: alvo.nome, email: alvo.email, papel: alvo.papel, paginas: alvo.paginas, extras: alvo.extras, ativo: alvo.ativo },
    depois: { nome, email, papel, paginas, extras, ativo } });
  return { ok: true };
}

async function redefinirSenha(api: ReturnType<typeof apis>, eu: Perfil, corpo: any) {
  const id = String(corpo?.id ?? '');
  if (id === eu.id) throw new ErroHttp(400, 'Para mudar a sua própria senha, use "Trocar minha senha".');
  const alvo = await api.perfil(id);
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');
  const senha = senhaTemporaria();
  await api.atualizarUsuarioAuth(id, { password: senha });
  // com a troca pendente, o banco bloqueia todos os dados desse usuário até ele definir uma senha nova
  await api.gravarPerfil('PATCH', { trocar_senha: true }, id);
  await api.auditar(eu, 'usuario.redefinicao_senha', id, { email: alvo.email });
  return { ok: true, senha_temporaria: senha };
}

// ---------- entrada ----------
export async function handler(req: Request, env: Ambiente, f: typeof fetch = fetch): Promise<Response> {
  const origem = req.headers.get('Origin') ?? '';
  const permitidas = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const origemOk = permitidas.includes(origem);
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': origemOk ? origem : (permitidas[0] ?? ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: origemOk ? 204 : 403, headers: cors });
  if (!origemOk) return json({ erro: 'Origem não autorizada.' }, 403, cors);
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405, cors);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) throw new ErroHttp(401, 'Entre no sistema para continuar.');
    let corpo: any;
    try { corpo = await req.json(); } catch { throw new ErroHttp(400, 'Requisição inválida.'); }
    const api = apis(env, f);
    const usuario = await api.usuarioDoToken(token);
    const acao = String(corpo?.acao ?? '');

    if (acao === 'trocar_senha') return json(await trocarPropriaSenha(api, token, usuario, corpo), 200, cors);

    const eu = await api.perfil(usuario.id);
    if (!eu || !eu.ativo || eu.trocar_senha || eu.papel !== 'admin') throw new ErroHttp(403, 'Somente administradores gerenciam usuários.');
    if (acao === 'criar') return json(await criarUsuario(api, eu, corpo), 200, cors);
    if (acao === 'atualizar') return json(await atualizarUsuario(api, eu, corpo), 200, cors);
    if (acao === 'redefinir_senha') return json(await redefinirSenha(api, eu, corpo), 200, cors);
    throw new ErroHttp(400, 'Ação desconhecida.');
  } catch (e) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status, cors);
    console.error('admin-usuarios:', e instanceof Error ? e.message : e); // detalhe só no log do servidor
    return json({ erro: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500, cors);
  }
}

// No Supabase (Deno), publica a função. Nos testes locais, só o handler é importado.
// A verificação automática de JWT da plataforma fica desligada (verify_jwt = false), como o Supabase
// recomenda com as chaves novas: a sessão é conferida aqui, no Auth, a cada chamada (usuarioDoToken).
declare const Deno: any;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  const env: Ambiente = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '',
    SUPABASE_ANON_KEY: lerChave(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), Deno.env.get('SUPABASE_ANON_KEY')),
    SUPABASE_SERVICE_ROLE_KEY: lerChave(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
    ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS') ?? '',
  };
  Deno.serve((req: Request) => handler(req, env));
}
