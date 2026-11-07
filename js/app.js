/*
 * Racce · Gestão da loja — aplicativo (interface).
 * Os dados e as regras de acesso ficam no Supabase; este arquivo só monta as telas
 * e chama as operações da camada de dados (js/dados.js).
 */
(function () {
'use strict';

// =============================================================================
// Utilitários
// =============================================================================
var $ = function (s, r) { return (r || document).querySelector(s); };
function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad2(n) { return String(n).padStart(2, '0'); }
function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function brlNum(c) { c = Math.round(c || 0); var v = Math.abs(c); return (c < 0 ? '-' : '') + milhar(Math.floor(v / 100)) + ',' + pad2(v % 100); }
function brl(c) { c = Math.round(c || 0); return (c < 0 ? '−' : '') + 'R$ ' + brlNum(Math.abs(c)); }
function brlCurto(c) {
  var v = c / 100, a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e6) return s + 'R$ ' + String(Math.round(a / 1e5) / 10).replace('.', ',') + ' mi';
  if (a >= 1e4) return s + 'R$ ' + Math.round(a / 1e3) + ' mil';
  if (a >= 1e3) return s + 'R$ ' + String(Math.round(a / 100) / 10).replace('.', ',') + ' mil';
  return s + 'R$ ' + Math.round(a);
}
/** "1.250,50", "1250,5", "1.250", "R$ 80" -> centavos; NaN se inválido. */
function parseBrl(s) {
  s = String(s === null || s === undefined ? '' : s).replace(/[R$\s]/g, '');
  if (s === '') return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var n = Number(s);
  return isFinite(n) ? Math.round(n * 100) : NaN;
}
function parsePct(s) { s = String(s || '').replace('%', '').replace(',', '.').trim(); if (s === '') return 0; var n = Number(s); return isFinite(n) ? n : NaN; }
function pctTxt(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
function pct(a, b) { if (!b) return '—'; var n = Math.round(a / b * 100); return (n < 0 ? '−' + Math.abs(n) : n) + '%'; }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function plural(n, um, varios) { return milhar(n) + ' ' + (n === 1 ? um : varios); }
function hoje() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function somarDias(iso, n) { var p = iso.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return t.toISOString().slice(0, 10); }
function difDias(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5); }
function diaSemana(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); }
function addMes(k, n) { var y = +k.slice(0, 4), m = +k.slice(5, 7) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad2(m); }
function fimMes(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate(); }
var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
var SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function mesNome(k) { return MESES[+k.slice(5, 7) - 1]; }
function mesTitulo(k) { var n = mesNome(k); return n.charAt(0).toUpperCase() + n.slice(1) + ' de ' + k.slice(0, 4); }
function mesCurto(k) { return mesNome(k).slice(0, 3) + '/' + k.slice(2, 4); }
function dbr(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
function dcurta(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }
function dataLonga(iso) { return SEMANA[diaSemana(iso)] + ', ' + (+iso.slice(8, 10)) + ' de ' + MESES[+iso.slice(5, 7) - 1]; }
function horaDe(ts) { if (!ts) return ''; var d = new Date(ts); return isNaN(d) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function dataValida(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
function nVenda(n) { return String(n).padStart(3, '0'); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function nomeP(p) { return p ? p.nome + (p.cor ? ' · ' + p.cor : '') : 'Produto removido'; }
function margemTxt(custo, preco) { return preco > 0 ? Math.round((preco - custo) / preco * 100) + '%' : '—'; }
function soma(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }

var ICONES = {
 "tenis": "<path d=\"M 3 17 L 3 9.5 L 7.2 9.5 L 9 11.5 L 12.5 10.7 L 16 13 L 20 14 C 20.3 14.11 20.54 14.29 20.72 14.54 C 20.9 14.8 21 15.08 21 15.4 L 21 17 Z M 3 17\"/><path d=\"M 3 17 L 21 17 M 9.5 12.8 L 10.7 12.5 M 11.8 14 L 13 13.7\"/>",
 "roupas": "<path d=\"M 8.5 4 L 4 6.5 L 5.5 10.5 L 7.5 9.7 L 7.5 20 L 16.5 20 L 16.5 9.7 L 18.5 10.5 L 20 6.5 L 15.5 4 C 14.8 5.4 13.5 6.2 12 6.2 C 10.5 6.2 9.2 5.4 8.5 4 Z M 8.5 4\"/>",
 "acessorios": "<path d=\"M 10 2.5 L 14 2.5 L 14 5 L 15.5 7 L 15.5 19.5 C 15.5 19.76 15.45 20.02 15.35 20.26 C 15.25 20.51 15.1 20.73 14.92 20.92 C 14.73 21.1 14.51 21.25 14.26 21.35 C 14.02 21.45 13.76 21.5 13.5 21.5 L 10.5 21.5 C 10.24 21.5 9.98 21.45 9.74 21.35 C 9.49 21.25 9.27 21.1 9.08 20.92 C 8.9 20.73 8.75 20.51 8.65 20.26 C 8.55 20.02 8.5 19.76 8.5 19.5 L 8.5 7 L 10 5 Z M 10 2.5\"/><path d=\"M 8.5 11 L 15.5 11 M 8.5 15 L 15.5 15\"/>",
 "corrida": "<path d=\"M 19.5 13.5 C 19.5 13.99 19.45 14.48 19.36 14.96 C 19.26 15.44 19.12 15.92 18.93 16.37 C 18.74 16.82 18.51 17.26 18.24 17.67 C 17.96 18.08 17.65 18.46 17.3 18.8 C 16.96 19.15 16.58 19.46 16.17 19.74 C 15.76 20.01 15.32 20.24 14.87 20.43 C 14.42 20.62 13.94 20.76 13.46 20.86 C 12.98 20.95 12.49 21 12 21 C 11.51 21 11.02 20.95 10.54 20.86 C 10.06 20.76 9.58 20.62 9.13 20.43 C 8.68 20.24 8.24 20.01 7.83 19.74 C 7.42 19.46 7.04 19.15 6.69 18.8 C 6.35 18.46 6.04 18.08 5.76 17.67 C 5.49 17.26 5.26 16.82 5.07 16.37 C 4.88 15.92 4.74 15.44 4.64 14.96 C 4.55 14.48 4.5 13.99 4.5 13.5 C 4.5 13.01 4.55 12.52 4.64 12.04 C 4.74 11.56 4.88 11.08 5.07 10.63 C 5.26 10.18 5.49 9.74 5.76 9.33 C 6.04 8.92 6.35 8.54 6.69 8.2 C 7.04 7.85 7.42 7.54 7.83 7.26 C 8.24 6.99 8.68 6.76 9.13 6.57 C 9.58 6.38 10.06 6.24 10.54 6.14 C 11.02 6.05 11.51 6 12 6 C 12.49 6 12.98 6.05 13.46 6.14 C 13.94 6.24 14.42 6.38 14.87 6.57 C 15.32 6.76 15.76 6.99 16.17 7.26 C 16.58 7.54 16.96 7.85 17.3 8.2 C 17.65 8.54 17.96 8.92 18.24 9.33 C 18.51 9.74 18.74 10.18 18.93 10.63 C 19.12 11.08 19.26 11.56 19.36 12.04 C 19.45 12.52 19.5 13.01 19.5 13.5 Z M 19.5 13.5\"/><path d=\"M 12 13.5 L 12 9.5 M 10 2.5 L 14 2.5 M 12 2.5 L 12 6 M 18.5 6.5 L 20 5\"/>",
 "treino": "<path d=\"M 6.5 7 L 6.5 17 M 3.5 9.5 L 3.5 14.5 M 17.5 7 L 17.5 17 M 20.5 9.5 L 20.5 14.5 M 6.5 12 L 17.5 12\"/>",
 "desempenho": "<path d=\"M 2.5 12.5 L 6.5 12.5 L 8.5 7.5 L 12 17.5 L 14.5 10.5 L 16 12.5 L 21.5 12.5\"/>",
 "compra": "<path d=\"M 5 8 L 19 8 L 18 20.5 L 6 20.5 Z M 5 8\"/><path d=\"M 9 10 L 9 6.5 C 9 6.1 9.08 5.72 9.23 5.35 C 9.38 4.99 9.6 4.66 9.88 4.38 C 10.16 4.1 10.49 3.88 10.85 3.73 C 11.22 3.58 11.6 3.5 12 3.5 C 12.4 3.5 12.78 3.58 13.15 3.73 C 13.51 3.88 13.84 4.1 14.12 4.38 C 14.4 4.66 14.62 4.99 14.77 5.35 C 14.92 5.72 15 6.1 15 6.5 L 15 10\"/>",
 "entrega": "<path d=\"M 2.5 6.5 L 13.5 6.5 L 13.5 16.5 L 2.5 16.5 Z M 13.5 10 L 17.5 10 L 20.5 13 L 20.5 16.5 L 13.5 16.5 Z M 13.5 10\"/><path d=\"M 8.8 17.5 C 8.8 17.74 8.75 17.97 8.66 18.19 C 8.57 18.41 8.44 18.6 8.27 18.77 C 8.1 18.94 7.91 19.07 7.69 19.16 C 7.47 19.25 7.24 19.3 7 19.3 C 6.76 19.3 6.53 19.25 6.31 19.16 C 6.09 19.07 5.9 18.94 5.73 18.77 C 5.56 18.6 5.43 18.41 5.34 18.19 C 5.25 17.97 5.2 17.74 5.2 17.5 C 5.2 17.26 5.25 17.03 5.34 16.81 C 5.43 16.59 5.56 16.4 5.73 16.23 C 5.9 16.06 6.09 15.93 6.31 15.84 C 6.53 15.75 6.76 15.7 7 15.7 C 7.24 15.7 7.47 15.75 7.69 15.84 C 7.91 15.93 8.1 16.06 8.27 16.23 C 8.44 16.4 8.57 16.59 8.66 16.81 C 8.75 17.03 8.8 17.26 8.8 17.5 Z M 8.8 17.5\"/><path d=\"M 18.8 17.5 C 18.8 17.74 18.75 17.97 18.66 18.19 C 18.57 18.41 18.44 18.6 18.27 18.77 C 18.1 18.94 17.91 19.07 17.69 19.16 C 17.47 19.25 17.24 19.3 17 19.3 C 16.76 19.3 16.53 19.25 16.31 19.16 C 16.09 19.07 15.9 18.94 15.73 18.77 C 15.56 18.6 15.43 18.41 15.34 18.19 C 15.25 17.97 15.2 17.74 15.2 17.5 C 15.2 17.26 15.25 17.03 15.34 16.81 C 15.43 16.59 15.56 16.4 15.73 16.23 C 15.9 16.06 16.09 15.93 16.31 15.84 C 16.53 15.75 16.76 15.7 17 15.7 C 17.24 15.7 17.47 15.75 17.69 15.84 C 17.91 15.93 18.1 16.06 18.27 16.23 C 18.44 16.4 18.57 16.59 18.66 16.81 C 18.75 17.03 18.8 17.26 18.8 17.5 Z M 18.8 17.5\"/>",
 "troca": "<path d=\"M 4.5 9.5 L 17.5 9.5 L 14.5 6.5 M 19.5 14.5 L 6.5 14.5 L 9.5 17.5\"/>",
 "pagamento": "<path d=\"M 5.5 5.5 L 18.5 5.5 C 18.83 5.5 19.15 5.56 19.46 5.69 C 19.76 5.82 20.03 6 20.27 6.23 C 20.5 6.47 20.68 6.74 20.81 7.04 C 20.94 7.35 21 7.67 21 8 L 21 16 C 21 16.33 20.94 16.65 20.81 16.96 C 20.68 17.26 20.5 17.53 20.27 17.77 C 20.03 18 19.76 18.18 19.46 18.31 C 19.15 18.44 18.83 18.5 18.5 18.5 L 5.5 18.5 C 5.17 18.5 4.85 18.44 4.54 18.31 C 4.24 18.18 3.97 18 3.73 17.77 C 3.5 17.53 3.32 17.26 3.19 16.96 C 3.06 16.65 3 16.33 3 16 L 3 8 C 3 7.67 3.06 7.35 3.19 7.04 C 3.32 6.74 3.5 6.47 3.73 6.23 C 3.97 6 4.24 5.82 4.54 5.69 C 4.85 5.56 5.17 5.5 5.5 5.5 Z M 5.5 5.5\"/><path d=\"M 3 10 L 21 10 M 6.5 15 L 10.5 15\"/>",
 "loja": "<path d=\"M 12 21 C 12 21 5.5 15.4 5.5 10 C 5.5 9.57 5.54 9.15 5.63 8.73 C 5.71 8.31 5.83 7.91 6 7.51 C 6.16 7.12 6.36 6.74 6.6 6.39 C 6.83 6.03 7.1 5.71 7.4 5.4 C 7.71 5.1 8.03 4.83 8.39 4.6 C 8.74 4.36 9.12 4.16 9.51 4 C 9.91 3.83 10.31 3.71 10.73 3.63 C 11.15 3.54 11.57 3.5 12 3.5 C 12.43 3.5 12.85 3.54 13.27 3.63 C 13.69 3.71 14.09 3.83 14.49 4 C 14.88 4.16 15.26 4.36 15.61 4.6 C 15.97 4.83 16.29 5.1 16.6 5.4 C 16.9 5.71 17.17 6.03 17.4 6.39 C 17.64 6.74 17.84 7.12 18 7.51 C 18.17 7.91 18.29 8.31 18.38 8.73 C 18.46 9.15 18.5 9.57 18.5 10 C 18.5 15.4 12 21 12 21 Z M 12 21\"/><path d=\"M 14.4 10 C 14.4 10.32 14.34 10.63 14.22 10.92 C 14.1 11.21 13.92 11.47 13.7 11.7 C 13.47 11.92 13.21 12.1 12.92 12.22 C 12.63 12.34 12.32 12.4 12 12.4 C 11.68 12.4 11.38 12.34 11.08 12.22 C 10.79 12.1 10.53 11.92 10.3 11.7 C 10.08 11.47 9.9 11.21 9.78 10.92 C 9.66 10.63 9.6 10.32 9.6 10 C 9.6 9.68 9.66 9.38 9.78 9.08 C 9.9 8.79 10.08 8.53 10.3 8.3 C 10.53 8.08 10.79 7.9 11.08 7.78 C 11.38 7.66 11.68 7.6 12 7.6 C 12.32 7.6 12.63 7.66 12.92 7.78 C 13.21 7.9 13.47 8.08 13.7 8.3 C 13.92 8.53 14.1 8.79 14.22 9.08 C 14.34 9.38 14.4 9.68 14.4 10 Z M 14.4 10\"/>",
 "atendimento": "<path d=\"M 4 5.5 C 4 5.3 4.04 5.11 4.11 4.93 C 4.19 4.74 4.3 4.58 4.44 4.44 C 4.58 4.3 4.74 4.19 4.93 4.11 C 5.11 4.04 5.3 4 5.5 4 L 18.5 4 C 18.7 4 18.89 4.04 19.07 4.11 C 19.26 4.19 19.42 4.3 19.56 4.44 C 19.7 4.58 19.81 4.74 19.89 4.93 C 19.96 5.11 20 5.3 20 5.5 L 20 14.5 C 20 14.7 19.96 14.89 19.89 15.07 C 19.81 15.26 19.7 15.42 19.56 15.56 C 19.42 15.7 19.26 15.81 19.07 15.89 C 18.89 15.96 18.7 16 18.5 16 L 10.5 16 L 6.5 20 L 6.5 16 L 5.5 16 C 5.3 16 5.11 15.96 4.93 15.89 C 4.74 15.81 4.58 15.7 4.44 15.56 C 4.3 15.42 4.19 15.26 4.11 15.07 C 4.04 14.89 4 14.7 4 14.5 Z M 4 5.5\"/>",
 "painel": "<rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/>",
 "usuarios": "<circle cx=\"9\" cy=\"8.5\" r=\"3.5\"/><path d=\"M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5\"/><path d=\"M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.7c1.8.6 3 2.2 3.5 4.8\"/>",
 "ajustes": "<path d=\"M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9\"/><circle cx=\"15\" cy=\"7.5\" r=\"2\"/><circle cx=\"9\" cy=\"16.5\" r=\"2\"/>",
 "camera": "<path d=\"M4 8h3l1.5-2.5h7L17 8h3v11.5H4z\"/><circle cx=\"12\" cy=\"13.5\" r=\"3.5\"/>",
 "sair": "<path d=\"M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10\"/>",
 "check": "<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>",
 "mais": "<path d=\"M12 5v14M5 12h14\"/>",
 "x": "<path d=\"M6 6l12 12M18 6 6 18\"/>",
 "busca": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4 4\"/>",
 "esq": "<path d=\"M15 5l-7 7 7 7\"/>",
 "dir": "<path d=\"M9 5l7 7-7 7\"/>",
 "baixar": "<path d=\"M12 4v11M7 10l5 5 5-5M5 20h14\"/>",
 "lixo": "<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3\"/>",
 "vendas": "<path d=\"M 5 8 L 19 8 L 18 20.5 L 6 20.5 Z M 5 8\"/><path d=\"M 9 10 L 9 6.5 C 9 6.1 9.08 5.72 9.23 5.35 C 9.38 4.99 9.6 4.66 9.88 4.38 C 10.16 4.1 10.49 3.88 10.85 3.73 C 11.22 3.58 11.6 3.5 12 3.5 C 12.4 3.5 12.78 3.58 13.15 3.73 C 13.51 3.88 13.84 4.1 14.12 4.38 C 14.4 4.66 14.62 4.99 14.77 5.35 C 14.92 5.72 15 6.1 15 6.5 L 15 10\"/>",
 "estoque": "<path d=\"M 8.5 4 L 4 6.5 L 5.5 10.5 L 7.5 9.7 L 7.5 20 L 16.5 20 L 16.5 9.7 L 18.5 10.5 L 20 6.5 L 15.5 4 C 14.8 5.4 13.5 6.2 12 6.2 C 10.5 6.2 9.2 5.4 8.5 4 Z M 8.5 4\"/>",
 "despesas": "<path d=\"M 5.5 5.5 L 18.5 5.5 C 18.83 5.5 19.15 5.56 19.46 5.69 C 19.76 5.82 20.03 6 20.27 6.23 C 20.5 6.47 20.68 6.74 20.81 7.04 C 20.94 7.35 21 7.67 21 8 L 21 16 C 21 16.33 20.94 16.65 20.81 16.96 C 20.68 17.26 20.5 17.53 20.27 17.77 C 20.03 18 19.76 18.18 19.46 18.31 C 19.15 18.44 18.83 18.5 18.5 18.5 L 5.5 18.5 C 5.17 18.5 4.85 18.44 4.54 18.31 C 4.24 18.18 3.97 18 3.73 17.77 C 3.5 17.53 3.32 17.26 3.19 16.96 C 3.06 16.65 3 16.33 3 16 L 3 8 C 3 7.67 3.06 7.35 3.19 7.04 C 3.32 6.74 3.5 6.47 3.73 6.23 C 3.97 6 4.24 5.82 4.54 5.69 C 4.85 5.56 5.17 5.5 5.5 5.5 Z M 5.5 5.5\"/><path d=\"M 3 10 L 21 10 M 6.5 15 L 10.5 15\"/>",
 "resultado": "<path d=\"M 2.5 12.5 L 6.5 12.5 L 8.5 7.5 L 12 17.5 L 14.5 10.5 L 16 12.5 L 21.5 12.5\"/>",
 "cabide": "<path d=\"M 8.5 4 L 4 6.5 L 5.5 10.5 L 7.5 9.7 L 7.5 20 L 16.5 20 L 16.5 9.7 L 18.5 10.5 L 20 6.5 L 15.5 4 C 14.8 5.4 13.5 6.2 12 6.2 C 10.5 6.2 9.2 5.4 8.5 4 Z M 8.5 4\"/>"
};
function ic(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[n] || '') + '</svg>'; }

// =============================================================================
// Estado
// =============================================================================
var MERC = 'Compra de mercadoria';
var PAGAMENTOS = ['Pix', 'Dinheiro', 'Débito', 'Crédito à vista', 'Crédito parcelado'];
var PAG_CURTO = { 'Pix': 'Pix', 'Dinheiro': 'Dinheiro', 'Débito': 'Débito', 'Crédito à vista': 'Crédito', 'Crédito parcelado': 'Parcelado' };
var TAMANHOS_SUGERIDOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único', '34', '36', '38', '40', '42', '44'];
var PUBLICOS = ['Unissex', 'Feminino', 'Masculino'];
var MOTIVOS_AJUSTE = ['Contagem do estoque', 'Defeito', 'Perda ou furto', 'Troca com cliente', 'Brinde ou uso da loja', 'Devolução ao fornecedor', 'Correção de lançamento'];
var CONFIG_PADRAO = {
  taxas: { 'Pix': 0, 'Dinheiro': 0, 'Débito': 0, 'Crédito à vista': 0, 'Crédito parcelado': 0 },
  categoriasProduto: ['Leggings', 'Tops', 'Camisetas', 'Regatas', 'Shorts e bermudas', 'Conjuntos', 'Jaquetas e moletons', 'Calçados', 'Acessórios'],
  categoriasDespesa: ['Aluguel', MERC, 'Funcionários', 'Energia e água', 'Internet e telefone', 'Marketing e redes sociais', 'Maquininha e sistemas', 'Contabilidade', 'Impostos', 'Embalagens', 'Frete', 'Manutenção', 'Outras'],
  canais: ['Loja física', 'Site', 'Instagram', 'WhatsApp'],
  estoqueMinimo: 2,
  meta: 0,
  metas: {},
  loja: { nome: 'Racce', cnpj: '', endereco: 'Av. Dois de Maio, 1437 · Passaré', cidade: 'Fortaleza · CE', whatsapp: '(85) 99414-6085', instagram: '@racceloja', horario: '08h às 19h', troca: 'Trocas em até 30 dias, com este recibo e a peça com etiqueta.', mensagem: 'Obrigado por escolher a Racce.' }
};
var COLECOES = ['produtos', 'movs', 'vendas', 'despesas'];
function baseVazia() { return { produtos: {}, movs: {}, vendas: {}, despesas: {}, usuarios: {}, historico: {}, config: null, estoque: {}, fotos: {} }; }
/**
 * modo: 'carregando' | 'entrar' | 'trocarSenha' | 'real' | 'exemplo' | 'config' (o Supabase ainda não foi configurado).
 * perfil: quem entrou, com as permissões devolvidas pelo servidor (meu_perfil).
 */
var S = { modo: 'carregando', modoAntes: null, real: baseVazia(), exemplo: null, perfil: null, carregado: false, erro: '', erroEntrar: '', atualizadoEm: 0 };
var SB = null;     // cliente das APIs do Supabase (js/supabase-cliente.js)
var B = null;      // camada de dados ativa: banco real ou exemplo (js/dados.js)
var BREAL = null;  // camada do banco real, guardada enquanto o exemplo está aberto

// =============================================================================
// Fotos dos produtos: miniaturas chegam com os dados; a foto grande é buscada quando aparece
// =============================================================================
var FOTO_G = {}, carregandoG = {};
var LIMITE_ARQUIVO_FOTO = 15 * 1024 * 1024;
function fotosAtuais() { return (D() && D().fotos) || {}; }
function thumbHtml(pid, tam) {
  var src = fotosAtuais()[pid], cls = 'foto' + (tam && tam !== 40 ? ' f' + tam : '');
  return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="">' : '<span class="' + cls + '" aria-hidden="true">' + ic('cabide') + '</span>';
}
function desenharFoto(img, max, quadrado, q) {
  var w = img.naturalWidth, h = img.naturalHeight, sx = 0, sy = 0, sw = w, sh = h, dw, dh;
  if (quadrado) { var lado = Math.min(w, h); sx = (w - lado) / 2; sy = (h - lado) / 2; sw = sh = lado; dw = dh = Math.min(max, lado); }
  else { var k = Math.min(1, max / Math.max(w, h)); dw = Math.max(1, Math.round(w * k)); dh = Math.max(1, Math.round(h * k)); }
  var cv = document.createElement('canvas'); cv.width = dw; cv.height = dh;
  var cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, dw, dh); cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return cv.toDataURL('image/jpeg', q);
}
/** Reduz a imagem no navegador e converte para JPEG (o banco só aceita JPEG, até ~500 KB). */
function processarFoto(arq) {
  return new Promise(function (ok, falha) {
    if (!arq) return falha(new Error('Nenhuma imagem escolhida.'));
    if (!/^image\//.test(arq.type || '') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(arq.name || '')) return falha(new Error('Escolha uma imagem (JPG, PNG ou WEBP).'));
    if (arq.size > LIMITE_ARQUIVO_FOTO) return falha(new Error('A imagem tem mais de 15 MB. Escolha uma imagem menor.'));
    var url = URL.createObjectURL(arq), img = new Image();
    img.onload = function () {
      try {
        var r = { foto: desenharFoto(img, 900, false, 0.82), thumb: desenharFoto(img, 160, true, 0.8) };
        if (r.foto.length > 650000) r.foto = desenharFoto(img, 700, false, 0.72);
        URL.revokeObjectURL(url); ok(r);
      } catch (e) { URL.revokeObjectURL(url); falha(new Error('Não consegui processar esta imagem.')); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('Este formato de imagem não abre neste navegador. Use JPG ou PNG.')); };
    img.src = url;
  });
}
function guardarFoto(pid, d) { return gravar(function () { return B.salvarFoto(pid, d); }).then(function () { FOTO_G[pid] = d.foto; }); }
function apagarFoto(pid) { return gravar(function () { return B.removerFoto(pid); }).then(function () { delete FOTO_G[pid]; }); }
/** Foto grande de um produto (busca uma vez e guarda enquanto a página estiver aberta). */
function fotoGrande(pid) {
  if (FOTO_G[pid]) return Promise.resolve(FOTO_G[pid]);
  if (!fotosAtuais()[pid] || !B) return Promise.resolve(null);
  if (carregandoG[pid]) return carregandoG[pid];
  carregandoG[pid] = B.fotoGrande(pid).then(function (f) { delete carregandoG[pid]; if (f) FOTO_G[pid] = f; return f; }, function () { delete carregandoG[pid]; return null; });
  return carregandoG[pid];
}
function carregarFotoGrande(pid) {
  fotoGrande(pid).then(function (src) { var a = $('#fotoGrande'); if (!src || !a || !ui.det || ui.det.id !== pid) return; var img = a.querySelector('img'); if (img && img.getAttribute('src') !== src) img.src = src; });
}
function fotoGrandeSrc(pid) { return FOTO_G[pid] || fotosAtuais()[pid] || ''; }

// ---------- usuários e permissões
var PAINEIS = [['painel', 'Visão geral'], ['vendas', 'Vendas'], ['estoque', 'Estoque'], ['despesas', 'Despesas'], ['resultado', 'Resultado']];
var EXTRAS = [['equipe', 'Ver as vendas de toda a equipe', 'Sem isso, a pessoa vê só as vendas que ela registrou.', 'Vendas da equipe'],
  ['cancelar', 'Cancelar vendas', 'As peças voltam para o estoque.', 'Cancela vendas'],
  ['editar', 'Editar vendas já registradas', 'Corrige produto, tamanho, quantidade, pagamento e outros dados, sempre com motivo. Tudo vai para o histórico.', 'Edita vendas'],
  ['historico', 'Ver o histórico de alterações das vendas', 'Quem editou ou cancelou cada venda, quando, o que mudou e o motivo.', 'Vê histórico'],
  ['custos', 'Ver custo e lucro das vendas', 'Na lista de vendas e no detalhe de cada venda.', 'Vê custos']];
var PERFIS = [
  ['admin', 'Administrador', null, null, 'Acesso total, inclusive usuários e ajustes.'],
  ['gerente', 'Gerente', ['painel', 'vendas', 'estoque', 'despesas', 'resultado'], ['equipe', 'cancelar', 'editar', 'historico', 'custos'], 'Toda a operação da loja, sem mexer em usuários e ajustes.'],
  ['vendedor', 'Vendedor(a)', ['vendas'], [], 'Registra vendas e vê só as vendas que registrou.'],
  ['estoquista', 'Estoquista', ['estoque'], [], 'Cadastra produtos e fotos, lança entradas e contagens.'],
  ['financeiro', 'Financeiro', ['painel', 'despesas', 'resultado'], ['equipe', 'custos', 'historico'], 'Despesas, resultado do mês, visão geral e histórico de alterações das vendas.'],
  ['personalizado', 'Personalizado', null, null, 'Painéis e permissões escolhidos um a um.']];
/** Painéis e permissões de cada pessoa: as funções prontas seguem sempre a definição da função; a personalizada usa o que foi marcado. */
function paginasDe(u) { var pf = perfil(u && u.papel); return pf[2] && u.papel !== 'personalizado' ? pf[2] : (u && u.paginas) || []; }
function extrasDe(u) { var pf = perfil(u && u.papel); return pf[3] && u.papel !== 'personalizado' ? pf[3] : (u && u.extras) || []; }
function perfil(k) { return PERFIS.filter(function (p) { return p[0] === k; })[0] || PERFIS[PERFIS.length - 1]; }
function nomePerfil(u) { return perfil(u && u.papel)[1]; }
function iniciais(nome) { var p = String(nome || '?').trim().split(/\s+/); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
function listaUsuarios() {
  var us = D().usuarios || {};
  return Object.keys(us).map(function (id) { return Object.assign({ id: id }, us[id]); }).sort(function (a, b) { return norm(a.nome) < norm(b.nome) ? -1 : 1; });
}
function permissoes() { return S.perfil && S.perfil.permissoes ? S.perfil.permissoes : []; }
/**
 * Decide só o que APARECE na tela. Quem autoriza de verdade é o servidor: mesmo que
 * alguém mude este código no navegador, o banco recusa o que a função dele não permite.
 */
function pode(p) {
  if (p === 'venda') p = 'vendas';
  if (S.modo === 'exemplo') return true;
  if (S.modo !== 'real') return false;
  return permissoes().indexOf(p) >= 0;
}
function verCustos() { return S.modo === 'exemplo' || ['custos', 'estoque', 'resultado', 'painel'].some(pode); }
function soMinhas() { return S.modo === 'real' && !pode('equipe'); }
function meuId() { return S.perfil ? S.perfil.id : null; }
var ACAO_PERM = { novaVenda: 'vendas', verHoje: 'vendas', cancelarVenda: 'cancelar', editarVenda: 'editar', vSalvarEdicao: 'editar', verHistorico: 'historico',
  novoProduto: 'estoque', editarProduto: 'estoque', duplicarProduto: 'estoque', ativarProduto: 'estoque', novaEntrada: 'estoque', novoAjuste: 'estoque', desfazerMov: 'estoque', verBaixos: 'estoque', fotoProduto: 'estoque', removerFoto: 'estoque',
  novaDespesa: 'despesas', editarDesp: 'despesas', pagarDesp: 'despesas',
  salvarTaxas: 'ajustes', salvarDadosLoja: 'ajustes', rcExemplo: 'ajustes', verRecibo: 'vendas', salvarMeta: 'ajustes', editarMeta: 'ajustes', definirMeta: 'ajustes', removerMeta: 'ajustes', salvarMetaPadrao: 'ajustes', cAdd: 'vendas', cAddDet: 'vendas', cFinalizar: 'vendas', salvarLoja: 'ajustes', salvarListas: 'ajustes', baixarBackup: 'ajustes',
  novoUsuario: 'usuarios', editarUsuario: 'usuarios', redefinirSenha: 'usuarios' };
function permDe(el) { var a = el.dataset.a; if (a === 'ir') return el.dataset.p || null; return ACAO_PERM[a] || null; }
function aplicarPermissoes(raiz) { (raiz || document).querySelectorAll('[data-a]').forEach(function (el) { var p = permDe(el); if (p) el.hidden = !pode(p); }); }
function primeiraPagina() { var p = PAGINAS.filter(function (x) { return pode(x[0]); })[0]; return p ? p[0] : 'painel'; }
var ui = { pagina: 'painel', mes: hoje().slice(0, 7), f: { vp: 'mes' }, det: null, modal: null, venda: null, rascunho: {} };
/** Valor de um campo de Ajustes: mantém o que a pessoa está digitando quando chegam alterações de outra tela. */
function rv(id, padrao) { return ui.rascunho[id] !== undefined ? ui.rascunho[id] : padrao; }
function limparRascunho(prefixo) { Object.keys(ui.rascunho).forEach(function (k) { if (k.indexOf(prefixo) === 0) delete ui.rascunho[k]; }); }
var pend = 0;

function D() { return S.modo === 'exemplo' ? S.exemplo : S.real; }
function podeEscrever() { return S.modo === 'exemplo' || S.modo === 'real'; }
function cfgAtual() {
  var c = D().config || {}, out = {};
  Object.keys(CONFIG_PADRAO).forEach(function (k) { out[k] = c[k] !== undefined && c[k] !== null ? c[k] : CONFIG_PADRAO[k]; });
  out.taxas = Object.assign({}, CONFIG_PADRAO.taxas, c.taxas || {});
  out.loja = Object.assign({}, CONFIG_PADRAO.loja, c.loja || {});
  if (out.categoriasDespesa.indexOf(MERC) < 0) out.categoriasDespesa = out.categoriasDespesa.concat([MERC]);
  return out;
}
/** Meta do mês (AAAA-MM): a meta própria do mês; sem ela, a meta padrão. */
function metaDoMes(cfg, k) { var m = cfg.metas && cfg.metas[k]; return m !== undefined && m !== null ? Number(m) || 0 : (Number(cfg.meta) || 0); }
function taxaDe(cfg, pagamento) { return Number(cfg.taxas[pagamento]) || 0; }

// =============================================================================
// Cálculos — o estoque nasce das entradas, ajustes e vendas; nada é guardado em duplicidade
// =============================================================================
function calc() {
  var d = D(), cfg = cfgAtual(), h = hoje();
  function lista(col) { return Object.keys(d[col] || {}).map(function (id) { return Object.assign({ id: id }, d[col][id]); }); }
  var produtos = lista('produtos').sort(function (a, b) { return norm(nomeP(a)) < norm(nomeP(b)) ? -1 : 1; });
  var pIdx = {}; produtos.forEach(function (p) { pIdx[p.id] = p; });
  var vendas = lista('vendas').sort(function (a, b) { return a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : (a.id < b.id ? -1 : 1); });
  vendas.forEach(function (v, i) {
    v.numero = Number(v.numero) || i + 1;
    v.itens = Array.isArray(v.itens) ? v.itens : [];
    v.pecas = soma(v.itens, function (it) { return it.qtd || 0; });
    v.cmv = soma(v.itens, function (it) { return (it.qtd || 0) * (it.custo || 0); });
    // a taxa da maquininha fica gravada na venda (mudar a taxa hoje não altera o lucro dos meses passados)
    v.taxa = Math.round((v.total || 0) * (v.taxaPct !== undefined && v.taxaPct !== null ? Number(v.taxaPct) : taxaDe(cfg, v.pagamento)) / 100);
    v.ok = v.status !== 'cancelada';
  });
  var movs = lista('movs').sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : (a.criadoEm < b.criadoEm ? 1 : -1); });
  var despesas = lista('despesas').map(function (x) {
    x.paga = !!x.pagaEm;
    x.situacao = x.paga ? 'Paga' : x.vencimento < h ? 'Vencida' : x.vencimento === h ? 'Vence hoje' : 'A vencer';
    return x;
  }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0; });
  // estoque calculado pelo servidor (entradas + ajustes − vendas concluídas), igual para todos os perfis
  var est = limpo(d.estoque || {});
  produtos.forEach(function (p) {
    var e = est[p.id] || {}, tams = (p.tamanhos || []).slice();
    Object.keys(e).forEach(function (t) { if (tams.indexOf(t) < 0 && e[t] !== 0) tams.push(t); });
    p.grade = tams.map(function (t) { return { t: t, q: e[t] || 0 }; });
    p.ativo = p.ativo !== false;
    p.min = p.minimo === null || p.minimo === undefined || p.minimo === '' ? cfg.estoqueMinimo : Number(p.minimo);
    p.total = soma(p.grade, function (g) { return g.q; });
    p.baixos = p.grade.filter(function (g) { return (p.tamanhos || []).indexOf(g.t) >= 0 && g.q <= p.min; });
    p.zerados = p.grade.filter(function (g) { return (p.tamanhos || []).indexOf(g.t) >= 0 && g.q <= 0; });
  });
  var vIdx = {}; vendas.forEach(function (v) { vIdx[v.id] = v; });
  var historico = lista('historico').sort(function (a, b) { return a.em < b.em ? 1 : a.em > b.em ? -1 : (b.seq || 0) - (a.seq || 0); }), hPorVenda = {};
  historico.forEach(function (x) {
    var vv = vIdx[x.vendaId]; x.numero = vv ? vv.numero : null;
    x.mudancas = x.antes && x.depois ? difVenda(x.antes, x.depois) : [];
    (hPorVenda[x.vendaId] = hPorVenda[x.vendaId] || []).push(x);
  });
  vendas.forEach(function (v) { v.edicoes = (hPorVenda[v.id] || []).filter(function (x) { return x.tipo === 'edicao'; }).length; });
  return { cfg: cfg, hoje: h, produtos: produtos, pIdx: pIdx, vendas: vendas, movs: movs, despesas: despesas, est: est, vIdx: vIdx, historico: historico, hPorVenda: hPorVenda };
}
function resumoVendas(lista) {
  var r = { n: 0, subtotal: 0, desconto: 0, total: 0, pecas: 0, cmv: 0, taxas: 0 };
  lista.forEach(function (v) { if (!v.ok) return; r.n++; r.subtotal += v.subtotal || 0; r.desconto += v.desconto || 0; r.total += v.total || 0; r.pecas += v.pecas; r.cmv += v.cmv; r.taxas += v.taxa; });
  r.ticket = r.n ? Math.round(r.total / r.n) : 0;
  r.lucroBruto = r.total - r.taxas - r.cmv;
  return r;
}
function vendasDoMes(c, mes) { return c.vendas.filter(function (v) { return v.data && v.data.slice(0, 7) === mes; }); }
function despesasDoMes(c, mes) { return c.despesas.filter(function (x) { return x.vencimento && x.vencimento.slice(0, 7) === mes; }); }
function resultadoMes(c, mes) {
  var r = resumoVendas(vendasDoMes(c, mes)), ds = despesasDoMes(c, mes);
  var oper = ds.filter(function (x) { return x.categoria !== MERC; });
  r.despesas = soma(oper, function (x) { return x.valor || 0; });
  r.despesasTodas = soma(ds, function (x) { return x.valor || 0; });
  r.lucro = r.lucroBruto - r.despesas;
  var pagasNoMes = c.despesas.filter(function (x) { return x.pagaEm && x.pagaEm.slice(0, 7) === mes; });
  r.caixaEntrou = r.total - r.taxas;
  r.caixaSaiu = soma(pagasNoMes, function (x) { return x.valor || 0; });
  r.caixa = r.caixaEntrou - r.caixaSaiu;
  r.listaDespesas = ds; r.listaOper = oper;
  return r;
}
function valorEstoque(c) {
  var r = { pecas: 0, custo: 0, venda: 0 };
  c.produtos.forEach(function (p) { if (!p.ativo) return; p.grade.forEach(function (g) { var q = Math.max(0, g.q); r.pecas += q; r.custo += q * (p.custo || 0); r.venda += q * (p.preco || 0); }); });
  return r;
}
function alertasEstoque(c) {
  var out = [];
  c.produtos.forEach(function (p) { if (!p.ativo) return; p.baixos.forEach(function (g) { out.push({ p: p, t: g.t, q: g.q }); }); });
  return out.sort(function (a, b) { return a.q - b.q || (norm(nomeP(a.p)) < norm(nomeP(b.p)) ? -1 : 1); });
}
function vazioReal(c) { return S.modo === 'real' && !c.produtos.length && !c.vendas.length && !c.despesas.length; }
function vendedores(c) { var vis = {}, out = []; c.vendas.forEach(function (v) { if (v.por && !vis[v.por]) { vis[v.por] = 1; out.push([v.por, v.vendedorNome || 'Sem nome']); } }); return out.sort(function (a, b) { return norm(a[1]) < norm(b[1]) ? -1 : 1; }); }

// =============================================================================
// Gravação e carga: cada operação vai para o servidor (ou para o exemplo) e os dados são recarregados
// =============================================================================
function limpo(o) { return JSON.parse(JSON.stringify(o)); }
/** Executa uma gravação e, se der certo, recarrega os dados. Erros de sessão levam de volta à tela de entrada. */
function gravar(fn) {
  pend++; atualizarStatus();
  return Promise.resolve().then(fn).then(function (r) { return recarregar().then(function () { return r; }); })
    .catch(function (e) { if (e && e.status === 401) sessaoExpirada(); throw e; })
    .finally(function () { pend--; atualizarStatus(); });
}
function salvarConfig(parcial) { return gravar(function () { return B.salvarConfig(limpo(parcial)); }); }
var carga = { atual: null, denovo: false };
/** Busca de novo todos os dados visíveis para este usuário. Chamadas simultâneas viram uma só. */
function recarregar() {
  if (!B) return Promise.resolve();
  if (carga.atual) { carga.denovo = true; return carga.atual; }
  var modo = S.modo, camada = B;
  carga.atual = camada.carregar().then(function (d) {
    if (S.modo !== modo || B !== camada) return;
    if (modo === 'exemplo') S.exemplo = d; else { S.real = d; S.carregado = true; }
    S.erro = ''; S.atualizadoEm = Date.now(); agendarRender();
  }, function (e) {
    if (e && e.status === 401) { sessaoExpirada(); return; }
    S.erro = e && e.codigo === 'rede' ? 'Sem conexão com o servidor. Os dados na tela podem estar desatualizados.' : 'Não consegui atualizar os dados agora. Tente recarregar a página.';
    agendarRender();
  }).then(function () {
    carga.atual = null;
    if (carga.denovo) { carga.denovo = false; return recarregar(); }
  });
  return carga.atual;
}

// =============================================================================
// Componentes
// =============================================================================
function cabecalho(olho, titulo, sub, acoes) {
  return '<div class="cab"><div><span class="olho">' + esc(olho) + '</span><h1 class="tit">' + esc(titulo) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (acoes ? '<div class="acoes">' + acoes + '</div>' : '') + '</div>';
}
function mesNav() {
  var atual = hoje().slice(0, 7);
  return (ui.mes !== atual ? '<button class="btn" data-a="mesAtual">Este mês</button>' : '') +
    '<div class="mesnav" role="group" aria-label="Mês"><button data-a="mes" data-d="-1" aria-label="Mês anterior">' + ic('esq') + '</button><span>' + esc(mesTitulo(ui.mes)) + '</span><button data-a="mes" data-d="1" aria-label="Próximo mês"' + (ui.mes >= addMes(atual, 6) ? ' disabled' : '') + '>' + ic('dir') + '</button></div>';
}
function bloco(t, sub, corpo, acoes) {
  return '<section class="bloco"><header><div><h2>' + esc(t) + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acoes ? '<div class="acoes">' + acoes + '</div>' : '') + '</header>' + corpo + '</section>';
}
function destaque(icone, variante) { return '<span class="destaque d-' + variante + '" aria-hidden="true">' + ic(icone) + '</span>'; }
function tile(r, v, s, cls) { var cab = Array.isArray(r) ? '<div class="tile-cab"><span class="r">' + esc(r[0]) + '</span>' + destaque(r[1], r[2]) + '</div>' : '<span class="r">' + esc(r) + '</span>'; return '<div class="tile ' + (cls || '') + '">' + cab + '<span class="v">' + v + '</span>' + (s ? '<span class="s">' + s + '</span>' : '') + '</div>'; }
function pill(txt, tipo) { return '<span class="pill ' + (tipo || '') + '">' + esc(txt) + '</span>'; }
var SIT_PILL = { 'Paga': '', 'A vencer': '', 'Vence hoje': 'warn', 'Vencida': 'bad' };
function nv(v) { return '<span class="nv">#' + nVenda(v.numero) + '</span>'; }
function raiasProduto(p) {
  if (!p.grade.length) return '<span class="fraco">sem tamanhos</span>';
  return '<span class="raias-t">' + p.grade.map(function (g) {
    var cls = g.q <= 0 ? 'zero' : g.q <= p.min ? 'baixo' : '';
    return '<span class="raia ' + cls + '" title="' + esc(g.t + ': ' + g.q + (g.q === 1 ? ' peça' : ' peças')) + '"><i>' + esc(g.t) + '</i><b>' + g.q + '</b></span>';
  }).join('') + '</span>';
}
function tabela(cols, linhas, o) {
  o = o || {};
  if (!linhas.length) return '<div class="rolagem"><div class="vazio">' + (o.vazio || 'Nada para mostrar.') + '</div></div>';
  var h = '<div class="rolagem"><table class="tb"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c.c || '') + '">' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>';
  linhas.forEach(function (l) {
    h += '<tr' + (o.acao ? ' data-a="' + o.acao + '" data-id="' + esc(l.id) + '" tabindex="0"' : '') + (o.classe ? ' class="' + o.classe(l) + '"' : '') + '>' + cols.map(function (c) { return '<td class="' + (c.c || '') + '">' + c.v(l) + '</td>'; }).join('') + '</tr>';
  });
  return h + '</tbody>' + (o.rodape ? '<tfoot><tr>' + o.rodape + '</tr></tfoot>' : '') + '</table></div>';
}
function chipsFiltro(id, lista, padrao) {
  var atual = ui.f[id] === undefined ? (padrao || '') : ui.f[id];
  return '<div class="chips" role="group">' + lista.map(function (o) { return '<button class="chip" data-a="chip" data-f="' + id + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (atual === o[0]) + '">' + esc(o[1]) + (o[2] !== undefined ? '<small>' + o[2] + '</small>' : '') + '</button>'; }).join('') + '</div>';
}
function opcoes(lista, atual) {
  return lista.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(atual) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
}
function filtroTexto(id, rotulo, ph) { return '<label class="cresce">' + esc(rotulo) + '<input type="search" id="f_' + id + '" data-f="' + id + '" value="' + esc(ui.f[id] || '') + '" placeholder="' + esc(ph || '') + '"></label>'; }
function filtroSel(id, rotulo, lista) { return '<label>' + esc(rotulo) + '<select id="f_' + id + '" data-f="' + id + '">' + opcoes(lista, ui.f[id] || '') + '</select></label>'; }
function delta(atual, antes, rotulo) {
  if (!antes) return '';
  var v = Math.round((atual - antes) / Math.abs(antes) * 100);
  return '<span class="delta ' + (v >= 0 ? 'sobe' : 'desce') + '">' + (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v) + '%</span> ' + esc(rotulo);
}
function botaoCsv(chave, rot) { return '<button class="btn mini" data-a="csv" data-k="' + chave + '">' + ic('baixar') + (rot || 'Exportar CSV') + '</button>'; }
var exportes = {};
function registrarCsv(chave, nome, cab, linhas) { exportes[chave] = { nome: nome, cab: cab, linhas: linhas }; }

