import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import {
  buildSlotPeriodos,
  type ViaturaPeriodoInput,
} from '@/components/administrativo/motorista-resumo/slotPeriodos';
import { periodosDeContratos } from '@/components/administrativo/motorista-resumo/periodosDoContrato';
import {
  buildTvdeModeloPrecoMap,
  buildPrecoPorTarifaModelo,
  type TarifaModeloRow,
} from '@/components/administrativo/motorista-resumo/tvdeModeloPreco';
import { classificarMovimento } from '@shared/movimentosMotorista';
import { construirLinhasLiquidoSemanal } from '@/components/administrativo/motorista-resumo/linhasLiquidoSemanal';
import { normalizeName, isNameMatch } from '@/components/administrativo/motoristaNomeMatching';
import { type MotoristaResumo } from '@/components/administrativo/contasResumoExports';

export function useContasResumoSemana(
  weekStart: Date,
  weekEnd: Date,
  periodoFechado: boolean | null
) {
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<MotoristaResumo[]>([]);
  const [motoristasList, setMotoristasList] = useState<Array<{ id: string; nome: string }>>([]);

  const [gestorMap, setGestorMap] = useState<Record<string, string>>({});
  const [matriculaMap, setMatriculaMap] = useState<Record<string, string>>({});
  const [dataContratacaoMap, setDataContratacaoMap] = useState<Record<string, string>>({});
  const [statusAtivoMap, setStatusAtivoMap] = useState<Record<string, boolean>>({});
  const [desativadoEmMap, setDesativadoEmMap] = useState<Record<string, string>>({});
  // motorista_id → a ficha do CRM é a própria empresa ("PREMIUM RIDE"), não uma
  // pessoa. Complementa o `contasFrota` das contas de plataforma mais abaixo:
  // aquele apanha a conta Uber marcada, este apanha a ficha — ver 20260917110000.
  const [contaFrotaMap, setContaFrotaMap] = useState<Record<string, boolean>>({});
  const [aluguerEstimadoMap, setAluguerEstimadoMap] = useState<Record<string, boolean>>({});

  async function recarregar() {
    setLoading(true);
    try {
      const { data: driversData } = await supabase
        .from('bolt_drivers')
        .select('driver_uuid, motorista_id, name, motoristas_ativos(id, nome, recibo_verde)');

      const boltToMotoristaMap: Record<string, string> = {};
      const reciboVerdeMap: Record<string, boolean> = {};
      const motoristaNameMap: Record<string, string> = {};

      (driversData || []).forEach((d) => {
        const motData = d.motoristas_ativos as {
          id: string;
          nome: string;
          recibo_verde: boolean | null;
        } | null;
        if (d.driver_uuid && d.motorista_id) {
          boltToMotoristaMap[d.driver_uuid] = d.motorista_id;
          reciboVerdeMap[d.motorista_id] = motData?.recibo_verde ?? true;
          motoristaNameMap[d.motorista_id] = d.name || motData?.nome || 'Desconhecido';
        }
      });

      const { data: todosMotoristas } = await supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, recibo_verde, uber_uuid, bolt_id, gestor_responsavel, data_contratacao, status_ativo, desativado_em, created_at, is_conta_frota'
        );

      const uberIdMap: Record<string, string> = {};
      const boltIdMap: Record<string, string> = {};

      const nomeToMotoristaMap: Record<
        string,
        { id: string; nome: string; recibo_verde: boolean }
      > = {};
      const crmNomeById: Record<string, string> = {};
      const statusAtivoPorId: Record<string, boolean> = {};
      (todosMotoristas || []).forEach((m) => {
        statusAtivoPorId[m.id] = m.status_ativo !== false;
      });
      (todosMotoristas || []).forEach((m) => {
        const norm = normalizeName(m.nome);
        nomeToMotoristaMap[norm] = { id: m.id, nome: m.nome, recibo_verde: m.recibo_verde ?? true };
        crmNomeById[m.id] = m.nome;

        const ganhaSobre = (existenteId: string | undefined) => {
          if (!existenteId) return true;
          const existenteAtivo = statusAtivoPorId[existenteId] !== false;
          const novoAtivo = m.status_ativo !== false;
          return novoAtivo && !existenteAtivo;
        };
        if (m.uber_uuid && ganhaSobre(uberIdMap[m.uber_uuid])) uberIdMap[m.uber_uuid] = m.id;
        if (m.bolt_id && ganhaSobre(boltIdMap[m.bolt_id])) boltIdMap[m.bolt_id] = m.id;

        if (!(m.id in reciboVerdeMap)) {
          reciboVerdeMap[m.id] = m.recibo_verde ?? true;
        }
      });

      const motoristaById = new Map<string, { id: string; nome: string; recibo_verde: boolean }>();
      for (const v of Object.values(nomeToMotoristaMap)) {
        if (!motoristaById.has(v.id)) motoristaById.set(v.id, v);
      }

      const boltQuery: PromiseLike<{ data: any[] | null; error: any }> = Promise.resolve({
        data: [],
        error: null,
      });

      const uberQuery = supabase
        .from('uber_resumos_semanais')
        .select('uber_driver_id, motorista_nome, motorista_id, ganhos_brutos, gorjetas, viagens')
        .lte('periodo_inicio', format(weekEnd, 'yyyy-MM-dd'))
        .gte('periodo_fim', format(weekStart, 'yyyy-MM-dd'));

      const fmtD = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const periodoStr = `${fmtD(weekStart)}-${fmtD(weekEnd)}`;
      const atividadeQuery = supabase
        .from('uber_atividade_motoristas')
        .select('uber_driver_id, viagens_concluidas')
        .eq('periodo', periodoStr);

      const uberDriversQuery = supabase
        .from('uber_drivers')
        .select('uber_driver_id, motorista_id, full_name, is_conta_frota');

      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;

      const combustivelQuery = supabase
        .from('bp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const repsolQuery = supabase
        .from('repsol_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const edpQuery = supabase
        .from('edp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const viaVerdeQuery = supabase
        .from('via_verde_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const viaturasQuery = supabase
        .from('contratos_renting')
        .select(
          'viatura_id, data_inicio, data_fim, valor_total_manual, tarifa_id, estado_operacional, substituido_em, viaturas(matricula, grupo_id, modelo_id), contrato_condutores!inner(motorista_id)'
        )
        .is('deleted_at', null)
        .lt('data_inicio', format(addDays(weekEnd, 1), 'yyyy-MM-dd'))
        .or(`data_fim.is.null,data_fim.gte.${format(weekStart, 'yyyy-MM-dd')}`);

      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      const tarifasQuery = supabase
        .from('renting_tarifas')
        .select('id, grupo_id, preco_semana')
        .eq('ativa', true);

      const tarifasTvdeModeloQuery = supabase
        .from('renting_tarifa_precos_modelo')
        .select('tarifa_id, modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa)')
        .eq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true);

      const contratosQuery = supabase
        .from('contratos_renting')
        .select('viatura_id, tarifa_id, estado_operacional, data_inicio, created_at')
        .is('deleted_at', null)
        .not('viatura_id', 'is', null);

      const financeiroQuery = supabase
        .from('motorista_financeiro')
        .select('motorista_id, valor, categoria, tipo')
        .gte('data_movimento', weekStartStr)
        .lte('data_movimento', weekEndStr)
        .neq('status', 'cancelado');

      const boltResumosQuery = supabase
        .from('bolt_resumos_semanais')
        .select(
          'motorista_id, motorista_nome, liquido_a_pagar, gorjetas, viagens_terminadas, integracao_id, identificador_motorista'
        )
        .lte('periodo_inicio', weekEndStr)
        .gte('periodo_fim', weekStartStr);

      const [
        boltResult,
        uberResult,
        atividadeResult,
        uberDriversResult,
        combustivelResult,
        repsolResult,
        edpResult,
        boltResumosResult,
        financeiroResult,
        viaturasResult,
        viaVerdeResult,
        tarifasResult,
        tarifasTvdeModeloResult,
        contratosResult,
      ] = await Promise.all([
        boltQuery,
        uberQuery,
        atividadeQuery,
        uberDriversQuery,
        combustivelQuery,
        repsolQuery,
        edpQuery,
        boltResumosQuery,
        financeiroQuery,
        viaturasQuery,
        viaVerdeQuery,
        tarifasQuery,
        tarifasTvdeModeloQuery,
        contratosQuery,
      ]);

      if (boltResult.error) throw boltResult.error;
      if (uberResult.error) throw uberResult.error;

      const combustivelByMotorista: Record<string, number> = {};

      const somarCombustivel = (resultado: any) => {
        (resultado.data || []).forEach((t: any) => {
          if (t.motorista_id) {
            combustivelByMotorista[t.motorista_id] =
              (combustivelByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
          }
        });
      };

      somarCombustivel(combustivelResult);
      somarCombustivel(repsolResult);
      somarCombustivel(edpResult);

      const portagensByMotorista: Record<string, number> = {};
      ((viaVerdeResult as any)?.data || []).forEach((t: any) => {
        if (t.motorista_id) {
          portagensByMotorista[t.motorista_id] =
            (portagensByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
        }
      });

      setMotoristasList((todosMotoristas || []).map((m) => ({ id: m.id, nome: m.nome })));

      const gMap: Record<string, string> = {};
      const dcMap: Record<string, string> = {};
      const saMap: Record<string, boolean> = {};
      const deMap: Record<string, string> = {};
      const cfMap: Record<string, boolean> = {};
      (todosMotoristas || []).forEach((m: any) => {
        if (m.gestor_responsavel) gMap[m.id] = m.gestor_responsavel;
        dcMap[m.id] = m.data_contratacao || m.created_at;
        saMap[m.id] = m.status_ativo !== false;
        if (m.desativado_em) deMap[m.id] = m.desativado_em;
        if (m.is_conta_frota) cfMap[m.id] = true;
      });
      setContaFrotaMap(cfMap);
      setGestorMap(gMap);
      setDataContratacaoMap(dcMap);
      setStatusAtivoMap(saMap);
      setDesativadoEmMap(deMap);
      const mMap: Record<string, string> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (mv.motorista_id && (mv.viaturas as any)?.matricula)
          mMap[mv.motorista_id] = (mv.viaturas as any).matricula;
      });
      setMatriculaMap(mMap);

      const grupoTarifaMap: Record<string, number> = {};
      (tarifasResult.data || []).forEach((t: any) => {
        if (t.grupo_id && t.preco_semana != null) {
          grupoTarifaMap[t.grupo_id] = Number(t.preco_semana) || 0;
        }
      });

      const modeloTvdeTarifaMap: Record<string, number> = {};
      const linhasTarifaModelo = (tarifasTvdeModeloResult.data || []) as TarifaModeloRow[];
      const precoPorTarifaModelo = buildPrecoPorTarifaModelo(linhasTarifaModelo);
      for (const [modeloId, preco] of buildTvdeModeloPrecoMap(linhasTarifaModelo)) {
        modeloTvdeTarifaMap[modeloId] = preco;
      }

      const precoPorTarifaId: Record<string, number> = {};
      (tarifasResult.data || []).forEach((t: any) => {
        if (t.id && t.preco_semana != null) precoPorTarifaId[t.id] = Number(t.preco_semana) || 0;
      });

      const contratoTarifaPorViatura: Record<string, string> = {};
      const contratosOrdenados = [...((contratosResult.data as any[]) || [])].sort((a, b) => {
        const emCurso = (c: any) => (c.estado_operacional === 'em_curso' ? 1 : 0);
        if (emCurso(a) !== emCurso(b)) return emCurso(a) - emCurso(b);
        return String(a.data_inicio ?? a.created_at ?? '').localeCompare(
          String(b.data_inicio ?? b.created_at ?? '')
        );
      });
      contratosOrdenados.forEach((c: any) => {
        if (c.viatura_id && c.tarifa_id) contratoTarifaPorViatura[c.viatura_id] = c.tarifa_id;
      });

      const viaturasPorMotorista = new Map<string, ViaturaPeriodoInput[]>();
      const aluguerEstimadoMap: Record<string, boolean> = {};
      (viaturasResult.data || []).forEach((ct: any) => {
        const condutores: Array<{ motorista_id: string | null }> = Array.isArray(
          ct.contrato_condutores
        )
          ? ct.contrato_condutores
          : ct.contrato_condutores
            ? [ct.contrato_condutores]
            : [];
        const { periodos, estimado } = periodosDeContratos([ct], {
          porTarifaModelo: precoPorTarifaModelo,
          porTarifa: precoPorTarifaId,
          porGrupo: grupoTarifaMap,
          porModelo: modeloTvdeTarifaMap,
        });
        if (periodos.length === 0) return;
        for (const c of condutores) {
          if (!c?.motorista_id) continue;
          if (estimado) aluguerEstimadoMap[c.motorista_id] = true;
          const lista = viaturasPorMotorista.get(c.motorista_id) ?? [];
          lista.push(...periodos);
          viaturasPorMotorista.set(c.motorista_id, lista);
        }
      });
      setAluguerEstimadoMap(aluguerEstimadoMap);

      const aluguerByMotorista: Record<string, number> = {};
      for (const [motoristaId, linhas] of viaturasPorMotorista) {
        const total = buildSlotPeriodos(linhas, weekStart, weekEnd, new Map()).reduce(
          (s, p) => s + p.custo,
          0
        );
        if (total > 0) aluguerByMotorista[motoristaId] = total;
      }

      const reparacoesByMotorista: Record<string, number> = {};
      const adhocByMotorista: Record<string, number> = {};
      const caucaoByMotorista: Record<string, number> = {};
      const segurosByMotorista: Record<string, number> = {};
      const slotByMotorista: Record<string, number> = {};
      const extrasByMotorista: Record<string, number> = {};

      (financeiroResult.data || []).forEach((m: any) => {
        if (!m.motorista_id) return;
        const val = Number(m.valor) || 0;
        const categoria = (m.categoria ?? '').trim().toLowerCase();

        if (m.tipo === 'debito' && categoria === 'reparacao') {
          reparacoesByMotorista[m.motorista_id] =
            (reparacoesByMotorista[m.motorista_id] || 0) + val;
          return;
        }

        const { destino } = classificarMovimento(m);
        if (destino === 'receita_outras') {
          extrasByMotorista[m.motorista_id] = (extrasByMotorista[m.motorista_id] || 0) + val;
        } else if (destino === 'caucao') {
          caucaoByMotorista[m.motorista_id] = (caucaoByMotorista[m.motorista_id] || 0) + val;
        } else if (destino === 'seguros') {
          segurosByMotorista[m.motorista_id] = (segurosByMotorista[m.motorista_id] || 0) + val;
        } else if (destino === 'slot') {
          slotByMotorista[m.motorista_id] = (slotByMotorista[m.motorista_id] || 0) + val;
        } else if (destino === 'outros') {
          adhocByMotorista[m.motorista_id] = (adhocByMotorista[m.motorista_id] || 0) + val;
        }
      });

      // Contas de frota não são motoristas — excluídas dos resumos (ver migração conta_frota_fora_dos_resumos_uber).
      const contasFrota = new Set(
        (uberDriversResult.data || [])
          .filter((d: any) => d.is_conta_frota)
          .map((d: any) => d.uber_driver_id)
      );

      const uberViagensByDriver: Record<string, number> = {};
      (atividadeResult.data || []).forEach((a) => {
        if (a.uber_driver_id && !contasFrota.has(a.uber_driver_id)) {
          uberViagensByDriver[a.uber_driver_id] =
            (uberViagensByDriver[a.uber_driver_id] || 0) + (a.viagens_concluidas || 0);
        }
      });

      const uberDriverToMotoristaMap: Record<string, string> = {};
      const uberDriverNameMap: Record<string, string> = {};
      (uberDriversResult.data || []).forEach((d) => {
        if (d.uber_driver_id && !contasFrota.has(d.uber_driver_id)) {
          if (d.motorista_id) uberDriverToMotoristaMap[d.uber_driver_id] = d.motorista_id;
          if (d.full_name) uberDriverNameMap[d.uber_driver_id] = d.full_name;
        }
      });

      interface AgrupadoEntry {
        motorista_id: string | null;
        driver_name: string;
        driver_uuid: string;
        faturado_bolt: number;
        faturado_uber: number;
        viagens_bolt: number;
        viagens_uber: number;
        gorjeta?: number;
        identificador_bolt?: string;
      }
      const agrupado: Record<string, AgrupadoEntry> = {};

      (boltResult.data || []).forEach((v) => {
        const driverUuid = v.driver_uuid || 'unknown';
        const identificadorBolt = (v as any).raw_data?.['Identificador do motorista'] || '';

        let motoristaId =
          identificadorBolt && boltIdMap[identificadorBolt]
            ? boltIdMap[identificadorBolt]
            : boltToMotoristaMap[driverUuid] || null;

        let displayName = v.driver_name || 'Desconhecido';

        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        } else if (motoristaId) {
          displayName = motoristaNameMap[motoristaId] || displayName;
        }

        const key = motoristaId || `bolt_${driverUuid}`;

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: driverUuid,
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(v.driver_earnings) || 0;
        agrupado[key].viagens_bolt += 1;
        if (identificadorBolt) agrupado[key].identificador_bolt = identificadorBolt;
      });

      const boltResumosTracked = new Set<string>();
      Object.entries(agrupado).forEach(([key, entry]) => {
        if (entry.faturado_bolt > 0) boltResumosTracked.add(key);
      });

      const gorjetaBoltById: Record<string, number> = {};

      (boltResumosResult.data || []).forEach((r: any) => {
        let motoristaId: string | null = r.motorista_id || null;
        const identificadorBolt = r.identificador_motorista || '';

        if (!motoristaId && identificadorBolt && boltIdMap[identificadorBolt]) {
          motoristaId = boltIdMap[identificadorBolt];
        }

        let displayName = r.motorista_nome || 'Desconhecido';

        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = motoristaId || `bolt_csv_${r.identificador_motorista || displayName}`;

        if (motoristaId) {
          gorjetaBoltById[motoristaId] =
            (gorjetaBoltById[motoristaId] || 0) + (Number(r.gorjetas) || 0);
        }

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(r.liquido_a_pagar) || 0;
        agrupado[key].viagens_bolt += Number(r.viagens_terminadas) || 0;
        if (identificadorBolt && !agrupado[key].identificador_bolt) {
          agrupado[key].identificador_bolt = identificadorBolt;
        }
      });

      const uberByDriver: Record<
        string,
        { firstName: string; lastName: string; total: number; count: number; gorjeta: number }
      > = {};
      (uberResult.data || []).forEach((t) => {
        const driverId = t.uber_driver_id || 'unknown';
        if (contasFrota.has(driverId)) return;
        const nome = (t.motorista_nome || '').trim();
        const espaco = nome.indexOf(' ');
        if (!uberByDriver[driverId]) {
          uberByDriver[driverId] = {
            firstName: espaco > 0 ? nome.slice(0, espaco) : nome,
            lastName: espaco > 0 ? nome.slice(espaco + 1) : '',
            total: 0,
            count: 0,
            gorjeta: 0,
          };
        }
        uberByDriver[driverId].total += Number(t.ganhos_brutos) || 0;
        uberByDriver[driverId].gorjeta += Number(t.gorjetas) || 0;
        uberByDriver[driverId].count = uberViagensByDriver[driverId] || 0;
      });

      for (const [driverId, viagens] of Object.entries(uberViagensByDriver)) {
        if (!uberByDriver[driverId]) {
          uberByDriver[driverId] = {
            firstName: uberDriverNameMap[driverId]?.split(' ')[0] || '',
            lastName: uberDriverNameMap[driverId]?.split(' ').slice(1).join(' ') || '',
            total: 0,
            count: viagens,
            gorjeta: 0,
          };
        }
      }

      Object.entries(uberByDriver).forEach(([uberDriverId, uberData]) => {
        const uberFullName = `${uberData.firstName} ${uberData.lastName}`.trim();

        let matchedMotoristaId: string | null =
          uberIdMap[uberDriverId] || uberDriverToMotoristaMap[uberDriverId] || null;
        let matchedName = uberFullName || uberDriverNameMap[uberDriverId] || uberDriverId;

        if (matchedMotoristaId) {
          const motData = motoristaById.get(matchedMotoristaId);
          if (motData) {
            matchedName = motData.nome;
            reciboVerdeMap[motData.id] = motData.recibo_verde;
          }
        } else {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(matchedName, mData.nome)) {
              matchedMotoristaId = mData.id;
              matchedName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = matchedMotoristaId || `uber_${uberDriverId}`;

        if (agrupado[key]) {
          agrupado[key].faturado_uber += uberData.total;
          agrupado[key].viagens_uber += uberData.count;
        } else {
          agrupado[key] = {
            motorista_id: matchedMotoristaId,
            driver_name: matchedName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: uberData.total,
            viagens_bolt: 0,
            viagens_uber: uberData.count,
          };
        }
        agrupado[key].gorjeta = (agrupado[key].gorjeta || 0) + (uberData.gorjeta || 0);
      });

      for (const [motoristaId, totalFuel] of Object.entries(combustivelByMotorista)) {
        if (!agrupado[motoristaId] && totalFuel > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalRep] of Object.entries(reparacoesByMotorista)) {
        if (!agrupado[motoristaId] && totalRep > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      const custosDoMotorista = (id: string) =>
        (adhocByMotorista[id] || 0) + (caucaoByMotorista[id] || 0) + (segurosByMotorista[id] || 0);

      for (const motoristaId of new Set([
        ...Object.keys(adhocByMotorista),
        ...Object.keys(caucaoByMotorista),
        ...Object.keys(segurosByMotorista),
      ])) {
        if (!agrupado[motoristaId] && custosDoMotorista(motoristaId) > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalSlotMotorista] of Object.entries(slotByMotorista)) {
        if (!agrupado[motoristaId] && totalSlotMotorista > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      const fundir = (alvoKey: string, dupKey: string) => {
        if (alvoKey === dupKey) return;
        const dup = agrupado[dupKey];
        if (!dup || !agrupado[alvoKey]) return;
        agrupado[alvoKey].faturado_bolt += dup.faturado_bolt;
        agrupado[alvoKey].faturado_uber += dup.faturado_uber;
        agrupado[alvoKey].gorjeta = (agrupado[alvoKey].gorjeta || 0) + (dup.gorjeta || 0);
        agrupado[alvoKey].viagens_bolt += dup.viagens_bolt;
        agrupado[alvoKey].viagens_uber += dup.viagens_uber;
        if (!agrupado[alvoKey].motorista_id && dup.motorista_id) {
          agrupado[alvoKey].motorista_id = dup.motorista_id;
        }
        if (!agrupado[alvoKey].identificador_bolt && dup.identificador_bolt) {
          agrupado[alvoKey].identificador_bolt = dup.identificador_bolt;
        }
        delete agrupado[dupKey];
      };

      const idDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        if (entry.motorista_id) {
          (idDedupMap[entry.motorista_id] ||= []).push(key);
        }
      }
      for (const keys of Object.values(idDedupMap)) {
        if (keys.length <= 1) continue;
        const primaryKey =
          keys.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) || keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      const nameDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        const nomeCanon =
          (entry.motorista_id && crmNomeById[entry.motorista_id]) || entry.driver_name;
        const norm = normalizeName(nomeCanon);
        if (norm) (nameDedupMap[norm] ||= []).push(key);
      }
      for (const keys of Object.values(nameDedupMap)) {
        if (keys.length <= 1) continue;
        const comId = keys.filter((k) => agrupado[k]?.motorista_id);
        const idsDistintos = new Set(comId.map((k) => agrupado[k]!.motorista_id));
        if (idsDistintos.size > 1) {
          const primaria = comId[0];
          keys.filter((k) => !agrupado[k]?.motorista_id).forEach((k) => fundir(primaria, k));
          continue;
        }
        const primaryKey =
          comId.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) ||
          comId[0] ||
          keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      const resumosCalculados = Object.values(agrupado).map((m) => {
        const displayNameFinal = (m.motorista_id && crmNomeById[m.motorista_id]) || m.driver_name;
        const extrasValor = m.motorista_id ? extrasByMotorista[m.motorista_id] || 0 : 0;
        const totalFaturado = m.faturado_bolt + m.faturado_uber + extrasValor;
        const totalViagens = m.viagens_bolt + m.viagens_uber;
        const passaReciboVerde = m.motorista_id ? (reciboVerdeMap[m.motorista_id] ?? true) : true;

        const gorjetaBolt = m.motorista_id ? gorjetaBoltById[m.motorista_id] || 0 : 0;
        const gorjetaUber = m.gorjeta || 0;
        const ajustarBase = (total: number, gorjetaPlataforma: number) =>
          passaReciboVerde ? total : (total - gorjetaPlataforma) / 1.06 + gorjetaPlataforma;
        const receita =
          ajustarBase(m.faturado_bolt, gorjetaBolt) +
          ajustarBase(m.faturado_uber, gorjetaUber) +
          extrasValor;
        const combustivelValor = m.motorista_id ? combustivelByMotorista[m.motorista_id] || 0 : 0;
        const portagensValor = m.motorista_id ? portagensByMotorista[m.motorista_id] || 0 : 0;
        const aluguerValor = m.motorista_id ? aluguerByMotorista[m.motorista_id] || 0 : 0;
        const reparacoesValor = m.motorista_id ? reparacoesByMotorista[m.motorista_id] || 0 : 0;
        const adhocValor = m.motorista_id ? adhocByMotorista[m.motorista_id] || 0 : 0;
        const caucaoValor = m.motorista_id ? caucaoByMotorista[m.motorista_id] || 0 : 0;
        const segurosValor = m.motorista_id ? segurosByMotorista[m.motorista_id] || 0 : 0;
        const slotValor = m.motorista_id ? slotByMotorista[m.motorista_id] || 0 : 0;
        const liquido =
          receita -
          combustivelValor -
          portagensValor -
          aluguerValor -
          reparacoesValor -
          adhocValor -
          caucaoValor -
          segurosValor -
          slotValor;

        return {
          driver_name: displayNameFinal,
          driver_uuid: m.driver_uuid,
          motorista_id: m.motorista_id || undefined,
          total_faturado: totalFaturado,
          faturado_bolt: m.faturado_bolt,
          faturado_uber: m.faturado_uber,
          gorjeta_bolt: gorjetaBolt,
          gorjeta_uber: gorjetaUber,
          total_viagens: totalViagens,
          viagens_bolt: m.viagens_bolt,
          viagens_uber: m.viagens_uber,
          recibo_verde: passaReciboVerde,
          liquido,
          combustivel: combustivelValor,
          portagens: portagensValor,
          reparacoes: reparacoesValor,
          outros_custos: adhocValor + caucaoValor + segurosValor,
          slot: slotValor,
          aluguer: aluguerValor,
          identificador_bolt: m.identificador_bolt,
        };
      });

      resumosCalculados.sort((a, b) => b.total_faturado - a.total_faturado);
      const comUid: MotoristaResumo[] = resumosCalculados.map((r, idx) => ({
        ...r,
        _uid: r.motorista_id || r.driver_uuid || `${r.driver_name || 'sem-nome'}__${idx}`,
      }));
      setResumos(comUid);

      if (periodoFechado !== true) {
        console.info('[liquido semanal] período por fechar — calculado, não gravado.');
      } else {
        try {
          const linhas = construirLinhasLiquidoSemanal(comUid, {
            semanaInicio: weekStartStr,
            semanaFim: weekEndStr,
            gravadoEm: new Date().toISOString(),
            gravadoPor: (await supabase.auth.getUser()).data.user?.id ?? null,
          });
          if (linhas.length > 0) {
            const { error: erroGravar } = await supabase
              .from('motorista_liquido_semanal')
              .upsert(linhas, { onConflict: 'motorista_id,semana_inicio' });
            if (erroGravar) console.error('[liquido semanal] falha ao gravar em lote:', erroGravar);
          }
        } catch (erroGravar) {
          console.error('[liquido semanal] falha ao gravar em lote:', erroGravar);
        }
      }

      const motoristaIdsComSaldo = comUid
        .map((r) => r.motorista_id)
        .filter((id): id is string => !!id);
      if (motoristaIdsComSaldo.length > 0) {
        const { data: saldos, error: erroSaldos } = await supabase.rpc(
          'motoristas_saldo_pendente_lote',
          {
            p_motorista_ids: motoristaIdsComSaldo,
            p_data_inicio: weekStartStr,
            p_data_fim: weekEndStr,
          }
        );
        if (erroSaldos) {
          console.error('Erro ao carregar saldos pendentes:', erroSaldos);
        } else {
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
      toast.error('Erro ao carregar dados de contas');
    } finally {
      setLoading(false);
    }
  }

  const semanaInicioStr = format(weekStart, 'yyyy-MM-dd');
  const semanaFimStr = format(weekEnd, 'yyyy-MM-dd');

  useEffect(() => {
    if (periodoFechado === false) {
      setResumos([]);
      setLoading(false);
      return;
    }
    if (periodoFechado === null) return;
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaInicioStr, semanaFimStr, periodoFechado]);

  return {
    resumos,
    loading,
    setLoading,
    statusAtivoMap,
    contaFrotaMap,
    motoristasList,
    matriculaMap,
    gestorMap,
    desativadoEmMap,
    dataContratacaoMap,
    aluguerEstimadoMap,
    recarregar,
  };
}
