/**
 * Domínio próprio dos pedidos de informática.
 *
 * A página pública de pedidos — ao contrário do resto da aplicação — não
 * precisa do domínio da organização: quem a abre pode não ter conta nenhuma, e
 * a autorização vem do token do próprio URL. Isso permite servi-la de um
 * domínio só, e a organização dona desse domínio vê o formulário logo na raiz,
 * sem token à vista.
 *
 * Tudo isto é opcional. Sem as variáveis definidas — em desenvolvimento e nos
 * previews, onde o domínio não existe — o comportamento é o de sempre.
 *
 * Os acessos a `import.meta.env` são estáticos de propósito: o Vite substitui
 * `import.meta.env.VITE_X` no build, e um acesso por índice não seria
 * substituído. São lidos dentro das funções, não no topo do módulo, para os
 * testes poderem trocar o ambiente.
 */

/**
 * Token da organização dona deste domínio, ou `null` se o domínio não for o dos
 * pedidos. É o que decide se a raiz mostra o formulário ou a página inicial.
 *
 * Recebe o domínio em argumento em vez de o ir buscar a `window`: mantém a
 * função pura e testável, e deixa a dependência do browser em quem a chama.
 */
export function tokenDoDominioTickets(hostname: string): string | null {
  const host = (import.meta.env.VITE_TICKETS_HOST ?? '').trim();
  const token = (import.meta.env.VITE_TICKETS_TOKEN ?? '').trim();
  if (!host || !token) return null;
  return hostname.toLowerCase() === host.toLowerCase() ? token : null;
}

/**
 * Entrada do ADMIN para os pedidos. Relativo de propósito, sempre.
 *
 * A lista de pedidos só aparece a quem tem sessão, e a sessão do Supabase vive
 * em `localStorage`, que é por origem. Mandar o admin para o domínio de
 * pedidos levava-o para uma origem onde não tem sessão: a lista desaparecia
 * sem erro nenhum. Aconteceu em produção a 2026-08-18.
 *
 * O domínio curto serve para PARTILHAR com quem não tem conta — não para
 * navegar a partir da aplicação.
 */
export function linkListaTickets(token: string): string {
  return `/ti/${token}`;
}