// ---------- gráficos (SVG desenhado à mão, uma escala por gráfico)
function escala(min, max, n) {
  if (max === min) max = min + 1;
  var bruto = (max - min) / (n || 4), p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p, passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  return { passo: passo, min: Math.floor(min / passo) * passo, max: Math.ceil(max / passo) * passo };
}
function coluna(x, y, w, h, r) { r = Math.max(0, Math.min(r, h, w / 2)); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; }
function colunaBaixo(x, y, w, h, r) { r = Math.max(0, Math.min(r, h, w / 2)); return 'M' + x + ',' + y + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) + 'V' + y + 'Z'; }
function largura(fracao) {
  var m = $('#main'), w = 1000;
  if (m) { var cs = getComputedStyle(m); w = m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }
  if (fracao && window.innerWidth > 1100) w = (w - 24) * fracao;
  return Math.max(260, Math.floor(w - (window.innerWidth <= 600 ? 34 : 42)));
}
/** Colunas: itens = [{rot, v, tip, futuro}] */
function grafColunas(itens, o) {
  var W = largura(o.fracao), H = o.alt || 200, m = { l: 56, r: 8, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = itens.length;
  var max = Math.max.apply(null, itens.map(function (i) { return i.v; }).concat([o.minimo || 1]));
  var e = escala(0, max, 3);
  function Y(v) { return m.t + ih - v / e.max * ih; }
  var slot = iw / n, bw = Math.max(3, Math.min(22, slot * .62));
  var s = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.titulo || '') + '">';
  for (var v = 0; v <= e.max + 1e-9; v += e.passo) s += '<line class="' + (v === 0 ? 'eixo' : 'grade') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(o.fmt(v)) + '</text>';
  var cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 38)))), ti = -1;
  itens.forEach(function (it, i) { if (it.destaque) ti = i; });
  itens.forEach(function (it, i) {
    var cx = m.l + i * slot + slot / 2, x = cx - bw / 2;
    if (it.v > 0) { var y = Y(it.v), hh = Y(0) - y; s += '<path d="' + coluna(x, y, bw, Math.max(hh, 2), 4) + '" fill="var(--bar)"/>'; }
    if (it.destaque) s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + (Y(0) + 3) + '" y2="' + (Y(0) + 7) + '" stroke="var(--ink)" stroke-width="2"/>';
    s += '<rect class="alvo" x="' + (m.l + i * slot) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '" data-tip="' + esc(it.tip) + '"/>';
    if (it.destaque || (i % cada === 0 && (ti < 0 || cada === 1 || Math.abs(i - ti) > 1))) s += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle"' + (it.destaque ? ' style="fill:var(--ink);font-weight:700"' : '') + '>' + esc(it.rot) + '</text>';
  });
  return s + '</svg>';
}
/** Colunas agrupadas com valores negativos: grupos = [{rot, a, b, tipA, tipB}] — a = vendas, b = lucro. */
function grafMeses(grupos, o) {
  var W = largura(o.fracao), H = o.alt || 230, m = { l: 60, r: 8, t: 14, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = grupos.length;
  var vals = []; grupos.forEach(function (g) { vals.push(g.a, g.b); });
  var e = escala(Math.min(0, Math.min.apply(null, vals)), Math.max(1, Math.max.apply(null, vals)), 4);
  function Y(v) { return m.t + ih - (v - e.min) / (e.max - e.min) * ih; }
  var slot = iw / n, bw = Math.max(6, Math.min(28, slot * .3));
  var s = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.titulo || '') + '">';
  for (var v = e.min; v <= e.max + 1e-9; v += e.passo) s += '<line class="' + (Math.abs(v) < 1e-9 ? 'eixo' : 'grade') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(o.fmt(v)) + '</text>';
  grupos.forEach(function (g, i) {
    var cx = m.l + i * slot + slot / 2, xa = cx - bw - 1, xb = cx + 1;
    if (g.a > 0) s += '<path d="' + coluna(xa, Y(g.a), bw, Math.max(2, Y(0) - Y(g.a)), 4) + '" fill="var(--bar)"/>';
    if (g.b > 0) s += '<path d="' + coluna(xb, Y(g.b), bw, Math.max(2, Y(0) - Y(g.b)), 4) + '" fill="var(--pos)"/>';
    else if (g.b < 0) s += '<path d="' + colunaBaixo(xb, Y(0), bw, Math.max(2, Y(g.b) - Y(0)), 4) + '" fill="var(--bad)"/>';
    s += '<rect class="alvo" x="' + (cx - slot / 2) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '" data-tip="' + esc(g.tip) + '"/>';
    s += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle"' + (g.destaque ? ' style="fill:var(--ink);font-weight:700"' : '') + '>' + esc(g.rot) + '</text>';
  });
  return s + '</svg>';
}
function barrasH(itens, vazio) {
  var max = Math.max.apply(null, [0].concat(itens.map(function (i) { return i.v; })));
  if (!itens.length || max <= 0) return '<div class="vazio">' + (vazio || 'Sem valores no período.') + '</div>';
  return '<div class="barras">' + itens.map(function (it) {
    return '<span>' + esc(it.rot) + '</span><span class="trilha"><b style="width:' + (it.v / max * 100).toFixed(2) + '%" data-tip="' + esc(it.tip || '') + '"></b></span><span class="num">' + it.txt + '</span>';
  }).join('') + '</div>';
}

// =============================================================================
// Estrutura da página
// =============================================================================
var PAGINAS = [['painel', 'Visão geral', 'Início'], ['vendas', 'Vendas'], ['estoque', 'Estoque'], ['despesas', 'Despesas', 'Contas'], ['resultado', 'Resultado', 'Lucro'], ['usuarios', 'Usuários', 'Equipe'], ['ajustes', 'Ajustes']];
function atualizarStatus() {
  var cls = '', txt = '';
  if (S.modo === 'exemplo') { cls = 'ex'; txt = 'Dados de exemplo'; }
  else if (S.modo === 'real') { if (pend > 0) txt = 'Salvando…'; else if (S.erro) txt = 'Sem conexão'; else { cls = 'ok'; txt = 'Salvo na nuvem'; } }
  else txt = 'Carregando';
  document.querySelectorAll('[data-status]').forEach(function (el) { el.className = 'status ' + cls; el.lastChild.textContent = txt; el.title = txt; });
}
function renderAbas(c) {
  var nAlerta = c ? alertasEstoque(c).filter(function (a) { return a.q <= 0; }).length : 0;
  var nVenc = c ? c.despesas.filter(function (x) { return x.situacao === 'Vencida'; }).length : 0;
  var conta = { estoque: nAlerta, despesas: nVenc }, sep = false;
  $('#abas').innerHTML = PAGINAS.filter(function (p) { return pode(p[0]); }).map(function (p) {
    var pre = '';
    if ((p[0] === 'usuarios' || p[0] === 'ajustes') && !sep) { sep = true; pre = '<span class="menu-sep" aria-hidden="true"></span>'; }
    return pre + '<button data-a="ir" data-p="' + p[0] + '"' + (ui.pagina === p[0] || (p[0] === 'vendas' && ui.pagina === 'historico') ? ' aria-current="page"' : '') + '>' + ic(p[0]) + '<span class="rot' + (p[2] ? ' longo' : '') + '">' + p[1] + '</span>' + (p[2] ? '<span class="rot-curto">' + p[2] + '</span>' : '') +
      (conta[p[0]] ? '<span class="conta" aria-label="' + conta[p[0]] + ' alertas">' + conta[p[0]] + '</span>' : '') + '</button>';
  }).join('');
  renderQuem();
  document.querySelectorAll('.btn-venda').forEach(function (b) { b.classList.toggle('ativo', ui.pagina === 'venda'); });
}
function renderQuem() {
  var el = $('#quem'), mv = $('#quemMovel'), nome = '', funcao = '';
  if (S.modo === 'exemplo') { nome = 'Demonstração'; funcao = 'Dados de exemplo'; }
  else if (S.perfil) { nome = S.perfil.nome; funcao = S.perfil.funcao; }
  if (el) {
    el.hidden = !nome;
    el.innerHTML = nome ? '<button class="quem-linha" data-a="minhaConta" title="Minha conta"><span class="avatar">' + esc(iniciais(nome)) + '</span><span><b>' + esc(nome) + '</b><small>' + esc(funcao) + '</small></span></button>' +
      '<button class="trocar" data-a="sair" title="' + (S.modo === 'exemplo' ? 'Voltar para a tela de entrada' : 'Encerrar a sessão neste aparelho') + '">' + ic('sair') + (S.modo === 'exemplo' ? 'Sair do exemplo' : 'Sair') + '</button>' : '';
  }
  if (mv) { mv.hidden = !nome; mv.innerHTML = nome ? '<span class="avatar">' + esc(iniciais(nome)) + '</span>' : ''; mv.setAttribute('aria-label', 'Minha conta (' + nome + ')'); mv.title = 'Minha conta'; }
}

// ---------- entrada no sistema, troca de senha e sessão
var MARCA_ENTRAR = '<section class="entrar-marca"><div><svg viewBox="0 0 434.9 45.1" role="img" aria-label="Racce"><use href="#rc-nome"/></svg><h2>Gestão da loja</h2><p>Vendas, estoque, despesas e resultado num só lugar, com acesso por função para cada pessoa da equipe.</p></div><small>Acesso protegido por e-mail e senha. Os dados ficam no servidor da loja.</small></section>';
function telaEntrar(corpo) {
  $('#telaEntrar').innerHTML = '<div class="entrar">' + MARCA_ENTRAR + '<section class="entrar-form"><div class="entrar-caixa">' + corpo + '</div></section></div>';
}
function renderEntrar() {
  telaEntrar('<h1>Entrar</h1><p>Use o e-mail e a senha cadastrados pelo administrador da loja.</p>' +
    '<form id="formEntrar" novalidate><label>E-mail<input type="email" id="lg_email" maxlength="254" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email"></label>' +
    '<label>Senha<input type="password" id="lg_senha" maxlength="72" autocomplete="current-password"></label>' +
    '<div class="erro-form" id="lgErro" role="alert" hidden></div><button class="btn pri" type="submit" id="lgBotao">Entrar</button></form>' +
    '<p class="fraco" style="font-size:13px">Esqueceu a senha? Peça ao administrador da loja para redefinir. Você recebe uma senha temporária e cria uma nova no primeiro acesso.</p>' +
    '<div class="entrar-pe"><span>Quer conhecer o sistema antes?</span><button class="btn link" data-a="verExemplo">Ver com dados de exemplo</button></div>');
  if (S.erroEntrar) erroEntrar(S.erroEntrar, true);
  var f = $('#lg_email'); if (f) f.focus();
}
function renderTrocarSenha() {
  var p = S.perfil || {};
  telaEntrar('<h1>Crie a sua senha</h1><p>Olá, ' + esc(String(p.nome || '').split(/\s+/)[0]) + '. Você entrou com uma senha temporária. Para continuar, crie uma senha só sua.</p>' +
    '<form id="formTrocarSenha" novalidate><input type="text" value="' + esc(p.email || '') + '" autocomplete="username" hidden>' +
    '<label>Senha temporária<input type="password" id="ts_atual" maxlength="72" autocomplete="current-password"></label>' +
    '<label>Nova senha<input type="password" id="ts_nova" maxlength="72" autocomplete="new-password"><small>' + esc(REGRA_SENHA) + '</small></label>' +
    '<label>Repita a nova senha<input type="password" id="ts_nova2" maxlength="72" autocomplete="new-password"></label>' +
    '<div class="erro-form" id="lgErro" role="alert" hidden></div><button class="btn pri" type="submit" id="lgBotao">Salvar e entrar</button></form>' +
    '<div class="entrar-pe"><span>Não é você?</span><button class="btn link" data-a="sair">Sair</button></div>');
  var f = $('#ts_atual'); if (f) f.focus();
}
function renderConfigFalta() {
  telaEntrar('<h1>Falta conectar o banco de dados</h1><p>Este endereço ainda não foi ligado ao Supabase da loja. Quem administra o sistema precisa preencher o arquivo <b>js/config.js</b> com o endereço do projeto e a chave pública, seguindo o guia de implantação.</p>' +
    '<div class="entrar-pe"><span>Enquanto isso:</span><button class="btn link" data-a="verExemplo">Ver com dados de exemplo</button></div>');
}
function erroEntrar(msg, semFoco) {
  var e = $('#lgErro'); if (!e) { toast(msg); return; }
  e.textContent = msg; e.hidden = false;
  if (!semFoco) { var f = $('#lg_senha') || $('#ts_atual'); if (f) { f.value = ''; f.focus(); } }
}
function ocupado(id, sim, txt) { var b = $('#' + id); if (!b) return; if (sim) { b.dataset.txt = b.textContent; b.textContent = txt; } else if (b.dataset.txt) b.textContent = b.dataset.txt; b.disabled = sim; }
var REGRA_SENHA = 'Pelo menos 10 caracteres, com letras e números. Evite datas e o seu nome.';
/** Mesma regra conferida no servidor (função admin-usuarios). Aqui só antecipa o aviso. */
function problemaSenha(senha, email) {
  if (senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'A senha precisa ter letras e números.';
  var local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && senha.toLowerCase().indexOf(local) >= 0) return 'A senha não pode conter o seu e-mail.';
  return '';
}
function entrar() {
  var email = val('lg_email'), senha = ($('#lg_senha') || {}).value || '';
  S.erroEntrar = '';
  if (!email || !senha) return erroEntrar('Informe o e-mail e a senha.', true);
  ocupado('lgBotao', true, 'Entrando…');
  SB.entrar(email, senha).then(function () { return iniciarSessao(); }, function (e) { ocupado('lgBotao', false); erroEntrar(e.message); });
}
function enviarTrocaSenha() {
  var atual = ($('#ts_atual') || {}).value || '', nova = ($('#ts_nova') || {}).value || '', nova2 = ($('#ts_nova2') || {}).value || '';
  if (!atual) return erroEntrar('Informe a senha temporária.', true);
  var prob = problemaSenha(nova, S.perfil && S.perfil.email); if (prob) return erroEntrar(prob, true);
  if (nova !== nova2) return erroEntrar('As senhas novas não conferem.', true);
  if (nova === atual) return erroEntrar('A nova senha precisa ser diferente da temporária.', true);
  ocupado('lgBotao', true, 'Salvando…');
  RacceDados.supabase(SB, S.perfil).trocarSenha(atual, nova).then(function () { toast('Senha criada.'); return iniciarSessao(); },
    function (e) { ocupado('lgBotao', false); if (e.status === 401) return sessaoExpirada(); erroEntrar(e.message, true); });
}
/** Depois do login (ou ao reabrir a página com a sessão ainda válida): pergunta ao servidor quem é e o que pode. */
function iniciarSessao() {
  S.modo = 'carregando'; render();
  return SB.rpc('meu_perfil').then(function (p) {
    if (!p || !p.ativo) {
      var msg = p && p.motivo === 'sem_perfil' ? 'Este e-mail ainda não tem acesso ao sistema. Fale com o administrador da loja.' : 'Este usuário está desativado. Fale com o administrador da loja.';
      return encerrarSessao(msg);
    }
    S.perfil = p;
    if (p.trocarSenha) { S.modo = 'trocarSenha'; render(); return; }
    BREAL = B = RacceDados.supabase(SB, p);
    S.modo = 'real'; S.carregado = false; S.real = baseVazia(); FOTO_G = {};
    ui.f = { vp: 'mes' }; ui.mes = hoje().slice(0, 7);
    var h = (location.hash || '').replace('#', '');
    ui.pagina = h && PAG[h] && pode(h) ? h : primeiraPagina();
    render();
    return recarregar().then(function () { render(); window.scrollTo(0, 0); toast('Olá, ' + p.nome.split(/\s+/)[0] + '.'); });
  }, function (e) {
    if (e && e.status === 401) return encerrarSessao('Sua sessão expirou. Entre novamente.');
    S.modo = 'entrar'; S.erroEntrar = e.message; render();
  });
}
/** Sai do sistema: encerra a sessão no servidor e limpa tudo da memória da página. */
function encerrarSessao(motivo) {
  var p = SB ? SB.sair('local') : Promise.resolve();
  S.perfil = null; S.real = baseVazia(); S.carregado = false; S.erro = ''; S.erroEntrar = motivo || ''; S.exemplo = null;
  B = BREAL = null; FOTO_G = {}; ui.venda = null; ui.rascunho = {};
  S.modo = 'entrar'; fecharCamadas(); $('#toast').hidden = true; render(); window.scrollTo(0, 0);
  return p;
}
function sessaoExpirada() { if (S.modo === 'real' || S.modo === 'trocarSenha' || S.modo === 'carregando') encerrarSessao('Sua sessão expirou. Entre novamente.'); }
function abrirMinhaConta() {
  if (S.modo === 'exemplo') { confirmar('Sair do modo de exemplo?', 'Sair do exemplo', false).then(function (s) { if (s) sairExemplo(); }); return; }
  var p = S.perfil; if (!p) return;
  abrirModal({
    olho: 'Minha conta', titulo: p.nome, botao: 'Trocar senha', sucesso: 'Senha alterada. As sessões abertas em outros aparelhos foram encerradas.',
    intro: '<dl class="ficha"><dt>E-mail</dt><dd>' + esc(p.email) + '</dd><dt>Função</dt><dd>' + esc(p.funcao) + '</dd></dl>',
    extra: '<button type="button" class="btn" data-a="sair" style="margin-right:auto">' + ic('sair') + 'Sair</button>',
    html: function () {
      return '<input type="text" value="' + esc(p.email) + '" autocomplete="username" hidden><label class="larga">Senha atual<input type="password" id="mc_atual" maxlength="72" autocomplete="current-password"></label>' +
        '<label>Nova senha<input type="password" id="mc_nova" maxlength="72" autocomplete="new-password"><small>' + esc(REGRA_SENHA) + '</small></label>' +
        '<label>Repita a nova senha<input type="password" id="mc_nova2" maxlength="72" autocomplete="new-password"></label>';
    },
    enviar: function () {
      var atual = $('#mc_atual').value, nova = $('#mc_nova').value;
      exigir(atual, 'Informe a senha atual.');
      var prob = problemaSenha(nova, p.email); exigir(!prob, prob);
      exigir(nova === $('#mc_nova2').value, 'As senhas novas não conferem.');
      exigir(nova !== atual, 'A nova senha precisa ser diferente da atual.');
      return B.trocarSenha(atual, nova);
    }
  });
}
function renderAviso() {
  var h = '';
  if (S.modo === 'exemplo') h = '<div class="aviso-modo"><div class="in"><span class="tag">Exemplo</span><span>Você está vendo <b>dados de exemplo</b> para conhecer a ferramenta. Nada aqui é salvo nem aparece para outras pessoas.</span><button class="btn mini" data-a="sairExemplo">Sair do exemplo</button></div></div>';
  else if (S.modo === 'real' && S.erro) h = '<div class="aviso-modo"><div class="in"><span class="tag">Atenção</span><span>' + esc(S.erro) + '</span><button class="btn mini" data-a="atualizar">Tentar de novo</button></div></div>';
  $('#avisoModo').innerHTML = h;
}
var renderAgendado = false;
function agendarRender() { if (renderAgendado) return; renderAgendado = true; requestAnimationFrame(function () { renderAgendado = false; render(); }); }
function render() {
  document.body.classList.toggle('leitura', !podeEscrever());
  atualizarStatus(); renderAviso();
  var fora = S.modo === 'entrar' || S.modo === 'trocarSenha' || S.modo === 'config', tela = $('#telaEntrar');
  $('.app').hidden = fora; tela.hidden = !fora;
  if (fora) {
    // só redesenha a tela de entrada quando ela muda (para não apagar o que a pessoa está digitando)
    if (tela.dataset.tela !== S.modo) { fecharCamadas(); tela.dataset.tela = S.modo; (S.modo === 'config' ? renderConfigFalta : S.modo === 'trocarSenha' ? renderTrocarSenha : renderEntrar)(); }
    return;
  }
  if (tela.dataset.tela) { tela.innerHTML = ''; delete tela.dataset.tela; }
  var main = $('#main');
  if (S.modo === 'carregando' || (S.modo === 'real' && !S.carregado) || (S.modo === 'exemplo' && !S.exemplo)) { renderAbas(null); main.innerHTML = '<div class="entrada"><div><div class="girando" role="status" aria-label="Carregando"></div><p class="fraco">Carregando os dados da loja…</p></div></div>'; return; }
  if (!PAG[ui.pagina] || !pode(ui.pagina)) ui.pagina = primeiraPagina();
  var ativo = document.activeElement, foco = ativo && ativo.id && (ativo.id.indexOf('f_') === 0 || ativo.id.indexOf('cfg_') === 0) ? { id: ativo.id, pos: ativo.selectionStart } : null;
  var c = calc();
  exportes = {};
  renderAbas(c);
  main.innerHTML = PAG[ui.pagina](c);
  document.body.classList.toggle('com-barra-venda', ui.pagina === 'venda' && !!(ui.venda && ui.venda.itens.length));
  if (ui.pagina === 'venda') carregarFotosCatalogo();
  aplicarPermissoes(document);
  if (foco) { var el = document.getElementById(foco.id); if (el) { el.focus(); try { el.setSelectionRange(foco.pos, foco.pos); } catch (e) { /* campo sem cursor */ } } }
  renderDetalhe(c);
}
function fecharCamadas() { if (ui.recibo) fecharRecibo(true); ui.det = null; ui.modal = null; ui.venda = null; ui.pagando = false; $('#camadaDet').innerHTML = ''; $('#camadaForm').innerHTML = ''; $('#camadaConf').innerHTML = ''; }

var PAG = {};

