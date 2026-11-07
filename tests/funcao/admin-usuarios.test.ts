// Testes da função admin-usuarios contra o Supabase falso (tests/servidor-falso).
// Pré-requisitos: tests/servidor-falso/preparar.sh e o servidor rodando (PORTA=8787).
// Uso: bun test tests/funcao
import { describe, expect, test } from 'bun:test';
import { cabecalhosChave, lerChave, problemaSenha, senhaTemporaria } from '../../supabase/functions/admin-usuarios/index.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const ANON = 'chave-publica-de-teste';
const SENHA = 'Racce2026teste';

async function login(email: string, senha: string) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
  return { status: r.status, corpo: await r.json() as any };
}
async function token(email: string, senha = SENHA) { const r = await login(email, senha); if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r.corpo)}`); return r.corpo.access_token as string; }
async function funcao(tk: string | null, corpo: unknown, origem = BASE) {
  const h: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json', Origin: origem };
  if (tk) h.Authorization = `Bearer ${tk}`;
  const r = await fetch(`${BASE}/functions/v1/admin-usuarios`, { method: 'POST', headers: h, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json() as any };
}
async function rpc(tk: string, nome: string, args = {}) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return { status: r.status, corpo: await r.json() as any };
}
async function ler(tk: string, tabela: string) {
  const r = await fetch(`${BASE}/rest/v1/${tabela}?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${tk}` } });
  return { status: r.status, corpo: await r.json() as any };
}

describe('regras de senha', () => {
  test('senha temporária é forte e varia', () => {
    const a = senhaTemporaria(), b = senhaTemporaria();
    expect(a).toHaveLength(14); expect(a).not.toBe(b);
    expect(problemaSenha(a, 'x@y.com')).toBeNull();
    expect(a).not.toMatch(/[0O1lI]/);
  });
  test('política recusa senhas fracas', () => {
    expect(problemaSenha('curta1', 'a@b.com')).toContain('10 caracteres');
    expect(problemaSenha('somenteletras', 'a@b.com')).toContain('letras e números');
    expect(problemaSenha('1234567890', 'a@b.com')).toContain('letras e números');
    expect(problemaSenha('maria.souza2026', 'maria.souza@b.com')).toContain('e-mail');
    expect(problemaSenha('Treino forte 2026', 'ana@b.com')).toBeNull();
  });
});

describe('chaves do Supabase (novas e antigas)', () => {
  test('chave nova vai só no apikey; a antiga (JWT) também no Authorization', () => {
    expect(cabecalhosChave('sb_secret_abc')).toEqual({ apikey: 'sb_secret_abc' });
    expect(cabecalhosChave('eyJhbGciOi.x.y')).toEqual({ apikey: 'eyJhbGciOi.x.y', Authorization: 'Bearer eyJhbGciOi.x.y' });
  });
  test('lê a chave "default" do formato novo e, sem ele, usa a antiga', () => {
    expect(lerChave('{"default":"sb_secret_novo"}', 'eyJ-antiga')).toBe('sb_secret_novo');
    expect(lerChave(undefined, 'eyJ-antiga')).toBe('eyJ-antiga');
    expect(lerChave('não é json', 'eyJ-antiga')).toBe('eyJ-antiga');
  });
});

describe('proteções de acesso à função', () => {
  test('sem login: 401', async () => {
    const r = await funcao(null, { acao: 'criar' });
    expect(r.status).toBe(401);
  });
  test('origem desconhecida: 403', async () => {
    const r = await funcao(await token('admin@racce.test'), { acao: 'criar' }, 'https://site-malicioso.example');
    expect(r.status).toBe(403);
  });
  test('token forjado: 401', async () => {
    const forjado = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.assinatura-falsa';
    const r = await funcao(forjado, { acao: 'criar', email: 'x@y.com', nome: 'X', papel: 'admin' });
    expect(r.status).toBe(401);
  });
  test('vendedor não cria usuários (nem administrador para si)', async () => {
    const r = await funcao(await token('vendas@racce.test'), { acao: 'criar', email: 'invasor@x.com', nome: 'Invasor', papel: 'admin' });
    expect(r.status).toBe(403);
    expect(r.corpo.erro).toContain('Somente administradores');
  });
  test('vendedor não redefine a senha de ninguém', async () => {
    const r = await funcao(await token('vendas@racce.test'), { acao: 'redefinir_senha', id: '10000000-0000-0000-0000-000000000001' });
    expect(r.status).toBe(403);
  });
});

describe('ciclo de vida de um usuário', () => {
  let id = '', temp = '', tkAdmin = '';
  const email = `nova.${Date.now()}@racce.test`;

  test('administrador cria usuário e recebe senha temporária', async () => {
    tkAdmin = await token('admin@racce.test');
    const r = await funcao(tkAdmin, { acao: 'criar', email, nome: 'Nina Nova', papel: 'personalizado', paginas: ['vendas'], extras: ['editar'] });
    expect(r.status).toBe(200);
    id = r.corpo.id; temp = r.corpo.senha_temporaria;
    expect(temp).toHaveLength(14);
  });
  test('e-mail repetido é recusado', async () => {
    const r = await funcao(tkAdmin, { acao: 'criar', email: email.toUpperCase(), nome: 'Outra', papel: 'vendedor' });
    expect(r.status).toBe(409);
  });
  test('dados inválidos são recusados', async () => {
    expect((await funcao(tkAdmin, { acao: 'criar', email: 'sem-arroba', nome: 'X Y', papel: 'vendedor' })).status).toBe(400);
    expect((await funcao(tkAdmin, { acao: 'criar', email: 'a@b.com', nome: 'X Y', papel: 'superusuario' })).status).toBe(400);
    expect((await funcao(tkAdmin, { acao: 'criar', email: 'a@b.com', nome: 'X Y', papel: 'personalizado', paginas: ['usuarios'] })).status).toBe(400);
  });
  test('com a senha temporária, entra mas não vê nenhum dado até trocar a senha', async () => {
    const tk = await token(email, temp);
    expect((await rpc(tk, 'meu_perfil')).corpo.trocarSenha).toBe(true);
    expect((await ler(tk, 'produtos')).corpo).toEqual([]);
    expect((await rpc(tk, 'registrar_venda', { p_venda: {} })).status).toBe(403);
  });
  test('senha atual errada é recusada e limitada a 5 tentativas', async () => {
    const tk = await token(email, temp);
    for (let i = 0; i < 5; i++) {
      const r = await funcao(tk, { acao: 'trocar_senha', senha_atual: 'errada-' + i, nova_senha: 'Treino forte 2026' });
      expect(r.status).toBe(400);
    }
    const bloqueio = await funcao(tk, { acao: 'trocar_senha', senha_atual: temp, nova_senha: 'Treino forte 2026' });
    expect(bloqueio.status).toBe(429);
  });
  test('senha nova fraca é recusada antes de conferir a atual', async () => {
    const tk = await token(email, temp);
    const r = await funcao(tk, { acao: 'trocar_senha', senha_atual: temp, nova_senha: 'fraca' });
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toContain('10 caracteres');
  });
  test('troca de senha libera o acesso e desconecta as outras sessões', async () => {
    await Bun.$`psql -X -q -h /tmp -p 5499 -U postgres -d racce_e2e -c ${`delete from public.tentativas_senha where user_id = '${id}'`}`.quiet();
    const outra = await token(email, temp);
    const tk = await token(email, temp);
    const r = await funcao(tk, { acao: 'trocar_senha', senha_atual: temp, nova_senha: 'Treino forte 2026' });
    expect(r.status).toBe(200);
    expect((await ler(outra, 'config')).status).toBe(401); // sessão de outro aparelho encerrada
    expect((await login(email, temp)).status).toBe(400);   // a senha temporária não vale mais
    const nova = await token(email, 'Treino forte 2026');
    expect((await rpc(nova, 'meu_perfil')).corpo.trocarSenha).toBe(false);
    expect((await ler(nova, 'config')).corpo.length).toBe(1);
  });
  test('desativar bloqueia o login e reativar libera', async () => {
    const tkUsuario = await token(email, 'Treino forte 2026');
    const r = await funcao(tkAdmin, { acao: 'atualizar', id, nome: 'Nina Nova', papel: 'vendedor', ativo: false });
    expect(r.status).toBe(200);
    expect((await ler(tkUsuario, 'produtos')).status).toBe(401); // sessões encerradas na hora
    expect((await login(email, 'Treino forte 2026')).corpo.error_code).toBe('user_banned');
    expect((await funcao(tkAdmin, { acao: 'atualizar', id, nome: 'Nina Nova', papel: 'vendedor', ativo: true })).status).toBe(200);
    expect((await login(email, 'Treino forte 2026')).status).toBe(200);
  });
  test('redefinir senha bloqueia os dados do usuário até ele criar uma nova', async () => {
    const tkUsuario = await token(email, 'Treino forte 2026');
    const r = await funcao(tkAdmin, { acao: 'redefinir_senha', id });
    expect(r.status).toBe(200);
    expect((await ler(tkUsuario, 'produtos')).corpo).toEqual([]);
    expect((await login(email, r.corpo.senha_temporaria)).status).toBe(200);
  });
  test('administrador não desativa nem rebaixa a si mesmo', async () => {
    const me = '10000000-0000-0000-0000-000000000001';
    expect((await funcao(tkAdmin, { acao: 'atualizar', id: me, nome: 'Franklin Admin', papel: 'admin', ativo: false })).status).toBe(400);
    expect((await funcao(tkAdmin, { acao: 'atualizar', id: me, nome: 'Franklin Admin', papel: 'gerente', ativo: true })).status).toBe(400);
    expect((await funcao(tkAdmin, { acao: 'redefinir_senha', id: me })).status).toBe(400);
  });
  test('tudo fica na auditoria', async () => {
    const r = await ler(tkAdmin, 'auditoria');
    const acoes = r.corpo.map((x: any) => x.acao);
    for (const a of ['usuario.criacao', 'usuario.troca_senha', 'usuario.alteracao', 'usuario.redefinicao_senha']) expect(acoes).toContain(a);
  });
});
