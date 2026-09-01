import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { MotoristaResumoProps, SlotPeriodo } from '../MotoristaResumoDialog';
import { buildSlotPeriodos } from './slotPeriodos';
import { periodosDeContratos, type ContratoParaPeriodo } from './periodosDoContrato';
import { buildTvdeModeloPrecoMap, buildPrecoPorTarifaModelo } from './tvdeModeloPreco';
import { formatCartoesFrota, type CartaoFrotaResumo } from './cartoesFrota';
import { agregarMovimentos } from '@shared/movimentosMotorista';

export interface UseMotoristaResumoDataReturn {
  loading: boolean;
  matricula: string | null;
  cartaoFrota: string | null;
  gestor: string | null;
  motoristaEmail: string | null;
  motoristaTelefone: string | null;
  motoristaIban: string | null;
  extraCosts: { caucao: number; seguros: number; outros: number };
  outrasReceitas: number;
  slotPeriodos: SlotPeriodo[];
  aluguerSemTarifa: boolean;
  /** O aluguer NAO veio de um contrato (preco tirado da tarifa do modelo).
   *  O resumo avisa, em vez de mostrar um preco de origem desconhecida. */
  aluguerEstimado: boolean;
}

/**
 * Hook que carrega os dados complementares do motorista (matrícula, cartão frota,
 * gestor, IBAN, telefone, email, custos extra, receitas extra e períodos de slot)
 * sempre que o dialog abre e o motorista muda.
 *
 * Extraído de MotoristaResumoDialog para reduzir o tamanho do componente.
 * Comportamento preservado 1:1 — incluíndo o eslint-disable de exhaustive-deps.
 */