// =============================================================================
// PAINEL
// =============================================================================
function boasVindas() {
  return '<section class="boas"><span class="olho">Primeiros passos</span><h2>Configure a loja em três etapas</h2>' +
    '<p>A loja ainda não tem registros. Comece cadastrando os produtos, com foto e o estoque que já está na loja. Depois, cada venda dá baixa no estoque sozinha.' + (pode('usuarios') ? ' Em Usuários, cadastre a equipe e escolha o que cada pessoa pode ver.' : '') + '</p>' +
    '<div class="acoes"><button class="btn pri" data-a="novoProduto" data-w>' + ic('mais') + 'Cadastrar o primeiro produto</button><button class="btn" data-a="verExemplo">Ver com dados de exemplo</button></div></section>' +
    '<div class="passos"><div><b>1</b><h4>Produtos e estoque</h4><p>Cadastre cada modelo e cor, com os tamanhos, o custo, o preço e as peças que já estão na loja.</p></div>' +
    '<div><b>2</b><h4>Vendas</h4><p>Registre cada venda em "Nova venda": o estoque baixa sozinho e o painel mostra quanto entrou.</p></div>' +
    '<div><b>3</b><h4>Despesas</h4><p>Lance aluguel, fornecedores e contas fixas. O Resultado mostra o lucro real do mês.</p></div></div>';
}
PAG.painel = function (c) {
  if (vazioReal(c)) return cabecalho('Racce', 'Visão geral', '') + boasVindas();
  var mes = ui.mes, h = c.hoje, atual = mes === h.slice(0, 7), dia = +h.slice(8, 10);
  var vm = vendasDoMes(c, mes), r = resultadoMes(c, mes);
  var ant = addMes(mes, -1), vAnt = vendasDoMes(c, ant);
  if (atual) vAnt = vAnt.filter(function (v) { return +v.data.slice(8, 10) <= dia; });
  var rAnt = resumoVendas(vAnt), txtAnt = 'vs ' + mesNome(ant) + (atual ? ' (até o dia ' + dia + ')' : '');
  var est = valorEstoque(c), meta = metaDoMes(c.cfg, mes), metaH = metaDoMes(c.cfg, h.slice(0, 7));
  var tVendas = '<div class="tile"><div class="tile-cab"><span class="r">Vendas em ' + esc(mesNome(mes)) + '</span>' + destaque('compra', 'preto') + '</div><span class="v">' + brl(r.total) + '</span>' +
    '<span class="s">' + plural(r.n, 'venda', 'vendas') + (r.n ? ' · ticket médio ' + brl(r.ticket) : '') + '</span>' +
    (rAnt.total ? '<span class="s">' + delta(r.total, rAnt.total, txtAnt) + '</span>' : '') +
    (meta ? '<div class="meta"><div class="trilho"><i style="width:' + Math.min(100, r.total / meta * 100).toFixed(1) + '%"></i></div><span><b>' + pct(r.total, meta) + '</b> da meta de ' + brl(meta) + '</span></div>' : '<button class="btn link" data-a="definirMeta" data-m="' + mes + '" style="margin-top:8px;align-self:flex-start">Definir meta de ' + esc(mesNome(mes)) + '</button>') + '</div>';
  var aPagar = soma(r.listaOper.filter(function (x) { return !x.paga; }), function (x) { return x.valor || 0; });
  var kpis = '<div class="kpis">' + tVendas +
    tile(['Lucro do mês', 'desempenho', 'volt'], '<span class="' + (r.lucro < 0 ? 'neg' : 'pos') + '">' + brl(r.lucro) + '</span>', r.total ? pct(r.lucro, r.total) + ' das vendas, depois de custos, taxas e despesas' : 'depois de custos, taxas e despesas') +
    tile(['Despesas do mês', 'pagamento', 'gelo'], brl(r.despesas), aPagar ? brl(aPagar) + ' ainda a pagar' : 'todas pagas') +
    tile(['Estoque', 'roupas', 'grafite'], plural(est.pecas, 'peça', 'peças'), brl(est.venda) + ' a preço de venda') + '</div>';

  // vendas por dia
  var porDia = {}; vm.forEach(function (v) { if (!v.ok) return; var k = v.data; if (!porDia[k]) porDia[k] = { t: 0, n: 0 }; porDia[k].t += v.total; porDia[k].n++; });
  var itens = []; for (var d = 1; d <= fimMes(mes); d++) { var k = mes + '-' + pad2(d), x = porDia[k] || { t: 0, n: 0 }; itens.push({ rot: String(d), v: x.t / 100, destaque: k === h, tip: dbr(k) + '\n' + plural(x.n, 'venda', 'vendas') + '\n' + brl(x.t) }); }
  var graf = grafColunas(itens, { fracao: 1.75 / 2.75, alt: 210, fmt: function (v) { return brlCurto(v * 100); }, titulo: 'Vendas por dia em ' + mesTitulo(mes), minimo: 100 });

  // hoje
  var vh = c.vendas.filter(function (v) { return v.data === h && v.ok; }), rh = resumoVendas(vh), porPag = {};
  vh.forEach(function (v) { porPag[v.pagamento] = (porPag[v.pagamento] || 0) + v.total; });
  var hojeHtml =     (vh.length ? '<div class="demonst">' + PAGAMENTOS.filter(function (p) { return porPag[p]; }).map(function (p) { return '<div>' + esc(p) + '</div><div class="num dir">' + brl(porPag[p]) + '</div>'; }).join('') + '</div>' : '<p class="fraco">Nenhuma venda registrada hoje ainda.</p>') +
    '<div class="acoes"><button class="btn pri" data-a="novaVenda" data-w>' + ic('mais') + 'Nova venda</button><button class="btn" data-a="verHoje">Ver vendas de hoje</button></div>';

  // mais vendidos
  var qtdP = {}; vm.forEach(function (v) { if (!v.ok) return; v.itens.forEach(function (it) { if (!qtdP[it.produtoId]) qtdP[it.produtoId] = { q: 0, t: 0, nome: it.nome, cor: it.cor }; qtdP[it.produtoId].q += it.qtd; qtdP[it.produtoId].t += it.qtd * it.preco; }); });
  var top = Object.keys(qtdP).map(function (id) { return Object.assign({ id: id }, qtdP[id]); }).sort(function (a, b) { return b.q - a.q || b.t - a.t; }).slice(0, 6);
  var maxQ = top.length ? top[0].q : 1;
  var topHtml = top.length ? '<div class="rank">' + top.map(function (x) { var p = c.pIdx[x.id]; return '<span class="nm prod-cel">' + thumbHtml(x.id, 28) + '<span>' + esc(p ? p.nome : x.nome) + ' <small>' + esc(p ? p.cor : x.cor) + '</small></span></span><span class="vv"><b>' + x.q + '</b> · ' + brl(x.t) + '</span><span class="trk"><i style="width:' + (x.q / maxQ * 100).toFixed(1) + '%"></i></span>'; }).join('') + '</div>' : '<div class="vazio">Sem vendas neste mês.</div>';

  // repor
  var al = alertasEstoque(c);
  var reporHtml = al.length ? '<div class="lista">' + al.slice(0, 7).map(function (a) {
    return '<button class="li" data-a="verProduto" data-id="' + esc(a.p.id) + '">' + thumbHtml(a.p.id, 32) + '<span class="nm">' + esc(a.p.nome) + '<small>' + esc([a.p.cor, 'tamanho ' + a.t + ': ' + plural(a.q, 'peça', 'peças')].filter(Boolean).join(' · ')) + '</small></span><span class="vv">' + (a.q <= 0 ? pill('Zerado', 'bad') : pill('Baixo', 'warn')) + '</span></button>';
  }).join('') + '</div>' + (al.length > 7 ? '<button class="btn link" data-a="verBaixos">Ver todos os ' + al.length + '</button>' : '') : '<div class="vazio">Nenhum tamanho abaixo do mínimo.</div>';

  // contas
  var lim = somarDias(h, 7), contas = c.despesas.filter(function (x) { return !x.paga && x.vencimento <= lim; });
  var contasHtml = contas.length ? '<div class="lista">' + contas.slice(0, 7).map(function (x) {
    return '<div class="li"><span>' + pill(x.situacao === 'A vencer' ? dcurta(x.vencimento) : x.situacao, SIT_PILL[x.situacao]) + '</span><span class="nm">' + esc(x.descricao) + '<small>' + esc(x.categoria) + ' · vence ' + dbr(x.vencimento) + '</small></span><span class="vv">' + brl(x.valor) + '<small><button class="btn link" data-a="pagarDesp" data-id="' + esc(x.id) + '" data-w>Pagar</button></small></span></div>';
  }).join('') + '</div>' : '<div class="vazio">Nada vencido nem vencendo nos próximos 7 dias.</div>';

  // últimas vendas
  var ult = c.vendas.slice().reverse().slice(0, 6);
  var ultHtml = ult.length ? tabelaVendas(ult, true) : '<div class="vazio">Nenhuma venda ainda.</div>';

  var lim7 = somarDias(h, 7), aPagar7 = soma(c.despesas.filter(function (x) { return !x.paga && x.vencimento <= lim7; }), function (x) { return x.valor || 0; });
  var mAtual = resumoVendas(vendasDoMes(c, h.slice(0, 7))), metaTxt = metaH ? [pct(mAtual.total, metaH) + ' da meta do mês', brl(mAtual.total) + ' de ' + brl(metaH)] : ['Ticket ' + brl(rh.ticket), 'médio das vendas de hoje'];
  function itemBarra(i, t, sub) { return '<div>' + ic(i) + '<span><b>' + t + '</b><small>' + esc(sub) + '</small></span></div>'; }
  var barra = '<div class="barra" role="group" aria-label="Resumo de hoje">' + itemBarra('compra', brl(rh.total), 'vendido hoje · ' + plural(rh.n, 'venda', 'vendas')) + itemBarra('roupas', plural(rh.pecas, 'peça', 'peças'), 'saíram do estoque hoje') +
    itemBarra('pagamento', brl(aPagar7), 'contas a pagar em 7 dias') + itemBarra('desempenho', metaTxt[0], metaTxt[1]) + '</div>';
  return cabecalho(cap(dataLonga(h)), 'Visão geral', '', mesNav()) + barra + kpis +
    '<div class="grade21">' + bloco('Vendas por dia', 'Total vendido em cada dia de ' + esc(mesNome(mes)), graf) + bloco('Caixa de hoje', 'Vendas de hoje por forma de pagamento', hojeHtml) + '</div>' +
    '<div class="grade3">' + bloco('Mais vendidos', 'Peças vendidas em ' + esc(mesNome(mes)), topHtml) + bloco('Repor estoque', 'Tamanhos no mínimo ou zerados', reporHtml, '<button class="btn mini" data-a="novaEntrada" data-w>Entrada</button>') + bloco('Contas da semana', 'Vencidas e vencendo nos próximos 7 dias', contasHtml) + '</div>' +
    bloco('Últimas vendas', '', ultHtml, '<button class="btn mini" data-a="ir" data-p="vendas">Ver todas</button>');
};

// =============================================================================
// VENDAS
// =============================================================================
function resumoItens(v) {
  var t = v.itens.map(function (it) { return (it.qtd > 1 ? it.qtd + '× ' : '') + it.nome + (it.cor ? ' ' + it.cor : '') + ' (' + it.tam + ')'; });
  return t.join(', ');
}
function tabelaVendas(lista, curta) {
  var cols = [
    { t: 'Nº', v: function (v) { return nv(v) + (v.edicoes ? '<span class="sub">editada</span>' : ''); } },
    { t: 'Quando', v: function (v) { return '<span class="num">' + dbr(v.data) + '</span><span class="sub">' + horaDe(v.criadoEm) + '</span>'; } },
    { t: 'Itens', c: 'quebra', v: function (v) { return '<span class="riscar">' + esc(resumoItens(v)) + '</span><span class="sub">' + plural(v.pecas, 'peça', 'peças') + (v.cliente ? ' · ' + esc(v.cliente) : '') + '</span>'; } },
    { t: 'Pagamento', v: function (v) { return esc(v.pagamento) + (v.parcelas > 1 ? ' ' + v.parcelas + 'x' : '') + '<span class="sub">' + esc(v.canal || '') + '</span>'; } },
    { t: 'Total', c: 'dir', v: function (v) { return '<b class="num riscar">' + brl(v.total) + '</b>' + (v.ok ? (v.desconto ? '<span class="sub">desc. ' + brl(v.desconto) + '</span>' : '') : '<span class="sub">' + pill('Cancelada', 'bad') + '</span>'); } }];
  if (pode('equipe')) cols.splice(cols.length - 1, 0, { t: 'Vendedor', v: function (v) { return esc(v.vendedorNome || '') || '<span class="fraco">—</span>'; } });
  return tabela(cols, lista, { acao: 'verVenda', classe: function (v) { return v.ok ? '' : 'riscado'; } });
}
function filtrarVendas(c) {
  var f = ui.f, h = c.hoje, p = f.vp || 'mes', q = norm(f.vq), mesAtual = h.slice(0, 7), mesAnt = addMes(mesAtual, -1);
  return c.vendas.filter(function (v) {
    if (p === 'hoje' && v.data !== h) return false;
    if (p === '7' && v.data < somarDias(h, -6)) return false;
    if (p === 'mes' && v.data.slice(0, 7) !== mesAtual) return false;
    if (p === 'mesant' && v.data.slice(0, 7) !== mesAnt) return false;
    if (f.vpag && v.pagamento !== f.vpag) return false;
    if (f.vcanal && v.canal !== f.vcanal) return false;
    if (f.vst === 'ok' && !v.ok) return false;
    if (f.vst === 'cancelada' && v.ok) return false;
    if (soMinhas() && v.por !== meuId()) return false;
    if (f.vvend && (v.por || '') !== f.vvend) return false;
    return !q || norm([v.cliente, v.telefone, v.obs, resumoItens(v), nVenda(v.numero)].join(' ')).indexOf(q) >= 0;
  }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : b.numero - a.numero; });
}
PAG.historico = function (c) {
  var f = ui.f, q = norm(f.hq), per = f.hp || 'tudo', h = c.hoje, mesA = h.slice(0, 7);
  var lista = c.historico.filter(function (x) {
    var d = isoLocal(x.em);
    if (per === '7' && d < somarDias(h, -6)) return false;
    if (per === 'mes' && d.slice(0, 7) !== mesA) return false;
    if (per === 'mesant' && d.slice(0, 7) !== addMes(mesA, -1)) return false;
    if (f.htipo && x.tipo !== f.htipo) return false;
    if (f.hresp && (x.porNome || '') !== f.hresp) return false;
    return !q || norm([x.numero ? nVenda(x.numero) : '', x.motivo, x.porNome, (x.mudancas || []).map(function (m) { return m.campo + ' ' + m.de + ' ' + m.para; }).join(' ')].join(' ')).indexOf(q) >= 0;
  });
  var nEd = 0, nCanc = 0, afet = {}, efeito = 0, porQuem = {};
  lista.forEach(function (x) {
    if (x.tipo === 'cancelamento') nCanc++; else nEd++;
    afet[x.vendaId] = 1;
    var a = x.antes || {}, d = x.depois || {};
    efeito += (d.status === 'cancelada' ? 0 : d.total || 0) - (a.status === 'cancelada' ? 0 : a.total || 0);
    var k = x.porNome || 'Não identificado'; porQuem[k] = (porQuem[k] || 0) + 1;
  });
  var nomes = []; c.historico.forEach(function (x) { if (x.porNome && nomes.indexOf(x.porNome) < 0) nomes.push(x.porNome); }); nomes.sort();
  registrarCsv('historico', 'historico-alteracoes', ['Data', 'Hora', 'Venda', 'Tipo', 'Responsável', 'Função', 'Motivo', 'Campo', 'Antes', 'Depois'],
    [].concat.apply([], lista.map(function (x) { return (x.mudancas && x.mudancas.length ? x.mudancas : [{ campo: '', de: '', para: '' }]).map(function (m) { return [dataLocal(x.em), horaDe(x.em), x.numero ? nVenda(x.numero) : '—', x.tipo === 'cancelamento' ? 'Cancelamento' : 'Edição', x.porNome, x.porFuncao, x.motivo, m.campo, m.de, m.para]; }); })));
  var integ = c.historico.length ? '<div class="nota ok">' + ic('check') + '<span><b>Registros protegidos.</b> Cada registro é gravado pelo servidor no momento da alteração, com o usuário que entrou no sistema. Ninguém consegue editar nem apagar esses registros, nem o administrador.</span></div>' : '';
  var itens = Object.keys(porQuem).sort(function (a, b) { return porQuem[b] - porQuem[a]; }).map(function (k) { return { rot: k, v: porQuem[k], txt: plural(porQuem[k], 'registro', 'registros'), tip: k + ': ' + plural(porQuem[k], 'registro', 'registros') }; });
  var rot = { '7': 'nos últimos 7 dias', mes: 'em ' + mesNome(mesA), mesant: 'em ' + mesNome(addMes(mesA, -1)), tudo: 'desde o início' }[per];
  return cabecalho('Controle', 'Histórico de alterações', 'Toda edição e todo cancelamento de venda ficam registrados aqui com o responsável, a data e a hora, o que mudou e o motivo.',
      (pode('vendas') ? '<button class="btn" data-a="ir" data-p="vendas">Ver vendas</button>' : '') + botaoCsv('historico')) + integ +
    chipsFiltro('hp', [['7', '7 dias'], ['mes', 'Este mês'], ['mesant', 'Mês passado'], ['tudo', 'Tudo']], 'tudo') +
    '<div class="tiles">' + tile('Edições', String(nEd), 'vendas corrigidas ' + rot) + tile('Cancelamentos', String(nCanc), 'vendas canceladas ' + rot) + tile('Vendas afetadas', String(Object.keys(afet).length), plural(lista.length, 'registro', 'registros') + ' no total') +
      tile('Efeito no faturamento', '<span class="' + (efeito < 0 ? 'neg' : efeito > 0 ? 'pos' : '') + '">' + (efeito > 0 ? '+' : '') + brl(efeito) + '</span>', 'diferença no total das vendas') + '</div>' +
    bloco('Por responsável', 'Quantas alterações cada pessoa fez ' + rot + '.', barrasH(itens, 'Nenhuma alteração ' + rot + '.')) +
    '<div class="filtros">' + filtroTexto('hq', 'Buscar', 'Número da venda, motivo, produto ou pessoa') + filtroSel('htipo', 'Tipo', [['', 'Todos'], ['edicao', 'Edições'], ['cancelamento', 'Cancelamentos']]) +
      filtroSel('hresp', 'Responsável', [['', 'Todos']].concat(nomes)) + '</div>' +
    (lista.length ? '<div class="hist-grade">' + lista.slice(0, 200).map(function (x) { return cardHist(x, c, false); }).join('') + '</div>' + (lista.length > 200 ? '<p class="fraco" style="font-size:13px">Mostrando os 200 registros mais recentes. Use os filtros ou exporte o CSV para ver todos.</p>' : '')
      : '<div class="rolagem"><div class="vazio">' + (c.historico.length ? 'Nenhum registro com esses filtros.' : 'Nenhuma venda foi editada ou cancelada ainda.') + '</div></div>');
};
PAG.vendas = function (c) {
  var lista = filtrarVendas(c), r = resumoVendas(lista), porPag = {};
  lista.forEach(function (v) { if (v.ok) porPag[v.pagamento] = (porPag[v.pagamento] || 0) + v.total; });
  var rotP = { hoje: 'hoje', '7': 'nos últimos 7 dias', mes: 'em ' + mesNome(c.hoje.slice(0, 7)), mesant: 'em ' + mesNome(addMes(c.hoje.slice(0, 7), -1)), tudo: 'desde o início' }[ui.f.vp || 'mes'];
  var cc = pode('custos');
  registrarCsv('vendas', 'vendas', ['Nº', 'Data', 'Hora', 'Itens', 'Peças', 'Subtotal', 'Desconto', 'Total'].concat(cc ? ['Taxa estimada', 'Custo das peças'] : []).concat(['Pagamento', 'Parcelas', 'Canal', 'Cliente', 'Vendedor', 'Situação', 'Observação']),
    lista.map(function (v) { return [nVenda(v.numero), dbr(v.data), horaDe(v.criadoEm), resumoItens(v), v.pecas, brlNum(v.subtotal), brlNum(v.desconto), brlNum(v.total)].concat(cc ? [brlNum(v.taxa), brlNum(v.cmv)] : []).concat([v.pagamento, v.parcelas || 1, v.canal, v.cliente, v.vendedorNome || '', v.ok ? 'Concluída' : 'Cancelada', v.obs]); }));
  var fech = barrasH(PAGAMENTOS.map(function (p) { var x = porPag[p] || 0; return { rot: p, v: x, txt: brl(x) + ' <span class="fraco">· ' + pct(x, r.total) + '</span>', tip: p + ': ' + brl(x) }; }), 'Nenhuma venda concluída no período.');
  return cabecalho('Movimento', 'Vendas', (soMinhas() ? 'Aqui aparecem só as vendas registradas por você. ' : '') + 'Cada venda dá baixa no estoque. Para corrigir uma venda, abra a venda e toque em "Editar venda": o que mudou e o motivo ficam no histórico de alterações.',
    '<button class="btn pri" data-a="novaVenda" data-w>' + ic('mais') + 'Nova venda</button><button class="btn" data-a="ir" data-p="historico">Histórico de alterações</button>' + botaoCsv('vendas')) +
    chipsFiltro('vp', [['hoje', 'Hoje'], ['7', '7 dias'], ['mes', 'Este mês'], ['mesant', 'Mês passado'], ['tudo', 'Tudo']], 'mes') +
    '<div class="tiles">' + tile('Vendido ' + rotP, brl(r.total), plural(r.n, 'venda', 'vendas')) + tile('Peças', milhar(r.pecas), r.n ? 'média de ' + (Math.round(r.pecas / r.n * 10) / 10).toString().replace('.', ',') + ' por venda' : '—') +
    tile('Ticket médio', brl(r.ticket), r.desconto ? brl(r.desconto) + ' em descontos' : 'sem descontos') + (cc ? tile('Lucro bruto', '<span class="' + (r.lucroBruto < 0 ? 'neg' : 'pos') + '">' + brl(r.lucroBruto) + '</span>', 'depois do custo das peças e das taxas') : tile('Canceladas', String(lista.filter(function (v) { return !v.ok; }).length), 'vendas canceladas no período')) + '</div>' +
    bloco(ui.f.vp === 'hoje' ? 'Fechamento do caixa' : 'Por forma de pagamento', ui.f.vp === 'hoje' ? 'Confira com a gaveta e o extrato da maquininha' : 'Vendas concluídas ' + esc(rotP), fech) +
    '<div class="filtros">' + filtroTexto('vq', 'Buscar', 'Cliente, produto ou número da venda') + filtroSel('vpag', 'Pagamento', [['', 'Todos']].concat(PAGAMENTOS)) + filtroSel('vcanal', 'Canal', [['', 'Todos']].concat(c.cfg.canais)) +
    filtroSel('vst', 'Situação', [['', 'Todas'], ['ok', 'Concluídas'], ['cancelada', 'Canceladas']]) + (pode('equipe') ? filtroSel('vvend', 'Vendedor', [['', 'Todos']].concat(vendedores(c))) : '') + '</div>' +
    (lista.length ? tabelaVendas(lista) : '<div class="rolagem"><div class="vazio">Nenhuma venda ' + esc(rotP) + (ui.f.vq || ui.f.vpag || ui.f.vcanal || ui.f.vst || ui.f.vvend ? ' com esses filtros' : '') + '.' + (podeEscrever() ? ' <button class="btn link" data-a="novaVenda">Registrar uma venda</button>' : '') + '</div></div>');
};
// ---------- edição de vendas e histórico de alterações
var MOTIVOS_EDICAO = ['Tamanho lançado errado', 'Produto lançado errado', 'Quantidade errada', 'Forma de pagamento errada', 'Desconto não lançado', 'Preço digitado errado', 'Data da venda errada', 'Dados do cliente'];
function dataLocal(ts) { var d = new Date(ts); return isNaN(d) ? '—' : pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
function isoLocal(ts) { var d = new Date(ts); return isNaN(d) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
/** Os dados da venda que contam para o histórico (o "antes" e o "depois" de cada alteração). */
/** Mesmo formato do retrato gravado pelo servidor no histórico (sem custos). */
function snapVenda(v) {
  return { data: v.data || '', itens: (v.itens || []).map(function (it) { return { produtoId: it.produtoId, nome: it.nome || '', cor: it.cor || '', tam: it.tam, qtd: Number(it.qtd) || 0, preco: Number(it.preco) || 0 }; }),
    subtotal: Number(v.subtotal) || 0, desconto: Number(v.desconto) || 0, total: Number(v.total) || 0, pagamento: v.pagamento || '', parcelas: Number(v.parcelas) || 1, recebido: Number(v.recebido) || 0,
    canal: v.canal || '', cliente: v.cliente || '', telefone: v.telefone ? String(v.telefone) : '', obs: v.obs || '', status: v.status === 'cancelada' ? 'cancelada' : 'ok' };
}
function txtPag(s) { return s.pagamento + (s.parcelas > 1 ? ' em ' + s.parcelas + 'x' : ''); }
function nomeItem(it) { return it.nome + (it.cor ? ' ' + it.cor : ''); }
function txtItem(it) { return it.qtd + '× ' + nomeItem(it) + ' (' + it.tam + ') a ' + brl(it.preco); }
/** Lista legível do que mudou entre dois retratos da venda. */
function difVenda(a, b) {
  var m = [];
  function add(campo, de, para) { m.push({ campo: campo, de: de === '' || de === null || de === undefined ? '—' : String(de), para: para === '' || para === null || para === undefined ? '—' : String(para) }); }
  function chave(it) { return it.produtoId + '|' + it.tam; }
  var A = {}, B = {}; a.itens.forEach(function (it) { A[chave(it)] = it; }); b.itens.forEach(function (it) { B[chave(it)] = it; });
  var tirados = a.itens.filter(function (it) { return !B[chave(it)]; }), postos = b.itens.filter(function (it) { return !A[chave(it)]; });
  a.itens.forEach(function (it) {
    var n = B[chave(it)]; if (!n) return;
    if (n.qtd !== it.qtd) add('Quantidade · ' + nomeItem(it) + ' (' + it.tam + ')', it.qtd, n.qtd);
    if (n.preco !== it.preco) add('Preço unitário · ' + nomeItem(it) + ' (' + it.tam + ')', brl(it.preco), brl(n.preco));
  });
  tirados.slice().forEach(function (it) {
    var par = postos.filter(function (n) { return n.produtoId === it.produtoId; })[0]; if (!par) return;
    tirados.splice(tirados.indexOf(it), 1); postos.splice(postos.indexOf(par), 1);
    add('Tamanho · ' + nomeItem(it), it.tam + ' · ' + it.qtd + '× ' + brl(it.preco), par.tam + ' · ' + par.qtd + '× ' + brl(par.preco));
  });
  tirados.forEach(function (it) { add('Item removido', txtItem(it), ''); });
  postos.forEach(function (it) { add('Item incluído', '', txtItem(it)); });
  if (txtPag(a) !== txtPag(b)) add('Forma de pagamento', txtPag(a), txtPag(b));
  if (a.recebido !== b.recebido) add('Valor recebido em dinheiro', a.recebido ? brl(a.recebido) : '', b.recebido ? brl(b.recebido) : '');
  if (a.desconto !== b.desconto) add('Desconto', brl(a.desconto), brl(b.desconto));
  if (a.total !== b.total) add('Total da venda', brl(a.total), brl(b.total));
  if (a.data !== b.data) add('Data da venda', dbr(a.data), dbr(b.data));
  if (a.canal !== b.canal) add('Canal', a.canal, b.canal);
  if (a.cliente !== b.cliente) add('Cliente', a.cliente, b.cliente);
  if ((a.telefone || '') !== (b.telefone || '')) add('WhatsApp do cliente', a.telefone || '', b.telefone || '');
  if (a.obs !== b.obs) add('Observação', a.obs, b.obs);
  if (a.status !== b.status) add('Situação', a.status === 'cancelada' ? 'Cancelada' : 'Concluída', b.status === 'cancelada' ? 'Cancelada' : 'Concluída');
  return m;
}
function htmlMudancas(ms, vazio) {
  if (!ms.length) return '<p class="fraco" style="font-size:13px;margin:0">' + esc(vazio || 'Nenhuma alteração.') + '</p>';
  return '<ul class="mudancas">' + ms.map(function (m) {
    return '<li><span class="mc">' + esc(m.campo) + '</span><span class="mv">' + (m.de === '—' ? '<span class="fraco">—</span>' : '<s>' + esc(m.de) + '</s>') + '<i aria-label="para">→</i><b>' + esc(m.para) + '</b></span></li>';
  }).join('') + '</ul>';
}
function cardHist(x, c, naVenda) {
  var v = c.vIdx[x.vendaId], venda = naVenda ? '' : v ? (pode('vendas') ? '<button class="btn link hist-venda" data-a="verVenda" data-id="' + esc(v.id) + '">Venda #' + nVenda(v.numero) + '</button>' : '<b>Venda #' + nVenda(v.numero) + '</b>') : '<b>Venda apagada</b>';
  return '<article class="hist"><header><span class="hist-tit">' + (x.tipo === 'cancelamento' ? pill('Cancelamento', 'bad') : pill('Edição', 'warn')) + venda + '</span><span class="hist-quando num">' + dataLocal(x.em) + ' às ' + horaDe(x.em) + '</span></header>' +
    '<p class="hist-quem">' + ic('usuarios') + '<span><b>' + esc(x.porNome || 'Não identificado') + '</b>' + (x.porFuncao ? ' · ' + esc(x.porFuncao) : '') + '</span></p>' +
    '<p class="hist-motivo"><span>Motivo</span>' + esc(x.motivo) + '</p>' + htmlMudancas(x.mudancas || []) + '</article>';
}
function historicoDaVenda(v, c) {
  var hs = c.hPorVenda[v.id] || [];
  var h = '<h3>Histórico de alterações</h3>';
  if (!hs.length) return h + '<p class="fraco" style="font-size:13px;margin:0">Esta venda não foi alterada desde o registro.</p>';
  return h + '<div class="hist-lista">' + hs.map(function (x) { return cardHist(x, c, true); }).join('') + '</div>' + (pode('historico') ? '<div><button class="btn link" data-a="verHistorico">Ver o histórico de alterações da loja</button></div>' : '');
}

// estado de edição: a venda volta para a sacola e para o painel de finalização
function estadoEdicao(v) {
  var s = snapVenda(v);
  return { editando: v.id, numero: v.numero, versao: v.versao || 1, registradaEm: v.criadoEm, orig: s, itens: s.itens.map(function (it) { return Object.assign({}, it); }), busca: '', sel: null, tam: null, qtd: 1,
    descTipo: 'R$', desc: s.desconto ? brlNum(s.desconto) : '', pag: s.pagamento, parcelas: s.parcelas > 1 ? s.parcelas : 3, canal: s.canal, cliente: s.cliente, telefone: s.telefone || '', data: s.data, obs: s.obs,
    recebido: s.recebido ? brlNum(s.recebido) : '', motivo: '' };
}
/** O que vai para o servidor: só produto, tamanho, quantidade e preço de cada item. Nome, custo e totais o servidor confere e calcula. */
function enviarVenda(doc) {
  return { data: doc.data, itens: doc.itens.map(function (it) { return { produtoId: it.produtoId, tam: it.tam, qtd: it.qtd, preco: it.preco }; }), desconto: doc.desconto, pagamento: doc.pagamento,
    parcelas: doc.parcelas, recebido: doc.recebido, canal: doc.canal, cliente: doc.cliente, telefone: doc.telefone, obs: doc.obs };
}
function docDeEstado(v, cfg) {
  var t = totaisVenda(v, cfg);
  return { data: v.data, itens: v.itens.map(function (it) { return { produtoId: it.produtoId, nome: it.nome, cor: it.cor || '', tam: it.tam, qtd: it.qtd, preco: it.preco }; }),
    subtotal: t.sub, desconto: t.desc, total: t.total, pagamento: v.pag, parcelas: v.pag === 'Crédito parcelado' ? Number(v.parcelas) : 1,
    recebido: v.pag === 'Dinheiro' && t.recebido >= t.total ? t.recebido : 0, canal: v.canal, cliente: String(v.cliente || '').trim(), telefone: String(v.telefone || '').trim(), obs: String(v.obs || '').trim(), status: 'ok' };
}
function iniciarEdicao(id) {
  if (!podeEscrever() || !pode('editar')) return;
  var c = calc(), v = c.vIdx[id]; if (!v) return;
  if (!v.ok) { toast('Uma venda cancelada não pode ser editada.'); return; }
  function abrir() { ui.det = null; renderDetalhe(c); irPara('venda'); renderVenda(); var m = $('#camadaForm .veu'); if (m) m.scrollTop = 0; }
  if (ui.venda && ui.venda.editando === id) { abrir(); return; }
  function comecar() { ui.venda = estadoEdicao(v); abrir(); }
  if (ui.venda && ui.venda.itens.length) {
    confirmar(ui.venda.editando ? 'A edição da venda #' + nVenda(ui.venda.numero) + ' ainda não foi salva. Descartar essa edição e editar a venda #' + nVenda(v.numero) + '?'
      : 'Há uma venda em andamento com ' + plural(soma(ui.venda.itens, function (it) { return it.qtd; }), 'peça', 'peças') + ' na sacola. Descartar essa venda para editar a venda #' + nVenda(v.numero) + '?', 'Descartar e editar', true).then(function (sim) { if (sim) comecar(); });
  } else comecar();
}
function descartarEdicao() {
  var v = ui.venda; if (!v || !v.editando) return;
  var id = v.editando, n = v.numero;
  confirmar('Descartar a edição da venda #' + nVenda(n) + '? A venda continua exatamente como estava.', 'Descartar edição', true).then(function (sim) {
    if (!sim) return;
    ui.venda = null; ui.pagando = false; $('#camadaForm').innerHTML = '';
    if (pode('vendas')) { irPara('vendas'); abrirDet('venda', id); } else render();
  });
}
function blocoEdicao(v) {
  return '<h3>O que vai mudar</h3><div id="vDif"></div>' +
    '<div class="campos"><div class="campo larga">Motivos comuns<div class="chips" role="group" aria-label="Motivos comuns">' + MOTIVOS_EDICAO.map(function (m) { return '<button type="button" class="chip" data-a="vMotivoRapido" data-v="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div></div>' +
    '<label class="larga">Motivo da alteração *<textarea id="v_motivo" maxlength="300" placeholder="Descreva o que estava errado. Ex.: a cliente levou o tamanho M, mas a venda foi lançada como P.">' + esc(v.motivo) + '</textarea><small>Obrigatório, com pelo menos 10 caracteres. Fica no histórico da venda, com o seu nome, e não pode ser apagado.</small></label></div>';
}
function atualizarDifEdicao() {
  var v = ui.venda; if (!v || !v.editando) return;
  var ms = difVenda(v.orig, snapVenda(docDeEstado(v, cfgAtual()))), cx = $('#vDif'), bt = $('#vSalvarEd');
  if (cx) cx.innerHTML = htmlMudancas(ms, 'Nada foi alterado ainda. Corrija acima o que estiver errado.');
  if (bt) { bt.disabled = !ms.length; bt.textContent = ms.length ? 'Salvar ' + plural(ms.length, 'alteração', 'alterações') : 'Salvar alterações'; }
}
function mudarTamItem(i, tam) {
  var v = ui.venda, it = v && v.itens[i]; if (!it || it.tam === tam) return;
  var ja = v.itens.filter(function (x, j) { return j !== i && x.produtoId === it.produtoId && x.tam === tam; })[0];
  if (ja) { ja.qtd += it.qtd; v.itens.splice(i, 1); } else it.tam = tam;
  renderVenda();
}
function salvarEdicao() {
  var v = ui.venda; if (!v || !v.editando) return;
  var c = calc(), err = $('#vErro');
  function falha(m) { if (err) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); } }
  var atual = c.vIdx[v.editando];
  if (!atual) return falha('Esta venda não existe mais.');
  if (!atual.ok) return falha('Esta venda foi cancelada e não pode mais ser editada.');
  if (!v.itens.length) return falha('A venda precisa ter pelo menos um item. Para desfazer a venda inteira, use "Cancelar venda".');
  if (!dataValida(v.data)) return falha('Informe a data da venda.');
  if (v.data > c.hoje) return falha('A data da venda não pode ser futura.');
  if (v.descTipo === '%' && isNaN(parsePct(v.desc))) return falha('Desconto inválido. Use um número, como 10.');
  if (v.descTipo === 'R$' && v.desc !== '' && isNaN(parseBrl(v.desc))) return falha('Desconto inválido. Use o formato 10,00.');
  if (v.itens.some(function (it) { return !(it.preco >= 0); })) return falha('Confira o preço dos itens.');
  var doc = docDeEstado(v, c.cfg), ms = difVenda(v.orig, snapVenda(doc));
  if (!ms.length) return falha('Nada foi alterado. Corrija o que estiver errado antes de salvar.');
  var motivo = String(v.motivo || '').trim();
  if (motivo.length < 10) { falha('Informe o motivo da alteração, com pelo menos 10 caracteres.'); var mm = $('#v_motivo'); if (mm) mm.focus(); return; }
  if (err) err.hidden = true;
  var id = v.editando, numero = v.numero, nome = S.perfil ? S.perfil.nome : 'Modo exemplo';
  confirmar('Salvar ' + plural(ms.length, 'alteração', 'alterações') + ' na venda #' + nVenda(numero) + '? O que mudou, o motivo e o seu nome (' + nome + ') ficam no histórico da venda e não podem ser apagados.', 'Salvar alterações', false).then(function (sim) {
    if (!sim) return;
    var bt = $('#vSalvarEd'); if (bt) bt.disabled = true;
    gravar(function () { return B.editarVenda(id, v.versao, enviarVenda(doc), motivo); }).then(function () {
      ui.venda = null; ui.pagando = false; $('#camadaForm').innerHTML = '';
      if (pode('vendas')) { irPara('vendas'); abrirDet('venda', id); } else render();
      toast('Venda #' + nVenda(numero) + ' alterada. O registro foi para o histórico.');
    }, function (e) { var b = $('#vSalvarEd'); if (b) b.disabled = false; falha(e.message); });
  });
}

// ---------- recibo de venda
var RC = { preto: '#000000', branco: '#FFFFFF', volt: '#CCFF3D', aco: '#5E5E63', cinza: '#9A9AA0', nevoa: '#E6E6E8', gelo: '#F4F4F5' };
var RC_FONTE = 'Inter, Arial, sans-serif', RC_TIT = 'Inter, "Arial Black", Arial, sans-serif';
function foneWhats(t) { var d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) return '55' + d; if (d.length >= 12 && d.length <= 13) return d; return ''; }
function caminhosIcone(n) { var out = [], re = /d="([^"]+)"/g, m; while ((m = re.exec(ICONES[n] || ''))) out.push(new Path2D(m[1])); return out; }
function nomeRecibo(R) { return 'recibo-' + norm((R.d.loja.nome || 'racce')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-venda-' + R.numero; }
function fontesRecibo() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  var ps = ['400 14px Inter', '600 14px Inter', '700 14px Inter', 'italic 900 22px Inter'].map(function (f) { return document.fonts.load(f).catch(function () { return null; }); });
  return Promise.race([Promise.all(ps), new Promise(function (ok) { setTimeout(ok, 2500); })]);
}
function dadosRecibo(v, c) {
  var agora = new Date().toISOString(), ed = (c.hPorVenda[v.id] || []).filter(function (x) { return x.tipo === 'edicao'; });
  return { loja: c.cfg.loja || {}, numero: nVenda(v.numero), data: dbr(v.data), hora: horaDe(v.criadoEm), cliente: v.cliente || '', telefone: v.telefone || '', canal: v.canal || '',
    vendedor: v.vendedorNome || '', pecas: v.pecas, subtotal: v.subtotal || 0, desconto: v.desconto || 0, total: v.total || 0,
    itens: v.itens.map(function (it) { var p = c.pIdx[it.produtoId] || {}; return { nome: it.nome, cor: it.cor || '', ref: p.ref || '', desc: p.descricao || '', tam: it.tam, qtd: it.qtd, preco: it.preco, total: it.preco * it.qtd }; }),
    pagTxt: v.pagamento + (v.parcelas > 1 ? ' · ' + v.parcelas + 'x de ' + brl(Math.round(v.total / v.parcelas)) : ''),
    recebido: v.pagamento === 'Dinheiro' && v.recebido && v.recebido >= v.total ? v.recebido : 0, obs: v.obs || '',
    corrigida: ed.length ? dataLocal(ed[0].em) : '', emitido: dataLocal(agora) + ' às ' + horaDe(agora) };
}
/** Desenha o recibo (largura lógica de 600 px) na escala pedida. Fundo branco, logomarca positiva no canto superior esquerdo, Volt só como faixa. */
function desenharRecibo(d, escala, opc) {
  opc = opc || {};
  var W = opc.largura || 600, mono = !!opc.mono, larga = W >= 500, M = larga ? 36 : W >= 400 ? 14 : 10, X1 = W - M, CW = W - 2 * M;
  var C = { prod: M + 12, tam: 322, qtd: 368, unit: 462, tot: X1 - 12 }, LP = C.tam - 28 - C.prod, LPD = C.unit - 70 - C.prod, lj = d.loja || {};
  if (!larga) { C.prod = M + 4; C.tot = X1 - 4; LP = CW - 8 - 84; LPD = CW - 8; }
  var logo = Array.prototype.map.call(document.querySelectorAll('#rc-nome path'), function (p) { return new Path2D(p.getAttribute('d')); }), troca = caminhosIcone('troca');
  function cor(x) { return mono && x !== RC.branco ? RC.preto : x; }
  function rodar(ctx, des) {
    var y = M + (larga ? 0 : 6);
    ctx.textBaseline = 'alphabetic';
    function fonte(peso, tam, ital) { ctx.font = (ital ? 'italic ' : '') + peso + ' ' + tam + 'px ' + (peso >= 800 ? RC_TIT : RC_FONTE); }
    function esp(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
    function t(x0, x, yy, c0, al) { if (!des) return; ctx.fillStyle = cor(c0); ctx.textAlign = al || 'left'; ctx.fillText(String(x0), x, yy); }
    function r(x, yy, w, h, c0, raio) {
      if (!des) return;
      if (mono && (c0 === RC.gelo || c0 === RC.volt)) return;
      ctx.fillStyle = cor(c0); if (raio && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, yy, w, h, raio); ctx.fill(); } else ctx.fillRect(x, yy, w, h);
    }
    function quebra(txt, larg, max) {
      var ps = String(txt || '').split(/\s+/).filter(Boolean), ls = [], l = '';
      ps.forEach(function (p) { var tst = l ? l + ' ' + p : p; if (!l || ctx.measureText(tst).width <= larg) l = tst; else { ls.push(l); l = p; } });
      if (l) ls.push(l);
      if (max && ls.length > max) { ls = ls.slice(0, max); var u = ls[max - 1]; while (u.length > 1 && ctx.measureText(u + '…').width > larg) u = u.slice(0, -1); ls[max - 1] = u.replace(/[\s,.;·]+$/, '') + '…'; }
      return ls;
    }
    function rotulo(x0, x, yy, al) { fonte(700, larga ? 9.5 : 10); esp(1.5); t(x0.toUpperCase(), x, yy, RC.aco, al); esp(0); }

    // logomarca (versão positiva, canto superior esquerdo) e título
    var hl = larga ? 22 : 18;
    if (des && logo.length) { ctx.save(); ctx.translate(M, y); var k = hl / 45.1; ctx.scale(k, k); ctx.fillStyle = RC.preto; logo.forEach(function (p) { ctx.fill(p); }); ctx.restore(); }
    if (larga) { fonte(900, 20, true); esp(0.4); t('RECIBO DE VENDA', X1, y + 20, RC.preto, 'right'); esp(0); y += hl + 20; }
    else { y += hl + 26; fonte(900, 16, true); esp(0.3); t('RECIBO DE VENDA', M, y, RC.preto); esp(0); y += 14; }
    r(M, y, CW, 3, RC.preto);
    y += 3 + 28;
    // loja e número da venda
    var yTopo = y, colN = larga ? 150 : 96;
    rotulo('Venda nº', X1, y - 2, 'right'); fonte(700, larga ? 24 : 21); t(d.numero, X1, y + 24, RC.preto, 'right');
    fonte(700, 13.5); quebra(lj.nome || 'Racce', CW - colN).forEach(function (l) { t(l, M, y, RC.preto); y += 18; });
    var info = [];
    if (lj.endereco || lj.cidade) info.push([lj.endereco, lj.cidade].filter(Boolean).join(' · '));
    if (lj.cnpj) info.push('CNPJ ' + lj.cnpj);
    if (larga) { var cont = [lj.whatsapp ? 'WhatsApp ' + lj.whatsapp : '', lj.instagram].filter(Boolean).join(' · '); if (cont) info.push(cont); }
    else { if (lj.whatsapp) info.push('WhatsApp ' + lj.whatsapp); if (lj.instagram) info.push(lj.instagram); }
    if (lj.horario) info.push('Horário: ' + lj.horario);
    fonte(400, 11.5); info.forEach(function (x0) { quebra(x0, CW - colN).forEach(function (l) { t(l, M, y, RC.aco); y += 16; }); });
    y = Math.max(y, yTopo + 36) + 10;
    r(M, y, CW, 1, RC.nevoa); y += 28;
    // dados da compra
    var cel = [['Data da compra', d.data], ['Horário', d.hora], ['Canal', d.canal || '—']];
    if (d.cliente) cel.push(['Cliente', d.cliente]);
    if (d.telefone) cel.push(['WhatsApp do cliente', d.telefone]);
    if (d.vendedor) cel.push(['Atendimento', d.vendedor]);
    var nc = larga ? 3 : 2, cw = CW / nc;
    for (var i = 0; i < cel.length; i += nc) {
      var lin = cel.slice(i, i + nc), alt = 1;
      fonte(600, 13); var qs = lin.map(function (cc) { return quebra(cc[1], cw - 12, 2); });
      qs.forEach(function (q) { alt = Math.max(alt, q.length); });
      lin.forEach(function (cc, j) { var x = M + j * cw; rotulo(cc[0], x, y); fonte(600, 13); qs[j].forEach(function (l, n) { t(l, x, y + 19 + n * 17, RC.preto); }); });
      y += 19 + alt * 17 + 14;
    }
    // produtos
    y += 8; rotulo('Produtos', M, y); y += 10;
    if (mono) { r(M, y, CW, 1, RC.preto); r(M, y + 27, CW, 1, RC.preto); } else r(M, y, CW, 28, RC.gelo, 6);
    rotulo('Produto', C.prod, y + 18); rotulo('Total R$', C.tot, y + 18, 'right');
    if (larga) { rotulo('Tam.', C.tam, y + 18, 'center'); rotulo('Qtd.', C.qtd, y + 18, 'center'); rotulo('Unit. R$', C.unit, y + 18, 'right'); }
    y += 28;
    d.itens.forEach(function (it) {
      var y0 = y + 23;
      fonte(600, 13); var ns = quebra(it.nome, LP, 2);
      ns.forEach(function (l, n) { t(l, C.prod, y0 + n * 17, RC.preto); });
      fonte(400, 12.5);
      if (larga) { t(it.tam, C.tam, y0, RC.preto, 'center'); t(it.qtd, C.qtd, y0, RC.preto, 'center'); t(brlNum(it.preco), C.unit, y0, RC.preto, 'right'); }
      fonte(700, 12.5); t(brlNum(it.total), C.tot, y0, RC.preto, 'right');
      var yy = y0 + (ns.length - 1) * 17 + 17, meta = [it.cor, it.ref ? 'Cód. ' + it.ref : ''].filter(Boolean).join(' · ');
      if (!larga) { fonte(500, 12); t('Tam. ' + it.tam + ' · ' + it.qtd + ' × ' + brlNum(it.preco), C.prod, yy, RC.preto); yy += 16; }
      fonte(400, 11);
      if (meta) { t(meta, C.prod, yy, RC.aco); yy += 15; }
      if (it.desc) quebra(it.desc, LPD, 2).forEach(function (l) { t(l, C.prod, yy, RC.aco); yy += 15; });
      y = yy - 2; r(M, y, CW, 1, RC.nevoa); y += 1;
    });
    // totais
    y += 26;
    function lt(rot, val) { fonte(400, 12.5); t(rot, larga ? M + CW * 0.42 : M, y, RC.aco); fonte(600, 12.5); t(val, X1, y, RC.preto, 'right'); y += 22; }
    lt('Subtotal · ' + plural(d.pecas, 'peça', 'peças'), brl(d.subtotal));
    if (d.desconto) lt(larga ? 'Desconto concedido' : 'Desconto', '− ' + brl(d.desconto));
    y += 2;
    var rotTot = larga ? 'TOTAL DA COMPRA' : 'TOTAL', tamTot = larga ? 26 : 22;
    if (mono) {
      r(M, y, CW, 2, RC.preto);
      fonte(700, 11); esp(2); t(rotTot, M, y + 33, RC.preto); esp(0);
      fonte(700, tamTot); t(brl(d.total), X1, y + 36, RC.preto, 'right');
      r(M, y + 50, CW, 2, RC.preto); y += 52 + 28;
    } else {
      r(M, y, CW, 60, RC.preto, 8);
      fonte(700, 10.5); esp(2.2); t(rotTot, M + 18, y + 35, RC.volt); esp(0);
      fonte(700, tamTot); t(brl(d.total), X1 - 18, y + 40, RC.branco, 'right');
      y += 60 + 30;
    }
    // pagamento e observação
    rotulo('Forma de pagamento', M, y); y += 20;
    fonte(600, 13.5); quebra(d.pagTxt, CW).forEach(function (l) { t(l, M, y, RC.preto); y += 18; });
    if (d.recebido) { fonte(400, 12); quebra('Valor recebido ' + brl(d.recebido) + ' · Troco ' + brl(d.recebido - d.total), CW).forEach(function (l) { t(l, M, y, RC.aco); y += 17; }); }
    if (d.obs) { y += 12; rotulo('Observação', M, y); y += 20; fonte(400, 12.5); quebra(d.obs, CW).forEach(function (l) { t(l, M, y, RC.preto); y += 17; }); }
    y += 18;
    // política de troca
    if (lj.troca) {
      var pad = larga ? 15 : 0, tx = M + pad + 31;
      fonte(400, 12); var tl = quebra(lj.troca, X1 - pad - tx), hb = 44 + tl.length * 17;
      if (mono) { r(M, y, CW, 1, RC.preto); r(M, y + hb - 1, CW, 1, RC.preto); } else r(M, y, CW, hb, RC.gelo, 8);
      if (des) { ctx.save(); ctx.translate(M + pad, y + 14); ctx.scale(20 / 24, 20 / 24); ctx.strokeStyle = RC.preto; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; troca.forEach(function (p) { ctx.stroke(p); }); ctx.restore(); }
      rotulo('Trocas', tx, y + 28);
      fonte(400, 12); tl.forEach(function (l, n) { t(l, tx, y + 46 + n * 17, RC.preto); });
      y += hb + 30;
    } else y += 12;
    // rodapé
    if (lj.mensagem) { fonte(700, 14); quebra(lj.mensagem, CW).forEach(function (l) { t(l, W / 2, y, RC.preto, 'center'); y += 20; }); y += 10; }
    fonte(400, larga ? 10.5 : 11);
    var pe = ['Emitido em ' + d.emitido + ' · venda nº ' + d.numero];
    if (d.corrigida) pe.push('Venda corrigida em ' + d.corrigida + '. Este recibo substitui os anteriores.');
    pe.push('Recibo de venda emitido pela loja. Não é documento fiscal.');
    pe.forEach(function (x0) { quebra(x0, CW).forEach(function (l) { t(l, W / 2, y, RC.aco, 'center'); y += 15; }); });
    y += mono ? 14 : 24;
    if (!mono) { r(0, y, W, 6, RC.volt); y += 6; }
    return y;
  }
  var med = document.createElement('canvas').getContext('2d'), h = Math.ceil(rodar(med, false));
  var cv = document.createElement('canvas'); cv.width = Math.round(W * escala); cv.height = Math.round(h * escala);
  var ctx = cv.getContext('2d'); ctx.scale(escala, escala); ctx.fillStyle = RC.branco; ctx.fillRect(0, 0, W, h);
  rodar(ctx, true);
  return cv;
}
function textoRecibo(d) {
  var L = [], lj = d.loja || {};
  L.push('*' + String(lj.nome || 'Racce').toUpperCase() + ' · RECIBO DE VENDA*');
  L.push('Venda nº ' + d.numero + ' · ' + d.data + ' às ' + d.hora);
  if (d.cliente) L.push('Cliente: ' + d.cliente);
  L.push('');
  d.itens.forEach(function (it) { L.push('• ' + it.qtd + '× ' + it.nome + (it.cor ? ' ' + it.cor : '') + ' · Tam. ' + it.tam + ' — ' + brl(it.total) + (it.qtd > 1 ? ' (' + brl(it.preco) + ' cada)' : '')); });
  L.push('');
  L.push('Subtotal: ' + brl(d.subtotal));
  if (d.desconto) L.push('Desconto: − ' + brl(d.desconto));
  L.push('*Total: ' + brl(d.total) + '*');
  L.push('Pagamento: ' + d.pagTxt);
  if (d.recebido) L.push('Recebido: ' + brl(d.recebido) + ' · Troco: ' + brl(d.recebido - d.total));
  L.push('');
  if (lj.troca) L.push(lj.troca);
  L.push('_Recibo de venda emitido pela loja. Não é documento fiscal._');
  if (lj.mensagem) { L.push(''); L.push(lj.mensagem); }
  var cont = [lj.instagram, lj.whatsapp ? 'WhatsApp ' + lj.whatsapp : ''].filter(Boolean).join(' · '); if (cont) L.push(cont);
  return L.join('\n');
}
/** PDF de uma página com a imagem do recibo (JPEG), sem bibliotecas externas. */
function pdfDeCanvas(cv, titulo) {
  var b64 = cv.toDataURL('image/jpeg', 0.93).split(',')[1], bin = atob(b64), jpg = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);
  var wPt = 300, hPt = Math.round(wPt * cv.height / cv.width * 100) / 100, partes = [], tam = 0, offs = [];
  function bytes(x) { var b = new Uint8Array(x.length); for (var j = 0; j < x.length; j++) b[j] = x.charCodeAt(j) & 255; return b; }
  function add(x) { var b = typeof x === 'string' ? bytes(x) : x; partes.push(b); tam += b.length; }
  function obj(n, corpo) { offs[n] = tam; add(n + ' 0 obj\n' + corpo + '\nendobj\n'); }
  add('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offs[4] = tam; add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n'); add(jpg); add('\nendstream\nendobj\n');
  var cont = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q';
  obj(5, '<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream');
  obj(6, '<< /Title (' + String(titulo || 'Recibo').normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '') + ') /Producer (Racce Gestao) >>');
  var xref = tam;
  add('xref\n0 7\n0000000000 65535 f \n');
  for (var n = 1; n <= 6; n++) add(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  add('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(partes, { type: 'application/pdf' });
}
function lerPapel() { try { return localStorage.getItem('racce-gestao-papel') || 'a4'; } catch (e) { return 'a4'; } }
function abrirRecibo(id, nova) {
  var c = calc(), v = c.vIdx[id]; if (!v) return;
  if (!v.ok) { toast('Venda cancelada não tem recibo.'); return; }
  fecharRecibo(true);
  var d = dadosRecibo(v, c), R = { id: id, nova: !!nova, numero: d.numero, d: d };
  ui.recibo = R;
  var comp = false;
  try { comp = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File(['x'], 'r.png', { type: 'image/png' })] })); } catch (e) { comp = false; }
  var h = '<header><div><span class="olho">Venda #' + d.numero + ' · ' + brl(d.total) + '</span><h2 id="rcTit" style="margin-top:8px">Recibo de venda</h2></div><button class="fechar" data-a="fecharRecibo" aria-label="Fechar">' + ic('x') + '</button></header>' +
    (nova ? '<div class="nota ok">' + ic('check') + '<span><b>Venda #' + d.numero + ' registrada.</b> Envie o recibo ao cliente, imprima ou baixe. Se não precisar, siga para a próxima venda.</span></div>' : '') +
    '<div class="recibo-grade"><div class="recibo-prev" id="rcPrev"><span class="fraco">Gerando o recibo…</span></div><div class="recibo-acoes">' +
    '<section><h3>Enviar pelo WhatsApp</h3><div class="campos um"><label>WhatsApp do cliente<input type="text" inputmode="tel" id="rc_tel" value="' + esc(v.telefone || '') + '" maxlength="20" placeholder="(11) 91234-5678" autocomplete="off"><small>Com DDD. Sem número, o WhatsApp abre para você escolher o contato.</small></label></div>' +
      '<button type="button" class="btn pri" data-a="rcWhats">' + ic('atendimento') + 'Enviar pelo WhatsApp</button>' +
      (comp ? '<button type="button" class="btn" data-a="rcCompartilhar">' + ic('compra') + 'Compartilhar imagem do recibo</button>' : '') +
      '<small class="fraco">O WhatsApp abre com o recibo escrito na conversa. ' + (comp ? 'Para mandar a imagem, toque em "Compartilhar imagem do recibo" e escolha o WhatsApp.' : 'Para mandar também a imagem, baixe o recibo e anexe na conversa.') + '</small></section>' +
    '<section><h3>Imprimir</h3><div class="campos um"><label>Papel<select id="rc_fmt">' + opcoes([['a4', 'Folha A4'], ['80', 'Bobina 80 mm'], ['58', 'Bobina 58 mm']], lerPapel()) + '</select></label></div><button type="button" class="btn" data-a="rcImprimir">Imprimir recibo</button></section>' +
    '<section><h3>Baixar</h3><div class="lin"><button type="button" class="btn" data-a="rcPdf">' + ic('baixar') + 'PDF</button><button type="button" class="btn" data-a="rcPng">' + ic('baixar') + 'Imagem PNG</button></div></section>' +
    '</div></div>' +
    '<div class="rodape">' + (nova ? '<button type="button" class="btn pri" data-a="fecharRecibo">Próxima venda</button>' : '<button type="button" class="btn" data-a="fecharRecibo">Fechar</button>') + '</div>';
  $('#camadaForm').innerHTML = '<div class="veu"><div class="caixa recibo-caixa" role="dialog" aria-modal="true" aria-labelledby="rcTit">' + h + '</div></div>';
  fontesRecibo().then(function () {
    if (ui.recibo !== R) return;
    var cv = desenharRecibo(d, 3); R.cv = cv;
    cv.toBlob(function (b) {
      if (ui.recibo !== R || !b) return;
      R.blob = b; R.url = URL.createObjectURL(b);
      var pv = $('#rcPrev'); if (pv) pv.innerHTML = '<img src="' + R.url + '" alt="Recibo da venda nº ' + d.numero + '">';
    }, 'image/png');
  });
}
function fecharRecibo(silencio) { var R = ui.recibo; if (!R) return; ui.recibo = null; if (R.url) setTimeout(function () { URL.revokeObjectURL(R.url); }, 60000); if (!silencio) $('#camadaForm').innerHTML = ''; }
function imprimirRecibo() {
  var R = ui.recibo; if (!R || !R.url) { toast('Aguarde, o recibo ainda está sendo gerado.'); return; }
  var fmt = val('rc_fmt') || 'a4', bob = fmt === '80' ? 80 : fmt === '58' ? 58 : 0, larg = bob ? bob - (bob === 80 ? 8 : 10) : 120;
  var cvI = bob ? desenharRecibo(R.d, 3, { largura: bob === 80 ? 400 : 300, mono: true }) : R.cv, src = bob ? cvI.toDataURL('image/png') : R.url, alt = larg * cvI.height / cvI.width;
  var est = $('#estiloImpressao'); if (!est) { est = document.createElement('style'); est.id = 'estiloImpressao'; document.head.appendChild(est); }
  est.textContent = (bob ? '@page{size:' + bob + 'mm ' + Math.ceil(alt + 6) + 'mm;margin:3mm}' : '@page{size:A4;margin:15mm}') +
    '@media print{html,body{background:#fff!important}body>*:not(#impressao){display:none!important}#impressao{display:block!important}#impressao img{display:block;width:' + larg + 'mm;height:auto;margin:0 auto' + (bob ? '' : ';max-height:265mm;object-fit:contain') + '}}';
  var cx = $('#impressao'); if (!cx) { cx = document.createElement('div'); cx.id = 'impressao'; cx.style.display = 'none'; document.body.appendChild(cx); }
  cx.innerHTML = '<img alt="">';
  var img = cx.querySelector('img');
  img.onload = function () { window.print(); };
  img.src = src;
}
window.addEventListener('afterprint', function () { var cx = $('#impressao'); if (cx) cx.innerHTML = ''; var est = $('#estiloImpressao'); if (est) est.textContent = ''; });

