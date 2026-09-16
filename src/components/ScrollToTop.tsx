import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MAX_FRAMES = 20;

export const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    // Evita erros de seletor com âncoras que tenham caracteres especiais.
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
