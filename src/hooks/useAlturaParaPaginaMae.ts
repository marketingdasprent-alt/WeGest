import { useEffect, useRef } from 'react';

import { mensagemDeAltura } from '@/utils/formularioEmbed';

/**
 * Dentro de um iframe, avisa a página mãe da altura do conteúdo sempre que
 * ela muda (etapa seguinte, erro de validação, ecrã de sucesso), para o
 * iframe crescer e não haver scroll dentro de scroll. Só a altura sai; a
 * origem de destino é livre porque o número não é sensível.
 */
export function useAlturaParaPaginaMae(ativo: boolean, pronto: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!ativo || !pronto || !el || window.parent === window) return;

    const enviar = () =>
      window.parent.postMessage(mensagemDeAltura(el.getBoundingClientRect().height), '*');
    enviar();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(enviar);
    observador.observe(el);
    return () => observador.disconnect();
  }, [ativo, pronto]);

  return ref;
}
