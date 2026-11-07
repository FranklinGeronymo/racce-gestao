# Auditoria e reestruturação do Racce Gestão

Data: 7 de novembro de 2026 · Ramo: `seguranca-supabase` · Versão auditada: commit `cabb07d` (5/11/2026)

## 1. Resumo executivo

O sistema anterior era um único arquivo HTML que guardava vendas, estoque, usuários e senhas **no navegador de cada computador**. O controle de acesso era apenas visual: qualquer pessoa com acesso ao computador conseguia se tornar administradora em segundos, pelo console do navegador. Cada computador tinha uma loja diferente, sem dados compartilhados.

A nova versão leva os dados e as regras para um servidor (Supabase, com PostgreSQL), com autenticação real e permissões conferidas no banco a cada consulta e gravação. A interface, a identidade visual e as regras de negócio foram preservadas.

| Indicador | Antes | Depois |
|---|---|---|
| Onde ficam os dados | No navegador de cada computador | Banco central, acessível de qualquer aparelho |
| Quem decide o acesso | O próprio navegador (contornável) | O servidor, a cada consulta e gravação |
| Senhas | SHA-256 no navegador, mínimo de 4 caracteres | bcrypt no Supabase Auth, mínimo de 10, com letras e números |
| Limite de tentativas | Contador na tela (zerava ao recarregar) | No servidor (Auth) e na troca de senha (5 a cada 15 min) |
| Histórico de alterações | Selo calculado no navegador (recalculável) | Gravado pelo servidor; nem o administrador altera |
| Testes automatizados | Nenhum | 102 no banco, 18 na função de usuários, 44 no navegador |

**Recomendação:** concluir a implantação (cerca de 40 minutos, conforme `docs/IMPLANTACAO.md`) antes de lançar dados reais. A versão atual publicada continua funcionando até lá, e nenhum dado real precisa ser migrado.

## 2. Achados na versão anterior

### Segurança

| # | Gravidade | Achado | Impacto |
|---|---|---|---|
| S1 | Crítica | A sessão era só o ID do usuário no `sessionStorage`. Gravar o ID do administrador ali dava acesso total. | Qualquer pessoa no computador virava administradora. |
| S2 | Crítica | O login podia ser desligado editando o IndexedDB (`loginAtivo: false`), e vinha desligado por padrão. | O controle de acesso era opcional e contornável. |
| S3 | Crítica | Permissões aplicadas só escondendo botões (`aplicarPermissoes`). | Toda função estava ao alcance do console. |
| S4 | Alta | Senhas com SHA-256 repetido 500 vezes, em JavaScript, com mínimo de 4 caracteres; hashes legíveis no navegador e no arquivo de backup. | Senhas quebráveis por tentativa offline. |
| S5 | Alta | Restaurar backup aceitava um JSON qualquer, inclusive com usuários e senhas. | Um backup forjado criava um administrador. |
| S6 | Alta | Tela de entrada listava todos os usuários com nome e função. | Enumeração de usuários. |
| S7 | Média | Limite de tentativas de senha só na memória da tela. | Recarregar a página zerava o bloqueio. |
| S8 | Média | Exportação CSV sem proteção contra fórmulas (`=HYPERLINK(...)`). | Injeção de fórmula ao abrir no Excel. |
| S9 | Média | Selo de integridade do histórico calculado no navegador. | Quem altera os dados recalcula o selo. |
| S10 | Média | Sem política de segurança de conteúdo (CSP). | Sem defesa extra contra scripts injetados. |
| S11 | Baixa | Dados de clientes (nome e WhatsApp) sem controle de acesso por função. | Risco de LGPD. |

### Lógica e regras de negócio

