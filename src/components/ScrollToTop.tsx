import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Quantos frames esperar pelo elemento antes de desistir e ir para o topo. */
const MAX_FRAMES = 20;

/**
 * Ao mudar de rota, volta ao topo — exceto com âncora no URL, caso em que salta
 * para o elemento. O React Router não faz scroll para `#hash` sozinho, e como as
 * páginas carregam em lazy, o elemento pode não existir ainda no primeiro frame.
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