function fichaVenda(v, c) {
  var h = '<header><div><span class="olho">' + esc(cap(dataLonga(v.data))) + ' · ' + horaDe(v.criadoEm) + '</span><h2 style="margin-top:4px">Venda #' + nVenda(v.numero) + '</h2></div><button class="fechar" data-a="fecharDet" aria-label="Fechar">' + ic('x') + '</button></header>' +
    '<div class="det-total"><span class="num">' + brl(v.total) + '</span>' + (v.ok ? pill('Concluída', 'ok') : pill('Cancelada', 'bad')) + (v.edicoes ? pill('Editada ' + v.edicoes + '×', 'warn') : '') + '</div>';
  if (!v.ok) h += '<div class="nota atencao">Cancelada em ' + (v.canceladaEm ? dataLocal(v.canceladaEm) : '—') + (v.canceladaPor ? ' por ' + esc(v.canceladaPor) : '') + (v.motivoCancel ? ': ' + esc(String(v.motivoCancel).replace(/[.\s]+$/, '')) : '') + '. As peças voltaram para o estoque.</div>';
  h += '<h3>Itens</h3>' + tabela([
    { t: 'Produto', c: 'quebra', v: function (it) { return '<span class="prod-cel">' + thumbHtml(it.produtoId, 32) + '<span><b>' + esc(it.nome) + '</b><span class="sub">' + esc([it.cor, 'Tam. ' + it.tam].filter(Boolean).join(' · ')) + '</span></span></span>'; } },
    { t: 'Qtd.', c: 'dir', v: function (it) { return it.qtd; } },
    { t: 'Preço', c: 'dir', v: function (it) { return '<span class="num">' + brl(it.preco) + '</span>' + (it.precoTabela !== undefined && it.precoTabela !== it.preco ? '<span class="sub">tabela: ' + brl(it.precoTabela) + '</span>' : ''); } },
    { t: 'Total', c: 'dir', v: function (it) { return '<b class="num">' + brl(it.preco * it.qtd) + '</b>'; } }], v.itens.map(function (it, i) { return Object.assign({ id: i }, it); }));
  var lucro = v.total - v.taxa - v.cmv;
  h += '<div class="demonst"><div>Subtotal</div><div class="num dir">' + brl(v.subtotal) + '</div>' + (v.desconto ? '<div class="sub2">Desconto</div><div class="num dir">' + brl(-v.desconto) + '</div>' : '') +
    '<div class="tot">Total pago pelo cliente</div><div class="num dir tot">' + brl(v.total) + '</div>' +
    (pode('custos') ? '<div class="sub2">Taxa da maquininha' + (v.taxa ? ' (' + pctTxt(v.taxaPct !== undefined ? v.taxaPct : taxaDe(c.cfg, v.pagamento)) + '%)' : '') + '</div><div class="num dir">' + brl(-v.taxa) + '</div>' +
    '<div class="sub2">Custo das peças</div><div class="num dir">' + brl(-v.cmv) + '</div>' +
    '<div class="tot">Lucro bruto da venda</div><div class="num dir tot ' + (lucro < 0 ? 'neg' : 'pos') + '">' + brl(lucro) + (v.total ? ' <small style="display:inline">(' + pct(lucro, v.total) + ')</small>' : '') + '</div>' : '') + '</div>';
  h += '<h3>Detalhes</h3><dl class="ficha"><dt>Pagamento</dt><dd>' + esc(v.pagamento) + (v.parcelas > 1 ? ' em ' + v.parcelas + 'x de ' + brl(Math.round(v.total / v.parcelas)) : '') + (v.recebido ? ' · recebido ' + brl(v.recebido) + ', troco ' + brl(v.recebido - v.total) : '') + '</dd>' +
    '<dt>Canal</dt><dd>' + esc(v.canal || '—') + '</dd><dt>Cliente</dt><dd>' + (esc(v.cliente) || '<span class="fraco">não informado</span>') + '</dd>' + (v.telefone ? '<dt>WhatsApp</dt><dd>' + esc(v.telefone) + '</dd>' : '') +
    (v.obs ? '<dt>Observação</dt><dd>' + esc(v.obs) + '</dd>' : '') + '<dt>Vendedor(a)</dt><dd>' + (esc(v.vendedorNome || '') || '<span class="fraco">não identificado</span>') + '</dd>' +
    '<dt>Registrada</dt><dd>' + dbr((v.criadoEm || '').slice(0, 10)) + ' às ' + horaDe(v.criadoEm) + '</dd>' + (v.editadaEm ? '<dt>Última edição</dt><dd>' + dataLocal(v.editadaEm) + ' às ' + horaDe(v.editadaEm) + (v.editadaPor ? ' por ' + esc(v.editadaPor) : '') + '</dd>' : '') + '</dl>';
  if (v.ok) h += '<div class="acoes" data-w><button class="btn pri" data-a="verRecibo" data-id="' + esc(v.id) + '">' + ic('compra') + 'Recibo</button><button class="btn" data-a="editarVenda" data-id="' + esc(v.id) + '">Editar venda</button><button class="btn per" data-a="cancelarVenda" data-id="' + esc(v.id) + '">Cancelar venda</button></div>';
  h += historicoDaVenda(v, c);
  return h;
}