| # | Achado | Correção |
|---|---|---|
| L1 | O número da venda era a posição na lista ordenada: mudava se uma venda sumisse e seria diferente para cada usuário com vendas filtradas. | Número atribuído pelo servidor, sequencial, só quando a venda é concluída (tentativas recusadas não deixam buracos). |
| L2 | A taxa da maquininha era recalculada com a taxa atual: mudar a taxa hoje alterava o lucro dos meses passados. | A taxa do dia fica gravada em cada venda. |
| L3 | Subtotal e total vinham prontos do navegador. | O servidor recalcula a partir dos itens; ignora valores enviados. |
| L4 | O custo da peça vinha do navegador. | O servidor busca o custo do cadastro; na edição, mantém o custo do dia da venda. |
| L5 | "Desfazer" apagava o lançamento de estoque e "Excluir" apagava a despesa, sem rastro. | Estorno e exclusão lógicos, com registro na auditoria. |
| L6 | Edições simultâneas: conferência por comparação de texto na tela. | Controle de versão no servidor: a segunda edição é recusada com aviso. |
| L7 | O vendedor podia mudar o preço sem rastro do preço de tabela. | O preço de tabela fica guardado no item e aparece no detalhe quando difere. |
| L8 | Datas validadas só pelo relógio do computador. | Validação no servidor, no fuso de Fortaleza. |
| L9 | Código morto do antigo ponto de venda (`vSel`, `vAdd`, `v_busca`...). | Removido. |

### Interface, acessibilidade e textos

| Achado | Correção |
|---|---|
| Página Usuários estourava a largura no celular (1.377 px em tela de 390 px). | Corrigido; todas as páginas testadas em 390 px. |
| Diálogos sem foco preso nem retorno de foco. | Tab fica dentro do diálogo aberto; o foco volta ao elemento de origem. |
| Painel de detalhe sem nome acessível. | `aria-label` em cada diálogo. |
| Rótulos da tela de entrada em caixa-alta, diferentes do resto do sistema. | Padronizados com os demais formulários. |
| Textos que citavam "neste computador", "backup", "login desativado". | Reescritos para o novo funcionamento. |
| Percentual negativo com hífen; o resto do sistema usa o sinal de menos. | Padronizado (−). |
| Sem estado de carregamento nas gravações. | Botões mostram "Entrando…", "Registrando…", "Salvando…" e o status lateral acompanha. |
| Sem preferência de movimento reduzido. | Respeita `prefers-reduced-motion`. |

## 3. Arquitetura nova

```
Navegador (GitHub Pages)                Supabase
┌─────────────────────────┐   HTTPS   ┌──────────────────────────────────────┐
│ index.html  (telas, CSS)│──────────▶│ Auth: senhas bcrypt, sessões, limites │
│ js/app.js   (interface) │           │ PostgREST: leitura com RLS            │
│ js/dados.js (operações) │           │ Funções SQL: cada gravação validada   │
│ js/supabase-cliente.js  │           │ Edge Function admin-usuarios          │
└─────────────────────────┘           │   (única que usa a chave secreta)     │
                                      └──────────────────────────────────────┘
```

**Decisões e justificativas**

| Decisão | Alternativa considerada | Por quê |
|---|---|---|
| Supabase (escolhido pela diretoria) | Next.js com backend próprio | Autenticação gerenciada, regras no banco e menos código para manter. |
| Todas as gravações por funções SQL (`SECURITY DEFINER`) | Permitir gravação direta nas tabelas com RLS | Uma venda envolve itens, custos, estoque e histórico: a função faz tudo numa transação e valida regras que a RLS não expressa. |
| Custos em tabelas separadas | Restringir colunas | Mais simples de auditar: quem não pode ver custos não lê a tabela. |
| Cliente REST próprio, sem bibliotecas | Biblioteca oficial por CDN | Sem dependência de terceiros no navegador; a CSP libera só o próprio site e o Supabase. |
| Sessão no `sessionStorage` | `localStorage` ou cookies | Termina ao fechar a aba (computador de loja). Cookies `httpOnly` exigiriam um servidor próprio; a CSP reduz o risco de roubo de token por script injetado. |
| Interface preservada | Reescrita em framework | Mantém o que a equipe conhece e reduz o risco da mudança. |

## 4. Controles de segurança implementados

