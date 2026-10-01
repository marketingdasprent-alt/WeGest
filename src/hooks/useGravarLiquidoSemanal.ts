import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface GravarLiquidoSemanalInput {
  motoristaId: string | null | undefined;
  motoristaNome: string | null | undefined;
  /** O "VALOR LÍQUIDO A RECEBER" tal como o relatório o mostra. */
  liquido: number;
  semanaInicio: Date;
  semanaFim: Date;
  /** Só grava quando o resumo está pronto — nunca a meio de carregar. */
  pronto: boolean;
}

/**
 * Guarda o líquido semanal JÁ CALCULADO pelo ecrã (não recalcula), para o
 * histórico nunca contradizer o que foi comunicado ao motorista mesmo que a
 * fórmula mude depois. Falha silenciosa: não deve bloquear o ecrã.
 */
export function useGravarLiquidoSemanal({
  motoristaId,
  motoristaNome,
  liquido,
  semanaInicio,
  semanaFim,
  pronto,
}: GravarLiquidoSemanalInput) {
  // Evita regravar a mesma coisa a cada render: só volta a gravar quando
  // muda o motorista, a semana ou o próprio valor.
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
