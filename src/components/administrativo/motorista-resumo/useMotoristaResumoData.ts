import { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO, max, min } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { MotoristaResumoProps, SlotPeriodo } from '../MotoristaResumoDialog';
import { deriveAluguerSemTarifa } from './aluguerSemTarifa';

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
              'viatura_id, data_inicio, data_fim, viaturas(matricula, grupo_id, renting_grupos(renting_tarifas(preco_semana, ativa)))'
            )
            .eq('motorista_id', resolvedMotoristaId)
            .lte('data_inicio', format(dateRange.to, 'yyyy-MM-dd'))
            .or(`data_fim.is.null,data_fim.gte.${format(dateRange.from, 'yyyy-MM-dd')}`)
            .order('data_inicio', { ascending: true }),
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
            renting_grupos: {
              renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }>;
            } | null;
          } | null;
        }>;

        if (viaturaData?.viaturas) {
          setMatricula((viaturaData.viaturas as any).matricula);
        }

        // Aviso "sem tarifa": tem viatura ativa mas o grupo não tem tarifa
        // ativa com preço semanal > 0 (aluguer aparece a 0€ por falta de
        // configuração, não por ser grátis).
        setAluguerSemTarifa(deriveAluguerSemTarifa(viaturasPeriodoData));

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
          const weekStart = dateRange.from;
          const weekEnd = dateRange.to;
          const totalWeekDays = differenceInDays(weekEnd, weekStart) + 1;

          const periodos: SlotPeriodo[] = viaturasPeriodoData
            .map((mv) => {
              const tarifas = mv.viaturas?.renting_grupos?.renting_tarifas || [];
              const tarifa = tarifas.find((t) => t.ativa);
              const valorSemanal = Number(tarifa?.preco_semana ?? 0);
              if (!valorSemanal) return null;
              const periodStart = max([parseISO(mv.data_inicio), weekStart]);
              const periodEnd = mv.data_fim ? min([parseISO(mv.data_fim), weekEnd]) : weekEnd;
              if (periodStart > periodEnd) return null;
              const dias = differenceInDays(periodEnd, periodStart) + 1;
              const taxaDiaria = valorSemanal / totalWeekDays;
              return {
                matricula: mv.viaturas?.matricula ?? '—',
                dias,
                taxaDiaria,
                custo: dias * taxaDiaria,
                dataInicioStr: format(periodStart, 'dd/MM'),
                dataFimStr: format(periodEnd, 'dd/MM'),
              };
            })
            .filter((p): p is SlotPeriodo => p !== null);
          setSlotPeriodos(periodos);
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
  };
}
