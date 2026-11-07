/*
 * Testes de ponta a ponta no navegador (Chrome), contra o Supabase falso.
 * Pré-requisitos: tests/servidor-falso/preparar.sh e o servidor rodando em http://localhost:8787.
 * Uso: node tests/e2e/ponta-a-ponta.cjs   (variáveis: BASE, CHROME, PLAYWRIGHT, FOTOS=pasta para capturas)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:8787';
const FOTOS = process.env.FOTOS || '';
const SENHA_ADMIN = 'Racce2026teste';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let passou = 0, falhou = 0;
const erros = [];
function ok(cond, msg) { if (cond) { passou++; console.log('  ok   ' + msg); } else { falhou++; console.log('  FALHOU ' + msg); } }
async function foto(p, nome) { if (FOTOS) await p.screenshot({ path: path.join(FOTOS, nome + '.png'), fullPage: false }); }

async function novaPagina(b, vp) {
  const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|status of 40[0-49]|status of 429/.test(m.text())) erros.push('console: ' + m.text()); });
  p.on('dialog', d => d.dismiss());
  return { ctx, p };
}
async function entrar(p, email, senha) {
  await p.goto(BASE + '/');
  await p.waitForSelector('#lg_email');
  await p.fill('#lg_email', email); await p.fill('#lg_senha', senha);
  await p.click('#lgBotao');
}
async function esperarTitulo(p, t) { await p.waitForFunction(x => { const h = document.querySelector('h1.tit'); return h && h.textContent.trim() === x; }, t, { timeout: 15000 }); }
async function toast(p, trecho) { await p.waitForFunction(x => { const t = document.querySelector('#toast'); return t && !t.hidden && t.textContent.indexOf(x) >= 0; }, trecho, { timeout: 15000 }); return true; }
async function confirmar(p) { await p.click('#camadaConf button[data-v="1"]'); }
async function sair(p) { await p.click('#quem [data-a="sair"]'); await confirmar(p); await p.waitForSelector('#lg_email'); }
async function ir(p, pagina) { await p.click(`#abas [data-p="${pagina}"]`); }
async function criarSenha(p, temp, nova) {
  await p.waitForSelector('#ts_atual');
  await p.fill('#ts_atual', temp); await p.fill('#ts_nova', nova); await p.fill('#ts_nova2', nova);
  await p.click('#lgBotao');
}
async function api(p, metodo, caminho, corpo) {
  return p.evaluate(async ([metodo, caminho, corpo]) => {
    const s = JSON.parse(sessionStorage.getItem('racce-sessao-v2') || 'null');
    const r = await fetch(caminho, { method: metodo, headers: { apikey: window.RACCE_CONFIG.supabaseChavePublica, Authorization: 'Bearer ' + (s ? s.access_token : ''), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    let c = null; try { c = await r.json(); } catch (e) { c = null; }
    return { status: r.status, corpo: c };
  }, [metodo, caminho, corpo]);
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  let senhaVania = '', senhaGabi = '';

  console.log('\n1. Administrador: produto com foto, usuários e ajustes');
  {
    const { ctx, p } = await novaPagina(b);
    await entrar(p, 'admin@racce.test', 'errada');
    await p.waitForSelector('#lgErro:not([hidden])');
    ok((await p.textContent('#lgErro')).includes('E-mail ou senha incorretos'), 'senha errada mostra mensagem genérica (não revela se o e-mail existe)');
    await p.fill('#lg_senha', SENHA_ADMIN); await p.click('#lgBotao');
    await esperarTitulo(p, 'Visão geral');
    ok(true, 'administrador entra e vê a Visão geral');
    ok(await p.evaluate(() => sessionStorage.getItem('racce-sessao-v2') !== null && localStorage.length === 0 || !Object.keys(localStorage).some(k => /sess|token/i.test(k))), 'sessão fica no sessionStorage, nada de token no localStorage');
    await foto(p, 'e2e-01-admin-painel');

    // produto
    await p.click('[data-a="novoProduto"] >> nth=0');
    await p.waitForSelector('#pf_nome');
    await p.setInputFiles('#pf_foto', { name: 'legging.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#pfFotoBox img');
    await p.fill('#pf_nome', 'Legging Teste <img src=x onerror=alert(1)>');
    await p.fill('#pf_cor', 'Preta'); await p.fill('#pf_custo', '45,00'); await p.fill('#pf_preco', '129,90');
    for (const t of ['GG']) await p.click(`#pfTams [data-t="${t}"]`); // tira o GG (padrão P, M, G, GG)
    await p.fill('[data-t="P"][id^="pf_ini_"]', '5'); await p.fill('[data-t="M"][id^="pf_ini_"]', '5');
    await p.click('#mForm button[type=submit]');
    await toast(p, 'Produto cadastrado');
    ok(true, 'produto cadastrado com foto e estoque inicial');
    await ir(p, 'estoque'); await esperarTitulo(p, 'Estoque');
    const linha = await p.textContent('tr[data-a="verProduto"]');
    ok(linha.includes('Legging Teste <img src=x onerror=alert(1)>') && linha.includes('10'), 'nome com HTML aparece como texto (sem executar) e o total é 10');
    ok(await p.$('tr[data-a="verProduto"] img.foto') !== null, 'miniatura da foto aparece na lista');

    // usuários
    await ir(p, 'usuarios'); await esperarTitulo(p, 'Usuários');
    await p.click('[data-a="novoUsuario"]');
    await p.fill('#us_nome', 'Vânia Vendas'); await p.fill('#us_email', 'vania@racce.test'); await p.selectOption('#us_papel', 'vendedor');
    await p.click('#mForm button[type=submit]');
    await p.waitForSelector('#stSenha');
    senhaVania = (await p.textContent('#stSenha')).trim();
    ok(senhaVania.length === 14, 'senha temporária de 14 caracteres mostrada uma vez');
    await foto(p, 'e2e-02-senha-temporaria');
    await p.click('#camadaConf [data-a="fecharConf"]');
    await p.click('[data-a="novoUsuario"]');
    await p.fill('#us_nome', 'Gabi Gerente'); await p.fill('#us_email', 'gabi@racce.test'); await p.selectOption('#us_papel', 'gerente');
    await p.click('#mForm button[type=submit]');
    await p.waitForSelector('#stSenha'); senhaGabi = (await p.textContent('#stSenha')).trim();
    await p.click('#camadaConf [data-a="fecharConf"]');
    await p.click('[data-a="novoUsuario"]');
    await p.fill('#us_nome', 'Repetida'); await p.fill('#us_email', 'VANIA@racce.test');
    await p.click('#mForm button[type=submit]');
    await p.waitForSelector('#mErro:not([hidden])');
    ok((await p.textContent('#mErro')).includes('Já existe um usuário com este e-mail'), 'e-mail repetido é recusado com mensagem clara');
    await p.click('#mForm [data-a="fecharModal"] >> nth=-1');

    // ajustes
    await ir(p, 'ajustes'); await esperarTitulo(p, 'Ajustes');
    await p.fill('#cfg_taxa_2', '1,99'); await p.click('[data-a="salvarTaxas"]');
    await toast(p, 'Taxas salvas');
    ok(true, 'administrador salva as taxas da maquininha');
    await sair(p);
    ok(await p.evaluate(() => sessionStorage.getItem('racce-sessao-v2') === null), 'ao sair, a sessão é apagada do navegador');
    await p.goBack().catch(() => null);
    ok(await p.isVisible('#lg_email') || await p.isHidden('.app'), 'voltar no navegador depois de sair não mostra dados');
    await ctx.close();
  }

  console.log('\n2. Vendedora: primeiro acesso, venda e tentativas de burlar o sistema');
  {
    const { ctx, p } = await novaPagina(b);
    await entrar(p, 'vania@racce.test', senhaVania);
    await p.waitForSelector('#ts_atual');
    ok(true, 'com senha temporária, o sistema exige criar uma senha nova');
    await p.fill('#ts_atual', senhaVania); await p.fill('#ts_nova', 'curta'); await p.fill('#ts_nova2', 'curta'); await p.click('#lgBotao');
    await p.waitForSelector('#lgErro:not([hidden])');
    ok((await p.textContent('#lgErro')).includes('10 caracteres'), 'senha fraca é recusada');
    await criarSenha(p, senhaVania, 'Vendas forte 2026');
    await esperarTitulo(p, 'Vendas');
    const abas = await p.$$eval('#abas [data-p]', l => l.map(x => x.dataset.p));
    ok(abas.join(',') === 'vendas', 'menu da vendedora mostra só Vendas (veio: ' + abas.join(',') + ')');
    await p.evaluate(() => { location.hash = 'estoque'; });
    await p.reload(); await esperarTitulo(p, 'Vendas');
    ok(true, 'abrir #estoque pela URL não mostra o estoque');

    // venda
    await p.click('.btn-venda >> nth=0'); await esperarTitulo(p, 'Nova venda');
    await p.click('.pc-tams button[data-t="P"]');
    await p.click('[data-a="cFinalizar"] >> nth=0');
    await p.click('[data-a="vPag"][data-v="Débito"]');
    await p.fill('#v_cliente', '=HYPERLINK("http://x")');
    await p.click('#vRegistrar');
    await p.waitForSelector('text=Recibo de venda', { timeout: 15000 });
    ok(true, 'venda registrada e recibo aberto');
    await foto(p, 'e2e-03-recibo');
    await p.keyboard.press('Escape');
    await ir(p, 'vendas'); await esperarTitulo(p, 'Vendas');
    ok(!(await p.textContent('main')).includes('Lucro bruto'), 'vendedora não vê lucro nem custo');

    // tentativas de burlar, direto nas APIs, com a sessão dela
    let r = await api(p, 'POST', '/rest/v1/rpc/salvar_config', { p_dados: { taxas: { Pix: 0 } } });
    ok(r.status === 403, 'chamar salvar_config pela API é recusado (403)');
    r = await api(p, 'POST', '/rest/v1/vendas', { data: '2026-01-01', subtotal: 1, total: 1, pagamento: 'Pix' });
    ok(r.status === 403, 'gravar direto na tabela de vendas é recusado (403)');
    r = await api(p, 'GET', '/rest/v1/produtos_custo?select=*');
    ok(r.status === 200 && r.corpo.length === 0, 'ler custos pela API devolve lista vazia');
    r = await api(p, 'GET', '/rest/v1/perfis?select=*');
    ok(r.status === 200 && r.corpo.length === 1, 'ler usuários pela API devolve só o próprio perfil');
    r = await api(p, 'POST', '/functions/v1/admin-usuarios', { acao: 'criar', email: 'eu@x.com', nome: 'Eu Admin', papel: 'admin' });
    ok(r.status === 403, 'criar administrador pela função é recusado (403)');
    r = await api(p, 'POST', '/rest/v1/rpc/registrar_venda', { p_venda: { itens: [{ produtoId: '00000000-0000-0000-0000-000000000000', tam: 'P', qtd: 1, preco: 1 }], pagamento: 'Pix', data: '2026-01-01' } });
    ok(r.status === 400 && /não existe/.test(r.corpo.message), 'venda com produto inventado é recusada pelo servidor');
    // manipulação da tela: um botão de cancelar "injetado" no HTML
    await p.evaluate(() => { const bt = document.createElement('button'); bt.dataset.a = 'cancelarVenda'; bt.id = 'injetado'; document.body.appendChild(bt); });
    await p.click('#injetado');
    await toast(p, 'não tem acesso');
    ok(true, 'botão injetado na página não executa a ação (e o servidor também recusaria)');
    await sair(p);
    await ctx.close();
  }

  console.log('\n3. Gerente: edita e cancela a venda; histórico; estoque volta');
  {
    const { ctx, p } = await novaPagina(b);
    await entrar(p, 'gabi@racce.test', senhaGabi);
    await criarSenha(p, senhaGabi, 'Gerente forte 2026');
    await esperarTitulo(p, 'Visão geral');
    const abas = await p.$$eval('#abas [data-p]', l => l.map(x => x.dataset.p));
    ok(!abas.includes('usuarios') && !abas.includes('ajustes'), 'gerente não vê Usuários nem Ajustes');
    await ir(p, 'vendas'); await esperarTitulo(p, 'Vendas');
    ok((await p.textContent('main')).includes('Vânia Vendas'), 'gerente vê a venda da Vânia, com o nome dela');
    await p.click('tr[data-a="verVenda"] >> nth=0');
    await p.click('[data-a="editarVenda"]');
    await esperarTitulo(p, 'Editar venda');
    await p.waitForSelector('#v_tam_0');
    await p.selectOption('#v_tam_0', 'M');
    await p.fill('#v_motivo', 'A cliente levou o tamanho M, não o P.');
    await p.click('#vSalvarEd');
    await confirmar(p);
    await toast(p, 'alterada');
    ok(true, 'venda editada com motivo');
    await p.click('[data-a="fecharDet"]').catch(() => null);
    await ir(p, 'vendas'); await p.click('[data-a="ir"][data-p="historico"]');
    await esperarTitulo(p, 'Histórico de alterações');
    const hist = await p.textContent('.hist-grade');
    ok(hist.includes('Gabi Gerente') && hist.includes('P') && hist.includes('M') && hist.includes('A cliente levou o tamanho M'), 'histórico mostra quem, o motivo e a troca de tamanho');
    await foto(p, 'e2e-04-historico');
    await ir(p, 'vendas'); await p.click('tr[data-a="verVenda"] >> nth=0');
    await p.click('[data-a="cancelarVenda"]');
    await p.fill('#cv_motivo', 'Cliente desistiu da compra.');
    await p.click('#mForm button[type=submit]');
    await toast(p, 'Venda cancelada');
    ok((await p.textContent('#camadaDet')).includes('Cancelada'), 'venda cancelada com motivo; o detalhe mostra a situação');
    await p.click('[data-a="fecharDet"]');
    await ir(p, 'estoque'); await esperarTitulo(p, 'Estoque');
    const raias = await p.$$eval('tr[data-a="verProduto"] .raia', l => l.map(x => x.textContent));
    ok(raias.join(' ') === 'P5 M5 G0', 'estoque voltou ao original depois do cancelamento (' + raias.join(' ') + ')');
    await sair(p);
    await ctx.close();
  }

  console.log('\n4. Administrador: desativa, redefine senha, despesas e sessão expirada');
  {
    const { ctx, p } = await novaPagina(b);
    await entrar(p, 'admin@racce.test', SENHA_ADMIN);
    await esperarTitulo(p, 'Visão geral');
    await ir(p, 'usuarios'); await esperarTitulo(p, 'Usuários');
    await p.click('tr[data-a="editarUsuario"]:has-text("Vânia")');
    await p.uncheck('#us_ativo'); await p.click('#mForm button[type=submit]');
    await toast(p, 'Usuário alterado');
    await p.click('tr[data-a="editarUsuario"]:has-text("Gabi")');
    await p.click('#mForm [data-a="redefinirSenha"]'); await confirmar(p);
    await p.waitForSelector('#stSenha');
    ok((await p.textContent('#stSenha')).trim().length === 14, 'redefinição gera nova senha temporária');
    await p.click('#camadaConf [data-a="fecharConf"]');
    const txt = await p.textContent('main');
    ok(txt.includes('Inativo') && txt.includes('aguardando criar a senha'), 'lista mostra a situação: inativo e aguardando nova senha');
    await foto(p, 'e2e-05-usuarios');

    await ir(p, 'despesas'); await esperarTitulo(p, 'Despesas');
    await p.click('[data-a="novaDespesa"] >> nth=0');
    await p.fill('#de_desc', 'Aluguel da loja'); await p.selectOption('#de_cat', 'Aluguel'); await p.fill('#de_valor', '2.800,00');
    await p.check('#de_rep'); await p.fill('#de_meses', '3');
    await p.click('#mForm button[type=submit]');
    await toast(p, 'Despesa lançada');
    await p.click('[data-a="pagarDesp"] >> nth=0');
    await p.click('#mForm button[type=submit]');
    await toast(p, 'marcada como paga');
    ok(true, 'conta fixa lançada (3 meses) e paga');

    // sessão adulterada → volta à entrada
    await p.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('racce-sessao-v2')); s.access_token = 'adulterado'; s.refresh_token = 'adulterado'; sessionStorage.setItem('racce-sessao-v2', JSON.stringify(s)); });
    await p.reload();
    await p.waitForSelector('#lg_email', { timeout: 15000 });
    ok((await p.textContent('#lgErro').catch(() => '')).includes('expirou'), 'token adulterado não dá acesso: volta para a entrada com aviso');
    await ctx.close();
  }

  console.log('\n5. Usuária desativada não entra');
  {
    const { ctx, p } = await novaPagina(b);
    await entrar(p, 'vania@racce.test', 'Vendas forte 2026');
    await p.waitForSelector('#lgErro:not([hidden])');
    ok((await p.textContent('#lgErro')).includes('desativado'), 'login de usuária desativada é recusado');
    await ctx.close();
  }

  console.log('\n6. Celular (390 × 844): sem rolagem lateral em nenhuma página');
  {
    const { ctx, p } = await novaPagina(b, { width: 390, height: 844 });
    await entrar(p, 'admin@racce.test', SENHA_ADMIN);
    await esperarTitulo(p, 'Visão geral');
    for (const pg of ['painel', 'vendas', 'estoque', 'despesas', 'resultado', 'usuarios', 'ajustes']) {
      await p.evaluate(x => { const b = document.querySelector(`#abas [data-p="${x}"]`); if (b) b.click(); }, pg);
      await p.waitForTimeout(300);
      const larg = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok(larg[0] <= larg[1], `${pg}: largura ${larg[0]} cabe na tela ${larg[1]}`);
      await foto(p, 'e2e-movel-' + pg);
    }
    await p.click('#quemMovel');
    await p.waitForSelector('#mc_atual');
    ok(true, 'no celular, o avatar abre "Minha conta" (trocar senha e sair)');
    await ctx.close();
  }

  console.log('\n7. Inatividade: sessão encerrada depois de 30 minutos sem uso');
  {
    const { ctx, p } = await novaPagina(b);
    await p.clock.install();
    await entrar(p, 'admin@racce.test', SENHA_ADMIN);
    await esperarTitulo(p, 'Visão geral');
    await p.clock.fastForward('31:00');
    await p.waitForSelector('#lg_email', { timeout: 15000 });
    ok((await p.textContent('#lgErro')).includes('30 minutos'), 'depois de 30 minutos parado, volta para a entrada');
    await ctx.close();
  }

  await b.close();
  console.log('\nErros de página: ' + (erros.length ? '\n  ' + erros.join('\n  ') : 'nenhum'));
  console.log(`\nResultado: ${passou} ok, ${falhou} falharam`);
  process.exit(falhou || erros.length ? 1 : 0);
})().catch(e => { console.error('\nFALHA INESPERADA:', e.message); process.exit(1); });
