/*
 * Configuração do Supabase da loja.
 * Preencha com os dados de Supabase > Project Settings > API (veja docs/IMPLANTACAO.md):
 *   supabaseUrl          → "Project URL", por exemplo https://abcdefghijkl.supabase.co
 *   supabaseChavePublica → a chave pública ("publishable" ou "anon public")
 *
 * Estes dois valores são públicos por natureza: qualquer visitante do site consegue vê-los.
 * A segurança NÃO depende deles, e sim das regras do banco (RLS) e das funções do servidor.
 * NUNCA coloque aqui a chave secreta ("secret" ou "service_role").
 */
window.RACCE_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseChavePublica: 'COLE-AQUI-A-CHAVE-PUBLICA'
};
