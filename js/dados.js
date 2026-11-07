/*
 * Racce · Gestão — camada de dados.
 *
 * Duas implementações com as MESMAS operações, para a tela não precisar saber
 * onde os dados estão:
 *   • supabase(cliente, perfil): banco real. Leituras passam pelas regras de
 *     acesso do banco (RLS) e cada gravação chama uma função do servidor, que
 *     confere a permissão e valida os dados antes de gravar.
 *   • memoria(estado): modo de exemplo, só nesta tela, sem salvar nada.
 *
 * Formato entregue à tela (o mesmo nas duas): coleções indexadas por id
 * { produtos, movs, vendas, despesas, historico, usuarios, config, estoque, fotos }.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RacceDados = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function porId(lista, conv) { var o = {}; lista.forEach(function (x) { o[x.id] = conv ? conv(x) : x; }); return o; }
  function erro(msg) { var e = new Error(msg); e.codigo = 'P0001'; return e; }
  function erroPerm(msg) { var e = new Error(msg || 'Seu usuário não tem permissão para esta ação.'); e.codigo = '42501'; return e; }

  // ---------------------------------------------------------------------------
  // Banco real (Supabase)
  // ---------------------------------------------------------------------------
  function supabase(c, perfil) {
    var perms = (perfil && perfil.permissoes) || [];
    function tem(p) { return perms.indexOf(p) >= 0; }
    function algum(l) { return l.some(tem); }

    function carregar() {
      var verCustos = algum(['custos', 'estoque', 'resultado', 'painel']);
      var vazio = Promise.resolve([]);
      return Promise.all([
        c.ler('config', { select: 'dados' }),
        c.lerTudo('produtos', { select: 'id,nome,cor,ref,categoria,publico,descricao,preco,tamanhos,minimo,ativo,criado_em', ordem: 'criado_em.asc,id.asc' }),
        verCustos ? c.lerTudo('produtos_custo', { select: 'produto_id,custo', ordem: 'produto_id.asc' }) : vazio,
        c.rpc('estoque_atual'),
        tem('estoque') ? c.lerTudo('movimentos', { select: 'id,produto_id,tipo,data,qtds,custo_unit,fornecedor,motivo,obs,criado_em', filtros: { estornado_em: 'is.null' }, ordem: 'criado_em.asc,id.asc' }) : vazio,
        c.lerTudo('vendas', { select: 'id,numero,data,criado_em,vendedor_id,vendedor_nome,subtotal,desconto,total,taxa_pct,pagamento,parcelas,recebido,canal,cliente,telefone,obs,status,versao,editada_em,editada_por_nome,cancelada_em,cancelada_por_nome,motivo_cancel', ordem: 'numero.asc' }),
        c.lerTudo('venda_itens', { select: 'id,venda_id,ordem,produto_id,nome,cor,tam,qtd,preco,preco_tabela', ordem: 'venda_id.asc,ordem.asc' }),
        verCustos ? c.lerTudo('venda_custos', { select: 'item_id,custo', ordem: 'item_id.asc' }) : vazio,
        c.lerTudo('historico_vendas', { select: 'id,venda_id,seq,tipo,em,por_id,por_nome,por_funcao,motivo,antes,depois', ordem: 'em.asc,id.asc' }),
        algum(['despesas', 'resultado', 'painel']) ? c.lerTudo('despesas', { select: 'id,descricao,categoria,valor,vencimento,paga_em,forma,obs,grupo,criado_em', filtros: { excluida_em: 'is.null' }, ordem: 'vencimento.asc,id.asc' }) : vazio,
        c.lerTudo('produto_fotos', { select: 'produto_id,thumb', ordem: 'produto_id.asc' }),
        tem('usuarios') ? c.lerTudo('perfis', { select: 'id,email,nome,papel,paginas,extras,ativo,trocar_senha,ultimo_acesso,criado_em', ordem: 'nome.asc' }) : vazio
      ]).then(function (r) {
        var custos = {}; r[2].forEach(function (x) { custos[x.produto_id] = x.custo; });
        var estoque = {}; (r[3] || []).forEach(function (x) { (estoque[x.produto_id] = estoque[x.produto_id] || {})[x.tam] = x.qtd; });
        var custoItem = {}; r[7].forEach(function (x) { custoItem[x.item_id] = x.custo; });
        var itensPor = {}; r[6].forEach(function (i) {
          (itensPor[i.venda_id] = itensPor[i.venda_id] || []).push({ id: i.id, produtoId: i.produto_id, nome: i.nome, cor: i.cor, tam: i.tam, qtd: i.qtd, preco: i.preco, precoTabela: i.preco_tabela, custo: custoItem[i.id] });
        });
        var fotos = {}; r[10].forEach(function (x) { fotos[x.produto_id] = x.thumb; });
        return {
          config: (r[0][0] && r[0][0].dados) || {},
          verCustos: verCustos,
          produtos: porId(r[1], function (p) {
            return { nome: p.nome, cor: p.cor, ref: p.ref, categoria: p.categoria, publico: p.publico, descricao: p.descricao, preco: p.preco, tamanhos: p.tamanhos || [],
              minimo: p.minimo, ativo: p.ativo, criadoEm: p.criado_em, custo: verCustos ? (custos[p.id] || 0) : undefined };
          }),
          estoque: estoque,
          movs: porId(r[4], function (m) { return { produtoId: m.produto_id, tipo: m.tipo, data: m.data, qtds: m.qtds || {}, custoUnit: m.custo_unit, fornecedor: m.fornecedor, motivo: m.motivo, obs: m.obs, criadoEm: m.criado_em }; }),
          vendas: porId(r[5], function (v) {
            return { numero: v.numero, data: v.data, criadoEm: v.criado_em, por: v.vendedor_id, vendedorNome: v.vendedor_nome, subtotal: v.subtotal, desconto: v.desconto, total: v.total,
              taxaPct: Number(v.taxa_pct) || 0, pagamento: v.pagamento, parcelas: v.parcelas, recebido: v.recebido, canal: v.canal, cliente: v.cliente, telefone: v.telefone, obs: v.obs,
              status: v.status, versao: v.versao, editadaEm: v.editada_em, editadaPor: v.editada_por_nome, canceladaEm: v.cancelada_em, canceladaPor: v.cancelada_por_nome,
              motivoCancel: v.motivo_cancel, itens: itensPor[v.id] || [] };
          }),
          historico: porId(r[8], function (h) { return { vendaId: h.venda_id, seq: h.seq, tipo: h.tipo, em: h.em, porId: h.por_id, porNome: h.por_nome, porFuncao: h.por_funcao, motivo: h.motivo, antes: h.antes, depois: h.depois }; }),
          despesas: porId(r[9], function (d) { return { descricao: d.descricao, categoria: d.categoria, valor: d.valor, vencimento: d.vencimento, pagaEm: d.paga_em, forma: d.forma, obs: d.obs, grupo: d.grupo, criadoEm: d.criado_em }; }),
          fotos: fotos,
          usuarios: porId(r[11], function (u) { return { nome: u.nome, email: u.email, papel: u.papel, paginas: u.paginas || [], extras: u.extras || [], ativo: u.ativo, trocarSenha: u.trocar_senha, ultimoAcesso: u.ultimo_acesso, criadoEm: u.criado_em }; })
        };
      });
    }

    return {
      tipo: 'supabase',
      carregar: carregar,
      fotoGrande: function (pid) { return c.ler('produto_fotos', { select: 'foto', filtros: { produto_id: 'eq.' + pid } }).then(function (l) { return l[0] ? l[0].foto : null; }); },
      salvarProduto: function (id, dados, estoqueInicial) { return c.rpc('salvar_produto', { p_id: id || null, p_dados: dados, p_estoque_inicial: estoqueInicial || null }); },
      definirAtivoProduto: function (id, ativo) { return c.rpc('definir_ativo_produto', { p_id: id, p_ativo: ativo }); },
      salvarFoto: function (pid, f) { return c.rpc('salvar_foto', { p_produto: pid, p_thumb: f.thumb, p_foto: f.foto }); },
      removerFoto: function (pid) { return c.rpc('remover_foto', { p_produto: pid }); },
      registrarEntrada: function (d) { return c.rpc('registrar_entrada', { p_dados: d }); },
      registrarAjuste: function (d) { return c.rpc('registrar_ajuste', { p_dados: d }); },
      estornarMovimento: function (id) { return c.rpc('estornar_movimento', { p_id: id }); },
      registrarVenda: function (v) { return c.rpc('registrar_venda', { p_venda: v }); },
      editarVenda: function (id, versao, v, motivo) { return c.rpc('editar_venda', { p_id: id, p_versao: versao, p_venda: v, p_motivo: motivo }); },
      cancelarVenda: function (id, versao, motivo) { return c.rpc('cancelar_venda', { p_id: id, p_versao: versao, p_motivo: motivo }); },
      salvarDespesa: function (id, d, meses) { return c.rpc('salvar_despesa', { p_id: id || null, p_dados: d, p_meses: meses || 1 }); },
      pagarDespesa: function (id, data, forma) { return c.rpc('pagar_despesa', { p_id: id, p_data: data, p_forma: forma || '' }); },
      excluirDespesa: function (id) { return c.rpc('excluir_despesa', { p_id: id }); },
      salvarConfig: function (parcial) { return c.rpc('salvar_config', { p_dados: parcial }); },
      criarUsuario: function (d) { return c.funcao('admin-usuarios', Object.assign({ acao: 'criar' }, d)); },
      atualizarUsuario: function (d) { return c.funcao('admin-usuarios', Object.assign({ acao: 'atualizar' }, d)); },
      redefinirSenha: function (id) { return c.funcao('admin-usuarios', { acao: 'redefinir_senha', id: id }); },
      trocarSenha: function (atual, nova) { return c.funcao('admin-usuarios', { acao: 'trocar_senha', senha_atual: atual, nova_senha: nova }); }
    };
  }

  // ---------------------------------------------------------------------------
  // Modo de exemplo (memória). Reproduz as regras principais do servidor para
  // a demonstração se comportar como o sistema de verdade.
  // ---------------------------------------------------------------------------
  function memoria(estado, ajuda) {
    var E = estado, seq = 0;
    ['produtos', 'movs', 'vendas', 'despesas', 'historico', 'usuarios', 'fotos', 'fotosG'].forEach(function (k) { E[k] = E[k] || {}; });
    E.config = E.config || {};
    function id(p) { seq++; return p + '-ex' + Date.now().toString(36) + seq; }
    function agora() { return new Date().toISOString(); }
    function hoje() { return ajuda.hoje(); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function estoque() {
      var est = {};
      function add(pid, t, q) { (est[pid] = est[pid] || {})[t] = (est[pid][t] || 0) + q; }
      Object.keys(E.movs).forEach(function (k) { var m = E.movs[k], q = m.qtds || {}; Object.keys(q).forEach(function (t) { add(m.produtoId, t, Number(q[t]) || 0); }); });
      Object.keys(E.vendas).forEach(function (k) { var v = E.vendas[k]; if (v.status !== 'cancelada') (v.itens || []).forEach(function (it) { add(it.produtoId, it.tam, -it.qtd); }); });
      return est;
    }
    function proximoNumero() { var n = 0; Object.keys(E.vendas).forEach(function (k) { n = Math.max(n, E.vendas[k].numero || 0); }); return n + 1; }
    function montarItens(itens, antigos, nova) {
      if (!Array.isArray(itens) || !itens.length) throw erro('A venda precisa ter pelo menos um item.');
      return itens.map(function (it) {
        var p = E.produtos[it.produtoId]; if (!p) throw erro('Um dos produtos da venda não existe mais.');
        if (nova && p.ativo === false) throw erro(p.nome + ' está desativado e não pode ser vendido.');
        var ant = (antigos || []).filter(function (a) { return a.produtoId === it.produtoId; })[0];
        if (!(it.qtd >= 1) || Math.round(it.qtd) !== it.qtd) throw erro('Valor inválido em a quantidade.');
        if (!(it.preco >= 0)) throw erro('Valor inválido em o preço unitário.');
        return { id: id('i'), produtoId: it.produtoId, nome: ant ? ant.nome : p.nome, cor: ant ? ant.cor : (p.cor || ''), tam: it.tam, qtd: it.qtd, preco: it.preco,
          precoTabela: ant ? ant.precoTabela : p.preco, custo: ant ? ant.custo : (p.custo || 0) };
      });
    }
    function cabecalho(v, sub) {
      var desc = Number(v.desconto) || 0; if (desc > sub) throw erro('O desconto não pode ser maior que o subtotal.');
      if (!v.data || v.data > hoje()) throw erro('A data da venda não pode ser futura.');
      var total = sub - desc, pag = v.pagamento;
      return { data: v.data, subtotal: sub, desconto: desc, total: total, pagamento: pag, parcelas: pag === 'Crédito parcelado' ? Number(v.parcelas) || 2 : 1,
        recebido: pag === 'Dinheiro' && v.recebido >= total ? v.recebido : 0, canal: v.canal || '', cliente: v.cliente || '', telefone: v.telefone || '', obs: v.obs || '' };
    }
    function quem() { return ajuda.quem(); }
    function snap(v) { return ajuda.snapVenda(v); }

    return {
      tipo: 'memoria',
      carregar: function () {
        var c = clone({ produtos: E.produtos, movs: E.movs, vendas: E.vendas, despesas: E.despesas, historico: E.historico, usuarios: E.usuarios, config: E.config });
        c.estoque = estoque(); c.fotos = Object.assign({}, E.fotos); c.verCustos = true;
        return Promise.resolve(c);
      },
      fotoGrande: function (pid) { return Promise.resolve(E.fotosG[pid] || E.fotos[pid] || null); },
      salvarProduto: function (pid, d, ini) {
        var novo = !pid; pid = pid || id('p');
        var antes = E.produtos[pid] || {};
        E.produtos[pid] = Object.assign({}, antes, d, { ativo: novo ? true : antes.ativo !== false, criadoEm: antes.criadoEm || agora() });
        if (novo && ini) { var q = {}; Object.keys(ini).forEach(function (t) { if (ini[t] > 0) q[t] = ini[t]; }); if (Object.keys(q).length) E.movs[id('m')] = { produtoId: pid, tipo: 'entrada', qtds: q, custoUnit: d.custo || 0, fornecedor: 'Estoque inicial', obs: '', data: hoje(), criadoEm: agora() }; }
        return Promise.resolve(pid);
      },
      definirAtivoProduto: function (pid, ativo) { E.produtos[pid].ativo = !!ativo; return Promise.resolve(); },
      salvarFoto: function (pid, f) { E.fotos[pid] = f.thumb; E.fotosG[pid] = f.foto; return Promise.resolve(); },
      removerFoto: function (pid) { delete E.fotos[pid]; delete E.fotosG[pid]; return Promise.resolve(); },
      registrarEntrada: function (d) {
        E.movs[id('m')] = { produtoId: d.produtoId, tipo: 'entrada', qtds: d.qtds, custoUnit: d.custoUnit, fornecedor: d.fornecedor || '', obs: d.obs || '', data: d.data, criadoEm: agora() };
        if (d.atualizarCusto) E.produtos[d.produtoId].custo = d.custoUnit;
        if (d.despesa) {
          var p = E.produtos[d.produtoId], n = Object.keys(d.qtds).reduce(function (s, t) { return s + d.qtds[t]; }, 0);
          if (d.custoUnit * n > 0) E.despesas[id('d')] = { descricao: 'Mercadoria: ' + p.nome + (p.cor ? ' · ' + p.cor : '') + ' (' + n + (n === 1 ? ' peça)' : ' peças)') + (d.fornecedor ? ' · ' + d.fornecedor : ''),
            categoria: 'Compra de mercadoria', valor: d.custoUnit * n, vencimento: d.despesa.paga ? d.data : d.despesa.vencimento, pagaEm: d.despesa.paga ? d.data : null, forma: '', obs: d.obs || '', grupo: null, criadoEm: agora() };
        }
        return Promise.resolve();
      },
      registrarAjuste: function (d) { E.movs[id('m')] = { produtoId: d.produtoId, tipo: 'ajuste', qtds: d.qtds, motivo: d.motivo, obs: d.obs || '', data: d.data, criadoEm: agora() }; return Promise.resolve(); },
      estornarMovimento: function (mid) { delete E.movs[mid]; return Promise.resolve(); },
      registrarVenda: function (v) {
        try {
          var itens = montarItens(v.itens, null, true), sub = itens.reduce(function (s, it) { return s + it.qtd * it.preco; }, 0), cab = cabecalho(v, sub), q = quem();
          var vid = id('v'), num = proximoNumero(), taxa = Number(((E.config || {}).taxas || {})[cab.pagamento]) || 0;
          E.vendas[vid] = Object.assign(cab, { itens: itens, numero: num, criadoEm: agora(), por: q.id, vendedorNome: q.nome, status: 'ok', versao: 1, taxaPct: taxa });
          return Promise.resolve({ id: vid, numero: num });
        } catch (e) { return Promise.reject(e); }
      },
      editarVenda: function (vid, versao, v, motivo) {
        try {
          var atual = E.vendas[vid]; if (!atual) throw erro('Esta venda não existe ou você não tem acesso a ela.');
          if (atual.status === 'cancelada') throw erro('Uma venda cancelada não pode ser editada.');
          if (atual.versao !== versao) throw erro('Esta venda foi alterada por outra pessoa enquanto você editava. Feche e abra a venda de novo.');
          if (String(motivo || '').trim().length < 10) throw erro('Informe o motivo da alteração, com 10 a 300 caracteres.');
          var antes = snap(atual), itens = montarItens(v.itens, atual.itens, false), sub = itens.reduce(function (s, it) { return s + it.qtd * it.preco; }, 0), cab = cabecalho(v, sub), q = quem();
          var novo = Object.assign({}, atual, cab, { itens: itens, versao: atual.versao + 1, editadaEm: agora(), editadaPor: q.nome });
          if (cab.pagamento !== atual.pagamento) novo.taxaPct = Number(((E.config || {}).taxas || {})[cab.pagamento]) || 0;
          var depois = snap(novo);
          if (JSON.stringify(antes) === JSON.stringify(depois)) throw erro('Nada foi alterado. Corrija o que estiver errado antes de salvar.');
          E.vendas[vid] = novo;
          var n = Object.keys(E.historico).filter(function (k) { return E.historico[k].vendaId === vid; }).length;
          E.historico[id('h')] = { vendaId: vid, seq: n + 1, tipo: 'edicao', em: agora(), porId: q.id, porNome: q.nome, porFuncao: q.funcao, motivo: String(motivo).trim(), antes: antes, depois: depois };
          return Promise.resolve({ versao: novo.versao });
        } catch (e) { return Promise.reject(e); }
      },
      cancelarVenda: function (vid, versao, motivo) {
        var v = E.vendas[vid];
        if (!v || v.status === 'cancelada') return Promise.reject(erro('Esta venda já está cancelada.'));
        if (v.versao !== versao) return Promise.reject(erro('Esta venda foi alterada por outra pessoa. Feche e abra a venda de novo.'));
        if (String(motivo || '').trim().length < 10) return Promise.reject(erro('Informe o motivo do cancelamento, com 10 a 300 caracteres.'));
        var q = quem(), antes = snap(v);
        Object.assign(v, { status: 'cancelada', versao: v.versao + 1, canceladaEm: agora(), canceladaPor: q.nome, motivoCancel: String(motivo).trim() });
        var n = Object.keys(E.historico).filter(function (k) { return E.historico[k].vendaId === vid; }).length;
        E.historico[id('h')] = { vendaId: vid, seq: n + 1, tipo: 'cancelamento', em: agora(), porId: q.id, porNome: q.nome, porFuncao: q.funcao, motivo: String(motivo).trim(), antes: antes, depois: snap(v) };
        return Promise.resolve();
      },
      salvarDespesa: function (did, d, meses) {
        if (did) { Object.assign(E.despesas[did], d); return Promise.resolve(); }
        meses = meses || 1;
        var grupo = meses > 1 ? id('g') : null, dia = +d.vencimento.slice(8, 10), base = d.vencimento.slice(0, 7);
        for (var i = 0; i < meses; i++) {
          var k = ajuda.addMes(base, i), dd = Math.min(dia, ajuda.fimMes(k)), venc = k + '-' + String(dd).padStart(2, '0');
          E.despesas[id('d')] = Object.assign({}, d, { vencimento: venc, pagaEm: i === 0 ? d.pagaEm : null, grupo: grupo, criadoEm: agora() });
        }
        return Promise.resolve();
      },
      pagarDespesa: function (did, data, forma) { Object.assign(E.despesas[did], { pagaEm: data, forma: forma || '' }); return Promise.resolve(); },
      excluirDespesa: function (did) { delete E.despesas[did]; return Promise.resolve(); },
      salvarConfig: function (parcial) { Object.assign(E.config, clone(parcial)); return Promise.resolve(); },
      criarUsuario: function () { return Promise.reject(erroPerm('No modo de exemplo, os usuários não são salvos. Saia do exemplo e entre como administrador para cadastrar a equipe.')); },
      atualizarUsuario: function () { return Promise.reject(erroPerm('No modo de exemplo, os usuários não são salvos.')); },
      redefinirSenha: function () { return Promise.reject(erroPerm('No modo de exemplo, as senhas não existem.')); },
      trocarSenha: function () { return Promise.reject(erroPerm('No modo de exemplo, as senhas não existem.')); }
    };
  }

  return { supabase: supabase, memoria: memoria };
});