// ---------- catálogo da Nova venda (vitrine no estilo da loja online)
/** Troca as miniaturas do catálogo pela foto grande, à medida que chegam. */
function carregarFotosCatalogo() {
  document.querySelectorAll('img[data-fid]').forEach(function (img) {
    var pid = img.dataset.fid;
    fotoGrande(pid).then(function (src) { if (src) document.querySelectorAll('img[data-fid="' + pid + '"]').forEach(function (i) { if (i.getAttribute('src') !== src) i.src = src; }); });
  });
}
function tamanhosDe(p) { return p.tamanhos && p.tamanhos.length ? p.tamanhos : p.grade.map(function (g) { return g.t; }); }
function addItemVenda(p, tam, qtd) {
  var v = ui.venda; if (!v) return;
  var ja = v.itens.filter(function (it) { return it.produtoId === p.id && it.tam === tam; })[0];
  if (ja) ja.qtd += qtd; else v.itens.push({ produtoId: p.id, nome: p.nome, cor: p.cor || '', tam: tam, qtd: qtd, preco: p.preco, custo: p.custo || 0 });
}
function cardVenda(p, c, v, top) {
  var tams = tamanhosDe(p), fsrc = fotoGrandeSrc(p.id);
  var naVenda = soma(v.itens.filter(function (it) { return it.produtoId === p.id; }), function (it) { return it.qtd; });
  var disp = soma(tams, function (t) { return Math.max(0, disponivel(c, v, p.id, t)); });
  var selo = naVenda ? '<span class="pc-selo na">' + naVenda + ' na venda</span>' : disp <= 0 ? '<span class="pc-selo esg">Esgotado</span>' : top.indexOf(p.id) >= 0 ? '<span class="pc-selo">Mais vendido</span>' : '';
  return '<article class="pc' + (disp <= 0 ? ' sem' : '') + '"><button type="button" class="pc-foto" data-a="cDet" data-id="' + esc(p.id) + '" aria-label="Ver detalhes de ' + esc(nomeP(p)) + '">' + selo +
      (fsrc ? '<img src="' + esc(fsrc) + '" data-fid="' + esc(p.id) + '" alt="" loading="lazy">' : ic('cabide')) + '</button>' +
    '<div class="pc-info"><span class="pc-rot">' + esc([p.categoria, p.publico].filter(Boolean).join(' · ')) + '</span>' +
      '<button type="button" class="pc-nome" data-a="cDet" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</button>' +
      '<span class="pc-sub">' + esc([p.cor, p.ref ? 'Cód. ' + p.ref : ''].filter(Boolean).join(' · ')) + '</span>' +
      '<span class="pc-preco">' + brl(p.preco) + '</span>' + (p.descricao ? '<span class="pc-desc">' + esc(p.descricao) + '</span>' : '') +
      '<span class="pc-est">' + (disp > 0 ? plural(disp, 'peça disponível', 'peças disponíveis') : 'Sem peças no estoque') + '</span>' +
      '<div class="pc-tams" role="group" aria-label="Adicionar tamanho">' + tams.map(function (t) {
        var q = disponivel(c, v, p.id, t);
        return '<button type="button" data-a="cAdd" data-id="' + esc(p.id) + '" data-t="' + esc(t) + '"' + (q <= 0 ? ' disabled' : '') + (q > 0 && q <= p.min ? ' class="baixo"' : '') + ' title="' + esc(t + ': ' + plural(Math.max(0, q), 'peça', 'peças')) + '">' + esc(t) + '<small>' + Math.max(0, q) + '</small></button>';
      }).join('') + '</div></div></article>';
}
PAG.venda = function (c) {
  if (!ui.venda) ui.venda = novaVendaEstado(c);
  var v = ui.venda, f = ui.f, q = norm(f.cq), t = totaisVenda(v, c.cfg);
  var vend = {}, lim = somarDias(c.hoje, -30);
  c.vendas.forEach(function (x) { if (x.ok && x.data >= lim) x.itens.forEach(function (it) { vend[it.produtoId] = (vend[it.produtoId] || 0) + it.qtd; }); });
  var ativos = c.produtos.filter(function (p) { return p.ativo; });
  var top = ativos.filter(function (p) { return vend[p.id]; }).sort(function (a, b) { return vend[b.id] - vend[a.id]; }).slice(0, 3).map(function (p) { return p.id; });
  var cats = [], ordemCat = c.cfg.categoriasProduto;
  ativos.forEach(function (p) { if (p.categoria && cats.indexOf(p.categoria) < 0) cats.push(p.categoria); });
  cats.sort(function (a, b) { var ia = ordemCat.indexOf(a), ib = ordemCat.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  var dispP = function (p) { return soma(tamanhosDe(p), function (x) { return Math.max(0, disponivel(c, v, p.id, x)); }); };
  var lista = ativos.filter(function (p) {
    if (f.ccat && p.categoria !== f.ccat) return false;
    if (f.cpub && p.publico !== f.cpub) return false;
    if (f.cest === 'com' && dispP(p) <= 0) return false;
    return !q || norm([p.nome, p.cor, p.ref, p.categoria, p.publico, p.descricao].join(' ')).indexOf(q) >= 0;
  });
  var ord = f.cord || 'vendidos', porNome = function (a, b) { return norm(nomeP(a)) < norm(nomeP(b)) ? -1 : 1; };
  lista.sort(function (a, b) {
    if (ord === 'nome') return porNome(a, b);
    if (ord === 'menor') return a.preco - b.preco || porNome(a, b);
    if (ord === 'maior') return b.preco - a.preco || porNome(a, b);
    if (ord === 'estoque') return dispP(b) - dispP(a) || porNome(a, b);
    return (vend[b.id] || 0) - (vend[a.id] || 0) || porNome(a, b);
  });
  var pecas = soma(v.itens, function (it) { return it.qtd; });
  var grade = !ativos.length ? '<div class="rolagem"><div class="vazio">Ainda não há produtos cadastrados. <button class="btn link" data-a="novoProduto">Cadastrar produto</button></div></div>'
    : lista.length ? '<div class="cat-grade">' + lista.map(function (p) { return cardVenda(p, c, v, top); }).join('') + '</div>'
    : '<div class="rolagem"><div class="vazio">Nenhum produto com esses filtros.</div></div>';
  var itens = v.itens.length ? v.itens.map(function (it, i) {
    return '<div class="sac-item">' + thumbHtml(it.produtoId, 48) + '<span class="sac-info"><b>' + esc(it.nome) + '</b><small>' + esc([it.cor, 'Tam. ' + it.tam].filter(Boolean).join(' · ')) + '</small>' +
      '<span class="stepper"><button type="button" data-a="cLinQtd" data-i="' + i + '" data-d="-1" aria-label="Menos">−</button><span>' + it.qtd + '</span><button type="button" data-a="cLinQtd" data-i="' + i + '" data-d="1" aria-label="Mais">+</button></span></span>' +
      '<span class="sac-preco"><b class="num">' + brl(it.preco * it.qtd) + '</b><button type="button" class="btn link" data-a="cDel" data-i="' + i + '">Remover</button></span></div>';
  }).join('') : '<div class="vazio" style="padding:18px 4px">Toque no tamanho de um produto para adicionar à venda, ou na foto para ver os detalhes.</div>';
  var sacola = '<aside class="pdv-sacola bloco" aria-label="Sacola da venda"><header><div><h2>' + (v.editando ? 'Itens da venda #' + nVenda(v.numero) : 'Sacola da venda') + '</h2><p>' + (pecas ? plural(pecas, 'peça', 'peças') : 'Nenhum item') + '</p></div>' + (v.itens.length && !v.editando ? '<button type="button" class="btn link" data-a="cLimpar">Limpar</button>' : '') + '</header>' +
    '<div class="sac-lista">' + itens + '</div><div class="sac-total"><span>Subtotal</span><b class="num">' + brl(t.sub) + '</b></div>' +
    '<button type="button" class="btn pri" style="width:100%" data-a="cFinalizar"' + (v.itens.length ? '' : ' disabled') + '>' + ic('compra') + (v.editando ? 'Revisar alterações' : 'Finalizar venda') + '</button></aside>';
  var barra = v.itens.length ? '<div class="pdv-barra"><span><b class="num">' + brl(t.sub) + '</b><small>' + plural(pecas, 'peça', 'peças') + ' na venda</small></span><button type="button" class="btn pri" data-a="cFinalizar">' + ic('compra') + (v.editando ? 'Revisar' : 'Finalizar') + '</button></div>' : '';
  setTimeout(carregarFotosCatalogo, 0);
  return (v.editando ? cabecalho('Venda #' + nVenda(v.numero), 'Editar venda', 'Inclua, troque ou retire produtos: toque no tamanho para incluir uma peça e use a lista ao lado para mudar quantidades. Nada muda na venda até você salvar com o motivo.',
      '<button class="btn per" data-a="vDescartarEdicao">Descartar edição</button><button class="btn pri" data-a="cFinalizar"' + (v.itens.length ? '' : ' disabled') + '>Revisar alterações</button>')
    : cabecalho('Ponto de venda', 'Nova venda', 'Todos os produtos da loja. Toque no tamanho para adicionar à venda ou na foto para ver os detalhes.', '<button class="btn" data-a="ir" data-p="vendas">Ver vendas</button>')) +
    '<div class="pdv"><div class="pdv-cat"><div class="filtros">' + filtroTexto('cq', 'Buscar', 'Nome, cor, código ou característica') + filtroSel('cpub', 'Público', [['', 'Todos']].concat(PUBLICOS)) +
      filtroSel('cord', 'Ordenar', [['vendidos', 'Mais vendidos'], ['nome', 'Nome'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['estoque', 'Mais estoque']]) + '</div>' +
      chipsFiltro('ccat', [['', 'Todas', ativos.length]].concat(cats.map(function (k) { return [k, k, ativos.filter(function (p) { return p.categoria === k; }).length]; }))) +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span class="fraco" style="font-size:13px">' + plural(lista.length, 'produto', 'produtos') + '</span>' + chipsFiltro('cest', [['', 'Todos'], ['com', 'Só com estoque']]) + '</div>' +
      grade + '</div>' + sacola + '</div>' + barra;
};
function fichaCatalogo(p, c) {
  var v = ui.venda, tams = tamanhosDe(p), t = v.detTam, qd = v.detQtd || 1, fsrc = fotoGrandeSrc(p.id), disp = t ? disponivel(c, v, p.id, t) : 0;
  var tot = soma(tams, function (x) { return Math.max(0, disponivel(c, v, p.id, x)); });
  var h = '<header><div><span class="olho">' + esc([p.categoria, p.publico].filter(Boolean).join(' · ') || 'Produto') + '</span><h2 style="margin-top:6px">' + esc(p.nome) + '</h2><p class="fraco" style="margin-top:4px">' + esc([p.cor, p.ref ? 'Cód. ' + p.ref : ''].filter(Boolean).join(' · ')) + '</p></div><button class="fechar" data-a="fecharDet" aria-label="Fechar">' + ic('x') + '</button></header>';
  h += '<div class="ficha-prod ficha-cat"><div><div class="moldura"><div class="foto-grande" id="fotoGrande">' + (fsrc ? '<img src="' + esc(fsrc) + '" alt="Foto de ' + esc(nomeP(p)) + '">' : ic('cabide') + 'Sem foto') + '</div></div></div>' +
    '<div><span class="preco-g">' + brl(p.preco) + '</span>' + (p.descricao ? '<p>' + esc(p.descricao) + '</p>' : '') +
    '<dl class="ficha"><dt>Categoria</dt><dd>' + esc(p.categoria || '—') + '</dd><dt>Público</dt><dd>' + esc(p.publico || '—') + '</dd><dt>Cor</dt><dd>' + esc(p.cor || '—') + '</dd>' + (p.ref ? '<dt>Código</dt><dd>' + esc(p.ref) + '</dd>' : '') + '<dt>Disponível</dt><dd>' + plural(tot, 'peça', 'peças') + '</dd></dl>' +
    '<span class="fraco" style="font-size:12.5px">Tamanho</span><div class="tams" role="group" aria-label="Tamanho">' + tams.map(function (x) { var qq = disponivel(c, v, p.id, x); return '<button type="button" data-a="cTam" data-t="' + esc(x) + '" aria-pressed="' + (t === x) + '"' + (qq <= 0 ? ' class="zero" title="Sem peças no estoque"' : '') + '>' + esc(x) + '<small>' + Math.max(0, qq) + ' un.</small></button>'; }).join('') + '</div>' +
    (t && qd > disp ? '<div class="nota atencao">' + (disp > 0 ? 'Só ' + (disp === 1 ? 'há 1 peça' : 'há ' + disp + ' peças') + ' de ' + esc(t) + ' no estoque.' : 'O estoque não tem peças de ' + esc(t) + '.') + ' A venda vai deixar o estoque negativo; confira a contagem depois.</div>' : '') +
    '<div class="selec" style="background:none;border:0;padding:0"><div class="lin"><div class="stepper"><button type="button" data-a="cQtdDet" data-d="-1" aria-label="Menos">−</button><span>' + qd + '</span><button type="button" data-a="cQtdDet" data-d="1" aria-label="Mais">+</button></div>' +
    '<button type="button" class="btn pri" data-a="cAddDet" data-id="' + esc(p.id) + '"' + (t ? '' : ' disabled') + '>' + ic('compra') + 'Adicionar à venda</button></div></div>' + (t ? '' : '<span class="fraco" style="font-size:12.5px">Escolha o tamanho.</span>') + '</div></div>';
  return h;
}
function fecharPagamento() { ui.pagando = false; $('#camadaForm').innerHTML = ''; render(); }

// ---------- nova venda (ponto de venda)
function novaVendaEstado(c) { return { itens: [], busca: '', sel: null, tam: null, qtd: 1, descTipo: 'R$', desc: '', pag: 'Pix', parcelas: 3, canal: c.cfg.canais[0] || 'Loja física', cliente: '', telefone: '', data: c.hoje, obs: '', recebido: '' }; }
function abrirVenda() {
  if (!podeEscrever()) return;
  var c = calc();
  if (!c.produtos.some(function (p) { return p.ativo; })) {
    if (!pode('estoque')) { toast('Ainda não há produtos cadastrados. Peça ao responsável pelo estoque para cadastrar.'); return; }
    confirmar('Ainda não há produtos cadastrados. Cadastre os produtos e o estoque para registrar vendas.', 'Cadastrar produto', false).then(function (sim) { if (sim) formProduto(null); });
    return;
  }
  if (!ui.venda) ui.venda = novaVendaEstado(c);
  ui.modal = null; irPara('venda');
}
function totaisVenda(v, cfg) {
  var sub = soma(v.itens, function (it) { return it.qtd * it.preco; }), desc = 0;
  if (v.descTipo === '%') { var p = parsePct(v.desc); desc = isNaN(p) ? 0 : Math.round(sub * Math.max(0, Math.min(100, p)) / 100); }
  else { var d = parseBrl(v.desc); desc = isNaN(d) ? 0 : Math.max(0, d); }
  desc = Math.min(desc, sub);
  var total = sub - desc, rec = parseBrl(v.recebido);
  return { sub: sub, desc: desc, total: total, taxa: Math.round(total * taxaDe(cfg, v.pag) / 100), recebido: isNaN(rec) ? 0 : rec };
}
function disponivel(c, v, pid, tam) {
  var e = (c.est[pid] || {})[tam] || 0;
  if (v.orig) v.orig.itens.forEach(function (it) { if (it.produtoId === pid && it.tam === tam) e += it.qtd; });
  v.itens.forEach(function (it) { if (it.produtoId === pid && it.tam === tam) e -= it.qtd; });
  return e;
}
function renderVenda() {
  var v = ui.venda; if (!v) return;
  var c = calc(), cfg = c.cfg, t = totaisVenda(v, cfg);
  var ativo = document.activeElement, foco = ativo && ativo.id && ativo.id.indexOf('v_') === 0 ? { id: ativo.id, pos: ativo.selectionStart } : null;
  var rolagem = $('#camadaForm .veu') ? $('#camadaForm .veu').scrollTop : 0;
  ui.pagando = true;
  var h = v.editando ? '<header><div><span class="olho">Venda #' + nVenda(v.numero) + ' · registrada em ' + dataLocal(v.registradaEm) + ' às ' + horaDe(v.registradaEm) + '</span><h2 style="margin-top:8px">Editar venda</h2></div><button class="fechar" data-a="fecharPagamento" aria-label="Voltar aos produtos">' + ic('x') + '</button></header>'
    : '<header><div><span class="olho">Ponto de venda</span><h2 style="margin-top:8px">Finalizar venda</h2></div><button class="fechar" data-a="fecharPagamento" aria-label="Voltar ao catálogo">' + ic('x') + '</button></header>';

  // carrinho
  h += '<h3>Itens da venda</h3>';
  if (v.itens.length) {
    h += '<div class="carrinho">' + tabela([
      { t: 'Produto', c: 'quebra', v: function (it) { var pp = c.pIdx[it.produtoId], ts = pp ? tamanhosDe(pp).slice() : []; if (ts.indexOf(it.tam) < 0) ts.push(it.tam); return '<span class="prod-cel">' + thumbHtml(it.produtoId, 32) + '<span><b>' + esc(it.nome) + '</b><span class="sub">' + (it.cor ? esc(it.cor) + ' · ' : '') + 'Tam. <select class="tam-sel" id="v_tam_' + it.id + '" data-i="' + it.id + '" aria-label="Tamanho de ' + esc(it.nome) + '">' + opcoes(ts, it.tam) + '</select></span></span></span>'; } },
      { t: 'Qtd.', v: function (it) { return '<div class="stepper"><button type="button" data-a="vLinQtd" data-i="' + it.id + '" data-d="-1" aria-label="Menos">−</button><span>' + it.qtd + '</span><button type="button" data-a="vLinQtd" data-i="' + it.id + '" data-d="1" aria-label="Mais">+</button></div>'; } },
      { t: 'Preço un.', v: function (it) { return '<input type="text" inputmode="decimal" class="din preco" id="v_preco_' + it.id + '" data-i="' + it.id + '" value="' + brlNum(it.preco) + '" aria-label="Preço unitário">'; } },
      { t: 'Total', c: 'dir', v: function (it) { return '<b class="num">' + brl(it.preco * it.qtd) + '</b>'; } },
      { t: '', v: function (it) { return '<button type="button" class="fechar" style="width:30px;height:30px" data-a="vDel" data-i="' + it.id + '" aria-label="Remover">' + ic('x') + '</button>'; } }],
      v.itens.map(function (it, i) { return Object.assign({ id: i }, it); })) + '</div>';
  } else h += '<div class="nota">A venda está sem itens. Volte ao catálogo para escolher os produtos.</div>';
  var faltas = v.itens.filter(function (it) { return disponivel(c, v, it.produtoId, it.tam) < 0; });
  if (faltas.length) h += '<div class="nota atencao">Estoque insuficiente: ' + faltas.map(function (it) { return esc(nomeItem(it) + ' (' + it.tam + ')') + ' fica com ' + String(disponivel(c, v, it.produtoId, it.tam)).replace('-', '−'); }).join('; ') + '. A venda vai deixar o estoque negativo; confira a contagem depois.</div>';

  // pagamento
  h += '<div class="campos">' +
    '<div class="campo larga">Forma de pagamento<div class="chips" role="group">' + PAGAMENTOS.map(function (p) { return '<button type="button" class="chip" data-a="vPag" data-v="' + esc(p) + '" aria-pressed="' + (v.pag === p) + '">' + esc(PAG_CURTO[p]) + '</button>'; }).join('') + '</div></div>' +
    (v.pag === 'Crédito parcelado' ? '<label>Parcelas<select id="v_parcelas">' + opcoes([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return [n, n + 'x de ' + brl(Math.round(t.total / n))]; }), v.parcelas) + '</select></label>' : '') +
    (v.pag === 'Dinheiro' ? '<label>Valor recebido (R$)<input type="text" inputmode="decimal" class="din" id="v_recebido" value="' + esc(v.recebido) + '" placeholder="0,00" autocomplete="off"><small>' + (t.recebido >= t.total && t.recebido ? 'Troco: <b>' + brl(t.recebido - t.total) + '</b>' : 'Para calcular o troco') + '</small></label>' : '') +
    '<div class="campo">Desconto<div style="display:flex;gap:6px"><div class="chips" role="group" style="flex:none"><button type="button" class="chip" data-a="vDescTipo" data-v="R$" aria-pressed="' + (v.descTipo === 'R$') + '">R$</button><button type="button" class="chip" data-a="vDescTipo" data-v="%" aria-pressed="' + (v.descTipo === '%') + '">%</button></div><input type="text" inputmode="decimal" class="din" id="v_desc" value="' + esc(v.desc) + '" placeholder="0" autocomplete="off" aria-label="Desconto"></div></div>' +
    '<div class="campo larga">Canal<div class="chips" role="group">' + cfg.canais.map(function (p) { return '<button type="button" class="chip" data-a="vCanal" data-v="' + esc(p) + '" aria-pressed="' + (v.canal === p) + '">' + esc(p) + '</button>'; }).join('') + '</div></div>' +
    '<label>Cliente (opcional)<input type="text" id="v_cliente" value="' + esc(v.cliente) + '" maxlength="80" autocomplete="off"></label>' +
    '<label>WhatsApp do cliente (opcional)<input type="text" inputmode="tel" id="v_tel" value="' + esc(v.telefone || '') + '" maxlength="20" placeholder="(11) 91234-5678" autocomplete="off"><small>Para enviar o recibo.</small></label>' +
    '<label>Data da venda<input type="date" id="v_data" value="' + esc(v.data) + '" max="' + c.hoje + '"></label>' +
    '<label class="larga">Observação<input type="text" id="v_obs" value="' + esc(v.obs) + '" maxlength="200" autocomplete="off" placeholder="Ex.: troca de tamanho, encomenda, presente"></label></div>' + (v.editando ? blocoEdicao(v) : '');

  h += '<div class="total-venda"><span class="fr">Subtotal</span><span class="num dir">' + brl(t.sub) + '</span>' + (t.desc ? '<span class="fr">Desconto</span><span class="num dir">− ' + brl(t.desc) + '</span>' : '') +
    (t.taxa ? '<span class="fr">Taxa estimada da maquininha</span><span class="num dir fr">' + brl(t.taxa) + '</span>' : '') +
    '<span class="rotulo">Total</span><span class="grande num dir">' + brl(t.total) + '</span></div>' +
    '<div class="erro-form" id="vErro" hidden></div>' +
    (v.editando ? '<div class="rodape ed"><button type="button" class="btn per" data-a="vDescartarEdicao" style="margin-right:auto">Descartar edição</button><button type="button" class="btn" data-a="fecharPagamento">Trocar produtos</button><button type="button" class="btn pri" id="vSalvarEd" data-a="vSalvarEdicao" disabled>Salvar alterações</button></div>'
      : '<div class="rodape"><button type="button" class="btn" data-a="fecharPagamento">Voltar ao catálogo</button><button type="button" class="btn pri" id="vRegistrar" data-a="vRegistrar"' + (v.itens.length ? '' : ' disabled') + '>Registrar venda · ' + brl(t.total) + '</button></div>');

  $('#camadaForm').innerHTML = '<div class="veu lado"><div class="caixa" role="dialog" aria-modal="true" aria-label="' + (v.editando ? 'Editar venda' : 'Nova venda') + '">' + h + '</div></div>';
  var veu = $('#camadaForm .veu'); if (veu) veu.scrollTop = rolagem;
  if (foco) { var el = document.getElementById(foco.id); if (el) { el.focus(); try { el.setSelectionRange(foco.pos, foco.pos); } catch (e) { /* sem cursor */ } } }
  atualizarDifEdicao();
}
function registrarVenda() {
  var v = ui.venda; if (!v) return;
  var c = calc(), t = totaisVenda(v, c.cfg), err = $('#vErro'), bt = $('#vRegistrar');
  function falha(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
  if (!v.itens.length) return falha('Adicione pelo menos um produto.');
  if (!dataValida(v.data)) return falha('Informe a data da venda.');
  if (v.data > c.hoje) return falha('A data da venda não pode ser futura.');
  if (v.descTipo === '%' && isNaN(parsePct(v.desc))) return falha('Desconto inválido. Use um número, como 10.');
  if (v.descTipo === 'R$' && v.desc !== '' && isNaN(parseBrl(v.desc))) return falha('Desconto inválido. Use o formato 10,00.');
  if (v.itens.some(function (it) { return !(it.preco >= 0); })) return falha('Confira o preço dos itens.');
  var doc = docDeEstado(v, c.cfg);
  err.hidden = true; bt.disabled = true; bt.textContent = 'Registrando…';
  gravar(function () { return B.registrarVenda(enviarVenda(doc)); }).then(function (r) {
    ui.venda = null; ui.pagando = false; $('#camadaForm').innerHTML = ''; render();
    if (r && r.id && calc().vIdx[r.id]) abrirRecibo(r.id, true); else toast('Venda #' + nVenda(r && r.numero) + ' registrada · ' + brl(t.total) + '.');
  }, function (e) { var b = $('#vRegistrar'); if (b) { b.disabled = false; b.textContent = 'Registrar venda · ' + brl(t.total); } var x = $('#vErro'); if (x) { x.textContent = e.message; x.hidden = false; } });
}

// =============================================================================
// ESTOQUE
// =============================================================================
PAG.estoque = function (c) {
  var f = ui.f, q = norm(f.eq), st = f.est || '', ev = valorEstoque(c), al = alertasEstoque(c);
  var n = { baixo: 0, zerado: 0, inativo: 0, semfoto: 0 }, fts = fotosAtuais();
  c.produtos.forEach(function (p) { if (!p.ativo) { n.inativo++; return; } if (p.baixos.length) n.baixo++; if (p.zerados.length) n.zerado++; if (!fts[p.id]) n.semfoto++; });
  var lista = c.produtos.filter(function (p) {
    if (st === 'inativos') { if (p.ativo) return false; } else if (!p.ativo) return false;
    if (st === 'baixo' && !p.baixos.length) return false;
    if (st === 'zerado' && !p.zerados.length) return false;
    if (st === 'semfoto' && fts[p.id]) return false;
    if (f.ecat && p.categoria !== f.ecat) return false;
    if (f.epub && p.publico !== f.epub) return false;
    return !q || norm([p.nome, p.cor, p.ref, p.categoria].join(' ')).indexOf(q) >= 0;
  });
  var cols = [
    { t: 'Produto', c: 'quebra', v: function (p) { return '<span class="prod-cel">' + thumbHtml(p.id, 40) + '<span><b>' + esc(p.nome) + '</b><span class="sub">' + esc([p.cor, p.ref, p.categoria, p.publico].filter(Boolean).join(' · ')) + '</span></span></span>'; } },
    { t: 'Estoque por tamanho', v: function (p) { return raiasProduto(p); } },
    { t: 'Total', c: 'dir', v: function (p) { return '<b class="num">' + p.total + '</b>'; } },
    { t: 'Custo', c: 'dir', v: function (p) { return '<span class="num">' + brl(p.custo) + '</span>'; } },
    { t: 'Preço', c: 'dir', v: function (p) { return '<span class="num">' + brl(p.preco) + '</span><span class="sub">margem ' + margemTxt(p.custo, p.preco) + '</span>'; } }];
  if (!verCustos()) cols.splice(3, 1);
  registrarCsv('estoque', 'estoque', ['Produto', 'Cor', 'Código', 'Categoria', 'Público', 'Tamanho', 'Quantidade', 'Mínimo', 'Custo', 'Preço', 'Situação'],
    [].concat.apply([], c.produtos.map(function (p) { return p.grade.map(function (g) { return [p.nome, p.cor, p.ref, p.categoria, p.publico, g.t, g.q, p.min, brlNum(p.custo), brlNum(p.preco), p.ativo ? 'Ativo' : 'Inativo']; }); })));
  var movs = c.movs.slice(0, 25);
  var movHtml = tabela([
    { t: 'Data', v: function (m) { return '<span class="num">' + dbr(m.data) + '</span>'; } },
    { t: 'Movimento', c: 'quebra', v: function (m) { var p = c.pIdx[m.produtoId]; return '<b>' + esc(nomeP(p)) + '</b><span class="sub">' + (m.tipo === 'entrada' ? 'Entrada' + (m.fornecedor ? ' · ' + esc(m.fornecedor) : '') : 'Ajuste · ' + esc(m.motivo || '')) + (m.obs ? ' · ' + esc(m.obs) : '') + '</span>'; } },
    { t: 'Tamanhos', v: function (m) { var qq = m.qtds || {}; return '<span class="raias-t">' + Object.keys(qq).map(function (t) { var x = qq[t]; return '<span class="raia' + (x < 0 ? ' zero' : '') + '"><i>' + esc(t) + '</i><b>' + (x > 0 ? '+' : '') + x + '</b></span>'; }).join('') + '</span>'; } },
    { t: 'Valor', c: 'dir', v: function (m) { var tot = soma(Object.keys(m.qtds || {}), function (t) { return m.qtds[t]; }); return m.tipo === 'entrada' && m.custoUnit ? '<span class="num">' + brl(tot * m.custoUnit) + '</span>' : '<span class="fraco">—</span>'; } },
    { t: '', v: function (m) { return '<button class="btn mini" data-a="desfazerMov" data-id="' + esc(m.id) + '" data-w>Desfazer</button>'; } }], movs, { vazio: 'Nenhuma entrada ou ajuste registrado.' });
  return cabecalho('Mercadoria', 'Estoque', 'O estoque é calculado a partir das entradas, dos ajustes e das vendas. Para corrigir uma quantidade, use "Ajustar estoque" com a contagem real.',
    '<button class="btn pri" data-a="novaEntrada" data-w>' + ic('mais') + 'Entrada de mercadoria</button><button class="btn" data-a="novoAjuste" data-w>Ajustar estoque</button><button class="btn" data-a="novoProduto" data-w>Cadastrar produto</button>' + botaoCsv('estoque')) +
    '<div class="tiles">' + tile('Peças em estoque', milhar(ev.pecas), plural(c.produtos.filter(function (p) { return p.ativo; }).length, 'produto ativo', 'produtos ativos')) + tile('Valor de custo', brl(ev.custo), 'o que foi pago pelas peças') +
    tile('Valor de venda', brl(ev.venda), 'se tudo for vendido pelo preço cheio') + tile('Tamanhos para repor', String(al.length), al.filter(function (a) { return a.q <= 0; }).length + ' zerados · mínimo padrão de ' + c.cfg.estoqueMinimo, al.length ? '' : '') + '</div>' +
    '<div class="filtros">' + filtroTexto('eq', 'Buscar', 'Nome, cor ou código') + filtroSel('ecat', 'Categoria', [['', 'Todas']].concat(c.cfg.categoriasProduto)) + filtroSel('epub', 'Público', [['', 'Todos']].concat(PUBLICOS)) + '</div>' +
    chipsFiltro('est', [['', 'Ativos'], ['baixo', 'Para repor', n.baixo], ['zerado', 'Com tamanho zerado', n.zerado], ['semfoto', 'Sem foto', n.semfoto], ['inativos', 'Inativos', n.inativo]]) +
    tabela(cols, lista, { acao: 'verProduto', vazio: c.produtos.length ? 'Nenhum produto com este filtro.' : 'Nenhum produto cadastrado. <button class="btn link" data-a="novoProduto" data-w>Cadastrar o primeiro</button>' }) +
    bloco('Entradas e ajustes', 'As 25 movimentações mais recentes. "Desfazer" estorna o lançamento e recalcula o estoque; o registro do estorno fica guardado.', movHtml);
};
function fichaProduto(p, c) {
  var h = '<header><div><span class="olho">' + esc([p.categoria, p.publico].filter(Boolean).join(' · ') || 'Produto') + '</span><h2 style="margin-top:8px">' + esc(p.nome) + '</h2><p class="fraco" style="margin-top:6px">' + esc([p.cor, p.ref ? 'Cód. ' + p.ref : ''].filter(Boolean).join(' · ')) + (p.ativo ? '' : ' ' + pill('Inativo')) + '</p></div><button class="fechar" data-a="fecharDet" aria-label="Fechar">' + ic('x') + '</button></header>';
  var fsrc = fotoGrandeSrc(p.id);
  h += '<div class="ficha-prod"><div><div class="moldura"><div class="foto-grande" id="fotoGrande">' + (fsrc ? '<img src="' + esc(fsrc) + '" alt="Foto de ' + esc(nomeP(p)) + '">' : ic('cabide') + 'Sem foto') + '</div></div>' +
    '<div class="foto-acoes"><button class="btn mini" data-a="fotoProduto">' + ic('camera') + (fsrc ? 'Trocar foto' : 'Adicionar foto') + '</button>' + (fsrc ? '<button class="btn mini per" data-a="removerFoto" data-id="' + esc(p.id) + '">Remover</button>' : '') + '<input type="file" id="fotoDet" accept="image/*" hidden></div></div>' +
    '<div>' + (p.descricao ? '<p style="color:var(--ink-2)">' + esc(p.descricao) + '</p>' : '') + '<dl class="ficha"><dt>Em estoque</dt><dd><b>' + plural(p.total, 'peça', 'peças') + '</b></dd><dt>Preço</dt><dd>' + brl(p.preco) + '</dd><dt>Custo</dt><dd>' + brl(p.custo) + '</dd><dt>Margem</dt><dd>' + margemTxt(p.custo, p.preco) + '</dd><dt>Repor com</dt><dd>' + plural(p.min, 'peça', 'peças') + ' ou menos por tamanho</dd></dl>' +
    '<span class="fraco" style="font-size:12.5px">Estoque por tamanho</span>' + raiasProduto(p) + '</div></div>';
  h += '<div class="acoes" data-w><button class="btn pri" data-a="novaEntrada" data-id="' + esc(p.id) + '">Entrada</button><button class="btn" data-a="novoAjuste" data-id="' + esc(p.id) + '">Ajustar</button><button class="btn" data-a="editarProduto" data-id="' + esc(p.id) + '">Editar</button><button class="btn" data-a="duplicarProduto" data-id="' + esc(p.id) + '">Nova cor</button>' +
    '<button class="btn' + (p.ativo ? ' per' : '') + '" data-a="ativarProduto" data-id="' + esc(p.id) + '">' + (p.ativo ? 'Desativar' : 'Reativar') + '</button></div>';
  var hist = [];
  c.movs.forEach(function (m) { if (m.produtoId === p.id) hist.push({ data: m.data, ts: m.criadoEm, tipo: m.tipo === 'entrada' ? 'Entrada' : 'Ajuste', det: m.tipo === 'entrada' ? (m.fornecedor || '') : (m.motivo || ''), qtds: m.qtds || {} }); });
  c.vendas.forEach(function (v) { v.itens.forEach(function (it) { if (it.produtoId !== p.id) return; var q = {}; q[it.tam] = v.ok ? -it.qtd : 0; hist.push({ data: v.data, ts: v.criadoEm, tipo: 'Venda #' + nVenda(v.numero), det: v.ok ? brl(it.preco * it.qtd) : 'cancelada', qtds: q, venda: v.id }); }); });
  hist.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : (a.ts < b.ts ? 1 : -1); });
  h += '<h3>Histórico</h3>' + tabela([
    { t: 'Data', v: function (x) { return '<span class="num">' + dbr(x.data) + '</span>'; } },
    { t: 'Movimento', v: function (x) { return '<b>' + esc(x.tipo) + '</b>' + (x.det ? '<span class="sub">' + esc(x.det) + '</span>' : ''); } },
    { t: 'Tamanhos', v: function (x) { return '<span class="raias-t">' + Object.keys(x.qtds).map(function (t) { var q = x.qtds[t]; return '<span class="raia' + (q < 0 ? ' zero' : '') + '"><i>' + esc(t) + '</i><b>' + (q > 0 ? '+' : '') + q + '</b></span>'; }).join('') + '</span>'; } }],
    hist.slice(0, 60).map(function (x, i) { x.id = i; return x; }), { vazio: 'Sem movimentações.' });
  return h;
}

// =============================================================================
// DESPESAS
// =============================================================================
PAG.despesas = function (c) {
  var mes = ui.mes, st = ui.f.dst || '', q = norm(ui.f.dq), h = c.hoje;
  var doMes = despesasDoMes(c, mes), vencidasTodas = c.despesas.filter(function (x) { return x.situacao === 'Vencida'; });
  var lista = (st === 'vencidas' ? vencidasTodas : doMes).filter(function (x) {
    if (st === 'abertas' && x.paga) return false;
    if (st === 'pagas' && !x.paga) return false;
    if (ui.f.dcat && x.categoria !== ui.f.dcat) return false;
    return !q || norm([x.descricao, x.categoria, x.obs].join(' ')).indexOf(q) >= 0;
  });
  var tot = soma(doMes, function (x) { return x.valor; }), pago = soma(doMes.filter(function (x) { return x.paga; }), function (x) { return x.valor; });
  var venc = soma(vencidasTodas, function (x) { return x.valor; }), merc = soma(doMes.filter(function (x) { return x.categoria === MERC; }), function (x) { return x.valor; });
  var porCat = {}; doMes.forEach(function (x) { porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor; });
  var cats = Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; });
  registrarCsv('despesas', 'despesas-' + mes, ['Descrição', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Paga em', 'Forma', 'Observação'],
    lista.map(function (x) { return [x.descricao, x.categoria, dbr(x.vencimento), brlNum(x.valor), x.situacao, x.pagaEm ? dbr(x.pagaEm) : '', x.forma, x.obs]; }));
  var cols = [
    { t: 'Despesa', c: 'quebra', v: function (x) { return '<b>' + esc(x.descricao) + '</b><span class="sub">' + esc(x.categoria) + (x.grupo ? ' · repete todo mês' : '') + '</span>'; } },
    { t: 'Vencimento', v: function (x) { return '<span class="num">' + dbr(x.vencimento) + '</span>' + (x.paga ? '<span class="sub">paga em ' + dcurta(x.pagaEm) + '</span>' : x.situacao === 'Vencida' ? '<span class="sub neg">há ' + plural(difDias(h, x.vencimento), 'dia', 'dias') + '</span>' : ''); } },
    { t: 'Situação', v: function (x) { return pill(x.situacao, SIT_PILL[x.situacao]); } },
    { t: 'Valor', c: 'dir', v: function (x) { return '<b class="num">' + brl(x.valor) + '</b>'; } },
    { t: '', c: 'dir', v: function (x) { return x.paga ? '' : '<button class="btn mini pri" data-a="pagarDesp" data-id="' + esc(x.id) + '" data-w>Pagar</button>'; } }];
  return cabecalho('Financeiro', 'Despesas', 'Contas da loja pelo mês de vencimento. Compras de mercadoria entram no caixa, mas no lucro aparecem como custo das peças vendidas.',
    mesNav() + '<button class="btn pri" data-a="novaDespesa" data-w>' + ic('mais') + 'Nova despesa</button>' + botaoCsv('despesas')) +
    '<div class="tiles">' + tile('Total do mês', brl(tot), plural(doMes.length, 'conta', 'contas') + (merc ? ' · ' + brl(merc) + ' em mercadoria' : '')) + tile('Pago', brl(pago), pct(pago, tot) + ' do total') +
    tile('A pagar no mês', brl(tot - pago), plural(doMes.filter(function (x) { return !x.paga; }).length, 'conta em aberto', 'contas em aberto')) +
    tile('Vencidas', '<span class="' + (venc ? 'neg' : '') + '">' + brl(venc) + '</span>', venc ? plural(vencidasTodas.length, 'conta atrasada', 'contas atrasadas') + ' (todos os meses)' : 'nenhuma conta atrasada') + '</div>' +
    '<div class="grade21"><div style="display:flex;flex-direction:column;gap:14px;min-width:0">' +
    '<div class="filtros">' + filtroTexto('dq', 'Buscar', 'Descrição ou observação') + filtroSel('dcat', 'Categoria', [['', 'Todas']].concat(c.cfg.categoriasDespesa)) + '</div>' +
    chipsFiltro('dst', [['', 'Todas do mês'], ['abertas', 'A pagar'], ['pagas', 'Pagas'], ['vencidas', 'Vencidas', vencidasTodas.length]]) +
    tabela(cols, lista, { acao: 'editarDesp', vazio: 'Nenhuma despesa ' + (st === 'vencidas' ? 'vencida.' : 'em ' + esc(mesNome(mes)) + (st || q || ui.f.dcat ? ' com estes filtros.' : '.')) + (podeEscrever() && !st ? ' <button class="btn link" data-a="novaDespesa">Lançar uma despesa</button>' : ''),
      rodape: lista.length ? '<td colspan="3">' + plural(lista.length, 'despesa', 'despesas') + '</td><td class="dir num">' + brl(soma(lista, function (x) { return x.valor; })) + '</td><td></td>' : '' }) +
    '</div>' + bloco('Por categoria', esc(mesTitulo(mes)), barrasH(cats.map(function (k) { return { rot: k, v: porCat[k], txt: brl(porCat[k]), tip: k + ': ' + brl(porCat[k]) }; }), 'Nenhuma despesa no mês.')) + '</div>';
};

// =============================================================================
// RESULTADO
// =============================================================================
PAG.resultado = function (c) {
  var mes = ui.mes, r = resultadoMes(c, mes), cfg = c.cfg, semTaxas = !PAGAMENTOS.some(function (p) { return taxaDe(cfg, p) > 0; });
  var porCat = {}; r.listaOper.forEach(function (x) { porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor; });
  var linhas = [], csv = [];
  function L(t, v, cls, sub) { linhas.push('<div class="' + (cls || '') + '">' + esc(t) + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="num dir ' + (cls === 'tot' || cls === 'final' ? cls : '') + (v < 0 && (cls === 'tot' || cls === 'final') ? ' neg' : '') + '">' + brl(v) + '</div>'); csv.push([t, brlNum(v)]); }
  L('Vendas brutas', r.subtotal, '', plural(r.n, 'venda', 'vendas') + ' · ' + plural(r.pecas, 'peça', 'peças'));
  if (r.desconto) L('− Descontos', -r.desconto, 'sub2');
  L('Vendas líquidas', r.total, 'tot');
  L('− Taxas da maquininha', -r.taxas, 'sub2', semTaxas ? 'cadastre as taxas em Ajustes' : 'estimadas pelas taxas cadastradas');
  L('− Custo das peças vendidas', -r.cmv, 'sub2', 'pelo custo de cada produto no dia da venda');
  L('Lucro bruto', r.lucroBruto, 'tot', r.total ? 'margem de ' + pct(r.lucroBruto, r.total) : '');
  Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; }).forEach(function (k) { L('− ' + k, -porCat[k], 'sub2'); });
  if (!r.listaOper.length) L('− Despesas', 0, 'sub2', 'nenhuma despesa lançada no mês');
  L('Lucro do mês', r.lucro, 'final');
  registrarCsv('dre', 'resultado-' + mes, ['Linha', 'Valor (R$)'], csv);
  var caixa = '<div class="demonst"><div>+ Entrou das vendas<small>vendas líquidas menos taxas</small></div><div class="num dir">' + brl(r.caixaEntrou) + '</div>' +
    '<div class="sub2">− Saiu em contas pagas<small>todas as despesas pagas no mês, inclusive mercadoria</small></div><div class="num dir">' + brl(-r.caixaSaiu) + '</div>' +
    '<div class="tot">Sobrou no caixa</div><div class="num dir tot ' + (r.caixa < 0 ? 'neg' : 'pos') + '">' + brl(r.caixa) + '</div></div>' +
    '<p class="fraco" style="font-size:12.5px">O lucro mostra se a loja ganha dinheiro com o que vende. O caixa mostra o dinheiro que de fato entrou e saiu no mês; ele fica menor que o lucro em meses de compra de estoque.</p>';
  // 6 meses
  var grupos = [];
  for (var i = 5; i >= 0; i--) { var k = addMes(mes, -i), x = resultadoMes(c, k); grupos.push({ rot: mesCurto(k), a: x.total / 100, b: x.lucro / 100, destaque: k === mes, tip: mesTitulo(k) + '\nVendas: ' + brl(x.total) + '\nLucro: ' + brl(x.lucro) }); }
  var graf = grafMeses(grupos, { alt: 240, fracao: 1.75 / 2.75, fmt: function (v) { return brlCurto(v * 100); }, titulo: 'Vendas e lucro nos últimos 6 meses' }) + '<div class="legenda"><span><i style="background:var(--bar)"></i>Vendas líquidas</span><span><i style="background:var(--pos)"></i>Lucro do mês</span><span><i style="background:var(--bad)"></i>Prejuízo</span></div>';
  // quebras
  var vm = vendasDoMes(c, mes).filter(function (v) { return v.ok; }), pp = {}, cn = {}, ct = {};
  vm.forEach(function (v) { pp[v.pagamento] = (pp[v.pagamento] || 0) + v.total; cn[v.canal || '—'] = (cn[v.canal || '—'] || 0) + v.total; v.itens.forEach(function (it) { var p = c.pIdx[it.produtoId], k = p ? p.categoria || 'Sem categoria' : 'Sem categoria'; if (!ct[k]) ct[k] = { v: 0, q: 0 }; ct[k].v += it.qtd * it.preco; ct[k].q += it.qtd; }); });
  function bar(obj) { return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).map(function (k) { return { rot: k, v: obj[k], txt: brl(obj[k]) + ' <span class="fraco">· ' + pct(obj[k], r.total) + '</span>', tip: k + ': ' + brl(obj[k]) }; }); }
  var catItens = Object.keys(ct).sort(function (a, b) { return ct[b].v - ct[a].v; }).map(function (k) { return { rot: k, v: ct[k].v, txt: brl(ct[k].v) + ' <span class="fraco">· ' + ct[k].q + ' pç</span>', tip: k + ': ' + plural(ct[k].q, 'peça', 'peças') }; });
  var pv = {}; vm.forEach(function (v) { var k = v.vendedorNome || 'Não identificado'; if (!pv[k]) pv[k] = { v: 0, n: 0 }; pv[k].v += v.total; pv[k].n++; });
  var vendItens = Object.keys(pv).sort(function (a, b) { return pv[b].v - pv[a].v; }).map(function (k) { return { rot: k, v: pv[k].v, txt: brl(pv[k].v) + ' <span class="fraco">· ' + plural(pv[k].n, 'venda', 'vendas') + '</span>', tip: k + ': ' + brl(pv[k].v) }; });
  return cabecalho('Financeiro', 'Resultado', 'O lucro do mês e o dinheiro que entrou e saiu, calculados a partir das vendas e despesas registradas.', mesNav() + botaoCsv('dre', 'Exportar resultado') + '<button class="btn mini" data-a="ir" data-p="historico">Alterações nas vendas</button>') +
    (semTaxas && r.n ? '<div class="nota atencao">As taxas da maquininha ainda não foram cadastradas, então o lucro está um pouco maior que o real. <button class="btn link" data-a="ir" data-p="ajustes">Cadastrar taxas</button></div>' : '') +
    '<div class="tiles">' + tile('Vendas líquidas', brl(r.total), plural(r.n, 'venda', 'vendas') + (metaDoMes(cfg, mes) ? ' · ' + pct(r.total, metaDoMes(cfg, mes)) + ' da meta de ' + brl(metaDoMes(cfg, mes)) : '')) + tile('Lucro bruto', brl(r.lucroBruto), r.total ? 'margem de ' + pct(r.lucroBruto, r.total) : '—') + tile('Despesas', brl(r.despesas), 'sem compras de mercadoria') +
    tile('Lucro do mês', '<span class="' + (r.lucro < 0 ? 'neg' : 'pos') + '">' + brl(r.lucro) + '</span>', r.total ? pct(r.lucro, r.total) + ' das vendas' : '—') + '</div>' +
    '<div class="grade2">' + bloco('Demonstrativo', esc(mesTitulo(mes)), '<div class="demonst">' + linhas.join('') + '</div>') + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">' + bloco('Caixa do mês', esc(mesTitulo(mes)), caixa) +
    bloco('Por forma de pagamento', 'Vendas concluídas no mês', barrasH(bar(pp))) + '</div></div>' +
    '<div class="grade21">' + bloco('Últimos 6 meses', 'Vendas líquidas e lucro de cada mês', graf) + bloco('Por canal', 'Onde a venda aconteceu', barrasH(bar(cn))) + '</div>' +
    (pode('equipe') ? '<div class="grade2">' + bloco('Por categoria de produto', 'Valor vendido e peças no mês', barrasH(catItens)) + bloco('Por vendedor', 'Vendas concluídas no mês, para conferir comissões', barrasH(vendItens, 'Nenhuma venda no mês.')) + '</div>'
      : bloco('Por categoria de produto', 'Valor vendido e peças no mês', barrasH(catItens)));
};

