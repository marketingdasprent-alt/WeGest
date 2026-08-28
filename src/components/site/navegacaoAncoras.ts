/**
 * Navegação por âncoras da landing, partilhada pelo cabeçalho e pelo hero.
 *
 * Existe para que não haja dois comportamentos na mesma página: um link do
 * índice a deslizar e o "Percorrer o sistema" do hero a teletransportar.
 */

const preferePoucoMovimento = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const comportamentoDeScroll = (): ScrollBehavior =>
  preferePoucoMovimento() ? 'auto' : 'smooth';

/** Leva o visitante a uma secção sem o teletransportar para lá. */
export const irParaSeccao = (id: string) => {
  const destino = document.getElementById(id);
  if (!destino) return;

  // `scroll-margin-top` das secções é respeitado pelo `scrollIntoView`, por
  // isso o destino não fica escondido debaixo do cabeçalho fixo.
  destino.scrollIntoView({ behavior: comportamentoDeScroll(), block: 'start' });

  // O salto instantâneo foi substituído, mas o endereço continua a mudar: quem
  // copiar o URL a meio da página leva a secção consigo. `replaceState` e não
  // `pushState` — navegar no índice não é histórico de navegação.
  window.history.replaceState(null, '', `#${id}`);
};

/**
 * Handler pronto a pôr num `<a href="#id">`. O elemento continua a ser um link
 * de verdade — clique do meio, teclado e leitores de ecrã não perdem nada; só
 * o salto é que passa a ser suave.
 */
export const aoClicarNaAncora = (evento: React.MouseEvent, id: string) => {
  evento.preventDefault();
  irParaSeccao(id);
};