| Requisito | Como foi atendido |
|---|---|
| Senhas com hash seguro e sal | Supabase Auth (bcrypt). O aplicativo nunca vê nem guarda hashes. |
| Política de senha | Mínimo de 10 caracteres, letras e números, sem o e-mail; conferida no servidor (função) e na configuração do Auth. |
| Login, logout e expiração | Token de acesso curto e renovado automaticamente; logout encerra a sessão no servidor; fim automático após 30 minutos sem uso. |
| Recuperação de senha | O administrador redefine e recebe uma senha temporária de 14 caracteres, mostrada uma vez. A pessoa perde o acesso aos dados até criar a nova senha. |
| Troca de senha | Exige a senha atual, conferida no servidor; 5 erros bloqueiam por 15 minutos; outras sessões são encerradas. |
| Validação no servidor | Toda leitura passa pela RLS; toda gravação passa por uma função que confere a permissão e os dados. O papel `authenticated` não tem INSERT, UPDATE nem DELETE em nenhuma tabela. |
| Proteção contra manipulação do navegador | Testado: chamadas diretas à API, gravação direta em tabelas, botões injetados e token adulterado são recusados. |
| Menor privilégio | Visitante sem login (`anon`) não lê nem executa nada. Funções internas não podem ser chamadas pela API. A chave secreta fica só na Edge Function. |
| Contas sem perfil | Mesmo que alguém crie uma conta no Auth, sem perfil ativo não vê nenhum dado. |
| Usuário desativado | Perde o acesso aos dados imediatamente (RLS) e não consegue mais entrar (banimento no Auth). |
| Pelo menos um administrador | Gatilho no banco impede desativar ou rebaixar o último administrador. |
| SQL Injection | Sem SQL montado com texto do usuário: parâmetros tipados nas funções. |
| XSS | Todo texto passa por `esc()` antes de ir para a tela; CSP sem scripts embutidos; testado com nome de produto contendo HTML. |
| CSRF | Não se aplica: a autenticação vai no cabeçalho `Authorization`, não em cookie. A Edge Function só aceita origens autorizadas. |
| Clickjacking | O aplicativo se recusa a funcionar dentro de molduras de outros sites. |
| Uploads | Imagem reduzida no navegador e aceita pelo banco só como JPEG em base64, com limite de tamanho (regra no banco). |
| Mensagens de erro | O navegador só mostra mensagens escritas para o usuário; detalhes técnicos ficam no log do servidor. Login com e-mail ou senha errados mostra mensagem única (não revela se o e-mail existe). |
| Auditoria | Criação, alteração, desativação e redefinição de usuários, mudanças nos ajustes, estornos e exclusões ficam registrados e não podem ser apagados. |

## 5. Onde cada permissão é verificada

| Ação | Quem pode | Verificação no servidor |
|---|---|---|
| Ver catálogo e estoque disponível | Qualquer usuário ativo | RLS em `produtos`; função `estoque_atual` |
| Ver custos e lucro | Custos, Estoque, Resultado ou Visão geral | RLS em `produtos_custo` e `venda_custos` |
| Registrar venda | Vendas | `registrar_venda` |
| Ver todas as vendas | Vendas da equipe, Visão geral, Resultado ou Histórico | RLS em `vendas` (os demais veem só as próprias) |
| Editar / cancelar venda | Edita vendas / Cancela vendas, e só vendas que consegue ver | `editar_venda`, `cancelar_venda` |
| Produtos, fotos, entradas, ajustes | Estoque | Funções de estoque |
| Despesas | Despesas | Funções de despesas |
| Ver despesas | Despesas, Resultado ou Visão geral | RLS em `despesas` |
| Ajustes da loja | Administrador | `salvar_config` |
| Usuários | Administrador | Edge Function `admin-usuarios` |

Observação de negócio: quem tem **Visão geral** ou **Resultado** acessa os números de todas as vendas, porque esses painéis somam a loja inteira. Isso já era assim e agora está explícito na tela de Usuários.

## 6. Validação final

| Bateria | Resultado | O que cobre |
|---|---|---|
| Banco (`tests/db`) | 102 de 102 | Cada perfil, cada função, gravação direta negada, dados inválidos, histórico imutável, último administrador. |
| Função de usuários (`tests/funcao`) | 18 de 18 (52 verificações) | Origem, token forjado, permissão, criação, duplicidade, troca de senha, bloqueio por tentativas, desativação, redefinição, auditoria. |
| Navegador (`tests/e2e`) | 44 de 44 | Fluxos completos com 4 perfis, tentativas de burlar pela API e pela tela, celular em 390 px, sessão adulterada, inatividade. |
| Varredura de páginas | 0 erros de execução | Todas as páginas e formulários, nos modos real e de exemplo. |

