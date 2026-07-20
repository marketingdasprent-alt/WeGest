import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ReceitasData } from '@/components/viaturas/tabs/ViaturaFinanceiraMovimentos';

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Dias inteiros entre duas datas, arredondado pra cima, mínimo 1. */
function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86_400_000));
}

const EMPTY: ReceitasData = {
  contratoReceita: 0,
  contratoRegime: null,
  contratoDetalhe: null,
  multas: 0,
  danos: 0,
  loading: true,
};

export function useViaturaFinanceiraReceitas(viaturaId: string | undefined) {
  const [receitas, setReceitas] = useState<ReceitasData>(EMPTY);

  const loadReceitas = useCallback(async () => {
    if (!viaturaId) return;
    setReceitas((prev) => ({ ...prev, loading: true }));

    try {
      const hoje = new Date();

      // Contrato ativo da viatura. Pode haver várias linhas agendado/em_curso
      // ao mesmo tempo (reservas futuras sobrepostas, comum nos dados de
      // teste) — critério de escolha: 1) 'em_curso' (a decorrer agora) tem
      // sempre prioridade sobre 'agendado' (só planeado); 2) entre iguais,
      // prefere quem tem tarifa resolvível (tarifa_id/tarifa_diaria/
      // valor_total_manual) — senão calha pegar numa reserva placeholder sem
      // preço nenhum configurado. Receita = valor do contrato inteiro até
      // hoje, não do trimestre — um contrato TVDE não tem "fim" natural por
      // trimestre.
      const { data: contratosAtivos } = await supabase
        .from('contratos_renting')
        .select(
          'id, regime, data_inicio, data_fim, tarifa_id, tarifa_diaria, valor_total_manual, estado_operacional'
        )
        .eq('viatura_id', viaturaId)
        .in('estado_operacional', ['agendado', 'em_curso']);

      const temTarifa = (c: (typeof contratosAtivos)[number]) =>
        !!c.tarifa_id || (Number(c.tarifa_diaria) || 0) > 0 || c.valor_total_manual != null;

      const contrato =
        [...(contratosAtivos ?? [])].sort((a, b) => {
          if (a.estado_operacional !== b.estado_operacional) {
            return a.estado_operacional === 'em_curso' ? -1 : 1;
          }
          if (temTarifa(a) !== temTarifa(b)) return temTarifa(a) ? -1 : 1;
          return b.data_inicio.localeCompare(a.data_inicio);
        })[0] ?? null;

      if (!contrato) {
        setReceitas({ ...EMPTY, loading: false });
        return;
      }

      const dataInicio = new Date(`${contrato.data_inicio.split('T')[0]}T00:00:00Z`);
      const dataFim = contrato.data_fim
        ? new Date(`${contrato.data_fim.split('T')[0]}T00:00:00Z`)
        : null;
      const periodoFim = dataFim && dataFim < hoje ? dataFim : hoje;

      let contratoReceita = 0;
      let contratoDetalhe: ReceitasData['contratoDetalhe'] = null;

      if (contrato.regime === 'tvde') {
        const dias = diasEntre(dataInicio, periodoFim);
        const semanas = Math.ceil(dias / 7);

        let valorSemanal = 0;
        if (contrato.tarifa_id) {
          const { data: tarifa } = await supabase
            .from('renting_tarifas')
            .select('preco_semana')
            .eq('id', contrato.tarifa_id)
            .maybeSingle();
          valorSemanal = Number(tarifa?.preco_semana ?? 0);

          // TVDE não tem preço por grupo — é por modelo da viatura.
          if (!valorSemanal) {
            const { data: viatura } = await supabase
              .from('viaturas')
              .select('modelo_id')
              .eq('id', viaturaId)
              .maybeSingle();
            if (viatura?.modelo_id) {
              const { data: precoModelo } = await supabase
                .from('renting_tarifa_precos_modelo')
                .select('preco_semana')
                .eq('tarifa_id', contrato.tarifa_id)
                .eq('modelo_id', viatura.modelo_id)
                .maybeSingle();
              valorSemanal = Number(precoModelo?.preco_semana ?? 0);
            }
          }
        }

        contratoReceita = valorSemanal * semanas;
        contratoDetalhe = { tipo: 'tvde', valorSemanal, semanas };
      } else {
        const dias = diasEntre(dataInicio, periodoFim);
        const tarifaDiaria = Number(contrato.tarifa_diaria) || 0;
        const temOverride = contrato.valor_total_manual != null;
        contratoReceita = temOverride ? Number(contrato.valor_total_manual) : tarifaDiaria * dias;
        contratoDetalhe = { tipo: 'rent_a_car', tarifaDiaria, dias, override: temOverride };
      }

      const inicioStr = toDateStr(dataInicio);
      const fimStr = toDateStr(periodoFim);

      const [multasRes, reparacoesRes] = await Promise.all([
        supabase
          .from('viatura_multas')
          .select('valor')
          .eq('viatura_id', viaturaId)
          .gte('data_infracao', inicioStr)
          .lte('data_infracao', fimStr),
        supabase
          .from('viatura_reparacoes')
          .select('custo, data_entrada, data_saida')
          .eq('viatura_id', viaturaId),
      ]);

      const totalMultas = (multasRes.data || []).reduce(
        (acc: number, r: any) => acc + (Number(r.valor) || 0),
        0
      );

      const totalDanos = (reparacoesRes.data || [])
        .filter((r: any) => {
          const dataRef = r.data_saida ?? r.data_entrada;
          return !!dataRef && dataRef >= inicioStr && dataRef <= fimStr;
        })
        .reduce((acc: number, r: any) => acc + (Number(r.custo) || 0), 0);

      setReceitas({
        contratoReceita,
        // 'slot' existe no enum partilhado mas não gera linhas em
        // contratos_renting na prática — trata-se como rent_a_car por
        // segurança de tipos (a fórmula usada já é a mesma, no `else` acima).
        contratoRegime: contrato.regime === 'tvde' ? 'tvde' : 'rent_a_car',
        contratoDetalhe,
        multas: totalMultas,
        danos: totalDanos,
        loading: false,
      });
    } catch (error) {
      console.error('Erro ao carregar receitas:', error);
      toast.error('Erro ao carregar dados de receitas.');
      setReceitas((prev) => ({ ...prev, loading: false }));
    }
  }, [viaturaId]);

  useEffect(() => {
    loadReceitas();
  }, [loadReceitas]);

  return { receitas, loadReceitas };
}
