/**
 * Domínio próprio dos pedidos de informática.
 *
 * Estas páginas — ao contrário do resto da aplicação — não precisam do domínio
 * da organização: quem as abre pode não ter conta nenhuma, e a autorização vem
 * do token do próprio URL. Isso permite servi-las todas de um domínio só.
 *
 * Uma organização pode ser a "dona" desse domínio: aí a raiz mostra o
 * formulário dela e o link a partilhar fica só `tickets.wegest.pt`, sem token à
 * vista. As outras continuam a usar `/ti/<token>`.
 *
 * Tudo isto é opcional. Sem as variáveis definidas — em desenvolvimento e nos
 * previews, onde o domínio não existe — o comportamento é o de sempre.
 *
 * Os acessos a `import.meta.env` são estáticos de propósito: o Vite substitui
 * `import.meta.env.VITE_X` no build, e um acesso por índice não seria
 * substituído. São lidos dentro das funções, não no topo do módulo, para os
 * testes poderem trocar o ambiente.
 */

function base(): string {
  // A barra final é removida: `https://x/` + `/ti/…` daria `https://x//ti/…`,
  // e num URL absoluto uma barra a dobrar muda o host.
  return (import.meta.env.VITE_TICKETS_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

function tokenConfigurado(): string {
  return (import.meta.env.VITE_TICKETS_TOKEN ?? '').trim();
}

/**
 * Token da organização dona deste domínio, ou `null` se o domínio não for o dos
 * pedidos. É o que decide se a raiz mostra o formulário ou a página inicial.
 *
 * Recebe o domínio em argumento em vez de o ir buscar a `window`: mantém a
 * função pura e testável, e deixa a dependência do browser em quem a chama.
 */
export function tokenDoDominioTickets(hostname: string): string | null {
  const host = (import.meta.env.VITE_TICKETS_HOST ?? '').trim();
  const token = tokenConfigurado();
  if (!host || !token) return null;
  return hostname.toLowerCase() === host.toLowerCase() ? token : null;
}

/** Link público de submissão, para partilhar com quem não tem conta. */
export function linkSubmissaoTickets(token: string): string {
  const dominio = base();
  // A organização dona do domínio leva o link curto — nesse domínio a raiz já
  // mostra o formulário dela. Qualquer outra tem de levar o token no caminho,
  // senão os pedidos iam parar à organização errada.
  if (dominio && token === tokenConfigurado()) return dominio;
  return `${dominio}/ti/${token}`;
}
