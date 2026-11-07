/*
 * Racce · Gestão — cliente mínimo das APIs REST do Supabase.
 *
 * Sem bibliotecas de terceiros nem CDN: o navegador só conversa com o próprio
 * site e com o projeto Supabase (a política de segurança de conteúdo, no
 * index.html, bloqueia qualquer outro destino).
 *
 * Sessão: o token de acesso e o de renovação ficam no sessionStorage (somem ao
 * fechar a aba, o que é mais seguro em computador compartilhado de loja).
 * O token de acesso dura pouco e é renovado automaticamente. Nada disso dá
 * acesso a dados por si só: quem decide o que cada pessoa vê e faz é o banco.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RacceSupabase = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHAVE_SESSAO = 'racce-sessao-v2';
  var MARGEM_RENOVACAO_S = 90;  // renova quando faltam 90 segundos para o token vencer
  var LIMITE_PAGINA = 1000;     // o Supabase devolve no máximo 1000 linhas por consulta

  function ErroApi(mensagem, status, codigo) {
    var e = new Error(mensagem); e.status = status || 0; e.codigo = codigo || ''; return e;
  }

  function criar(opcoes) {
    var url = String(opcoes.url || '').replace(/\/+$/, ''), chave = opcoes.chave, armazenamento = opcoes.armazenamento || safeStorage();
    var sessao = lerSessao(), ouvintes = [], renovando = null, timer = null;

    function safeStorage() {
      try { var s = window.sessionStorage, k = '__racce_teste'; s.setItem(k, '1'); s.removeItem(k); return s; }
      catch (e) { var mem = {}; return { getItem: function (k) { return mem[k] || null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } }; }
    }
    function lerSessao() { try { var s = JSON.parse(armazenamento.getItem(CHAVE_SESSAO) || 'null'); return s && s.access_token && s.refresh_token ? s : null; } catch (e) { return null; } }
    function gravarSessao(s) {
      sessao = s;
      try { if (s) armazenamento.setItem(CHAVE_SESSAO, JSON.stringify(s)); else armazenamento.removeItem(CHAVE_SESSAO); } catch (e) { /* segue só em memória */ }
      agendarRenovacao();
    }
    function avisar(evento) { ouvintes.slice().forEach(function (f) { try { f(evento, sessao); } catch (e) { /* ouvinte com erro */ } }); }
    function agendarRenovacao() {
      if (typeof window === 'undefined') return;
      clearTimeout(timer);
      if (!sessao) return;
      var ms = Math.max(5000, (sessao.expires_at - MARGEM_RENOVACAO_S) * 1000 - Date.now());
      timer = setTimeout(function () { renovar().catch(function () { /* tratado em renovar */ }); }, Math.min(ms, 2147483000));
    }

    function cabecalhos(extra, comToken) {
      var h = { apikey: chave, 'Content-Type': 'application/json' };
      if (comToken && sessao) h.Authorization = 'Bearer ' + sessao.access_token;
      if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
      return h;
    }

    function pedir(caminho, init) {
      return fetch(url + caminho, init).catch(function () {
        throw ErroApi('Sem conexão com o servidor. Verifique a internet e tente de novo.', 0, 'rede');
      }).then(function (r) {
        return r.text().then(function (t) {
          var corpo = null; try { corpo = t ? JSON.parse(t) : null; } catch (e) { corpo = t; }
          return { status: r.status, corpo: corpo };
        });
      });
    }

    function sessaoDe(c) {
      return { access_token: c.access_token, refresh_token: c.refresh_token, expires_at: c.expires_at || Math.floor(Date.now() / 1000) + (c.expires_in || 3600), user: { id: c.user && c.user.id, email: c.user && c.user.email } };
    }

    function renovar() {
      if (!sessao) return Promise.reject(ErroApi('Sessão encerrada. Entre novamente.', 401, 'sem_sessao'));
      if (renovando) return renovando;
      var rt = sessao.refresh_token;
      renovando = pedir('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: cabecalhos(null, false), body: JSON.stringify({ refresh_token: rt }) })
        .then(function (r) {
          if (r.status === 200 && r.corpo && r.corpo.access_token) { gravarSessao(sessaoDe(r.corpo)); avisar('renovada'); return sessao; }
          if (r.status >= 500 || r.status === 0) throw ErroApi('Sem conexão com o servidor. Verifique a internet e tente de novo.', r.status, 'rede');
          gravarSessao(null); avisar('expirou');
          throw ErroApi('Sua sessão expirou. Entre novamente.', 401, 'expirou');
        })
        .finally(function () { renovando = null; });
      return renovando;
    }

    function tokenValido() {
      if (!sessao) return Promise.reject(ErroApi('Sessão encerrada. Entre novamente.', 401, 'sem_sessao'));
      if (sessao.expires_at - MARGEM_RENOVACAO_S > Date.now() / 1000) return Promise.resolve(sessao);
      return renovar();
    }

    /** Requisição autenticada; em caso de 401, renova o token uma vez e repete. */
    function autenticado(caminho, init, tentou) {
      return tokenValido().then(function () {
        var i = Object.assign({}, init, { headers: cabecalhos(init.headers, true) });
        return pedir(caminho, i);
      }).then(function (r) {
        if (r.status === 401 && !tentou) return renovar().then(function () { return autenticado(caminho, init, true); });
        if (r.status === 401) { gravarSessao(null); avisar('expirou'); throw ErroApi('Sua sessão expirou. Entre novamente.', 401, 'expirou'); }
        if (r.status >= 400) throw erroDoServidor(r);
        return r.corpo;
      });
    }

    /** Mostra a mensagem do servidor só quando ela foi escrita para o usuário (regras de negócio e permissões). */
    function erroDoServidor(r) {
      var c = r.corpo || {}, cod = c.code || c.error_code || '';
      if ((cod === 'P0001' || cod === '42501') && c.message) return ErroApi(c.message, r.status, cod);
      if (c.erro) return ErroApi(c.erro, r.status, 'funcao');
      if (r.status === 403) return ErroApi('Seu usuário não tem permissão para esta ação.', 403, cod);
      if (r.status === 429) return ErroApi('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.', 429, cod);
      if (r.status === 413) return ErroApi('O arquivo enviado é grande demais.', 413, cod);
      return ErroApi('Não foi possível concluir agora. Tente de novo em instantes.', r.status, cod);
    }

    function consulta(o) {
      var p = ['select=' + encodeURIComponent(o.select || '*')];
      Object.keys(o.filtros || {}).forEach(function (k) { p.push(encodeURIComponent(k) + '=' + encodeURIComponent(o.filtros[k])); });
      if (o.ordem) p.push('order=' + encodeURIComponent(o.ordem));
      if (o.limite !== undefined) p.push('limit=' + o.limite);
      if (o.deslocamento) p.push('offset=' + o.deslocamento);
      return p.join('&');
    }

    var api = {
      url: url,
      sessao: function () { return sessao; },
      usuarioId: function () { return sessao && sessao.user ? sessao.user.id : null; },
      aoMudar: function (f) { ouvintes.push(f); },

      entrar: function (email, senha) {
        return pedir('/auth/v1/token?grant_type=password', { method: 'POST', headers: cabecalhos(null, false), body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password: senha }) })
          .then(function (r) {
            if (r.status === 200 && r.corpo && r.corpo.access_token) { gravarSessao(sessaoDe(r.corpo)); avisar('entrou'); return sessao; }
            var cod = r.corpo && (r.corpo.error_code || r.corpo.error) || '';
            if (r.status === 429 || cod === 'over_request_rate_limit') throw ErroApi('Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo.', 429, 'limite');
            if (cod === 'user_banned') throw ErroApi('Este usuário está desativado. Fale com o administrador da loja.', 400, 'desativado');
            if (r.status === 400 || r.status === 401 || r.status === 422) throw ErroApi('E-mail ou senha incorretos.', 400, 'credenciais');
            throw ErroApi('Não foi possível entrar agora. Tente de novo em instantes.', r.status, 'servidor');
          });
      },

      /** Encerra a sessão no servidor (o token de renovação deixa de valer) e apaga a cópia local. */
      sair: function (escopo) {
        var s = sessao; gravarSessao(null); avisar('saiu');
        if (!s) return Promise.resolve();
        return pedir('/auth/v1/logout?scope=' + (escopo || 'local'), { method: 'POST', headers: { apikey: chave, Authorization: 'Bearer ' + s.access_token } }).catch(function () { return null; });
      },

      renovar: renovar,

      /** Lê todas as linhas de uma tabela, de 1000 em 1000. */
      lerTudo: function (tabela, o) {
        o = o || {};
        var tudo = [];
        function pagina(desloc) {
          var q = consulta(Object.assign({}, o, { limite: LIMITE_PAGINA, deslocamento: desloc }));
          return autenticado('/rest/v1/' + tabela + '?' + q, { method: 'GET', headers: { 'Range-Unit': 'items' } }).then(function (linhas) {
            linhas = Array.isArray(linhas) ? linhas : [];
            tudo = tudo.concat(linhas);
            return linhas.length === LIMITE_PAGINA ? pagina(desloc + LIMITE_PAGINA) : tudo;
          });
        }
        return pagina(0);
      },

      ler: function (tabela, o) {
        return autenticado('/rest/v1/' + tabela + '?' + consulta(o || {}), { method: 'GET' }).then(function (l) { return Array.isArray(l) ? l : []; });
      },

      rpc: function (nome, args) {
        return autenticado('/rest/v1/rpc/' + nome, { method: 'POST', body: JSON.stringify(args || {}) });
      },

      funcao: function (nome, corpo) {
        return autenticado('/functions/v1/' + nome, { method: 'POST', body: JSON.stringify(corpo || {}) });
      }
    };
    agendarRenovacao();
    return api;
  }

  return { criar: criar, ErroApi: ErroApi };
});
