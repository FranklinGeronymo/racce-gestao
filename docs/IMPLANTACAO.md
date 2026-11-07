# Guia de implantação — Racce Gestão com Supabase

Este guia leva o sistema do repositório até o uso real. Tempo estimado: 40 minutos.
Quem executa precisa de acesso de administrador ao GitHub do repositório e a uma conta no Supabase.

> **Antes de começar:** a versão atual publicada no GitHub Pages guarda os dados no navegador. Esta nova versão só funciona depois dos passos abaixo. Por isso as mudanças estão no ramo `seguranca-supabase`: o endereço atual continua igual até o ramo ser incorporado ao `main`.

## Visão geral

| Peça | Onde fica | O que faz |
|---|---|---|
| Aplicativo (`index.html`, `js/`) | GitHub Pages | Telas. Não guarda dados nem decide permissões. |
| Banco de dados | Supabase (PostgreSQL) | Dados, regras de acesso (RLS) e regras de negócio (funções). |
| Autenticação | Supabase Auth | Senhas com hash bcrypt, sessões, limite de tentativas. |
| Função `admin-usuarios` | Supabase Edge Functions | Criar usuários, redefinir e trocar senhas. Guarda a chave secreta. |

## 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto. Na região, escolha **South America (São Paulo)**: os dados de clientes ficam no Brasil, o que simplifica a conformidade com a LGPD e reduz a latência.
2. Guarde a senha do banco num gerenciador de senhas. Ela não é usada pelo aplicativo.

## 2. Criar o banco

1. Abra **SQL Editor > New query**.
2. Cole todo o conteúdo de `supabase/migrations/20261107000000_racce_gestao.sql` e clique em **Run**.
3. Deve aparecer "Success. No rows returned". Se aparecer erro, não rode de novo por cima: copie a mensagem e corrija antes.

## 3. Configurar a autenticação

Em **Authentication** (os nomes podem variar um pouco conforme a versão do painel):

| Configuração | Valor | Por quê |
|---|---|---|
| Permitir novos cadastros (*Allow new users to sign up*) | **Desligado** | Só o administrador cria contas. Mesmo que fique ligado, uma conta sem perfil não vê nada, mas é melhor fechar a porta. |
| Tamanho mínimo da senha | **10** | Mesma regra do aplicativo. |
| Requisitos da senha | **Letras e números** | Mesma regra do aplicativo. |
| Troca de senha segura (*Secure password change*) | **Ligado** | Exige login recente para trocar a senha. |
| Duração do token de acesso (JWT expiry) | **3600** segundos ou menos | O token vence rápido; o aplicativo renova sozinho. |
| Limites de tentativas (*Rate limits*) | Manter os padrões | Protegem contra tentativas repetidas de senha. |
| Proteção contra senhas vazadas | Ligar, se o plano permitir | Recusa senhas que já apareceram em vazamentos. |

## 4. Criar o primeiro administrador

1. **Authentication > Users > Add user > Create new user**. Informe o e-mail e uma senha forte e marque **Auto Confirm User**.
2. No **SQL Editor**, rode (trocando os dados):

   ```sql
   select public.criar_admin_inicial('email.do.admin@exemplo.com', 'Nome do Administrador');
   ```

   Essa função só funciona uma vez e só pelo SQL Editor (a API não consegue chamá-la). Os demais usuários são criados pelo próprio aplicativo, em **Usuários**.

## 5. Publicar a função de usuários

**Pelo painel:** **Edge Functions > Deploy a new function > Via Editor**, nome `admin-usuarios`, cole o conteúdo de `supabase/functions/admin-usuarios/index.ts` e publique. Mantenha **Verify JWT** ligado.

**Pela linha de comando** (alternativa):

```bash
supabase login
supabase link --project-ref SEU-PROJETO
supabase functions deploy admin-usuarios
```

Depois, em **Edge Functions > Secrets** (ou `supabase secrets set`), crie:

| Nome | Valor |
|---|---|
| `ALLOWED_ORIGINS` | O endereço do aplicativo, sem barra no fim. Ex.: `https://franklingeronymo.github.io`. Se houver domínio próprio, inclua os dois separados por vírgula. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente nas funções. **A chave secreta nunca vai para o aplicativo nem para o GitHub.**

## 6. Ligar o aplicativo ao Supabase

1. Em **Project Settings > API**, copie o **Project URL** e a chave **pública** (*publishable* ou *anon public*).
2. Edite `js/config.js`:

   ```js
   window.RACCE_CONFIG = {
     supabaseUrl: 'https://abcdefghijkl.supabase.co',
     supabaseChavePublica: 'sb_publishable_...'
   };
   ```

   Esses dois valores são públicos por natureza (qualquer visitante consegue vê-los). A segurança está nas regras do banco.
3. Se o Supabase usar um domínio próprio, troque `https://*.supabase.co` pelo domínio dele na linha `Content-Security-Policy` do `index.html`.

## 7. Publicar no GitHub Pages

1. Incorpore o ramo `seguranca-supabase` ao `main` (pela revisão do pull request).
2. Em **Settings > Pages**, confirme a publicação a partir do `main` e marque **Enforce HTTPS**.
3. Abra o endereço, entre com o administrador e cadastre a equipe em **Usuários**. Cada pessoa recebe uma senha temporária e cria a própria senha no primeiro acesso.

## 8. Conferência depois de publicar (10 minutos)

- [ ] Entrar como administrador e cadastrar um produto com foto.
- [ ] Criar um usuário vendedor, entrar com ele numa janela anônima e criar a senha.
- [ ] Como vendedor: registrar uma venda; conferir que o menu mostra só **Vendas** e que custo e lucro não aparecem.
- [ ] Como administrador: desativar o vendedor e confirmar que ele não consegue mais entrar.
- [ ] Em **Ajustes**, baixar a cópia dos dados.

## Operação do dia a dia

| Situação | O que fazer |
|---|---|
| Alguém esqueceu a senha | Administrador: **Usuários > (pessoa) > Redefinir senha** e entregar a senha temporária pessoalmente. |
| Alguém saiu da equipe | **Usuários > (pessoa) >** desmarcar **Usuário ativo**. O acesso aos dados é cortado na hora. |
| Computador compartilhado | A sessão fica só na aba aberta e termina sozinha depois de 30 minutos sem uso. Use **Sair** ao terminar. |
| Cópia de segurança | Semanal: **Ajustes > Baixar cópia dos dados**. Guarde em local seguro (contém dados de clientes). Confira também a política de backups do seu plano no Supabase. |

## Testes automatizados (para quem mantém o código)

| Comando | O que testa |
|---|---|
| `tests/db/rodar.sh` | Banco e permissões: cerca de 100 verificações em PostgreSQL 16 com a migração real. |
| `tests/servidor-falso/preparar.sh` e `bun tests/servidor-falso/servidor.ts` | Sobe um Supabase simulado em `http://localhost:8787` com a migração real. |
| `bun test tests/funcao` | Função de usuários (com o servidor simulado rodando). |
| `node tests/e2e/ponta-a-ponta.cjs` | Navegador de ponta a ponta: perfis, tentativas de burlar, celular e inatividade. |
