import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface GravarLiquidoSemanalInput {
  motoristaId: string | null | undefined;
  motoristaNome: string | null | undefined;
  liquido: number;
  semanaInicio: Date;
  semanaFim: Date;
  pronto: boolean;
}

export function useGravarLiquidoSemanal({
  motoristaId,
  motoristaNome,
  liquido,
  semanaInicio,
  semanaFim,
  pronto,
}: GravarLiquidoSemanalInput) {
  const ultimaGravacao = useRef<string | null>(null);

  useEffect(() => {
    if (!pronto || !motoristaId || !Number.isFinite(liquido)) return;

    const inicio = format(semanaInicio, 'yyyy-MM-dd');
    const fim = format(semanaFim, 'yyyy-MM-dd');
    const assinatura = `${motoristaId}|${inicio}|${liquido}`;
    if (ultimaGravacao.current === assinatura) return;
    ultimaGravacao.current = assinatura;

    const gravar = async () => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('motorista_liquido_semanal').upsert(
        {
          motorista_id: motoristaId,
          motorista_nome: motoristaNome ?? null,
          semana_inicio: inicio,
          semana_fim: fim,
          liquido,
          gravado_em: new Date().toISOString(),
          gravado_por: user?.user?.id ?? null,
        },
        { onConflict: 'motorista_id,semana_inicio' }
      );
      if (error) console.error('[liquido semanal] falha ao gravar:', error);
    };

    void gravar();
  }, [pronto, motoristaId, motoristaNome, liquido, semanaInicio, semanaFim]);
}
