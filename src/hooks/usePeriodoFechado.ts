import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * A semana já foi fechada (existe fecho que a cobre)? null enquanto verifica.
 * Os fechos podem cobrir intervalos personalizados, por isso compara por sobreposição.
 * Em falha de rede devolve true para o resumo continuar visível.
 * O setter serve para quem acabou de fechar o período o marcar sem nova leitura.
 */
export function usePeriodoFechado(
  weekStart: Date,
  weekEnd: Date
): [boolean | null, (fechado: boolean | null) => void] {
  const [periodoFechado, setPeriodoFechado] = useState<boolean | null>(null);
  // Dependências em texto evitam ciclos causados por novas instâncias de Date.
  const inicio = format(weekStart, 'yyyy-MM-dd');
  const fim = format(weekEnd, 'yyyy-MM-dd');

  useEffect(() => {
    let cancelado = false;
    const verificar = async () => {
      setPeriodoFechado(null);
      const { count, error } = await supabase
        .from('motorista_resumo_semanal')
        .select('id', { count: 'exact', head: true })
        .lte('semana_inicio', fim)
        .gte('semana_fim', inicio);
      if (cancelado) return;
      setPeriodoFechado(error ? true : (count ?? 0) > 0);
    };
    verificar();
    return () => {
      cancelado = true;
    };
  }, [inicio, fim]);

  return [periodoFechado, setPeriodoFechado];
}
