import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ehColunaDetalheEmFalta } from '@/lib/resumoSemanalDetalhe';
import { carregarDadosResumoSemana } from '@/lib/resumoSemana/carregarDadosResumoSemana';
import { construirLinhasLiquidoSemanal } from '@/components/administrativo/motorista-resumo/linhasLiquidoSemanal';
import {
  calcularResumosSemana,
  type MapasDaFicha,
} from '@/components/administrativo/motorista-resumo/calcularResumosSemana';
import { type MotoristaResumo } from '@/components/administrativo/contasResumoExports';

interface OpcoesContasResumoSemana {
  /** Só calcula: não grava o líquido de todos (a ficha do motorista usa a mesma conta). */
  soLeitura?: boolean;
  /** Ficha: só este motorista, com os dados fechados pela função no servidor. */
  motoristaId?: string;
}

const MAPAS_VAZIOS: MapasDaFicha = {
  gestorMap: {},
  dataContratacaoMap: {},
  statusAtivoMap: {},
  desativadoEmMap: {},
  contaFrotaMap: {},
  matriculaMap: {},
  aluguerEstimadoMap: {},
};

async function gravarLiquidoSemanal(
  resumos: MotoristaResumo[],
  semanaInicio: string,
  semanaFim: string
) {
  try {
    const linhas = construirLinhasLiquidoSemanal(resumos, {
      semanaInicio,
      semanaFim,
      gravadoEm: new Date().toISOString(),
      gravadoPor: (await supabase.auth.getUser()).data.user?.id ?? null,
    });
    if (linhas.length === 0) return;
    const gravar = (l: unknown[]) =>
      supabase
        .from('motorista_liquido_semanal')
        .upsert(l as never, { onConflict: 'motorista_id,semana_inicio' });
    let { error: erroGravar } = await gravar(linhas);
    // Base ainda sem a coluna do resumo (migração por aplicar): o líquido
    // grava-se na mesma, só sem a fotografia. Nunca perder o acerto por isto.
    if (erroGravar && ehColunaDetalheEmFalta(erroGravar)) {
      ({ error: erroGravar } = await gravar(linhas.map(({ detalhe: _d, ...resto }) => resto)));
    }
    if (erroGravar) console.error('[liquido semanal] falha ao gravar em lote:', erroGravar);
  } catch (erroGravar) {
    console.error('[liquido semanal] falha ao gravar em lote:', erroGravar);
  }
}

export function useContasResumoSemana(
  weekStart: Date,
  weekEnd: Date,
  periodoFechado: boolean | null,
  { soLeitura = false, motoristaId }: OpcoesContasResumoSemana = {}
) {
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<MotoristaResumo[]>([]);
  const [motoristasList, setMotoristasList] = useState<Array<{ id: string; nome: string }>>([]);
  const [mapas, setMapas] = useState<MapasDaFicha>(MAPAS_VAZIOS);

  const semanaInicioStr = format(weekStart, 'yyyy-MM-dd');
  const semanaFimStr = format(weekEnd, 'yyyy-MM-dd');
  // Trocar de semana ou de motorista a meio: a resposta antiga não pisa a nova.
  const ultimoPedido = useRef(0);

  async function recarregar() {
    const pedido = ++ultimoPedido.current;
    const atual = () => pedido === ultimoPedido.current;
    setLoading(true);
    try {
      const dados = await carregarDadosResumoSemana(weekStart, weekEnd, motoristaId);
      if (!atual()) return;
      const {
        resumos: calculados,
        motoristasList: lista,
        ...novosMapas
      } = calcularResumosSemana(dados, weekStart, weekEnd);
      setMotoristasList(lista);
      setMapas(novosMapas);
      setResumos(calculados);

      // Quem grava é a lista de Contas/Resumo; a ficha só mostra.
      const gravaLiquido = !soLeitura && !motoristaId;
      if (gravaLiquido && periodoFechado === true) {
        await gravarLiquidoSemanal(calculados, semanaInicioStr, semanaFimStr);
      } else if (gravaLiquido) {
        console.info('[liquido semanal] período por fechar — calculado, não gravado.');
      }

      const idsComSaldo = calculados
        .map((r) => r.motorista_id)
        .filter((id): id is string => !!id && (!motoristaId || id === motoristaId));
      if (idsComSaldo.length > 0) {
        const { data: saldos, error: erroSaldos } = await supabase.rpc(
          'motoristas_saldo_pendente_lote',
          { p_motorista_ids: idsComSaldo, p_data_inicio: semanaInicioStr, p_data_fim: semanaFimStr }
        );
        if (erroSaldos) {
          console.error('Erro ao carregar saldos pendentes:', erroSaldos);
        } else if (atual()) {
          const saldoPorMotorista = new Map(
            (saldos ?? []).map((s) => [s.motorista_id, Number(s.saldo) || 0])
          );
          setResumos((prev) =>
            prev.map((r) => ({
              ...r,
              saldoPendente: r.motorista_id ? (saldoPorMotorista.get(r.motorista_id) ?? 0) : 0,
            }))
          );
        }
      }
    } catch (error) {
      console.error('Erro ao carregar resumos:', error);
      if (atual()) toast.error('Erro ao carregar dados de contas');
    } finally {
      if (atual()) setLoading(false);
    }
  }

  useEffect(() => {
    if (periodoFechado === false) {
      setResumos([]);
      setLoading(false);
      return;
    }
    if (periodoFechado === null) return;
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaInicioStr, semanaFimStr, periodoFechado, motoristaId]);

  return {
    resumos,
    loading,
    setLoading,
    ...mapas,
    motoristasList,
    recarregar,
  };
}