// =============================================================================
// AJUSTES
// =============================================================================
PAG.ajustes = function (c) {
  var cfg = c.cfg, d = D();
  var total = COLECOES.reduce(function (s, k) { return s + Object.keys(d[k] || {}).length; }, 0);
  var taxas = '<div class="campos">' + PAGAMENTOS.map(function (p, i) { return '<label>' + esc(p) + ' (%)<input type="text" inputmode="decimal" class="din" id="cfg_taxa_' + i + '" value="' + esc(rv('cfg_taxa_' + i, pctTxt(taxaDe(cfg, p)))) + '"' + (podeEscrever() ? '' : ' disabled') + '></label>'; }).join('') + '</div>' +
    '<div class="acoes" data-w><button class="btn pri" data-a="salvarTaxas">Salvar taxas</button></div>';
  var metas = cfg.metas || {}, atualM = c.hoje.slice(0, 7), mesSel = ui.metaMes || atualM, opMeses = [];
  for (var im = -6; im <= 12; im++) opMeses.push(addMes(atualM, im));
  Object.keys(metas).concat([mesSel]).forEach(function (k) { if (opMeses.indexOf(k) < 0) opMeses.push(k); });
  opMeses.sort();
  var linhasMeta = Object.keys(metas).filter(function (k) { return metas[k] > 0; }).sort().reverse().map(function (k) { return { id: k, meta: metas[k], vend: resumoVendas(vendasDoMes(c, k)).total }; });
  var tabMetas = tabela([
    { t: 'Mês', v: function (m) { return '<b>' + esc(mesTitulo(m.id)) + '</b>' + (m.id === atualM ? ' ' + pill('Mês atual', 'ok') : m.id > atualM ? ' ' + pill('Futuro') : ''); } },
    { t: 'Meta', c: 'dir', v: function (m) { return '<span class="num">' + brl(m.meta) + '</span>'; } },
    { t: 'Vendido', c: 'dir', v: function (m) { return '<span class="num">' + brl(m.vend) + '</span>'; } },
    { t: 'Atingido', v: function (m) { return '<div class="meta" style="margin:0;min-width:150px"><div class="trilho"><i style="width:' + Math.min(100, m.vend / m.meta * 100).toFixed(1) + '%"></i></div><span><b>' + pct(m.vend, m.meta) + '</b>' + (m.vend >= m.meta ? ' · meta batida' : '') + '</span></div>'; } },
    { t: '', c: 'dir', v: function (m) { return '<span style="display:inline-flex;gap:6px" data-w><button class="btn mini" data-a="editarMeta" data-m="' + m.id + '">Editar</button><button class="btn mini per" data-a="removerMeta" data-m="' + m.id + '">Remover</button></span>'; } }],
    linhasMeta, { vazio: 'Nenhuma meta cadastrada por mês ainda.' });
  var blocoMetas = bloco('Metas de vendas', 'Escolha o mês de referência e informe a meta. Ela aparece na Visão geral e no Resultado desse mês.',
    '<div class="campos"><label>Mês da meta<select id="cfg_meta_mes"' + (podeEscrever() ? '' : ' disabled') + '>' + opcoes(opMeses.map(function (k) { return [k, mesTitulo(k) + (metas[k] > 0 ? ' · meta ' + brl(metas[k]) : '')]; }), mesSel) + '</select></label>' +
    '<label>Meta de vendas de ' + esc(mesNome(mesSel)) + ' (R$)<input type="text" inputmode="decimal" class="din" id="cfg_meta_valor" value="' + esc(rv('cfg_meta_valor', metas[mesSel] > 0 ? brlNum(metas[mesSel]) : '')) + '" placeholder="Ex.: 20.000,00"' + (podeEscrever() ? '' : ' disabled') + '>' +
      (metas[mesSel] > 0 ? '' : cfg.meta ? '<small>Sem meta própria: vale a meta padrão de ' + brl(cfg.meta) + '.</small>' : '<small>Este mês ainda não tem meta.</small>') + '</label></div>' +
    '<div class="acoes" data-w><button class="btn pri" data-a="salvarMeta">Salvar meta de ' + esc(mesTitulo(mesSel).toLowerCase()) + '</button></div>' + tabMetas +
    '<div class="campos"><label class="larga">Meta padrão (R$)<input type="text" inputmode="decimal" class="din" id="cfg_meta" value="' + esc(rv('cfg_meta', cfg.meta ? brlNum(cfg.meta) : '')) + '" placeholder="Sem meta padrão"' + (podeEscrever() ? '' : ' disabled') + '><small>Opcional. Usada nos meses que não têm meta própria.</small></label></div>' +
    '<div class="acoes" data-w><button class="btn" data-a="salvarMetaPadrao">Salvar meta padrão</button></div>');
  var lj = cfg.loja || {}, dis = podeEscrever() ? '' : ' disabled';
  function cl(id, rot, v0, ph, larga) { return '<label' + (larga ? ' class="larga"' : '') + '>' + rot + '<input type="text" id="cfg_loja_' + id + '" value="' + esc(rv('cfg_loja_' + id, v0 || '')) + '" placeholder="' + esc(ph || '') + '" maxlength="120"' + dis + '></label>'; }
  var blocoRecibo = bloco('Dados da loja no recibo', 'Aparecem no recibo de venda entregue ao cliente. Preencha só o que quiser mostrar.',
    '<div class="campos">' + cl('nome', 'Nome da loja *', lj.nome, 'Racce') + cl('cnpj', 'CNPJ (opcional)', lj.cnpj, '00.000.000/0000-00') +
    cl('endereco', 'Endereço', lj.endereco, 'Rua, número · bairro') + cl('cidade', 'Cidade e estado', lj.cidade, 'Cidade · UF') +
    cl('whatsapp', 'WhatsApp da loja', lj.whatsapp, '(00) 00000-0000') + cl('instagram', 'Instagram', lj.instagram, '@racceloja') + cl('horario', 'Horário de funcionamento', lj.horario, '08h às 19h', true) +
    '<label class="larga">Política de troca<textarea id="cfg_loja_troca" maxlength="300"' + dis + '>' + esc(rv('cfg_loja_troca', lj.troca || '')) + '</textarea><small>Aparece em destaque no recibo. Deixe em branco para não mostrar.</small></label>' +
    cl('mensagem', 'Mensagem de agradecimento', lj.mensagem, 'Obrigado por escolher a Racce.', true) + '</div>' +
    '<div class="acoes"><button class="btn pri" data-a="salvarDadosLoja" data-w>Salvar dados da loja</button><button class="btn" data-a="rcExemplo">Ver um recibo</button></div>');
  var loja = '<div class="campos"><label class="larga">Estoque mínimo padrão (peças por tamanho)<input type="number" min="0" step="1" id="cfg_min" value="' + esc(rv('cfg_min', String(cfg.estoqueMinimo))) + '"' + (podeEscrever() ? '' : ' disabled') + '><small>Cada produto pode ter o seu próprio mínimo.</small></label></div>' +
    '<div class="acoes" data-w><button class="btn pri" data-a="salvarLoja">Salvar</button></div>';
  var listas = '<div class="campos"><label>Categorias de produto<textarea id="cfg_cp" rows="8"' + (podeEscrever() ? '' : ' disabled') + '>' + esc(rv('cfg_cp', cfg.categoriasProduto.join('\n'))) + '</textarea><small>Uma por linha.</small></label>' +
    '<label>Categorias de despesa<textarea id="cfg_cd" rows="8"' + (podeEscrever() ? '' : ' disabled') + '>' + esc(rv('cfg_cd', cfg.categoriasDespesa.join('\n'))) + '</textarea><small>Uma por linha. "' + MERC + '" é fixa.</small></label>' +
    '<label class="larga">Canais de venda<input type="text" id="cfg_canais" value="' + esc(rv('cfg_canais', cfg.canais.join(', '))) + '"' + (podeEscrever() ? '' : ' disabled') + '><small>Separe por vírgula.</small></label></div>' +
    '<div class="acoes" data-w><button class="btn pri" data-a="salvarListas">Salvar listas</button></div>';
  var cc = verCustos();
  registrarCsv('itens', 'itens-vendidos', ['Nº venda', 'Data', 'Produto', 'Cor', 'Tamanho', 'Qtd.', 'Preço unitário', 'Preço de tabela'].concat(cc ? ['Custo unitário'] : []).concat(['Pagamento', 'Canal', 'Vendedor', 'Situação']),
    [].concat.apply([], c.vendas.map(function (v) { return v.itens.map(function (it) { return [nVenda(v.numero), dbr(v.data), it.nome, it.cor, it.tam, it.qtd, brlNum(it.preco), brlNum(it.precoTabela !== undefined ? it.precoTabela : it.preco)].concat(cc ? [brlNum(it.custo)] : []).concat([v.pagamento, v.canal, v.vendedorNome || '', v.ok ? 'Concluída' : 'Cancelada']); }); })));
  registrarCsv('todasVendas', 'vendas-completo', ['Nº', 'Data', 'Hora', 'Itens', 'Peças', 'Subtotal', 'Desconto', 'Total', 'Pagamento', 'Parcelas', 'Canal', 'Cliente', 'Vendedor', 'Situação'],
    c.vendas.map(function (v) { return [nVenda(v.numero), dbr(v.data), horaDe(v.criadoEm), resumoItens(v), v.pecas, brlNum(v.subtotal), brlNum(v.desconto), brlNum(v.total), v.pagamento, v.parcelas || 1, v.canal, v.cliente, v.vendedorNome || '', v.ok ? 'Concluída' : 'Cancelada']; }));
  registrarCsv('todasDespesas', 'despesas-completo', ['Descrição', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Paga em', 'Forma', 'Observação'],
    c.despesas.map(function (x) { return [x.descricao, x.categoria, dbr(x.vencimento), brlNum(x.valor), x.situacao, x.pagaEm ? dbr(x.pagaEm) : '', x.forma, x.obs]; }));
  registrarCsv('estoqueAj', 'estoque', ['Produto', 'Cor', 'Código', 'Categoria', 'Público', 'Tamanho', 'Quantidade', 'Custo', 'Preço'],
    [].concat.apply([], c.produtos.map(function (p) { return p.grade.map(function (g) { return [p.nome, p.cor, p.ref, p.categoria, p.publico, g.t, g.q, brlNum(p.custo), brlNum(p.preco)]; }); })));
  var acesso = S.modo === 'exemplo' ? 'Você está no modo de exemplo: as alterações ficam só nesta tela e somem ao sair.' :
    'Os dados ficam no banco de dados da loja, no Supabase, e aparecem na hora em qualquer aparelho. Cada pessoa entra com o próprio e-mail e senha e só vê e faz o que a função dela permite. Essa conferência é feita no servidor, e não apenas na tela.';
  var copia = S.modo === 'real' ? bloco('Cópia dos dados', 'Arquivo com produtos, estoque, vendas, histórico, despesas e ajustes, para guardar fora do sistema. Não inclui senhas.',
    '<div class="acoes"><button class="btn pri" data-a="baixarBackup">' + ic('baixar') + 'Baixar cópia dos dados (JSON)</button></div>' +
    '<p class="fraco" style="font-size:13px">Os backups automáticos do banco ficam no painel do Supabase. Esta cópia é uma garantia extra: guarde-a num local seguro, porque ela contém dados de clientes (LGPD).</p>') : '';
  return cabecalho('Loja', 'Ajustes', 'Taxas, metas, listas, dados do recibo e exportação.') +
    '<div class="grade2">' + bloco('Taxas da maquininha', 'Percentual cobrado em cada forma de pagamento. Entra no cálculo do lucro das vendas registradas daqui em diante.', taxas) + bloco('Estoque mínimo', 'Quando um tamanho chega a este número, ele aparece em "Repor estoque".', loja) + '</div>' + blocoMetas + blocoRecibo +
    bloco('Listas', '', listas) +
    '<div class="grade2">' + bloco('Exportar dados', 'Arquivos CSV para abrir no Excel ou no Planilhas Google.', '<div class="acoes">' + botaoCsv('todasVendas', 'Vendas') + botaoCsv('itens', 'Itens vendidos') + botaoCsv('estoqueAj', 'Estoque') + botaoCsv('todasDespesas', 'Despesas') + '</div>') +
    bloco('Onde os dados ficam', '', '<p>' + esc(acesso) + '</p><p class="fraco" style="font-size:13px">' + milhar(total) + ' registros' + (S.atualizadoEm ? ' · atualizado às ' + horaDe(new Date(S.atualizadoEm).toISOString()) : '') + '.</p>' +
      (S.modo !== 'exemplo' ? '<div class="acoes"><button class="btn" data-a="atualizar">Atualizar agora</button><button class="btn" data-a="verExemplo">Ver com dados de exemplo</button></div>' : '')) + '</div>' + copia;
};

// =============================================================================
// USUÁRIOS
// =============================================================================
PAG.usuarios = function (c) {
  var us = listaUsuarios().sort(function (a, b) { return (a.ativo === false ? 1 : 0) - (b.ativo === false ? 1 : 0); });
  var nomesPag = {}; PAINEIS.forEach(function (p) { nomesPag[p[0]] = p[1]; });
  var cols = [
    { t: 'Pessoa', c: 'quebra', v: function (u) { return '<span class="pessoa"><span class="avatar claro">' + esc(iniciais(u.nome)) + '</span><span><b>' + esc(u.nome) + '</b>' + (u.id === meuId() ? ' <span class="fraco">(você)</span>' : '') + '<span class="sub">' + esc(u.email || '') + '</span></span></span>'; } },
    { t: 'Função', v: function (u) { return esc(nomePerfil(u)); } },
    { t: 'Painéis liberados', c: 'quebra', v: function (u) {
      if (u.papel === 'admin') return 'Todos<span class="sub">mais usuários e ajustes</span>';
      var ex = extrasDe(u).map(function (k) { var e = EXTRAS.filter(function (x) { return x[0] === k; })[0]; return e ? e[3] : ''; }).filter(Boolean);
      return esc(paginasDe(u).map(function (k) { return nomesPag[k]; }).filter(Boolean).join(', ')) + (ex.length ? '<span class="sub">' + esc(ex.join(' · ')) + '</span>' : '');
    } },
    { t: 'Último acesso', v: function (u) { return u.ultimoAcesso ? '<span class="num">' + dbr(u.ultimoAcesso.slice(0, 10)) + '</span><span class="sub">' + horaDe(u.ultimoAcesso) + '</span>' : '<span class="fraco">nunca entrou</span>'; } },
    { t: 'Situação', v: function (u) { return (u.ativo === false ? pill('Inativo') : pill('Ativo', 'ok')) + (u.ativo !== false && u.trocarSenha ? '<span class="sub">aguardando criar a senha</span>' : ''); } }];
  var cab = '<tr><th>Função</th>' + PAINEIS.map(function (p) { return '<th>' + esc(p[1]) + '</th>'; }).join('') + EXTRAS.map(function (e) { return '<th>' + esc(e[3]) + '</th>'; }).join('') + '<th>Usuários e ajustes</th></tr>';
  var linhas = PERFIS.filter(function (p) { return p[0] !== 'personalizado'; }).map(function (p) {
    var adm = p[0] === 'admin', sim = '<td>' + ic('check') + '<span class="sr">sim</span></td>', nao = '<td><span class="nao">—</span><span class="sr">não</span></td>';
    return '<tr><td><b>' + esc(p[1]) + '</b><span class="sub">' + esc(p[4]) + '</span></td>' + PAINEIS.map(function (x) { return adm || p[2].indexOf(x[0]) >= 0 ? sim : nao; }).join('') +
      EXTRAS.map(function (x) { return adm || p[3].indexOf(x[0]) >= 0 ? sim : nao; }).join('') + (adm ? sim : nao) + '</tr>';
  }).join('');
  return cabecalho('Equipe', 'Usuários', 'Cada pessoa entra com o próprio e-mail e senha e vê somente os painéis liberados para a função dela.', '<button class="btn pri" data-a="novoUsuario">' + ic('mais') + 'Novo usuário</button>') +
    (S.modo === 'exemplo' ? '<div class="nota atencao">Você está no modo de exemplo: usuários cadastrados aqui não são salvos. Para cadastrar a equipe de verdade, saia do exemplo e entre como administrador.</div>' : '') +
    tabela(cols, us, { acao: 'editarUsuario', vazio: 'Nenhum usuário cadastrado.' }) +
    bloco('O que cada função libera', 'Ao escolher a função no cadastro, os painéis abaixo já vêm marcados. Dá para ajustar pessoa por pessoa (a função passa a ser "Personalizado").', '<div class="rolagem"><table class="tb matriz"><thead>' + cab + '</thead><tbody>' + linhas + '</tbody></table></div>') +
    '<p class="fraco" style="font-size:12.5px;max-width:80ch">As permissões são conferidas no servidor a cada consulta e a cada gravação. Quem tem "Visão geral" ou "Resultado" também tem acesso aos números de todas as vendas, porque esses painéis somam a loja inteira. Para tirar o acesso de alguém, desative o usuário: a pessoa perde o acesso aos dados na hora.</p>';
};
function mesmaLista(a, b) { a = a || []; b = b || []; return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }
/** Mostra a senha temporária uma única vez, para o administrador entregar à pessoa. */
function mostrarSenhaTemporaria(nome, email, senha) {
  guardarFoco();
  $('#camadaConf').innerHTML = '<div class="veu" style="z-index:70"><div class="caixa" role="alertdialog" aria-modal="true" aria-labelledby="stTit"><h2 id="stTit" style="font-size:22px">Senha temporária de ' + esc(nome) + '</h2>' +
    '<p>Entregue pessoalmente a <b>' + esc(email) + '</b>. No primeiro acesso, o sistema pede para criar uma senha nova. Esta senha temporária não será mostrada de novo.</p>' +
    '<div class="senha-temp"><code id="stSenha">' + esc(senha) + '</code><button class="btn" data-a="copiarSenha">Copiar</button></div>' +
    '<p class="fraco" style="font-size:13px">Não envie a senha por e-mail ou mensagem em grupo. Se ela se perder, use "Redefinir senha" de novo.</p>' +
    '<div class="rodape"><button class="btn pri" data-a="fecharConf">Entendi</button></div></div></div>';
  var b = $('#camadaConf .btn.pri'); if (b) b.focus();
}
function formUsuario(u) {
  var novo = !u;
  var F = { papel: u ? u.papel : 'vendedor', paginas: u ? paginasDe(u).slice() : perfil('vendedor')[2].slice(), extras: u ? extrasDe(u).slice() : perfil('vendedor')[3].slice() };
  function htmlPags() {
    var adm = F.papel === 'admin';
    return '<div class="chk-grade">' + PAINEIS.map(function (p) { return '<label class="check"><input type="checkbox" data-pg="' + p[0] + '"' + (adm || F.paginas.indexOf(p[0]) >= 0 ? ' checked' : '') + (adm ? ' disabled' : '') + '><span>' + esc(p[1]) + '</span></label>'; }).join('') +
      (adm ? '<label class="check"><input type="checkbox" checked disabled><span>Usuários e ajustes</span></label>' : '') + '</div>';
  }
  function htmlExtras() {
    var adm = F.papel === 'admin';
    return '<div class="chk-grade">' + EXTRAS.map(function (e) { return '<label class="check"><input type="checkbox" data-ex="' + e[0] + '"' + (adm || F.extras.indexOf(e[0]) >= 0 ? ' checked' : '') + (adm ? ' disabled' : '') + '><span>' + esc(e[1]) + '<small>' + esc(e[2]) + '</small></span></label>'; }).join('') + '</div>';
  }
  var eu = !novo && u.id === meuId();
  abrirModal({
    olho: 'Equipe', titulo: novo ? 'Novo usuário' : u.nome, largo: true, botao: novo ? 'Cadastrar usuário' : 'Salvar',
    sucesso: novo ? null : 'Usuário alterado.',
    intro: novo ? '<p class="fraco">O sistema gera uma senha temporária para você entregar à pessoa. No primeiro acesso, ela cria a própria senha.</p>' : '',
    extra: !novo && !eu ? '<button type="button" class="btn per" data-a="redefinirSenha" style="margin-right:auto">Redefinir senha</button>' : '',
    html: function () {
      return '<label>Nome *<input type="text" id="us_nome" maxlength="60" value="' + esc(u ? u.nome : '') + '" placeholder="Ex.: Ana Souza" autocomplete="off"></label>' +
        '<label>E-mail para entrar *<input type="email" id="us_email" maxlength="254" value="' + esc(u ? u.email : '') + '" placeholder="Ex.: ana@email.com" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
        '<label class="larga">Função<select id="us_papel"' + (eu ? ' disabled' : '') + '>' + opcoes(PERFIS.map(function (p) { return [p[0], p[1]]; }), F.papel) + '</select><small id="usPapelDesc">' + esc(perfil(F.papel)[4]) + (eu ? ' Você não pode mudar a sua própria função.' : '') + '</small></label>' +
        '<div class="campo larga">Painéis que pode acessar<div id="usPags">' + htmlPags() + '</div></div>' +
        '<div class="campo larga">Permissões nas vendas<div id="usExtras">' + htmlExtras() + '</div></div>' +
        (novo ? '' : '<label class="check larga"><input type="checkbox" id="us_ativo"' + (u.ativo === false ? '' : ' checked') + (eu ? ' disabled' : '') + '> Usuário ativo (pode entrar no sistema)</label>');
    },
    aoMudar: function (ev) {
      var t = ev.target;
      if (t.id === 'us_papel') {
        F.papel = t.value; var pf = perfil(F.papel);
        if (pf[2]) { F.paginas = pf[2].slice(); F.extras = pf[3].slice(); }
        $('#usPags').innerHTML = htmlPags(); $('#usExtras').innerHTML = htmlExtras(); $('#usPapelDesc').textContent = pf[4];
        return;
      }
      if (t.dataset && (t.dataset.pg || t.dataset.ex)) {
        F.paginas = []; F.extras = [];
        document.querySelectorAll('#usPags input[data-pg]').forEach(function (i) { if (i.checked) F.paginas.push(i.dataset.pg); });
        document.querySelectorAll('#usExtras input[data-ex]').forEach(function (i) { if (i.checked) F.extras.push(i.dataset.ex); });
        var igual = PERFIS.filter(function (p) { return p[2] && mesmaLista(p[2], F.paginas) && mesmaLista(p[3], F.extras); })[0];
        F.papel = igual ? igual[0] : 'personalizado';
        $('#us_papel').value = F.papel; $('#usPapelDesc').textContent = perfil(F.papel)[4];
      }
    },
    acoes: {
      redefinirSenha: function () {
        confirmar('Redefinir a senha de ' + u.nome + '? A senha atual deixa de valer, a pessoa perde o acesso aos dados até criar uma senha nova e você recebe uma senha temporária para entregar a ela.', 'Redefinir senha', true).then(function (sim) {
          if (!sim) return;
          gravar(function () { return B.redefinirSenha(u.id); }).then(function (r) { fecharModal(); mostrarSenhaTemporaria(u.nome, u.email, r.senha_temporaria); }, function (e) { toast(e.message); });
        });
      }
    },
    enviar: function () {
      var nome = val('us_nome'); exigir(nome.length >= 2, 'Informe o nome, com pelo menos 2 letras.');
      var email = val('us_email').toLowerCase(); exigir(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), 'Informe um e-mail válido.');
      exigir(F.papel === 'admin' || F.paginas.length, 'Escolha pelo menos um painel.');
      var dados = { nome: nome, email: email, papel: F.papel, paginas: F.papel === 'personalizado' ? F.paginas.slice() : [], extras: F.papel === 'personalizado' ? F.extras.slice() : [] };
      if (novo) return gravar(function () { return B.criarUsuario(dados); }).then(function (r) { fecharModal(); mostrarSenhaTemporaria(nome, email, r.senha_temporaria); });
      dados.id = u.id; dados.ativo = eu ? true : !!val('us_ativo');
      return gravar(function () { return B.atualizarUsuario(dados); });
    }
  });
}

// =============================================================================
// Detalhe lateral
// =============================================================================
function renderDetalhe(c) {
  var d = ui.det, cx = $('#camadaDet'), h = '';
  c = c || calc();
  if (d) {
    if (d.t === 'venda') { var v = c.vendas.filter(function (x) { return x.id === d.id; })[0]; if (v) h = fichaVenda(v, c); }
    else if (d.t === 'produto') { var p = c.pIdx[d.id]; if (p) h = fichaProduto(p, c); }
    else if (d.t === 'cat') { var pc = c.pIdx[d.id]; if (pc && ui.venda) h = fichaCatalogo(pc, c); }
  }
  if (!h) { ui.det = null; cx.innerHTML = ''; return; }
  var rol = $('#camadaDet .veu'), topo = rol ? rol.scrollTop : 0;
  cx.innerHTML = '<div class="veu lado" data-a="fundoDet"><div class="caixa" role="dialog" aria-modal="true" aria-label="' + (d.t === 'venda' ? 'Detalhes da venda' : 'Detalhes do produto') + '">' + h + '</div></div>';
  $('#camadaDet .veu').scrollTop = topo;
  aplicarPermissoes($('#camadaDet'));
  if (d.t === 'produto' || d.t === 'cat') carregarFotoGrande(d.id);
}
function abrirDet(t, id) {
  var novo = !ui.det; if (novo) guardarFoco();
  ui.det = { t: t, id: id }; renderDetalhe();
  if (novo) { var f = $('#camadaDet .fechar'); if (f) f.focus(); }
}

// =============================================================================
// Formulários
// =============================================================================
function abrirModal(o) {
  if (!ui.modal) guardarFoco();
  ui.modal = o;
  $('#camadaForm').innerHTML = '<div class="veu"><div class="caixa' + (o.largo ? ' larga' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mTit"><header><div>' + (o.olho ? '<span class="olho">' + esc(o.olho) + '</span>' : '') + '<h2 id="mTit" style="margin-top:' + (o.olho ? '8px' : '0') + '">' + esc(o.titulo) + '</h2></div><button type="button" class="fechar" data-a="fecharModal" aria-label="Fechar">' + ic('x') + '</button></header>' +
    (o.intro ? '<div>' + o.intro + '</div>' : '') + '<form id="mForm" novalidate><div class="campos">' + o.html() + '</div><div class="erro-form" id="mErro" hidden style="margin-top:14px"></div>' +
    '<div class="rodape" style="margin-top:16px">' + (o.extra || '') + '<button type="button" class="btn" data-a="fecharModal">Cancelar</button><button type="submit" class="btn ' + (o.perigo ? 'per cheio' : 'pri') + '">' + esc(o.botao || 'Salvar') + '</button></div></form></div></div>';
  var prim = $('#mForm input:not([type=checkbox]):not([disabled]), #mForm select, #mForm textarea'); if (prim) prim.focus();
  if (o.aoAbrir) o.aoAbrir();
}
function fecharModal() { ui.modal = null; $('#camadaForm').innerHTML = ''; devolverFoco(); }
// ---------- acessibilidade dos diálogos: o Tab fica dentro do diálogo aberto e o foco volta ao fechar
var focoAntes = [];
function guardarFoco() { var a = document.activeElement; if (a && a !== document.body) focoAntes.push(a); }
function devolverFoco() { setTimeout(function () { while (focoAntes.length) { var el = focoAntes.pop(); if (el && document.contains(el) && el.offsetParent !== null) { el.focus(); return; } } }, 0); }
function dialogoAberto() { var l = ['#camadaConf .caixa', '#camadaForm .caixa', '#camadaDet .caixa']; for (var i = 0; i < l.length; i++) { var d = $(l[i]); if (d) return d; } return null; }
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Tab') return;
  var d = dialogoAberto(); if (!d) return;
  var f = Array.prototype.filter.call(d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'), function (x) { return x.offsetParent !== null; });
  if (!f.length) return;
  var prim = f[0], ult = f[f.length - 1];
  if (!d.contains(document.activeElement)) { ev.preventDefault(); prim.focus(); }
  else if (ev.shiftKey && document.activeElement === prim) { ev.preventDefault(); ult.focus(); }
  else if (!ev.shiftKey && document.activeElement === ult) { ev.preventDefault(); prim.focus(); }
});
function enviarModal() {
  var o = ui.modal; if (!o) return;
  var cx = $('#mErro'), bt = $('#mForm button[type=submit]');
  cx.hidden = true; bt.disabled = true;
  Promise.resolve().then(function () { return o.enviar(); }).then(function () {
    if (ui.modal === o) fecharModal();
    if (o.sucesso) toast(typeof o.sucesso === 'function' ? o.sucesso() : o.sucesso);
  }, function (e) {
    if (ui.modal !== o) return;
    var b = $('#mForm button[type=submit]'); if (b) b.disabled = false;
    var x = $('#mErro'); if (x) { x.textContent = (e && e.message) || String(e); x.hidden = false; }
  });
}
function val(id) { var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; }
function exigir(cond, msg) { if (!cond) throw new Error(msg); }
function dinheiro(id, rotulo, obrig) {
  var s = val(id); if (s === '') { exigir(!obrig, 'Informe ' + rotulo + '.'); return 0; }
  var n = parseBrl(s); exigir(!isNaN(n) && n >= 0, 'Valor inválido em ' + rotulo + '. Use o formato 1.234,56.'); return n;
}
var resolverConf = null;
function confirmar(msg, botao, perigo) {
  return new Promise(function (ok) {
    guardarFoco();
    resolverConf = ok;
    $('#camadaConf').innerHTML = '<div class="veu" style="z-index:70"><div class="caixa" role="alertdialog" aria-modal="true" aria-labelledby="cTit"><h2 id="cTit" style="font-size:22px">Confirme</h2><p>' + esc(msg) + '</p><div class="rodape"><button class="btn" data-a="conf" data-v="0">Voltar</button><button class="btn ' + (perigo ? 'per cheio' : 'pri') + '" data-a="conf" data-v="1">' + esc(botao || 'Confirmar') + '</button></div></div></div>';
    $('#camadaConf button[data-v="0"]').focus();
  });
}

