import { useEffect, useState } from 'react';
import { addMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface ContratoARenovar {
  id: string;
  numero_contrato: number;
  motorista_nome: string | null;
  matricula: string | null;
  diasParaRenovar: number;
}

export function useContratosARenovar() {
  const [contratos, setContratos] = useState<ContratoARenovar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    supabase
      .from('contratos')
      .select(
        'id, numero_contrato, data_inicio, data_fim, duracao_meses, motorista_nome, motorista_id, viatura_id, viaturas:viatura_id(matricula)'
      )
      .eq('status', 'ativo')
      .not('data_inicio', 'is', null)
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelado) return;
        if (error || !data) {
          setContratos([]);
          setLoading(false);
          return;
        }

        const hojeSemHora = new Date();
        hojeSemHora.setHours(0, 0, 0, 0);

        const comRenovacao = data.map((ct: any) => {
          const fim = ct.data_fim
            ? new Date(ct.data_fim + 'T00:00:00')
            : addMonths(new Date(ct.data_inicio + 'T00:00:00'), ct.duracao_meses ?? 12);
          const diasParaRenovar = Math.ceil(
            (fim.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24)
          );
          return { ...ct, _fim: fim, diasParaRenovar };
        });

        const unicos = Array.from(
          comRenovacao
            .reduce((mapa: Map<string, any>, ct: any) => {
              const chave = `${ct.motorista_id ?? ''}|${ct.viatura_id ?? ''}|${ct.data_inicio ?? ''}`;
              const existente = mapa.get(chave);
              if (!existente || (ct.numero_contrato ?? 0) > (existente.numero_contrato ?? 0)) {
                mapa.set(chave, ct);
              }
              return mapa;
            }, new Map<string, any>())
            .values()
        );

        const aRenovar = unicos
          .filter((ct: any) => ct.diasParaRenovar >= 0 && ct.diasParaRenovar <= 60)
          .sort((a: any, b: any) => a._fim.getTime() - b._fim.getTime())
          .map((ct: any) => ({
            id: ct.id,
            numero_contrato: ct.numero_contrato,
            motorista_nome: ct.motorista_nome,
            matricula: ct.viaturas?.matricula ?? null,
            diasParaRenovar: ct.diasParaRenovar,
          }));

        setContratos(aRenovar);
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return { contratos, loading };
}
