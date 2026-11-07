# Racce · Gestão da loja

Sistema de gestão da Racce (moda fitness, Fortaleza · CE): vendas com catálogo, recibo, estoque com fotos, despesas, metas, resultado do mês, usuários com acesso por função e histórico de alterações das vendas.

## Como funciona

| Peça | Onde fica | Papel |
|---|---|---|
| `index.html`, `js/` | GitHub Pages | Telas. Não guarda dados nem decide permissões. |
| `supabase/migrations/` | Supabase (PostgreSQL) | Tabelas, regras de acesso (RLS) e funções que validam cada gravação. |
| `supabase/functions/admin-usuarios/` | Supabase Edge Functions | Cadastro de usuários e senhas (única peça com a chave secreta). |

Os dados ficam no banco da loja e aparecem em qualquer aparelho. Cada pessoa entra com o próprio e-mail e senha e só vê e faz o que a função dela permite; essa conferência é feita no servidor.

## Começar

- **Implantação:** [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md) (cerca de 40 minutos).
- **Auditoria e decisões técnicas:** [docs/AUDITORIA.md](docs/AUDITORIA.md).
- **Conhecer sem configurar nada:** abra o site e escolha "Ver com dados de exemplo".

## Estrutura

```
index.html                     telas e estilos (identidade do Manual de Marca 2.1)
js/config.js                   endereço e chave pública do Supabase (preencher)
js/supabase-cliente.js         cliente das APIs REST do Supabase, sem dependências
js/dados.js                    operações: banco real ou modo de exemplo
js/app.js                      interface
supabase/migrations/           banco: tabelas, RLS, funções e gatilhos
supabase/functions/            função admin-usuarios
tests/db/                      testes de permissões no PostgreSQL
tests/servidor-falso/          Supabase simulado para testes locais
tests/funcao/                  testes da função de usuários
tests/e2e/                     testes no navegador
docs/                          implantação e auditoria
```

## Testes

```bash
tests/db/rodar.sh                                   # banco e permissões (PostgreSQL local)
tests/servidor-falso/preparar.sh                    # banco de testes com a equipe de exemplo
bun tests/servidor-falso/servidor.ts &              # Supabase simulado em http://localhost:8787
bun test tests/funcao                               # função de usuários
node tests/e2e/ponta-a-ponta.cjs                    # navegador (Playwright + Chrome)
```