export function useMotoristaResumoData(
  open: boolean,
  motorista: MotoristaResumoProps | null,
  dateRange: { from: Date; to: Date }
): UseMotoristaResumoDataReturn {
  const [loading, setLoading] = useState(false);
  const [matricula, setMatricula] = useState<string | null>(null);
  const [cartaoFrota, setCartaoFrota] = useState<string | null>(null);
  const [gestor, setGestor] = useState<string | null>(null);
  const [motoristaEmail, setMotoristaEmail] = useState<string | null>(null);
  const [motoristaTelefone, setMotoristaTelefone] = useState<string | null>(null);
  const [motoristaIban, setMotoristaIban] = useState<string | null>(null);
  const [extraCosts, setExtraCosts] = useState<{ caucao: number; seguros: number; outros: number }>(
    { caucao: 0, seguros: 0, outros: 0 }
  );
  const [outrasReceitas, setOutrasReceitas] = useState(0);
  const [slotPeriodos, setSlotPeriodos] = useState<SlotPeriodo[]>([]);
  const [aluguerSemTarifa, setAluguerSemTarifa] = useState(false);
  const [aluguerEstimado, setAluguerEstimado] = useState(false);

  useEffect(() => {
    if (open && (motorista?.motorista_id || motorista?.driver_uuid)) {
      fetchDadosMotorista();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, motorista?.motorista_id, motorista?.driver_uuid]);

  async function fetchDadosMotorista() {
    if (!motorista?.motorista_id && !motorista?.driver_uuid) return;

    setLoading(true);
    setMatricula(null);
    setCartaoFrota(null);
    setGestor(null);
    setMotoristaIban(null);
    setExtraCosts({ caucao: 0, seguros: 0, outros: 0 });
    setSlotPeriodos([]);
    setAluguerSemTarifa(false);
    setAluguerEstimado(false);

    try {
      let resolvedMotoristaId = motorista.motorista_id || null;

      if (!resolvedMotoristaId) {
        const query = supabase.from('motoristas_ativos').select('id');
        if (motorista.driver_uuid) {
          const { data } = await query.eq('uber_uuid', motorista.driver_uuid).maybeSingle();
          if (data) resolvedMotoristaId = data.id;
        }
        if (!resolvedMotoristaId && motorista.identificador_bolt) {
          const { data } = await query.eq('bolt_id', motorista.identificador_bolt).maybeSingle();
          if (data) resolvedMotoristaId = data.id;
        }
      }

      if (!resolvedMotoristaId && motorista.driver_uuid) {
        const { data: mapeamento } = await supabase
          .from('bolt_mapeamento_motoristas')
          .select('motorista_id')
          .eq('driver_uuid', motorista.driver_uuid)
          .maybeSingle();
        resolvedMotoristaId = mapeamento?.motorista_id || null;
      }

      if (!resolvedMotoristaId && motorista.driver_name) {
        const { data: matched } = await supabase
          .from('motoristas_ativos')
          .select('id')
          .ilike('nome', `%${motorista.driver_name}%`)
          .limit(1)
          .maybeSingle();
        resolvedMotoristaId = matched?.id || null;
      }

      if (resolvedMotoristaId) {
        const results = await Promise.all([
          supabase
            .from('motorista_viaturas')
            .select('viatura_id, viaturas(matricula, valor_aluguer)')
            .eq('motorista_id', resolvedMotoristaId)
            .lte('data_inicio', format(dateRange.to, 'yyyy-MM-dd'))
            .or(`data_fim.is.null,data_fim.gte.${format(dateRange.from, 'yyyy-MM-dd')}`)
            .order('data_inicio', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('motoristas_ativos')
            .select('email, telefone, iban, gestor_responsavel')
            .eq('id', resolvedMotoristaId)
            .maybeSingle(),
          supabase
            .from('motorista_financeiro')
            .select('categoria, valor, tipo')
            .eq('motorista_id', resolvedMotoristaId)
            .gte('data_movimento', format(dateRange.from, 'yyyy-MM-dd'))
            .lte('data_movimento', format(dateRange.to, 'yyyy-MM-dd'))
            .neq('status', 'cancelado'),
          // O aluguer sai do CONTRATO — datas e preço. Isto lia
          // `motorista_viaturas`, e um contrato criado com início retroactivo
          // (transferência, regularização) ficava com a atribuição carimbada
          // com a data de hoje: o contrato dizia 24/08, a atribuição dizia
          // 01/09, e a semana de 24–30/08 aparecia a 0,00 € de aluguer com o
          // contrato à frente dos olhos. Ver periodosDoContrato.ts.
          supabase
            .from('contratos_renting')
            .select(
              'viatura_id, data_inicio, data_fim, valor_total_manual, tarifa_id, estado_operacional, substituido_em, viaturas(matricula, grupo_id, modelo_id), contrato_condutores!inner(motorista_id)'
            )
            .eq('contrato_condutores.motorista_id', resolvedMotoristaId)
            .is('deleted_at', null)
            // `data_inicio` é timestamptz: com `.lte(data)` perde-se um
            // contrato que comece com hora no último dia do período.
            .lt('data_inicio', format(addDays(dateRange.to, 1), 'yyyy-MM-dd'))
            .or(`data_fim.is.null,data_fim.gte.${format(dateRange.from, 'yyyy-MM-dd')}`)
            .order('data_inicio', { ascending: true }),
          // TVDE não tem preço por grupo — é por MODELO (renting_tarifa_precos_
          // modelo). Sem isto, o aluguer de viaturas TVDE aparecia sempre a 0€
          // porque o grupo em si não tem tarifa direta.
          supabase
            .from('renting_tarifa_precos_modelo')
            .select('tarifa_id, modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa)')
            .eq('renting_tarifas.tipo', 'tvde')
            .eq('renting_tarifas.ativa', true),
          // Cartões de combustível: a MESMA fonte que a ficha do motorista
          // usa. Ver cartoesFrota.ts — o resumo lia as colunas de texto
          // motoristas_ativos.cartao_*, que a ficha já não mantém.
          supabase
            .from('cartoes_frota')
            .select('numero, tipo')
            .eq('motorista_id', resolvedMotoristaId)
            .order('tipo')
            .order('numero'),
        ]);

        const viaturaData = results[0].data;
        const motoristaData = results[1].data;
        const financeiroData = results[2].data;
        const contratosDoMotorista = (results[3].data ?? []) as ContratoParaPeriodo[];
        const tarifasModelo = (results[4].data ?? []) as Array<{
          tarifa_id: string | null;
          modelo_id: string;
          preco_semana: number;
        }>;
        // Mesma construção que o ecrã de Contas/Resumo usa — os dois têm de
        // dar o mesmo aluguer, e nenhum dos dois pode depender da ordem por
        // que a base devolve as tarifas. Ver tvdeModeloPreco.ts.
        const tvdeModeloPrecoMap = buildTvdeModeloPrecoMap(tarifasModelo);
        // `${tarifa_id}|${modelo_id}` → preço, para resolver a tarifa que o
        // contrato indica em vez de uma qualquer que esteja ativa.
        const precoPorTarifaModelo = buildPrecoPorTarifaModelo(tarifasModelo);

        // Os períodos de aluguer saem dos CONTRATOS: datas do contrato, preço
        // do contrato. Ver periodosDoContrato.ts.
        const { periodos: periodosDoAluguer, estimado: algumEstimado } = periodosDeContratos(
          contratosDoMotorista,
          { porTarifaModelo: precoPorTarifaModelo, porModelo: tvdeModeloPrecoMap }
        );

        if (viaturaData?.viaturas) {
          setMatricula((viaturaData.viaturas as any).matricula);
        }

        // Aviso "sem tarifa": há contrato a cobrir o período mas nenhum
        // conseguiu produzir um preço (aluguer a 0€ por falta de configuração,
        // não por ser grátis).
        setAluguerSemTarifa(
          periodosDoAluguer.length > 0 && periodosDoAluguer.every((p) => p.preco_semana == null)
        );

        setCartaoFrota(formatCartoesFrota((results[5].data ?? []) as CartaoFrotaResumo[]));

        if (motoristaData) {
          const m = motoristaData as any;
          setMotoristaEmail(m.email);
          setMotoristaTelefone(m.telefone);
          setMotoristaIban(m.iban);
          setGestor(m.gestor_responsavel || null);
        }

        if (periodosDoAluguer.length > 0) {
          setSlotPeriodos(
            buildSlotPeriodos(periodosDoAluguer, dateRange.from, dateRange.to, tvdeModeloPrecoMap)
          );
          setAluguerEstimado(algumEstimado);
        }

        if (financeiroData) {
          // A mesma função que o fecho e a lista de Contas/Resumo usam. Cada
          // um destes três tinha a sua versão da regra, e discordavam: um
          // crédito de renda_viatura era receita para o fecho e lixo para
          // este ecrã. Ver movimentosMotorista.ts.
          const mov = agregarMovimentos(financeiroData);
          setExtraCosts({
            caucao: mov.caucao,
            seguros: mov.seguros,
            outros: mov.outros,
          });
          setOutrasReceitas(mov.receitaOutras);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados do motorista:', error);
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    matricula,
    cartaoFrota,
    gestor,
    motoristaEmail,
    motoristaTelefone,
    motoristaIban,
    extraCosts,
    outrasReceitas,
    slotPeriodos,
    aluguerSemTarifa,
    aluguerEstimado,
  };
}
