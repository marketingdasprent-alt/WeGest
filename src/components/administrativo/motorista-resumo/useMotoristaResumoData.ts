import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { MotoristaResumoProps, SlotPeriodo } from '../MotoristaResumoDialog';
import { deriveAluguerSemTarifa } from './aluguerSemTarifa';
import { buildSlotPeriodos } from './slotPeriodos';

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
            .select(
              'cartao_frota, cartao_bp, cartao_repsol, cartao_edp, email, telefone, iban, gestor_responsavel'
            )
            .eq('id', resolvedMotoristaId)
            .maybeSingle(),
          supabase
            .from('motorista_financeiro')
            .select('categoria, valor, tipo')
            .eq('motorista_id', resolvedMotoristaId)
            .gte('data_movimento', format(dateRange.from, 'yyyy-MM-dd'))
            .lte('data_movimento', format(dateRange.to, 'yyyy-MM-dd'))
            .neq('status', 'cancelado'),
          supabase
            .from('motorista_viaturas')
            .select(
              'viatura_id, data_inicio, data_fim, viaturas(matricula, grupo_id, modelo_id, renting_grupos(renting_tarifas(preco_semana, ativa)))'
            )
            .eq('motorista_id', resolvedMotoristaId)
            .lte('data_inicio', format(dateRange.to, 'yyyy-MM-dd'))
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
          // O CONTRATO é a fonte de verdade do preço do aluguer — o modelo da
          // viatura pode ter várias tarifas ativas e escolher "uma qualquer"
          // dava o preço errado (ver ContasResumoTab, mesma cascata).
          supabase
            .from('contratos_renting')
            .select('viatura_id, tarifa_id, estado_operacional, data_inicio, created_at')
            .is('deleted_at', null)
            .not('viatura_id', 'is', null),
        ]);

        const viaturaData = results[0].data;
        const motoristaData = results[1].data;
        const financeiroData = results[2].data;
        const viaturasPeriodoData = (results[3].data ?? []) as Array<{
          viatura_id: string;
          data_inicio: string;
          data_fim: string | null;
          viaturas: {
            matricula: string;
            grupo_id: string | null;
            modelo_id: string | null;
            renting_grupos: {
              renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
            } | null;
          } | null;
        }>;
        const tarifasModelo = (results[4].data ?? []) as Array<{
          tarifa_id: string | null;
          modelo_id: string;
          preco_semana: number;
        }>;
        const tvdeModeloPrecoMap = new Map<string, number>(
          tarifasModelo.map((r) => [r.modelo_id, Number(r.preco_semana)])
        );
        // `${tarifa_id}|${modelo_id}` → preço, para resolver a tarifa que o
        // contrato indica em vez de uma qualquer que esteja ativa.
        const precoPorTarifaModelo = new Map<string, number>(
          tarifasModelo
            .filter((r) => r.tarifa_id)
            .map((r) => [`${r.tarifa_id}|${r.modelo_id}`, Number(r.preco_semana)])
        );

        // viatura_id → tarifa do contrato (em curso primeiro, senão o mais
        // recente). Mesma cascata da tabela de Contas/Resumo — os dois ecrãs
        // têm de mostrar o mesmo aluguer.
        const contratoTarifaPorViatura = new Map<string, string>();
        [...((results[5].data as any[]) ?? [])]
          .sort((a, b) => {
            const emCurso = (c: any) => (c.estado_operacional === 'em_curso' ? 1 : 0);
            if (emCurso(a) !== emCurso(b)) return emCurso(a) - emCurso(b);
            return String(a.data_inicio ?? a.created_at ?? '').localeCompare(
              String(b.data_inicio ?? b.created_at ?? '')
            );
          })
          .forEach((c: any) => {
            if (c.viatura_id && c.tarifa_id)
              contratoTarifaPorViatura.set(c.viatura_id, c.tarifa_id);
          });

        if (viaturaData?.viaturas) {
          setMatricula((viaturaData.viaturas as any).matricula);
        }

        // Aviso "sem tarifa": tem viatura ativa mas o grupo não tem tarifa
        // ativa com preço semanal > 0 (aluguer aparece a 0€ por falta de
        // configuração, não por ser grátis).
        setAluguerSemTarifa(deriveAluguerSemTarifa(viaturasPeriodoData, tvdeModeloPrecoMap));

        if (motoristaData) {
          const m = motoristaData as any;
          const cards = [m.cartao_bp, m.cartao_repsol, m.cartao_edp, m.cartao_frota]
            .filter((c: any) => !!c)
            .join(' / ');
          setCartaoFrota(cards || 'N/A');
          setMotoristaEmail(m.email);
          setMotoristaTelefone(m.telefone);
          setMotoristaIban(m.iban);
          setGestor(m.gestor_responsavel || null);
        }

        if (viaturasPeriodoData.length > 0) {
          // Resolve o preço pela tarifa do CONTRATO quando existe; sem
          // contrato, buildSlotPeriodos cai na tarifa do grupo/modelo (o
          // comportamento antigo) e o resumo assinala isso como estimado.
          let algumEstimado = false;
          const comPrecoDoContrato = viaturasPeriodoData.map((mv) => {
            const tarifaContrato = contratoTarifaPorViatura.get(mv.viatura_id);
            const preco =
              tarifaContrato && mv.viaturas?.modelo_id
                ? precoPorTarifaModelo.get(`${tarifaContrato}|${mv.viaturas.modelo_id}`)
                : undefined;
            if (preco == null) algumEstimado = true;
            return { ...mv, preco_semana: preco ?? null };
          });
          setSlotPeriodos(
            buildSlotPeriodos(comPrecoDoContrato, dateRange.from, dateRange.to, tvdeModeloPrecoMap)
          );
          setAluguerEstimado(algumEstimado);
        }

        if (financeiroData) {
          let recExtras = 0;
          const totals = financeiroData.reduce(
            (acc, curr) => {
              if (curr.categoria === 'reparacao' || curr.categoria === 'renda_viatura') return acc;
              const val = Number(curr.valor) || 0;
              if (curr.tipo === 'credito') {
                if (curr.categoria === 'caucao') return acc;
                recExtras += val;
                return acc;
              }
              if (curr.categoria === 'caucao') acc.caucao += val;
              else if (curr.categoria === 'seguros') acc.seguros += val;
              else acc.outros += val;
              return acc;
            },
            { caucao: 0, seguros: 0, outros: 0 }
          );
          setExtraCosts(totals);
          setOutrasReceitas(recExtras);
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