// ---------- produto
function formProduto(p, duplicar) {
  var c = calc(), cfg = c.cfg, novo = !p || duplicar;
  var F = { tams: p ? (p.tamanhos || []).slice() : ['P', 'M', 'G', 'GG'], ini: {}, foto: undefined, erroFoto: '', fotoAtual: p && !duplicar && fotosAtuais()[p.id] ? fotosAtuais()[p.id] : null };
  function htmlFotoPrev() { var src = F.foto ? F.foto.thumb : F.fotoAtual; return src ? '<img src="' + esc(src) + '" alt="">' : ic('cabide') + 'Sem foto'; }
  function htmlFoto() {
    return '<div class="campo larga">Foto do produto<div class="foto-campo"><div class="foto-grande" id="pfFotoBox">' + htmlFotoPrev() + '</div><div class="acoes"><button type="button" class="btn" data-a="pfEscolher">' + ic('camera') + 'Escolher foto</button>' +
      '<button type="button" class="btn per" id="pfSemFoto" data-a="pfSemFoto"' + (F.fotoAtual ? '' : ' hidden') + '>Remover foto</button><small>JPG ou PNG. No celular, dá para tirar a foto na hora.</small></div><input type="file" id="pf_foto" accept="image/*" hidden></div></div>';
  }
  function fotoDepois(id) {
    if (F.foto === undefined) return null;
    return (F.foto === null ? B.removerFoto(id) : B.salvarFoto(id, F.foto)).then(function () { if (F.foto) FOTO_G[id] = F.foto.foto; else delete FOTO_G[id]; }, function (e) { F.erroFoto = e.message; });
  }
  function opcTam() { var todos = TAMANHOS_SUGERIDOS.slice(); F.tams.forEach(function (t) { if (todos.indexOf(t) < 0) todos.push(t); }); return todos; }
  function htmlTams() { return opcTam().map(function (t) { return '<button type="button" data-a="pfTam" data-t="' + esc(t) + '" aria-pressed="' + (F.tams.indexOf(t) >= 0) + '">' + esc(t) + '</button>'; }).join(''); }
  function htmlIni() {
    if (!novo) return '';
    if (!F.tams.length) return '<p class="fraco">Escolha os tamanhos acima.</p>';
    return '<div class="gradeq">' + F.tams.map(function (t, i) { return '<label><span>' + esc(t) + '</span><input type="number" min="0" step="1" id="pf_ini_' + i + '" data-t="' + esc(t) + '" value="' + esc(F.ini[t] || '') + '" placeholder="0"></label>'; }).join('') + '</div>';
  }
  function guardarIni() { document.querySelectorAll('[id^="pf_ini_"]').forEach(function (el) { F.ini[el.dataset.t] = el.value; }); }
  function margem(cu, pr) { if (cu === undefined) { cu = parseBrl(val('pf_custo')); pr = parseBrl(val('pf_preco')); } if (isNaN(pr) || pr <= 0) return 'Informe o preço para ver a margem.'; cu = isNaN(cu) ? 0 : cu; return 'Margem de <b>' + margemTxt(cu, pr) + '</b> · lucro de <b>' + brl(pr - cu) + '</b> por peça, antes de taxas e despesas.'; }
  abrirModal({
    olho: novo ? (duplicar ? 'Nova cor de ' + p.nome : 'Novo produto') : 'Editar produto', titulo: novo ? 'Cadastrar produto' : p.nome, largo: true, botao: novo ? 'Cadastrar' : 'Salvar',
    sucesso: function () { return F.erroFoto ? (novo ? 'Produto cadastrado, mas a foto não foi salva. ' : 'Produto salvo, mas a foto não foi salva. ') + F.erroFoto : (novo ? 'Produto cadastrado.' : 'Produto alterado.'); },
    html: function () {
      return htmlFoto() + '<label class="larga">Nome do produto *<input type="text" id="pf_nome" maxlength="80" value="' + esc(p ? p.nome : '') + '" placeholder="Ex.: Legging cós alto"></label>' +
        '<label>Cor<input type="text" id="pf_cor" maxlength="40" value="' + esc(p && !duplicar ? p.cor : '') + '" placeholder="Ex.: Preta"></label>' +
        '<label>Código ou referência<input type="text" id="pf_ref" maxlength="30" value="' + esc(p && !duplicar ? p.ref : '') + '" placeholder="Opcional"></label>' +
        '<label>Categoria<select id="pf_cat">' + opcoes(cfg.categoriasProduto, p ? p.categoria : cfg.categoriasProduto[0]) + '</select></label>' +
        '<label>Público<select id="pf_pub">' + opcoes(PUBLICOS, p ? p.publico : 'Unissex') + '</select></label>' +
        '<label class="larga">Descrição e características<textarea id="pf_desc" maxlength="300" placeholder="Ex.: cós alto, tecido de compressão, bolso lateral para o celular">' + esc(p ? p.descricao || '' : '') + '</textarea><small>Aparece no catálogo da Nova venda.</small></label>' +
        '<label>Custo por peça (R$)<input type="text" inputmode="decimal" class="din" id="pf_custo" value="' + (p ? brlNum(p.custo) : '') + '" placeholder="0,00"><small>Quanto a loja paga ao fornecedor.</small></label>' +
        '<label>Preço de venda (R$) *<input type="text" inputmode="decimal" class="din" id="pf_preco" value="' + (p ? brlNum(p.preco) : '') + '" placeholder="0,00"></label>' +
        '<p class="larga fraco" id="pfMargem" style="font-size:13px">' + (p ? margem(p.custo || 0, p.preco) : 'Informe o preço para ver a margem.') + '</p>' +
        '<div class="campo larga">Tamanhos *<div class="tams" id="pfTams">' + htmlTams() + '</div><div style="display:flex;gap:8px;margin-top:4px"><input type="text" id="pf_outro" maxlength="12" placeholder="Outro tamanho (ex.: 46, Infantil)" aria-label="Outro tamanho"><button type="button" class="btn" data-a="pfTamOutro">Incluir</button></div></div>' +
        '<label>Estoque mínimo por tamanho<input type="number" min="0" step="1" id="pf_min" value="' + (p && p.minimo !== null && p.minimo !== undefined ? esc(p.minimo) : '') + '" placeholder="Padrão: ' + cfg.estoqueMinimo + '"><small>Abaixo disso o tamanho aparece em "Repor estoque".</small></label>' +
        (novo ? '<div class="larga" style="display:flex;flex-direction:column;gap:8px"><span class="olho">Peças que já estão na loja</span><div id="pfIni">' + htmlIni() + '</div></div>' : '');
    },
    aoMudar: function (ev) {
      if (ev.target.id === 'pf_foto') {
        if (ev.type !== 'change') return;
        var arq = ev.target.files && ev.target.files[0]; ev.target.value = '';
        if (!arq) return;
        processarFoto(arq).then(function (d) { F.foto = d; $('#pfFotoBox').innerHTML = htmlFotoPrev(); $('#pfSemFoto').hidden = false; }, function (e) { toast(e.message); });
        return;
      }
      if (ev.target.id === 'pf_custo' || ev.target.id === 'pf_preco') $('#pfMargem').innerHTML = margem();
    },
    acoes: {
      pfTam: function (ds) { guardarIni(); var i = F.tams.indexOf(ds.t); if (i >= 0) F.tams.splice(i, 1); else F.tams.push(ds.t); var ordem = opcTam(); F.tams.sort(function (a, b) { return ordem.indexOf(a) - ordem.indexOf(b); }); $('#pfTams').innerHTML = htmlTams(); if ($('#pfIni')) $('#pfIni').innerHTML = htmlIni(); },
      pfEscolher: function () { var i = $('#pf_foto'); if (i) i.click(); },
      pfSemFoto: function () { F.foto = F.fotoAtual ? null : undefined; F.fotoAtual = null; $('#pfFotoBox').innerHTML = htmlFotoPrev(); $('#pfSemFoto').hidden = true; },
      pfTamOutro: function () { var t = val('pf_outro'); if (!t) return; guardarIni(); if (F.tams.indexOf(t) < 0) F.tams.push(t); $('#pf_outro').value = ''; $('#pfTams').innerHTML = htmlTams(); if ($('#pfIni')) $('#pfIni').innerHTML = htmlIni(); }
    },
    enviar: function () {
      guardarIni();
      var nome = val('pf_nome'); exigir(nome, 'Informe o nome do produto.');
      var preco = dinheiro('pf_preco', 'o preço de venda', true); exigir(preco > 0, 'Informe o preço de venda.');
      var custo = dinheiro('pf_custo', 'o custo', false);
      exigir(F.tams.length, 'Escolha pelo menos um tamanho.');
      var minS = val('pf_min'), minimo = minS === '' ? null : Number(minS);
      exigir(minimo === null || (isFinite(minimo) && minimo >= 0 && Math.round(minimo) === minimo), 'O estoque mínimo precisa ser um número inteiro.');
      var doc = { nome: nome, cor: val('pf_cor'), ref: val('pf_ref'), categoria: val('pf_cat'), publico: val('pf_pub'), descricao: val('pf_desc'), custo: custo, preco: preco, tamanhos: F.tams.slice(), minimo: minimo };
      // sem permissão para ver custos, o custo não chega à tela; mantém o valor gravado
      if (!novo && p.custo === undefined) delete doc.custo;
      var qtds = {};
      if (novo) F.tams.forEach(function (t) { var n = Number(F.ini[t] || 0); exigir(isFinite(n) && n >= 0 && Math.round(n) === n, 'A quantidade inicial de ' + t + ' precisa ser um número inteiro.'); if (n > 0) qtds[t] = n; });
      return gravar(function () { return B.salvarProduto(novo ? null : p.id, doc, novo ? qtds : null).then(function (id) { return fotoDepois(id || p.id); }); });
    }
  });
}

// ---------- entrada de mercadoria
function formEntrada(pid) {
  var c = calc(), ativos = c.produtos.filter(function (p) { return p.ativo; });
  if (!ativos.length) { formProduto(null); return; }
  var E = { pid: pid && c.pIdx[pid] ? pid : ativos[0].id };
  function prod() { return calc().pIdx[E.pid]; }
  function htmlGrade() {
    var p = prod(); if (!p) return '';
    return '<div class="gradeq">' + (p.tamanhos || []).map(function (t, i) { var q = (calc().est[p.id] || {})[t] || 0; return '<label><span>' + esc(t) + '</span><em>tem ' + q + '</em><input type="number" min="0" step="1" id="en_q_' + i + '" data-t="' + esc(t) + '" placeholder="0"></label>'; }).join('') + '</div>';
  }
  function totalPecas() { var n = 0; document.querySelectorAll('[id^="en_q_"]').forEach(function (el) { var x = Number(el.value || 0); if (isFinite(x) && x > 0) n += Math.round(x); }); return n; }
  function preview() {
    var n = totalPecas(), cu = parseBrl(val('en_custo')); cu = isNaN(cu) ? 0 : cu;
    var el = $('#enTotal'); if (el) el.innerHTML = plural(n, 'peça', 'peças') + ' · total de <b>' + brl(n * cu) + '</b>';
    var dv = $('#enDespBox'); if (dv) dv.hidden = !val('en_desp');
  }
  abrirModal({
    olho: 'Mercadoria', titulo: 'Entrada de mercadoria', largo: true, botao: 'Registrar entrada', sucesso: 'Entrada registrada. O estoque foi atualizado.',
    html: function () {
      var p = prod();
      return '<label class="larga">Produto<select id="en_prod">' + opcoes(ativos.map(function (x) { return [x.id, nomeP(x) + (x.ref ? ' (' + x.ref + ')' : '')]; }), E.pid) + '</select></label>' +
        '<div class="larga" id="enGrade">' + htmlGrade() + '</div>' +
        '<label>Custo por peça (R$)<input type="text" inputmode="decimal" class="din" id="en_custo" value="' + (p ? brlNum(p.custo) : '') + '"></label>' +
        '<label>Data da chegada<input type="date" id="en_data" value="' + hoje() + '" max="' + hoje() + '"></label>' +
        '<label>Fornecedor<input type="text" id="en_forn" maxlength="80" placeholder="Opcional"></label>' +
        '<label>Observação<input type="text" id="en_obs" maxlength="200" placeholder="Ex.: nota fiscal 1234"></label>' +
        '<p class="larga" id="enTotal" style="font-size:14px">0 peças · total de <b>R$ 0,00</b></p>' +
        '<label class="check larga"><input type="checkbox" id="en_atualizar" checked> Usar este custo no cadastro do produto</label>' +
        (pode('despesas') ? '<label class="check larga"><input type="checkbox" id="en_desp"> Lançar o valor como conta a pagar ao fornecedor</label>' : '') +
        '<div class="larga campos" id="enDespBox" hidden><label>Vencimento<input type="date" id="en_venc" value="' + somarDias(hoje(), 30) + '"></label><label>Situação<select id="en_paga">' + opcoes([['', 'A pagar'], ['sim', 'Já paga na chegada']], '') + '</select></label></div>';
    },
    aoAbrir: preview,
    aoMudar: function (ev) {
      if (ev.target.id === 'en_prod') { E.pid = ev.target.value; var p = prod(); $('#enGrade').innerHTML = htmlGrade(); $('#en_custo').value = p ? brlNum(p.custo) : ''; }
      preview();
    },
    enviar: function () {
      var p = prod(); exigir(p, 'Escolha o produto.');
      var qtds = {}, n = 0;
      document.querySelectorAll('[id^="en_q_"]').forEach(function (el) { if (el.value === '') return; var x = Number(el.value); exigir(isFinite(x) && x >= 0 && Math.round(x) === x, 'As quantidades precisam ser números inteiros.'); if (x > 0) { qtds[el.dataset.t] = x; n += x; } });
      exigir(n > 0, 'Informe a quantidade que chegou em pelo menos um tamanho.');
      var custo = dinheiro('en_custo', 'o custo', false), data = val('en_data'); exigir(dataValida(data), 'Informe a data da chegada.');
      var dados = { produtoId: p.id, qtds: qtds, custoUnit: custo, fornecedor: val('en_forn'), obs: val('en_obs'), data: data, atualizarCusto: !!val('en_atualizar') };
      if (val('en_desp') && custo * n > 0) {
        var venc = val('en_venc'), paga = val('en_paga') === 'sim'; exigir(paga || dataValida(venc), 'Informe o vencimento da conta.');
        dados.despesa = { vencimento: venc, paga: paga };
      }
      return gravar(function () { return B.registrarEntrada(dados); });
    }
  });
}

// ---------- ajuste (contagem)
function formAjuste(pid) {
  var c = calc(), ativos = c.produtos.filter(function (p) { return p.ativo; });
  if (!ativos.length) { formProduto(null); return; }
  var A = { pid: pid && c.pIdx[pid] ? pid : ativos[0].id };
  function prod() { return calc().pIdx[A.pid]; }
  function htmlGrade() {
    var p = prod(); if (!p) return '';
    return '<div class="gradeq">' + p.grade.map(function (g, i) { return '<label><span>' + esc(g.t) + '</span><em id="aj_d_' + i + '">no sistema: ' + g.q + '</em><input type="number" step="1" id="aj_q_' + i + '" data-t="' + esc(g.t) + '" data-atual="' + g.q + '" value="' + g.q + '"></label>'; }).join('') + '</div>';
  }
  function difs() {
    document.querySelectorAll('[id^="aj_q_"]').forEach(function (el, i) {
      var a = Number(el.dataset.atual), n = Number(el.value), d = $('#aj_d_' + i);
      if (!d) return; if (el.value === '' || !isFinite(n) || n === a) { d.textContent = 'no sistema: ' + a; d.style.color = ''; return; }
      d.textContent = (n - a > 0 ? '+' : '') + (n - a) + ' (era ' + a + ')'; d.style.color = n - a < 0 ? 'var(--bad)' : 'var(--pos)';
    });
  }
  abrirModal({
    olho: 'Mercadoria', titulo: 'Ajustar estoque', largo: true, botao: 'Salvar ajuste', sucesso: 'Estoque ajustado.',
    intro: '<p class="fraco">Digite a quantidade real de cada tamanho, depois de contar as peças. A diferença fica registrada com o motivo.</p>',
    html: function () {
      return '<label class="larga">Produto<select id="aj_prod">' + opcoes(ativos.map(function (x) { return [x.id, nomeP(x) + (x.ref ? ' (' + x.ref + ')' : '')]; }), A.pid) + '</select></label>' +
        '<div class="larga" id="ajGrade">' + htmlGrade() + '</div>' +
        '<label>Motivo<select id="aj_motivo">' + opcoes(MOTIVOS_AJUSTE, MOTIVOS_AJUSTE[0]) + '</select></label>' +
        '<label>Data<input type="date" id="aj_data" value="' + hoje() + '" max="' + hoje() + '"></label>' +
        '<label class="larga">Observação<input type="text" id="aj_obs" maxlength="200" placeholder="Opcional"></label>';
    },
    aoMudar: function (ev) { if (ev.target.id === 'aj_prod') { A.pid = ev.target.value; $('#ajGrade').innerHTML = htmlGrade(); } difs(); },
    enviar: function () {
      var p = prod(); exigir(p, 'Escolha o produto.');
      var qtds = {}, n = 0;
      document.querySelectorAll('[id^="aj_q_"]').forEach(function (el) { exigir(el.value !== '', 'Preencha a quantidade de todos os tamanhos.'); var x = Number(el.value); exigir(isFinite(x) && Math.round(x) === x, 'As quantidades precisam ser números inteiros.'); var d = x - Number(el.dataset.atual); if (d) { qtds[el.dataset.t] = d; n++; } });
      exigir(n > 0, 'Nenhuma quantidade foi alterada.');
      var data = val('aj_data'); exigir(dataValida(data), 'Informe a data.');
      return gravar(function () { return B.registrarAjuste({ produtoId: p.id, qtds: qtds, motivo: val('aj_motivo'), obs: val('aj_obs'), data: data }); });
    }
  });
}

// ---------- despesa
function formDespesa(x) {
  var c = calc(), cfg = c.cfg, novo = !x;
  abrirModal({
    olho: 'Financeiro', titulo: novo ? 'Nova despesa' : 'Editar despesa', botao: novo ? 'Lançar' : 'Salvar', sucesso: function () { return novo ? 'Despesa lançada.' : 'Despesa alterada.'; },
    extra: !novo && podeEscrever() ? '<button type="button" class="btn per" data-a="excluirDesp" style="margin-right:auto">' + ic('lixo') + 'Excluir</button>' : '',
    html: function () {
      return '<label class="larga">Descrição *<input type="text" id="de_desc" maxlength="120" value="' + esc(x ? x.descricao : '') + '" placeholder="Ex.: Aluguel da loja"></label>' +
        '<label>Categoria<select id="de_cat">' + opcoes(cfg.categoriasDespesa, x ? x.categoria : cfg.categoriasDespesa[0]) + '</select></label>' +
        '<label>Valor (R$) *<input type="text" inputmode="decimal" class="din" id="de_valor" value="' + (x ? brlNum(x.valor) : '') + '" placeholder="0,00"></label>' +
        '<label>Vencimento *<input type="date" id="de_venc" value="' + esc(x ? x.vencimento : hoje()) + '"></label>' +
        '<label>Forma de pagamento<select id="de_forma">' + opcoes([''].concat(['Pix', 'Boleto', 'Dinheiro', 'Débito', 'Cartão de crédito', 'Débito automático', 'Transferência']), x ? x.forma : '') + '</select></label>' +
        '<label class="check larga"><input type="checkbox" id="de_pagachk"' + (x && x.pagaEm ? ' checked' : '') + '> Já está paga</label>' +
        '<div class="larga campos" id="dePagaBox"' + (x && x.pagaEm ? '' : ' hidden') + '><label>Data do pagamento<input type="date" id="de_pagaem" value="' + esc(x && x.pagaEm ? x.pagaEm : hoje()) + '" max="' + hoje() + '"></label></div>' +
        (novo ? '<label class="check larga"><input type="checkbox" id="de_rep"> Repetir todo mês (conta fixa)</label><div class="larga campos" id="deRepBox" hidden><label>Por quantos meses, contando este<input type="number" min="2" max="24" step="1" id="de_meses" value="12"><small>Cria uma conta por mês, com o mesmo dia de vencimento.</small></label></div>' : '') +
        '<label class="larga">Observação<input type="text" id="de_obs" maxlength="200" value="' + esc(x ? x.obs : '') + '"></label>';
    },
    aoMudar: function (ev) {
      if (ev.target.id === 'de_pagachk') $('#dePagaBox').hidden = !ev.target.checked;
      if (ev.target.id === 'de_rep') $('#deRepBox').hidden = !ev.target.checked;
    },
    acoes: {
      excluirDesp: function () { confirmar('Excluir a despesa "' + x.descricao + '"? Ela some do financeiro.', 'Excluir', true).then(function (sim) { if (!sim) return; gravar(function () { return B.excluirDespesa(x.id); }).then(function () { fecharModal(); toast('Despesa excluída.'); }, function (e) { toast(e.message); }); }); }
    },
    enviar: function () {
      var desc = val('de_desc'); exigir(desc, 'Informe a descrição.');
      var valor = dinheiro('de_valor', 'o valor', true); exigir(valor > 0, 'Informe o valor da despesa.');
      var venc = val('de_venc'); exigir(dataValida(venc), 'Informe o vencimento.');
      var paga = val('de_pagachk'), pagaEm = paga ? val('de_pagaem') : null; exigir(!paga || dataValida(pagaEm), 'Informe a data do pagamento.');
      var doc = { descricao: desc, categoria: val('de_cat'), valor: valor, vencimento: venc, pagaEm: pagaEm, forma: val('de_forma'), obs: val('de_obs') };
      if (!novo) return gravar(function () { return B.salvarDespesa(x.id, doc, 1); });
      var rep = val('de_rep'), meses = rep ? Number(val('de_meses')) : 1;
      exigir(!rep || (isFinite(meses) && meses >= 2 && meses <= 24 && Math.round(meses) === meses), 'Informe de 2 a 24 meses.');
      return gravar(function () { return B.salvarDespesa(null, doc, meses); });
    }
  });
}
function formPagar(x) {
  abrirModal({
    olho: 'Pagar conta', titulo: x.descricao, botao: 'Marcar como paga', sucesso: 'Despesa marcada como paga.',
    intro: '<p><b class="num" style="font-size:18px">' + brl(x.valor) + '</b> <span class="fraco">· vence ' + dbr(x.vencimento) + '</span></p>',
    html: function () {
      return '<label>Data do pagamento<input type="date" id="pg_data" value="' + hoje() + '" max="' + hoje() + '"></label>' +
        '<label>Forma de pagamento<select id="pg_forma">' + opcoes([''].concat(['Pix', 'Boleto', 'Dinheiro', 'Débito', 'Cartão de crédito', 'Débito automático', 'Transferência']), x.forma || '') + '</select></label>';
    },
    enviar: function () { var d = val('pg_data'); exigir(dataValida(d), 'Informe a data do pagamento.'); exigir(d <= hoje(), 'A data do pagamento não pode ser futura.'); return gravar(function () { return B.pagarDespesa(x.id, d, val('pg_forma')); }); }
  });
}

// =============================================================================
// Exportação
// =============================================================================
function baixarCsv(k) {
  var x = exportes[k]; if (!x) return;
  // Proteção contra fórmulas maliciosas: um texto que começa com = + - @ vira texto no Excel (números negativos ficam como estão).
  var cel = function (v) {
    v = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?[\d.]+(,\d+)?$/.test(v)) v = "'" + v;
    return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  var txt = [x.cab].concat(x.linhas).map(function (l) { return l.map(cel).join(';'); }).join('\r\n');
  var nome = 'racce-' + x.nome + '-' + hoje() + '.csv';
  if (!baixarArquivo(nome, '﻿' + txt, 'text/csv;charset=utf-8')) mostrarCsv(nome, txt);
}
function baixarArquivo(nome, conteudo, tipo) {
  try {
    var url = URL.createObjectURL(new Blob([conteudo], { type: tipo })), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Arquivo baixado: ' + nome); return true;
  } catch (e) { return false; }
}
/** Cópia dos dados carregados (o que este usuário pode ver), em JSON. Não contém senhas. */
function baixarBackup() {
  var d = limpo(D()); delete d.verCustos;
  var copia = { app: 'racce-gestao', versao: 3, geradoEm: new Date().toISOString(), geradoPor: S.perfil ? S.perfil.email : '', dados: d };
  baixarArquivo('racce-copia-dos-dados-' + hoje() + '.json', JSON.stringify(copia), 'application/json');
}
function mostrarCsv(nome, txt) {
  $('#camadaConf').innerHTML = '<div class="veu" style="z-index:70"><div class="caixa larga" role="dialog" aria-modal="true" aria-label="' + esc(nome) + '"><header><h2 style="font-size:22px">' + esc(nome) + '</h2><button class="fechar" data-a="fecharConf" aria-label="Fechar">' + ic('x') + '</button></header>' +
    '<p class="fraco">Aqui não foi possível baixar o arquivo. Copie o texto e cole no Excel ou no Planilhas Google (separador: ponto e vírgula).</p><textarea id="csvTxt" readonly style="min-height:260px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">' + esc(txt) + '</textarea>' +
    '<div class="rodape"><button class="btn pri" data-a="copiarCsv">Copiar</button></div></div></div>';
}

// =============================================================================
// Dados de exemplo (somente em memória)
// =============================================================================
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function montarExemplo(dias) {
  dias = dias || 48;
  var rnd = mulberry32(20261016), H = hoje();
  function r(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function sorteio(lista, pesos) { var t = 0, i; for (i = 0; i < pesos.length; i++) t += pesos[i]; var x = rnd() * t; for (i = 0; i < lista.length; i++) { x -= pesos[i]; if (x <= 0) return lista[i]; } return lista[lista.length - 1]; }
  function ts(iso, hh, mm) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], hh, mm, r(0, 59)).toISOString(); }
  var ex = { produtos: {}, movs: {}, vendas: {}, despesas: {}, config: { taxas: { 'Pix': 0, 'Dinheiro': 0, 'Débito': 1.37, 'Crédito à vista': 3.15, 'Crédito parcelado': 4.99 }, meta: 2000000, estoqueMinimo: 2 } };
  var seq = 0; function nid(p) { seq++; return p + String(seq).padStart(5, '0'); }
  function pessoa(nome, login, papel, dias, hh) { var pf = perfil(papel); return { nome: nome, email: login + '@exemplo.com', papel: papel, paginas: pf[2] ? pf[2].slice() : [], extras: pf[3] ? pf[3].slice() : [], ativo: true, criadoEm: ts(somarDias(H, -60), 9, 0), ultimoAcesso: ts(somarDias(H, -dias), hh, 12), por: null }; }
  ex.usuarios = { 'u-admin': pessoa('Administrador da loja', 'admin', 'admin', 2, 18), 'u-camila': pessoa('Camila Rocha', 'camila', 'gerente', 0, 9), 'u-ana': pessoa('Ana Souza', 'ana', 'vendedor', 0, 10),
    'u-bruno': pessoa('Bruno Lima', 'bruno', 'vendedor', 1, 9), 'u-diego': pessoa('Diego Alves', 'diego', 'estoquista', 3, 14), 'u-paula': pessoa('Paula Mendes', 'paula', 'financeiro', 5, 11) };
  var LISTA = [
    ['Legging cós alto', 'Leggings', 'Feminino', 'Preta', 'LG-1042', 7800, 18990, ['PP', 'P', 'M', 'G', 'GG'], [6, 14, 16, 12, 6], 10],
    ['Legging cós alto', 'Leggings', 'Feminino', 'Grafite', 'LG-1043', 7800, 18990, ['PP', 'P', 'M', 'G', 'GG'], [4, 8, 9, 7, 3], 6],
    ['Top nadador', 'Tops', 'Feminino', 'Preto', 'TP-2010', 4600, 11990, ['P', 'M', 'G'], [12, 16, 10], 8],
    ['Top nadador', 'Tops', 'Feminino', 'Névoa', 'TP-2011', 4600, 11990, ['P', 'M', 'G'], [5, 6, 4], 4],
    ['Camiseta dry', 'Camisetas', 'Unissex', 'Preta', 'CM-3001', 3500, 9990, ['P', 'M', 'G', 'GG'], [12, 22, 20, 10], 12],
    ['Camiseta dry', 'Camisetas', 'Unissex', 'Branca', 'CM-3002', 3500, 9990, ['P', 'M', 'G', 'GG'], [10, 16, 14, 6], 7],
    ['Shorts 2 em 1', 'Shorts e bermudas', 'Masculino', 'Preto', 'SH-4005', 5200, 13990, ['P', 'M', 'G', 'GG'], [8, 12, 12, 6], 6],
    ['Bermuda ciclista', 'Shorts e bermudas', 'Feminino', 'Preta', 'BC-4110', 4100, 10990, ['PP', 'P', 'M', 'G'], [4, 8, 8, 4], 5],
    ['Regata dry', 'Regatas', 'Masculino', 'Chumbo', 'RG-3150', 3000, 8990, ['P', 'M', 'G', 'GG'], [6, 10, 10, 5], 5],
    ['Jaqueta corta-vento', 'Jaquetas e moletons', 'Unissex', 'Preta', 'JQ-5001', 11500, 27990, ['P', 'M', 'G', 'GG'], [3, 5, 4, 2], 2],
    ['Conjunto top e legging', 'Conjuntos', 'Feminino', 'Volt', 'CJ-6002', 12000, 29990, ['P', 'M', 'G'], [3, 4, 3], 3],
    ['Meia cano médio (par)', 'Acessórios', 'Unissex', 'Branca', 'AC-7001', 900, 2990, ['Único'], [60], 9],
    ['Boné dry fit', 'Acessórios', 'Unissex', 'Preto', 'AC-7020', 2200, 6990, ['Único'], [14], 3]
  ];
  var est = {}, ids = [], pesos = [], d0 = somarDias(H, -(dias + 7));
  LISTA.forEach(function (l) {
    var id = nid('p'); ids.push(id); pesos.push(l[9]);
    var DESCS = { 'LG': 'Cós alto e largo que não enrola, tecido de compressão e bolso lateral para o celular.', 'TP': 'Costas nadador, sustentação média e bojo removível.', 'CM': 'Tecido leve que seca rápido, modelagem regular.',
      'SH': 'Short leve por fora e bermuda de compressão por dentro, com bolso traseiro.', 'BC': 'Cós alto, comprimento ciclista e tecido que não fica transparente no agachamento.', 'RG': 'Cava livre e tecido respirável para treinos intensos.',
      'JQ': 'Leve, com capuz e bolsos laterais. Dobra dentro do próprio bolso.', 'CJ': 'Top e legging na mesma cor, em tecido de compressão.', 'AC-7001': 'Cano médio com reforço no calcanhar e na ponta. Vendida em par.', 'AC-7020': 'Aba curva, tecido dry fit e regulagem traseira.' };
    ex.produtos[id] = { descricao: DESCS[l[4]] || DESCS[l[4].slice(0, 2)] || '', nome: l[0], categoria: l[1], publico: l[2], cor: l[3], ref: l[4], custo: l[5], preco: l[6], tamanhos: l[7], minimo: null, ativo: true, criadoEm: ts(d0, 9, 0), por: null };
    var fator = l[1] === 'Conjuntos' || l[1] === 'Jaquetas e moletons' ? 1 : 1.7, q = {}; l[7].forEach(function (t, i) { q[t] = Math.round(l[8][i] * fator); }); est[id] = Object.assign({}, q);
    ex.movs[nid('m')] = { produtoId: id, tipo: 'entrada', qtds: q, custoUnit: l[5], fornecedor: 'Estoque inicial', obs: '', data: d0, criadoEm: ts(d0, 9, 30), por: null };
  });
  var clientes = ['Ana Paula', 'Bruno', 'Carla', 'Diego', 'Fernanda', 'Gabriel', 'Júlia', 'Larissa', 'Marcos', 'Renata', 'Thiago', 'Vanessa'];
  var vendas = [], compras = [];
  for (var k = -dias; k <= 0; k++) {
    var dia = somarDias(H, k), ds = diaSemana(dia);
    if (dias > 60 && k < -30 && k % 21 === 0) {
      var nRep = 0, vRep = 0;
      ids.forEach(function (pid) {
        var pr = ex.produtos[pid], q = {}, n = 0;
        pr.tamanhos.forEach(function (t) { if (est[pid][t] < 6) { var add = pr.tamanhos.length === 1 ? 20 : 8; q[t] = add; est[pid][t] += add; n += add; } });
        if (n) { ex.movs[nid('m')] = { produtoId: pid, tipo: 'entrada', qtds: q, custoUnit: pr.custo, fornecedor: 'Confecção Ritmo', obs: 'Reposição', data: dia, criadoEm: ts(dia, 10, 0), por: null }; nRep += n; vRep += n * pr.custo; }
      });
      if (nRep) compras.push([dia, nRep, vRep]);
    }
    var repos = k === -22 ? [[ids[0], { P: 6, M: 8, G: 6 }, 'NF 2281'], [ids[4], { M: 10, G: 8 }, 'NF 2281'], [ids[2], { P: 4, M: 6 }, 'NF 2281']] : k === -9 ? [[ids[7], { P: 6, M: 6, G: 4 }, 'NF 2307'], [ids[5], { M: 8, G: 6 }, 'NF 2307']] : [];
    repos.forEach(function (x) {
      Object.keys(x[1]).forEach(function (t) { est[x[0]][t] += x[1][t]; });
      ex.movs[nid('m')] = { produtoId: x[0], tipo: 'entrada', qtds: x[1], custoUnit: ex.produtos[x[0]].custo, fornecedor: 'Confecção Ritmo', obs: x[2], data: dia, criadoEm: ts(dia, 10, 15), por: null };
    });
    if (ds === 0) continue;
    var n = k === 0 ? r(2, 3) : r(3, 6) + (ds === 6 ? 2 : 0);
    for (var s = 0; s < n; s++) {
      var nIt = sorteio([1, 2, 3], [62, 30, 8]), itens = [];
      for (var j = 0; j < nIt; j++) {
        var pid = sorteio(ids, pesos), p = ex.produtos[pid], livres = p.tamanhos.filter(function (t) { return est[pid][t] > 0; });
        if (!livres.length) continue;
        var tam = livres[r(0, livres.length - 1)], q = p.categoria === 'Acessórios' && rnd() < .3 ? 2 : 1;
        q = Math.min(q, est[pid][tam]); est[pid][tam] -= q;
        var ja = itens.filter(function (it) { return it.produtoId === pid && it.tam === tam; })[0];
        if (ja) ja.qtd += q; else itens.push({ produtoId: pid, nome: p.nome, cor: p.cor, tam: tam, qtd: q, preco: p.preco, custo: p.custo });
      }
      if (!itens.length) continue;
      var sub = soma(itens, function (it) { return it.qtd * it.preco; }), desc = rnd() < .12 ? Math.round(sub * .1 / 100) * 100 : 0;
      var pag = sorteio(PAGAMENTOS, [40, 8, 15, 25, 12]), hh = k === 0 ? r(9, Math.max(9, Math.min(19, new Date().getHours() - 1))) : r(9, 19);
      vendas.push({ data: dia, itens: itens, subtotal: sub, desconto: desc, total: sub - desc, pagamento: pag, parcelas: pag === 'Crédito parcelado' ? r(2, 6) : 1, recebido: 0,
        canal: sorteio(['Loja física', 'Site', 'Instagram', 'WhatsApp'], [64, 14, 12, 10]), cliente: rnd() < .3 ? clientes[r(0, clientes.length - 1)] : '', obs: '', status: 'ok', criadoEm: ts(dia, hh, r(0, 59)), por: sorteio(['u-ana', 'u-bruno', 'u-camila'], [46, 40, 14]) });
    }
  }
  var canc = vendas.filter(function (v) { return v.data === somarDias(H, -6) || v.data === somarDias(H, -5); })[0];
  if (canc) { canc.status = 'cancelada'; canc.motivoCancel = 'Cliente desistiu da compra na hora de trocar o tamanho.'; canc.canceladaEm = canc.criadoEm; }
  vendas.forEach(function (v) { ex.vendas[nid('v')] = v; });
  ex.historico = {};
  (function () {
    var idDe = function (o) { return Object.keys(ex.vendas).filter(function (k) { return ex.vendas[k] === o; })[0]; };
    var CAMILA = ['u-camila', 'Camila Rocha', 'Gerente'], ADMIN = ['u-admin', 'Administrador da loja', 'Administrador'];
    function depoisDe(v, min) { return new Date(Date.parse(v.criadoEm) + min * 60000).toISOString(); }
    function registro(v, tipo, motivo, antes, quem, em) {
      var depois = snapVenda(v), x = { tipo: tipo, vendaId: idDe(v), seq: (v.hist || 0) + 1, em: em, porId: quem[0], porNome: quem[1], porFuncao: quem[2], motivo: motivo, antes: antes, depois: depois };
      ex.historico[nid('h')] = x; v.hist = x.seq;
    }
    var entre = function (a, b) { return vendas.filter(function (v) { return v.status === 'ok' && v.data >= somarDias(H, a) && v.data <= somarDias(H, b); }); };
    // 1) tamanho lançado errado (e depois o nome da cliente)
    var e1 = entre(-12, -8).filter(function (v) { return v.itens.length === 1 && v.itens[0].qtd === 1 && !v.cliente; }).filter(function (v) {
      var it = v.itens[0], pr = ex.produtos[it.produtoId]; return pr && pr.tamanhos.some(function (t) { return t !== it.tam && (est[it.produtoId] || {})[t] > 2; });
    })[0];
    if (e1) {
      var it1 = e1.itens[0], pr1 = ex.produtos[it1.produtoId], novoT = pr1.tamanhos.filter(function (t) { return t !== it1.tam && est[it1.produtoId][t] > 2; })[0], velhoT = it1.tam, a1 = snapVenda(e1);
      it1.tam = novoT; est[it1.produtoId][velhoT]++; est[it1.produtoId][novoT]--;
      registro(e1, 'edicao', 'A cliente levou o tamanho ' + novoT + ', mas a venda foi lançada como ' + velhoT + ' por engano.', a1, CAMILA, depoisDe(e1, 26));
      var a1b = snapVenda(e1); e1.cliente = 'Juliana Prado';
      registro(e1, 'edicao', 'Dados do cliente; a cliente pediu para registrar o nome para fazer troca depois.', a1b, CAMILA, depoisDe(e1, 31));
    }
    // 2) forma de pagamento errada
    var e2 = entre(-20, -14).filter(function (v) { return v.pagamento === 'Pix' && v !== e1; })[0];
    if (e2) { var a2 = snapVenda(e2); e2.pagamento = 'Crédito à vista'; registro(e2, 'edicao', 'Pagamento lançado como Pix, mas foi no cartão de crédito. Conferido no extrato da maquininha.', a2, ADMIN, depoisDe(e2, 60 * 20)); }
    // 3) desconto não lançado
    var e3 = entre(-4, -2).filter(function (v) { return !v.desconto && v.subtotal >= 15000 && v !== e1 && v !== e2; })[0];
    if (e3) { var a3 = snapVenda(e3); e3.desconto = 2000; e3.total = e3.subtotal - 2000; registro(e3, 'edicao', 'Desconto não lançado: R$ 20,00 combinado com a cliente na hora do pagamento.', a3, CAMILA, depoisDe(e3, 42)); }
    // 4) o cancelamento que já existe nos dados
    if (canc) { canc.canceladaEm = depoisDe(canc, 15); canc.canceladaPor = CAMILA[1]; var a4 = Object.assign(snapVenda(canc), { status: 'ok' }); registro(canc, 'cancelamento', canc.motivoCancel, a4, CAMILA, canc.canceladaEm); }
  })();
  vendas.slice().sort(function (a, b) { return a.criadoEm < b.criadoEm ? -1 : 1; }).forEach(function (v, i) {
    v.numero = i + 1; v.versao = 1 + (v.hist || 0); delete v.hist; v.vendedorNome = (ex.usuarios[v.por] || {}).nome || '';
    v.taxaPct = ex.config.taxas[v.pagamento] || 0; v.itens.forEach(function (it) { it.precoTabela = it.preco; });
  });
  vendas.forEach(function (v) { var ed = Object.keys(ex.historico).map(function (k) { return ex.historico[k]; }).filter(function (x) { return x.vendaId && ex.vendas[x.vendaId] === v && x.tipo === 'edicao'; }); if (ed.length) { v.editadaEm = ed[ed.length - 1].em; v.editadaPor = ed[ed.length - 1].porNome; } });
  compras.forEach(function (cp) { var venc = somarDias(cp[0], 30), pago = venc < H; ex.despesas[nid('d')] = { descricao: 'Mercadoria: Confecção Ritmo (' + cp[1] + ' peças)', categoria: MERC, valor: cp[2], vencimento: venc, pagaEm: pago ? venc : null, forma: 'Boleto', obs: 'Reposição', grupo: null, criadoEm: ts(cp[0], 11, 0), por: null }; });
  if (dias > 60) {
    [[ids[2], 'Defeito', 'Costura aberta na alça', -12], [ids[4], 'Contagem do estoque', 'Contagem mensal', -30], [ids[11], 'Brinde ou uso da loja', 'Brinde para cliente', -5]].forEach(function (a) {
      var pr = ex.produtos[a[0]], t = pr.tamanhos.filter(function (x) { return est[a[0]][x] > 0; })[0]; if (!t) return;
      var q = {}; q[t] = -1; est[a[0]][t]--;
      ex.movs[nid('m')] = { produtoId: a[0], tipo: 'ajuste', qtds: q, motivo: a[1], obs: a[2], data: somarDias(H, a[3]), criadoEm: ts(somarDias(H, a[3]), 17, 0), por: null };
    });
  }
  // despesas: mês passado, este mês e o próximo
  var mesH = H.slice(0, 7), diaH = +H.slice(8, 10);
  var FIXAS = [['Aluguel da loja', 'Aluguel', 280000, 10], ['Salário da vendedora', 'Funcionários', 190000, 5], ['Energia', 'Energia e água', 41250, 15], ['Internet e telefone', 'Internet e telefone', 12990, 20],
    ['Impulsionamento no Instagram', 'Marketing e redes sociais', 40000, 8], ['Sistema e maquininha', 'Maquininha e sistemas', 8900, 12], ['Contador', 'Contabilidade', 35000, 7]];
  (dias > 60 ? [-5, -4, -3, -2, -1, 0, 1] : [-1, 0, 1]).forEach(function (off) {
    var mk = addMes(mesH, off);
    FIXAS.forEach(function (f) {
      if (off === 1 && f[1] !== 'Aluguel' && f[1] !== 'Funcionários') return;
      var d = Math.min(f[3], fimMes(mk)); if (off === 0 && f[1] === 'Energia e água') d = Math.max(1, diaH - 1);
      var venc = mk + '-' + pad2(d), pago = off < 0 || (off === 0 && venc < H && f[1] !== 'Energia e água');
      ex.despesas[nid('d')] = { descricao: f[0], categoria: f[1], valor: f[2] + (f[1] === 'Energia e água' ? off * 2380 : 0), vencimento: venc, pagaEm: pago ? venc : null, forma: f[1] === 'Funcionários' ? 'Pix' : 'Boleto', obs: '', grupo: 'g-' + f[1], criadoEm: ts(somarDias(H, -40), 8, 0), por: null };
    });
  });
  var vendMesPass = soma(vendas.filter(function (v) { return v.data.slice(0, 7) === addMes(mesH, -1) && v.status === 'ok'; }), function (v) { return v.total; });
  ex.despesas[nid('d')] = { descricao: 'Simples Nacional', categoria: 'Impostos', valor: Math.round(vendMesPass * .06), vencimento: mesH + '-' + pad2(Math.min(20, fimMes(mesH))), pagaEm: null, forma: 'Boleto', obs: 'Sobre as vendas de ' + mesNome(addMes(mesH, -1)), grupo: null, criadoEm: ts(somarDias(H, -10), 8, 0), por: null };
  ex.despesas[nid('d')] = { descricao: 'Sacolas e papel de seda', categoria: 'Embalagens', valor: 18600, vencimento: mesH + '-03', pagaEm: mesH + '-03', forma: 'Pix', obs: '', grupo: null, criadoEm: ts(somarDias(H, -12), 8, 0), por: null };
  var rep = somarDias(H, -22), totRep = (6 + 8 + 6) * 7800 + 18 * 3500 + 10 * 4600;
  ex.despesas[nid('d')] = { descricao: 'Mercadoria: Confecção Ritmo (48 peças)', categoria: MERC, valor: totRep, vencimento: somarDias(rep, 30), pagaEm: null, forma: 'Boleto', obs: 'NF 2281', grupo: null, criadoEm: ts(rep, 11, 0), por: null };
  var rep2 = somarDias(H, -9);
  ex.despesas[nid('d')] = { descricao: 'Mercadoria: Confecção Ritmo (30 peças)', categoria: MERC, valor: 16 * 4100 + 14 * 3500, vencimento: rep2, pagaEm: rep2, forma: 'Pix', obs: 'NF 2307', grupo: null, criadoEm: ts(rep2, 11, 0), por: null };
  var mx = H.slice(0, 7); ex.config.metas = {}; ex.config.metas[addMes(mx, -2)] = 2200000; ex.config.metas[addMes(mx, -1)] = 2400000; ex.config.metas[mx] = 2500000;
  return ex;
}
var FORMAS = {
  camiseta: 'M34 14 L44 10 Q50 18 56 10 L66 14 L88 32 L79 45 L69 39 L69 112 L31 112 L31 39 L21 45 L12 32 Z',
  regata: 'M38 10 L44 10 Q50 26 56 10 L62 10 Q64 30 72 38 L72 112 L28 112 L28 38 Q36 30 38 10 Z',
  top: 'M36 28 L42 28 Q50 50 58 28 L64 28 Q66 48 76 56 L76 84 Q50 90 24 84 L24 56 Q34 48 36 28 Z',
  legging: 'M30 12 L70 12 L74 116 L58 116 L51 46 L49 46 L42 116 L26 116 Z',
  shorts: 'M28 30 L72 30 L78 92 L56 92 L50 56 L44 92 L22 92 Z',
  bermuda: 'M30 24 L70 24 L72 98 L54 98 L50 58 L46 98 L28 98 Z',
  jaqueta: 'M34 14 L44 10 L50 16 L56 10 L66 14 L86 34 L94 100 L82 102 L72 52 L70 112 L30 112 L28 52 L18 102 L6 100 L14 34 Z',
  meia: 'M42 14 L60 14 L60 78 Q60 86 68 90 L80 96 Q90 102 84 112 L56 112 Q42 112 42 98 Z',
  bone: 'M22 74 Q22 38 50 36 Q78 38 78 74 Z M70 70 L96 76 Q98 82 92 82 L66 80 Z'
};
var CORES_FOTO = { 'Preta': '#1A1A1C', 'Preto': '#1A1A1C', 'Grafite': '#3A3A3E', 'Névoa': '#D2D2D8', 'Branca': '#FFFFFF', 'Branco': '#FFFFFF', 'Chumbo': '#2C2C2F', 'Volt': '#CCFF3D' };
function formaDe(p) {
  var c = p.categoria || '', n = norm(p.nome);
  if (c === 'Leggings') return ['legging']; if (c === 'Tops') return ['top']; if (c === 'Regatas') return ['regata'];
  if (c === 'Shorts e bermudas') return [n.indexOf('ciclista') >= 0 ? 'bermuda' : 'shorts']; if (c === 'Jaquetas e moletons') return ['jaqueta'];
  if (c === 'Conjuntos') return ['top', 'legging']; if (n.indexOf('meia') >= 0) return ['meia']; if (n.indexOf('bone') >= 0) return ['bone'];
  return ['camiseta'];
}
function fotoFicticia(p) {
  var W = 600, H = 750, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var cx = cv.getContext('2d'), cor = CORES_FOTO[p.cor] || '#1A1A1C', formas = formaDe(p);
  cx.fillStyle = '#F4F4F5'; cx.fillRect(0, 0, W, H);
  cx.fillStyle = 'rgba(0,0,0,0.07)'; cx.beginPath(); cx.ellipse(W / 2, H * 0.86, W * 0.3, 18, 0, 0, Math.PI * 2); cx.fill();
  formas.forEach(function (f, i) {
    cx.save();
    if (formas.length > 1) { cx.translate(i === 0 ? 40 : 300, i === 0 ? 120 : 40); cx.scale(2.6, 2.6 * (i === 0 ? 1 : 1.05)); }
    else { cx.translate(W * 0.08, H * 0.06); cx.scale(5.5, 5.5); }
    var pt = new Path2D(FORMAS[f]);
    cx.fillStyle = cor; cx.fill(pt);
    cx.lineWidth = 0.9; cx.strokeStyle = cor === '#FFFFFF' || cor === '#D2D2D8' || cor === '#CCFF3D' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.12)'; cx.stroke(pt);
    if (f === 'jaqueta') { cx.strokeStyle = cor === '#FFFFFF' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)'; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(50, 17); cx.lineTo(50, 112); cx.stroke(); }
    cx.restore();
  });
  var lado = Math.min(W, H), t = document.createElement('canvas'); t.width = t.height = 160;
  t.getContext('2d').drawImage(cv, (W - lado) / 2, (H - lado) / 2, lado, lado, 0, 0, 160, 160);
  return { foto: cv.toDataURL('image/jpeg', 0.85), thumb: t.toDataURL('image/jpeg', 0.82) };
}
/** Abre o modo de exemplo: uma loja fictícia só em memória, com as mesmas regras do servidor. */
function verExemplo() {
  if (S.modo !== 'exemplo') S.modoAntes = S.modo;
  var est = montarExemplo();
  est.fotos = {}; est.fotosG = {};
  Object.keys(est.produtos).forEach(function (pid) { var pr = est.produtos[pid]; if (pr.categoria === 'Acessórios') return; try { var f = fotoFicticia(pr); est.fotos[pid] = f.thumb; est.fotosG[pid] = f.foto; } catch (e) { /* sem foto */ } });
  B = RacceDados.memoria(est, { hoje: hoje, addMes: addMes, fimMes: fimMes, snapVenda: snapVenda, quem: function () { return { id: 'u-camila', nome: 'Modo exemplo', funcao: 'Demonstração' }; } });
  S.exemplo = null; S.modo = 'exemplo'; FOTO_G = {}; fecharCamadas(); ui.mes = hoje().slice(0, 7); ui.f = { vp: 'mes' };
  if (!PAG[ui.pagina]) ui.pagina = 'painel';
  render(); recarregar().then(function () { window.scrollTo(0, 0); });
}
function sairExemplo() {
  S.exemplo = null; FOTO_G = {}; fecharCamadas();
  S.modo = S.modoAntes === 'real' && BREAL ? 'real' : S.modoAntes === 'config' ? 'config' : S.perfil && BREAL ? 'real' : 'entrar';
  B = S.modo === 'real' ? BREAL : null;
  render(); if (S.modo === 'real') recarregar(); window.scrollTo(0, 0);
}

