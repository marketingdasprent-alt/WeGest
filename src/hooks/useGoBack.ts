import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Botão "Voltar" com o mesmo comportamento da seta ← do browser: volta à
 * página anterior no histórico (`navigate(-1)`). Se não houver histórico
 * interno — entrou-se por link direto ou é a 1.ª página da sessão — cai no
 * `fallback` (o caminho da lista do recurso), para nunca ficar sem destino.
 *
 * O react-router guarda o índice da entrada atual em `window.history.state.idx`;
 * `idx > 0` significa que há para onde voltar dentro da app.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state?.idx as number | undefined) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