Os testes rodam contra PostgreSQL 16 com a migração real. Auth, API REST e Edge Function foram simulados localmente com as mesmas rotas do Supabase; a primeira conferência no Supabase de verdade está no roteiro de 10 minutos do guia de implantação.

## 7. Riscos remanescentes e próximos passos

| Prioridade | Item | Recomendação |
|---|---|---|
| Alta | Implantação ainda não feita | Seguir `docs/IMPLANTACAO.md`; só depois incorporar o ramo ao `main`. |
| Alta | Backups | Confirmar a política de backups do plano do Supabase e manter a cópia semanal pelo sistema. |
| Média | Repositório público | Não há segredos no código, mas o repositório pode ficar privado (o GitHub Pages em repositório privado exige plano pago do GitHub). |
| Média | Recuperação de senha por e-mail | Depende do domínio e dos e-mails oficiais (pendência 3 do Manual de Marca). Hoje: redefinição pelo administrador. |
| Média | Crescimento dos dados | O aplicativo carrega tudo a cada atualização. Com vários anos de vendas, carregar por período. |
| Média | Política de privacidade e encarregado (DPO) | Pendência 7 do Manual de Marca; necessária para dados de clientes. |
| Baixa | Fonte Inter pelo Google Fonts | Hospedar os arquivos do Kit de Marca (pasta 09) no próprio site, sem chamar o Google. |
| Baixa | Ícone da aba provisório | Trocar `favicon.svg` pelo do Kit de Marca (pasta 03). |
| Baixa | Login com captcha | Ativar no Supabase Auth se houver tentativas automatizadas. |
| Baixa | Integração com o site | O mesmo banco pode receber os pedidos do site institucional, evitando cadastros duplicados. |

## 8. Observações contábeis sobre o Resultado

O cálculo foi preservado, mas há quatro pontos de classificação que importam quando os números forem usados como DRE gerencial ou levados à contabilidade.

1. **Impostos sobre vendas.** Pela estrutura da DRE (Lei 6.404/1976 e CPC 26), receita líquida é a receita bruta menos devoluções, descontos incondicionais e **impostos sobre a venda**. No Simples Nacional, o DAS incide sobre o faturamento, então é uma dedução da receita, não uma despesa operacional. Hoje ele entra como despesa da categoria "Impostos", depois do lucro bruto. O lucro final não muda, mas a "receita líquida" e a margem bruta aparecem maiores do que são.
2. **Taxas da maquininha.** O sistema as desconta antes do lucro bruto. Na classificação usual, são despesas comerciais (ou financeiras, no caso da antecipação de recebíveis), e o lucro bruto é receita líquida menos o custo das mercadorias vendidas (CMV). Para análise interna funciona, mas a margem bruta fica diferente da do contador.
3. **Custo das mercadorias.** O custo de cada peça é o do cadastro no dia da venda, que é atualizado na última entrada. Isso equivale a usar o **último custo**, que não está entre os critérios do CPC 16 (Estoques): a norma pede custo médio ponderado ou PEPS (primeiro que entra, primeiro que sai), e só admite atalhos quando o resultado se aproxima do custo real. Com preços de compra estáveis, a diferença é pequena; com reajustes frequentes, o CMV fica distorcido. Uma evolução natural é calcular o custo médio ponderado no servidor a cada entrada.
4. **Caixa do mês.** O "Sobrou no caixa" considera que a venda no cartão entra no mesmo mês. Na prática, o crédito à vista cai em cerca de 30 dias e o parcelado, mês a mês. Para um fluxo de caixa realizado e projetado (DFC), os recebíveis de cartão precisam ser lançados pela data prevista de crédito.

Nenhuma dessas mudanças foi aplicada, porque alteram regras de negócio. Elas podem entrar numa próxima etapa, junto com o modelo financeiro (DRE, DFC e balanço).