// =============================================================================
// Ações
// =============================================================================
function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3600); }
function irPara(p) { if (!pode(p)) { toast('Seu usuário não tem acesso a este painel.'); return; } ui.pagina = p; ui.det = null; try { history.replaceState(null, '', '#' + p); } catch (e) { /* sem histórico */ } render(); window.scrollTo(0, 0); }
var ACOES = {
  ir: function (d, el, ev) { if (ev) ev.preventDefault(); irPara(d.p); },
  mes: function (d) { ui.mes = addMes(ui.mes, +d.d); render(); },
  mesAtual: function () { ui.mes = hoje().slice(0, 7); render(); },
  chip: function (d) { ui.f[d.f] = d.v; render(); },
  csv: function (d) { baixarCsv(d.k); },
  copiarCsv: function () {
    var ta = $('#csvTxt'); if (!ta) return;
    var ok = function () { toast('Texto copiado.'); }, falha = function () { ta.focus(); ta.select(); toast('Selecione e copie com Ctrl+C.'); };
    try { navigator.clipboard.writeText(ta.value).then(ok, falha); } catch (e) { falha(); }
  },
  fecharConf: function () { $('#camadaConf').innerHTML = ''; devolverFoco(); },
  conf: function (d) { $('#camadaConf').innerHTML = ''; devolverFoco(); var r = resolverConf; resolverConf = null; if (r) r(d.v === '1'); },
  verExemplo: verExemplo, sairExemplo: sairExemplo, baixarBackup: baixarBackup,
  inicio: function (d, el, ev) { if (ev) ev.preventDefault(); irPara(primeiraPagina()); },
  sair: function () {
    if (S.modo === 'exemplo') { sairExemplo(); return; }
    fecharModal();
    if (S.modo === 'trocarSenha') { encerrarSessao(''); return; }
    confirmar('Sair do sistema neste aparelho?', 'Sair', false).then(function (sim) { if (sim) encerrarSessao(''); });
  },
  minhaConta: function () { abrirMinhaConta(); },
  sairMovel: function () { abrirMinhaConta(); },
  atualizar: function () { if (!B) return; toast('Atualizando os dados…'); recarregar().then(function () { if (!S.erro) toast('Dados atualizados.'); }); },
  copiarSenha: function () {
    var el = $('#stSenha'); if (!el) return;
    var ok = function () { toast('Senha copiada.'); }, falha = function () { var r = document.createRange(); r.selectNodeContents(el); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selecione e copie com Ctrl+C.'); };
    try { navigator.clipboard.writeText(el.textContent).then(ok, falha); } catch (e) { falha(); }
  },
  fotoProduto: function () { var i = $('#fotoDet'); if (i) i.click(); },
  removerFoto: function (d) {
    var p = calc().pIdx[d.id]; if (!p) return;
    confirmar('Remover a foto de ' + nomeP(p) + '?', 'Remover', true).then(function (sim) { if (sim) apagarFoto(p.id).then(function () { toast('Foto removida.'); }, function () { toast('Não consegui remover a foto.'); }); });
  },
  novoUsuario: function () { formUsuario(null); },
  editarUsuario: function (d) { var u = listaUsuarios().filter(function (x) { return x.id === d.id; })[0]; if (u) formUsuario(u); },
  verHoje: function () { ui.f.vp = 'hoje'; irPara('vendas'); },
  verBaixos: function () { ui.f.est = 'baixo'; irPara('estoque'); },
  fecharDet: function () { ui.det = null; renderDetalhe(); devolverFoco(); },
  fundoDet: function (d, el, ev) { if (ev.target === el) { ui.det = null; renderDetalhe(); devolverFoco(); } },
  verVenda: function (d) { abrirDet('venda', d.id); },
  verProduto: function (d) { abrirDet('produto', d.id); },
  fecharModal: fecharModal,
  // nova venda
  novaVenda: function () { ui.det = null; renderDetalhe(); abrirVenda(); },
  vLinQtd: function (d) { var it = ui.venda.itens[+d.i]; if (!it) return; it.qtd += Number(d.d); if (it.qtd <= 0) ui.venda.itens.splice(+d.i, 1); renderVenda(); },
  vDel: function (d) { ui.venda.itens.splice(+d.i, 1); renderVenda(); },
  vPag: function (d) { ui.venda.pag = d.v; renderVenda(); },
  vCanal: function (d) { ui.venda.canal = d.v; renderVenda(); },
  vDescTipo: function (d) { ui.venda.descTipo = d.v; renderVenda(); },
  vRegistrar: registrarVenda,
  verRecibo: function (d) { abrirRecibo(d.id, false); },
  fecharRecibo: function () { fecharRecibo(); },
  rcWhats: function () {
    var R = ui.recibo; if (!R) return;
    var tel = val('rc_tel'), f = foneWhats(tel);
    if (tel && !f) { toast('Confira o número: use o DDD e o número, como (11) 91234-5678.'); return; }
    var a = document.createElement('a'); a.href = 'https://wa.me/' + f + '?text=' + encodeURIComponent(textoRecibo(R.d)); a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  },
  rcCompartilhar: function () {
    var R = ui.recibo; if (!R || !R.blob) { toast('Aguarde, o recibo ainda está sendo gerado.'); return; }
    var arq = new File([R.blob], nomeRecibo(R) + '.png', { type: 'image/png' });
    navigator.share({ files: [arq], title: 'Recibo de venda nº ' + R.numero, text: 'Recibo da sua compra na ' + (R.d.loja.nome || 'Racce') + '.' }).catch(function () { return null; });
  },
  rcPng: function () { var R = ui.recibo; if (!R || !R.blob) { toast('Aguarde, o recibo ainda está sendo gerado.'); return; } baixarArquivo(nomeRecibo(R) + '.png', R.blob, 'image/png'); },
  rcPdf: function () { var R = ui.recibo; if (!R || !R.cv) { toast('Aguarde, o recibo ainda está sendo gerado.'); return; } baixarArquivo(nomeRecibo(R) + '.pdf', pdfDeCanvas(R.cv, 'Recibo de venda ' + R.numero + ' - ' + (R.d.loja.nome || 'Racce')), 'application/pdf'); },
  rcImprimir: function () { imprimirRecibo(); },
  rcExemplo: function () { var vs = calc().vendas.filter(function (x) { return x.ok; }); if (!vs.length) { toast('Registre uma venda para ver o recibo.'); return; } abrirRecibo(vs[vs.length - 1].id, false); },
  salvarDadosLoja: function () {
    var lj = {}; ['nome', 'cnpj', 'endereco', 'cidade', 'whatsapp', 'instagram', 'horario', 'troca', 'mensagem'].forEach(function (k) { lj[k] = val('cfg_loja_' + k); });
    if (!lj.nome) { toast('Informe o nome da loja.'); return; }
    salvarConfig({ loja: lj }).then(function () { limparRascunho('cfg_loja_'); toast('Dados da loja salvos.'); }, function (e) { toast(e.message); });
  },
  editarVenda: function (d) { iniciarEdicao(d.id); },
  vSalvarEdicao: function () { salvarEdicao(); },
  vDescartarEdicao: function () { descartarEdicao(); },
  vMotivoRapido: function (d) {
    var v = ui.venda; if (!v) return;
    var m = String(v.motivo || '').trim().replace(/[.;,]\s*$/, '');
    if (m.indexOf(d.v) >= 0) return;
    v.motivo = m ? m + '; ' + d.v : d.v; renderVenda();
    var x = $('#v_motivo'); if (x) { x.focus(); try { x.setSelectionRange(x.value.length, x.value.length); } catch (e) { /* sem cursor */ } }
  },
  verHistorico: function () { ui.det = null; renderDetalhe(); irPara('historico'); },
  fecharPagamento: function () { fecharPagamento(); },
  cFinalizar: function () { if (ui.venda && ui.venda.itens.length) renderVenda(); },
  cAdd: function (d) { var p = calc().pIdx[d.id]; if (!p || !ui.venda) return; addItemVenda(p, d.t, 1); render(); toast(p.nome + ' · ' + d.t + ' adicionado à venda.'); },
  cDet: function (d) { var p = calc().pIdx[d.id]; if (!p || !ui.venda) return; var tams = tamanhosDe(p); ui.venda.detTam = tams.length === 1 ? tams[0] : null; ui.venda.detQtd = 1; abrirDet('cat', d.id); },
  cTam: function (d) { if (!ui.venda) return; ui.venda.detTam = d.t; renderDetalhe(); },
  cQtdDet: function (d) { if (!ui.venda) return; ui.venda.detQtd = Math.max(1, (ui.venda.detQtd || 1) + Number(d.d)); renderDetalhe(); },
  cAddDet: function (d) {
    var p = calc().pIdx[d.id], v = ui.venda; if (!p || !v || !v.detTam) return;
    addItemVenda(p, v.detTam, v.detQtd || 1); var tam = v.detTam, q = v.detQtd || 1;
    ui.det = null; renderDetalhe(); render(); toast((q > 1 ? q + '× ' : '') + p.nome + ' · ' + tam + ' adicionado à venda.');
  },
  cLinQtd: function (d) { var it = ui.venda && ui.venda.itens[+d.i]; if (!it) return; it.qtd += Number(d.d); if (it.qtd <= 0) ui.venda.itens.splice(+d.i, 1); render(); },
  cDel: function (d) { if (!ui.venda) return; ui.venda.itens.splice(+d.i, 1); render(); },
  cLimpar: function () { confirmar('Limpar a venda? Os itens escolhidos serão removidos.', 'Limpar', true).then(function (sim) { if (sim) { ui.venda = null; render(); } }); },
  cancelarVenda: function (d) {
    var c = calc(), v = c.vendas.filter(function (x) { return x.id === d.id; })[0]; if (!v) return;
    abrirModal({ olho: 'Venda #' + nVenda(v.numero), titulo: 'Cancelar venda', botao: 'Cancelar venda', perigo: true, sucesso: 'Venda cancelada. As peças voltaram para o estoque.',
      intro: '<p>A venda deixa de contar no faturamento e as ' + plural(v.pecas, 'peça volta', 'peças voltam') + ' para o estoque. Ela continua visível, riscada, e o cancelamento fica registrado no histórico de alterações, com o seu nome.</p>',
      html: function () { return '<label class="larga">Motivo *<input type="text" id="cv_motivo" maxlength="300" placeholder="Ex.: cliente desistiu da compra no caixa"><small>Pelo menos 10 caracteres.</small></label>'; },
      enviar: function () {
        var m = val('cv_motivo'); exigir(m.length >= 10, 'Informe o motivo do cancelamento, com pelo menos 10 caracteres.');
        return gravar(function () { return B.cancelarVenda(v.id, v.versao || 1, m); });
      } });
  },
  // estoque
  novoProduto: function () { formProduto(null); },
  editarProduto: function (d) { formProduto(calc().pIdx[d.id]); },
  duplicarProduto: function (d) { formProduto(calc().pIdx[d.id], true); },
  ativarProduto: function (d) {
    var p = calc().pIdx[d.id]; if (!p) return;
    var fazer = function () { gravar(function () { return B.definirAtivoProduto(p.id, !p.ativo); }).then(function () { toast(p.ativo ? 'Produto desativado.' : 'Produto reativado.'); }, function (e) { toast(e.message); }); };
    if (p.ativo) confirmar('Desativar "' + nomeP(p) + '"? Ele sai da busca de vendas e dos alertas, mas o histórico continua.', 'Desativar', true).then(function (s) { if (s) fazer(); }); else fazer();
  },
  novaEntrada: function (d) { formEntrada(d && d.id); },
  novoAjuste: function (d) { formAjuste(d && d.id); },
  desfazerMov: function (d) {
    var c = calc(), m = c.movs.filter(function (x) { return x.id === d.id; })[0]; if (!m) return;
    confirmar('Desfazer ' + (m.tipo === 'entrada' ? 'a entrada' : 'o ajuste') + ' de ' + nomeP(c.pIdx[m.produtoId]) + ' em ' + dbr(m.data) + '? O lançamento é estornado e o estoque, recalculado.' + (m.tipo === 'entrada' ? ' Se houver conta a pagar desta compra, exclua-a em Despesas.' : ''), 'Desfazer', true)
      .then(function (s) { if (s) gravar(function () { return B.estornarMovimento(m.id); }).then(function () { toast('Lançamento desfeito.'); }, function (e) { toast(e.message); }); });
  },
  // despesas
  novaDespesa: function () { formDespesa(null); },
  editarDesp: function (d) { var x = calc().despesas.filter(function (y) { return y.id === d.id; })[0]; if (x) { if (podeEscrever()) formDespesa(x); } },
  pagarDesp: function (d, el, ev) { if (ev) ev.stopPropagation(); var x = calc().despesas.filter(function (y) { return y.id === d.id; })[0]; if (x) formPagar(x); },
  // ajustes
  salvarTaxas: function () {
    var taxas = {}, ruim = '';
    PAGAMENTOS.forEach(function (p, i) { var n = parsePct(val('cfg_taxa_' + i)); if (isNaN(n) || n < 0 || n > 30) ruim = p; else taxas[p] = Math.round(n * 100) / 100; });
    if (ruim) { toast('Taxa inválida em ' + ruim + '. Use um número como 3,15.'); return; }
    salvarConfig({ taxas: taxas }).then(function () { limparRascunho('cfg_taxa_'); toast('Taxas salvas.'); }, function (e) { toast(e.message); });
  },
  salvarLoja: function () {
    var min = Number(val('cfg_min'));
    if (!isFinite(min) || min < 0 || Math.round(min) !== min) { toast('O estoque mínimo precisa ser um número inteiro.'); return; }
    salvarConfig({ estoqueMinimo: min }).then(function () { limparRascunho('cfg_min'); toast('Estoque mínimo salvo.'); }, function (e) { toast(e.message); });
  },
  salvarMeta: function () {
    var sel = $('#cfg_meta_mes'), k = sel ? sel.value : (ui.metaMes || hoje().slice(0, 7)), txt = val('cfg_meta_valor'), v = txt === '' ? 0 : parseBrl(txt);
    if (isNaN(v) || v < 0) { toast('Meta inválida. Use o formato 20.000,00.'); return; }
    var metas = Object.assign({}, cfgAtual().metas || {}), nome = mesNome(k) + ' de ' + k.slice(0, 4);
    if (v > 0) metas[k] = v; else delete metas[k];
    salvarConfig({ metas: metas }).then(function () { ui.metaMes = k; delete ui.rascunho.cfg_meta_valor; toast(v > 0 ? 'Meta de ' + nome + ' salva: ' + brl(v) + '.' : 'Meta de ' + nome + ' removida.'); }, function (e) { toast(e.message); });
  },
  editarMeta: function (d) { ui.metaMes = d.m; delete ui.rascunho.cfg_meta_valor; render(); var i = $('#cfg_meta_valor'); if (i) { i.focus(); i.select(); i.scrollIntoView({ block: 'center' }); } },
  definirMeta: function (d) { ui.metaMes = d.m; delete ui.rascunho.cfg_meta_valor; irPara('ajustes'); var i = $('#cfg_meta_valor'); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } },
  removerMeta: function (d) {
    var nome = mesNome(d.m) + ' de ' + d.m.slice(0, 4);
    confirmar('Remover a meta de ' + nome + '?', 'Remover', true).then(function (sim) {
      if (!sim) return;
      var metas = Object.assign({}, cfgAtual().metas || {}); delete metas[d.m];
      salvarConfig({ metas: metas }).then(function () { toast('Meta de ' + nome + ' removida.'); }, function (e) { toast(e.message); });
    });
  },
  salvarMetaPadrao: function () {
    var txt = val('cfg_meta'), v = txt === '' ? 0 : parseBrl(txt);
    if (isNaN(v) || v < 0) { toast('Meta inválida. Use o formato 20.000,00.'); return; }
    salvarConfig({ meta: v }).then(function () { limparRascunho('cfg_meta'); toast(v ? 'Meta padrão salva: ' + brl(v) + '.' : 'Meta padrão removida.'); }, function (e) { toast(e.message); });
  },
  salvarListas: function () {
    var linhas = function (s) { var vistos = {}; return s.split(/\n/).map(function (x) { return x.trim(); }).filter(function (x) { if (!x || vistos[norm(x)]) return false; vistos[norm(x)] = 1; return true; }); };
    var cp = linhas(val('cfg_cp')), cd = linhas(val('cfg_cd')), cn = val('cfg_canais').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!cp.length || !cd.length || !cn.length) { toast('Cada lista precisa de pelo menos um item.'); return; }
    if (cd.indexOf(MERC) < 0) cd.push(MERC);
    salvarConfig({ categoriasProduto: cp, categoriasDespesa: cd, canais: cn }).then(function () { limparRascunho('cfg_cp'); limparRascunho('cfg_cd'); limparRascunho('cfg_canais'); toast('Listas salvas.'); }, function (e) { toast(e.message); });
  }
};

// =============================================================================
// Eventos
// =============================================================================
document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-a]'); if (!el) return;
  var nome = el.dataset.a;
  if (ui.modal && ui.modal.acoes && ui.modal.acoes[nome]) { ev.preventDefault(); ui.modal.acoes[nome](el.dataset, el, ev); return; }
  var perm = permDe(el); if (perm && !pode(perm)) { ev.preventDefault(); toast('Seu usuário não tem acesso a esta função.'); return; }
  var a = ACOES[nome]; if (a) a(el.dataset, el, ev);
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('tr[data-a]')) { var pp = permDe(ev.target), a = ACOES[ev.target.dataset.a]; if (a && (!pp || pode(pp))) a(ev.target.dataset, ev.target, ev); }
  if (ev.key === 'Escape') {
    if ($('#camadaConf').innerHTML) { if (resolverConf) ACOES.conf({ v: '0' }); else ACOES.fecharConf(); }
    else if (ui.recibo) fecharRecibo();
    else if (ui.pagando) fecharPagamento();
    else if (ui.modal) fecharModal();
    else if (ui.det) ACOES.fecharDet();
  }
});
document.addEventListener('submit', function (ev) {
  ev.preventDefault();
  if (ev.target.id === 'mForm') enviarModal();
  else if (ev.target.id === 'formEntrar') entrar();
  else if (ev.target.id === 'formTrocarSenha') enviarTrocaSenha();
});
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (ui.venda && t.id && t.id.indexOf('v_') === 0) {
    var v = ui.venda;
    if (t.id === 'v_desc') { v.desc = t.value; renderVenda(); }
    else if (t.id === 'v_recebido') { v.recebido = t.value; renderVenda(); }
    else if (t.id === 'v_cliente') v.cliente = t.value;
    else if (t.id === 'v_tel') v.telefone = t.value;
    else if (t.id === 'v_obs') v.obs = t.value;
    else if (t.id === 'v_motivo') { v.motivo = t.value; var er = $('#vErro'); if (er) er.hidden = true; }
    if (v.editando) atualizarDifEdicao();
    return;
  }
  if (ui.modal && ui.modal.aoMudar && t.closest('#mForm')) { ui.modal.aoMudar(ev); return; }
  if (t.id && t.id.indexOf('cfg_') === 0) { ui.rascunho[t.id] = t.value; return; }
  if (t.type === 'search' && t.dataset.f) { ui.f[t.dataset.f] = t.value; render(); }
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.id === 'rc_fmt') { try { localStorage.setItem('racce-gestao-papel', t.value); } catch (e) { /* sem memória */ } return; }
  if (t.id === 'cfg_meta_mes') { ui.metaMes = t.value; delete ui.rascunho.cfg_meta_valor; render(); return; }
  if (t.id === 'fotoDet') {
    var pid = ui.det && ui.det.id, arq = t.files && t.files[0]; t.value = '';
    if (!pid || !arq) return;
    processarFoto(arq).then(function (d) { return guardarFoto(pid, d); }).then(function () { toast('Foto salva.'); }, function (e) { toast(e.message); });
    return;
  }
  if (ui.venda && t.id) {
    var v = ui.venda;
    if (t.id === 'v_parcelas') { v.parcelas = Number(t.value); atualizarDifEdicao(); return; }
    if (t.id === 'v_data') { v.data = t.value; atualizarDifEdicao(); return; }
    if (t.id.indexOf('v_tam_') === 0) { mudarTamItem(+t.dataset.i, t.value); return; }
    if (t.id.indexOf('v_preco_') === 0) { var it = v.itens[+t.dataset.i], n = parseBrl(t.value); if (it && !isNaN(n) && n >= 0) it.preco = n; renderVenda(); return; }
  }
  if (ui.modal && ui.modal.aoMudar && t.closest('#mForm')) { ui.modal.aoMudar(ev); return; }
  if (t.dataset && t.dataset.f && t.type !== 'search') { ui.f[t.dataset.f] = t.value; render(); }
});
document.addEventListener('mousemove', function (ev) {
  var el = ev.target.closest && ev.target.closest('[data-tip]'), tip = $('#tip');
  if (!el || !el.getAttribute('data-tip')) { tip.hidden = true; return; }
  tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
  var w = tip.offsetWidth, hh = tip.offsetHeight, x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
  if (y + hh > window.innerHeight - 8) y = ev.clientY - hh - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
});
var larguraAntes = window.innerWidth, esperaRedim = null;
window.addEventListener('resize', function () { clearTimeout(esperaRedim); esperaRedim = setTimeout(function () { if (window.innerWidth !== larguraAntes) { larguraAntes = window.innerWidth; render(); } }, 180); });

// =============================================================================
// Sessão: renovação, inatividade e atualização automática
// =============================================================================
var INATIVIDADE_MIN = 30, ultimoUso = Date.now();
['click', 'keydown', 'touchstart', 'scroll', 'pointermove'].forEach(function (n) { document.addEventListener(n, function () { ultimoUso = Date.now(); }, { passive: true, capture: true }); });
setInterval(function () {
  if ((S.modo === 'real' || S.modo === 'trocarSenha') && Date.now() - ultimoUso > INATIVIDADE_MIN * 60000) encerrarSessao('Sua sessão foi encerrada depois de ' + INATIVIDADE_MIN + ' minutos sem uso.');
}, 30000);
// mantém os dados em dia: ao voltar para a aba e a cada minuto com a aba visível
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.modo === 'real' && Date.now() - S.atualizadoEm > 15000) recarregar(); });
setInterval(function () { if (document.visibilityState === 'visible' && S.modo === 'real' && !pend && Date.now() - S.atualizadoEm > 55000) recarregar(); }, 60000);

// =============================================================================
// Início
// =============================================================================
function iniciar() {
  // não funciona dentro de molduras de outros sites (proteção contra clickjacking)
  if (window.top !== window.self) { document.body.innerHTML = '<p style="padding:24px;font:16px sans-serif">Abra o sistema diretamente pelo endereço oficial.</p>'; return; }
  var h = (location.hash || '').replace('#', '');
  if (h === 'historico' || PAGINAS.some(function (p) { return p[0] === h; })) ui.pagina = h;
  var cfg = window.RACCE_CONFIG || {};
  if (!window.RacceSupabase || !window.RacceDados || !cfg.supabaseUrl || !cfg.supabaseChavePublica || /SEU-PROJETO|COLE-AQUI/.test(cfg.supabaseUrl + cfg.supabaseChavePublica)) { S.modo = 'config'; render(); return; }
  SB = RacceSupabase.criar({ url: cfg.supabaseUrl, chave: cfg.supabaseChavePublica });
  SB.aoMudar(function (ev) { if (ev === 'expirou') sessaoExpirada(); });
  if (SB.sessao()) iniciarSessao(); else { S.modo = 'entrar'; render(); }
}
iniciar();
})();
