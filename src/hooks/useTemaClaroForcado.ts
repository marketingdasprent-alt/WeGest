import { useEffect } from 'react';

/**
 * Páginas públicas ficam sempre em claro. O tema da aplicação segue o sistema
 * de quem a abre (`next-themes` põe `dark` no <html>), e um lead com o
 * telemóvel em modo escuro via o formulário da organização a preto. Ao sair
 * da página repõe-se o que estava.
 */
export function useTemaClaroForcado() {
  useEffect(() => {
    const html = document.documentElement;
    const tinhaDark = html.classList.contains('dark');
    const colorSchemeAnterior = html.style.colorScheme;
    html.classList.remove('dark');
    html.style.colorScheme = 'light';
    return () => {
      if (tinhaDark) html.classList.add('dark');
      html.style.colorScheme = colorSchemeAnterior;
    };
  }, []);
}
