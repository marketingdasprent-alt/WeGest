import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Quantos frames esperar pelo elemento antes de desistir e ir para o topo. */
const MAX_FRAMES = 20;

/**
 * Ao mudar de rota, volta ao topo — exceto quando o URL traz uma âncora, caso
 * em que salta para o elemento indicado.
 *
 * O tratamento da âncora não é um extra: o React Router não faz scroll para
 * `#hash` por si, e este componente fazia `scrollTo(0, 0)` em qualquer mudança
 * de rota. Resultado: links como `/#contacto` — usados pelos CTA das páginas
 * institucionais para chegar ao formulário da landing — aterravam no topo da
 * página inicial, e o visitante tinha de procurar o formulário à mão.
 *
 * As páginas são carregadas em lazy, portanto o elemento de destino pode ainda
 * não existir no primeiro frame depois da navegação — daí a tentativa repetida
 * durante alguns frames, com recurso ao topo se nunca aparecer.
 */
export const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    // `getElementById` e não `querySelector`: uma âncora com caracteres
    // inválidos como seletor faria o querySelector lançar.
    const id = decodeURIComponent(hash.slice(1));
    let frames = 0;
    let raf = 0;

    const tentar = () => {
      const alvo = document.getElementById(id);
      if (alvo) {
        alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (frames < MAX_FRAMES) {
        frames += 1;
        raf = requestAnimationFrame(tentar);
        return;
      }
      window.scrollTo(0, 0);
    };

    raf = requestAnimationFrame(tentar);
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash]);

  return null;
};
