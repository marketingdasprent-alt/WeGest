/* eslint-disable max-lines -- Extracção literal de ContasResumoTab.tsx: o
   corpo do cálculo veio byte-a-byte do original, de propósito, para a mudança
   de sítio não poder alterar valores. Parti-lo em módulos mais pequenos é
   trabalho a fazer à parte, com testes de comparação antes/depois — misturá-lo
   com a extracção tirava-lhe a única garantia que ela tem. */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  buildSlotPeriodos,
  type ViaturaPeriodoInput,
} from '@/components/administrativo/motorista-resumo/slotPeriodos';
import {
  buildTvdeModeloPrecoMap,
  buildPrecoPorTarifaModelo,
  type TarifaModeloRow,
} from '@/components/administrativo/motorista-resumo/tvdeModeloPreco';
import { normalizeName, isNameMatch } from '@/components/administrativo/motoristaNomeMatching';
import { type MotoristaResumo } from '@/components/administrativo/contasResumoExports';

/**
 * Cálculo dos resumos de contas por motorista (faturado, aluguer,
 * combustível, portagens, líquido) para uma semana/período. Extraído de
 * ContasResumoTab.tsx tal e qual — ver esse ficheiro (e o comentário junto de
 * `periodoFechado` no componente) para o porquê de o resumo só existir depois
 * do período FECHADO.
 */
export function useContasResumoSemana(
  weekStart: Date,
  weekEnd: Date,
  /** null = ainda não se sabe se o período está fechado (não carrega);
   *  false = período aberto (resumos vazios, sem carregar);
   *  true = carrega. Replica exactamente o gate que hoje vive no useEffect
   *  do componente. */
  periodoFechado: boolean | null
) {
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<MotoristaResumo[]>([]);
  const [motoristasList, setMotoristasList] = useState<Array<{ id: string; nome: string }>>([]);
  const [rendaAluguerSemana, setRendaAluguerSemana] = useState(0);

  // Maps for extra print data and filters
  const [gestorMap, setGestorMap] = useState<Record<string, string>>({});
  const [matriculaMap, setMatriculaMap] = useState<Record<string, string>>({});
  const [dataContratacaoMap, setDataContratacaoMap] = useState<Record<string, string>>({});
  const [statusAtivoMap, setStatusAtivoMap] = useState<Record<string, boolean>>({});
  // motorista_id → quando foi desativado. Um motorista inativo continua a
  // contar nas semanas ANTERIORES a esta data (ver filtro em filteredResumos,
  // em ContasResumoTab).
  const [desativadoEmMap, setDesativadoEmMap] = useState<Record<string, string>>({});
  // motorista_id → aluguer sem contrato por trás (preço vindo da tarifa do
  // modelo). Assinalado no resumo para se ver quem falta regularizar.
  const [aluguerEstimadoMap, setAluguerEstimadoMap] = useState<Record<string, boolean>>({});

  async function recarregar() {
    setLoading(true);
    try {
      // 1. Buscar bolt_drivers → motorista_id + recibo_verde + nome
      const { data: driversData } = await supabase
        .from('bolt_drivers')
        .select('driver_uuid, motorista_id, name, motoristas_ativos(id, nome, recibo_verde)');

      // Mapa: bolt driver_uuid → motorista_id
      const boltToMotoristaMap: Record<string, string> = {};
      // Mapa: motorista_id → recibo_verde
      const reciboVerdeMap: Record<string, boolean> = {};
      // Mapa: motorista_id → nome display (do bolt ou do motoristas_ativos)
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

      // 2. Buscar todos motoristas_ativos para matching (Nomes e IDs de plataforma)
      const { data: todosMotoristas } = await supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, recibo_verde, uber_uuid, bolt_id, gestor_responsavel, data_contratacao, status_ativo, desativado_em, created_at'
        );

      // Mapa: uber_uuid -> motorista_id
      const uberIdMap: Record<string, string> = {};
      // Mapa: bolt_id -> motorista_id
      const boltIdMap: Record<string, string> = {};

      // Mapa: nome normalizado → motorista_id
      const nomeToMotoristaMap: Record<
        string,
        { id: string; nome: string; recibo_verde: boolean }
      > = {};
      // Mapa: motorista_id → nome canónico do CRM (fonte de verdade do nome a exibir)
      const crmNomeById: Record<string, string> = {};
      // Passagem prévia: preciso de saber se um motorista está ativo ANTES de
      // decidir quem fica com um identificador de plataforma duplicado.
      const statusAtivoPorId: Record<string, boolean> = {};
      (todosMotoristas || []).forEach((m) => {
        statusAtivoPorId[m.id] = m.status_ativo !== false;
      });
      (todosMotoristas || []).forEach((m) => {
        const norm = normalizeName(m.nome);
        nomeToMotoristaMap[norm] = { id: m.id, nome: m.nome, recibo_verde: m.recibo_verde ?? true };
        crmNomeById[m.id] = m.nome;

        // Mapear IDs de plataforma se existirem. Quando o MESMO identificador
        // está em mais do que um motorista (duplicados por limpar), ganha
        // sempre o ATIVO — antes era "o último a ser lido", sem ordenação
        // nenhuma, e os ganhos podiam cair no registo inativo, que o filtro
        // desta tabela depois esconde: a faturação desaparecia do resumo sem
        // deixar rasto (caso real: Marco Reis, #1 ativo vs #338 inativo com o
        // mesmo uber_uuid).
        const ganhaSobre = (existenteId: string | undefined) => {
          if (!existenteId) return true;
          const existenteAtivo = statusAtivoPorId[existenteId] !== false;
          const novoAtivo = m.status_ativo !== false;
          return novoAtivo && !existenteAtivo;
        };
        if (m.uber_uuid && ganhaSobre(uberIdMap[m.uber_uuid])) uberIdMap[m.uber_uuid] = m.id;
        if (m.bolt_id && ganhaSobre(boltIdMap[m.bolt_id])) boltIdMap[m.bolt_id] = m.id;

        // Também guardar recibo_verde para qualquer motorista
        if (!(m.id in reciboVerdeMap)) {
          reciboVerdeMap[m.id] = m.recibo_verde ?? true;
        }
      });

      // Index id → dados (O(1)) — evita Object.values(nomeToMotoristaMap).find(
      // m=>m.id===X) repetido nos loops abaixo. Primeira ocorrência por id, que
      // é a mesma semântica do .find() sobre Object.values (dados idênticos por id).
      const motoristaById = new Map<string, { id: string; nome: string; recibo_verde: boolean }>();
      for (const v of Object.values(nomeToMotoristaMap)) {
        if (!motoristaById.has(v.id)) motoristaById.set(v.id, v);
      }

      // 3. Bolt: NÃO se consulta bolt_viagens. O dinheiro Bolt está todo em
      // bolt_resumos_semanais.ganhos_liquidos (ver src/config/bolt.ts), escrito
      // tanto pela API como pelo CSV. bolt_viagens tem uma linha por TENTATIVA
      // de despacho e somá-la conta a mesma corrida várias vezes.
      const boltQuery: PromiseLike<{ data: any[] | null; error: any }> = Promise.resolve({
        data: [],
        error: null,
      });

      // 4. Uber: o resumo semanal, não as transacções em bruto.
      //
      // uber_resumos_semanais é para a Uber o que bolt_resumos_semanais é para
      // a Bolt: uma linha por motorista e semana, mantida por gatilho, com a
      // API a mandar quando tem dados do período. Somar uber_transactions
      // directamente duplicava a receita no dia em que a API oficial ligasse —
      // ela escreve uma linha por VIAGEM e o CSV uma linha SEMANAL, e as duas
      // conviviam na mesma soma. Ver a migração 20260814170000.
      const uberQuery = supabase
        .from('uber_resumos_semanais')
        .select('uber_driver_id, motorista_nome, motorista_id, ganhos_brutos, gorjetas, viagens')
        .lte('periodo_inicio', format(weekEnd, 'yyyy-MM-dd'))
        .gte('periodo_fim', format(weekStart, 'yyyy-MM-dd'));

      // 4b. Buscar atividade Uber (viagens_concluidas reais) para o período
      // Gerar período normalizado: Segunda → Domingo (YYYYMMDD-YYYYMMDD)
      const fmtD = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const periodoStr = `${fmtD(weekStart)}-${fmtD(weekEnd)}`;
      const atividadeQuery = supabase
        .from('uber_atividade_motoristas')
        .select('uber_driver_id, viagens_concluidas')
        .eq('periodo', periodoStr);

      // 4c. Buscar uber_drivers para mapeamento uber_driver_id → motorista_id
      const uberDriversQuery = supabase
        .from('uber_drivers')
        .select('uber_driver_id, motorista_id, full_name');

      // Fronteira de semana por DATA UTC. Antes usava-se weekStart.toISOString()
      // (meia-noite local → 23:00 UTC do dia anterior), o que puxava transações
      // da véspera para a semana seguinte. Por data UTC o bucket fica correto.
      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;

      // 4d. Buscar transações de combustível no período
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

      // 4d-ter. Buscar portagens Via Verde no período
      const viaVerdeQuery = supabase
        .from('via_verde_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      // 4d-bis. Viaturas atribuídas DURANTE a semana e respetivo grupo/modelo
      // para cruzar com tarifa. Filtra por DATAS, não por status='ativo': o
      // aluguer de uma semana já passada não pode desaparecer só porque a
      // viatura foi entretanto devolvida (a atribuição passa a 'encerrado').
      // Era o que acontecia — o motorista #252 devolveu a viatura a 17/08 e o
      // aluguer da semana 03–09/08, que ele tem de pagar, ficou a 0,00 €
      // enquanto o detalhe do resumo continuava a mostrar os 175,00 €.
      const viaturasQuery = supabase
        .from('motorista_viaturas')
        .select(
          'motorista_id, viatura_id, data_inicio, data_fim, viaturas(matricula, grupo_id, modelo_id)'
        )
        .lte('data_inicio', format(weekEnd, 'yyyy-MM-dd'))
        .or(`data_fim.is.null,data_fim.gte.${format(weekStart, 'yyyy-MM-dd')}`);

      // 4e. Buscar resumos semanais Bolt (dados CSV) cujo intervalo intersecte a semana seleccionada
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // 4g. Tarifas de renting ativas — preco_semana é o custo semanal do motorista
      const tarifasQuery = supabase
        .from('renting_tarifas')
        .select('id, grupo_id, preco_semana')
        .eq('ativa', true);

      // 4g-bis. TVDE não tem preço por grupo — é por MODELO. Sem isto, o
      // aluguer de motoristas TVDE ficava sempre a 0€ (grupo sem tarifa direta).
      // `tarifa_id` vem no select para se poder escolher a tarifa QUE O
      // CONTRATO diz, e não uma qualquer que esteja ativa para o modelo.
      const tarifasTvdeModeloQuery = supabase
        .from('renting_tarifa_precos_modelo')
        .select('tarifa_id, modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa)')
        .eq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true);

      // 4g-ter. Contratos da viatura — o CONTRATO é a fonte de verdade do
      // preço, não o modelo. Um modelo pode ter várias tarifas ativas em
      // simultâneo (ex.: "TVDE - Base" 325 € e "Açores" 225 €) e escolher
      // "uma qualquer" dava o preço errado a 16 motoristas, ~1.100 €/semana
      // cobrados a menos — e mudava sozinho se a ordem das linhas mudasse.
      const contratosQuery = supabase
        .from('contratos_renting')
        .select('viatura_id, tarifa_id, estado_operacional, data_inicio, created_at')
        .is('deleted_at', null)
        .not('viatura_id', 'is', null);

      // 4f. Buscar movimentos financeiros unificados para a semana.
      // Contam TODOS os movimentos da semana excepto cancelados — um débito
      // marcado "pago" continua a ser despesa desta semana (alinhado com o
      // Resumo Financeiro do motorista, que fazia esta conta e divergia).
      const financeiroQuery = supabase
        .from('motorista_financeiro')
        .select('motorista_id, valor, categoria, tipo')
        .gte('data_movimento', weekStartStr)
        .lte('data_movimento', weekEndStr)
        .neq('status', 'cancelado');

      const boltResumosQuery = supabase
        .from('bolt_resumos_semanais')
        .select(
          'motorista_id, motorista_nome, ganhos_liquidos, gorjetas, viagens_terminadas, integracao_id, identificador_motorista'
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

      // Mapa: motorista_id → total combustível gasto no período
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

      // Mapa: motorista_id → total portagens Via Verde no período
      const portagensByMotorista: Record<string, number> = {};
      ((viaVerdeResult as any)?.data || []).forEach((t: any) => {
        if (t.motorista_id) {
          portagensByMotorista[t.motorista_id] =
            (portagensByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
        }
      });

      // Guardar lista de motoristas para o dialog de importação
      setMotoristasList((todosMotoristas || []).map((m) => ({ id: m.id, nome: m.nome })));

      // Mapas auxiliares para impressão (gestor + matrícula) e filtros
      const gMap: Record<string, string> = {};
      const dcMap: Record<string, string> = {};
      const saMap: Record<string, boolean> = {};
      const deMap: Record<string, string> = {};
      (todosMotoristas || []).forEach((m: any) => {
        if (m.gestor_responsavel) gMap[m.id] = m.gestor_responsavel;
        // Usar data_contratacao se disponível, senão usar created_at (sempre preenchido)
        dcMap[m.id] = m.data_contratacao || m.created_at;
        saMap[m.id] = m.status_ativo !== false;
        if (m.desativado_em) deMap[m.id] = m.desativado_em;
      });
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

      // Mapa: grupo_id → preco_semana da tarifa ativa
      const grupoTarifaMap: Record<string, number> = {};
      (tarifasResult.data || []).forEach((t: any) => {
        if (t.grupo_id && t.preco_semana != null) {
          grupoTarifaMap[t.grupo_id] = Number(t.preco_semana) || 0;
        }
      });

      // Mapa: modelo_id → preco_semana da tarifa TVDE ativa (preço por modelo,
      // não por grupo — ver comentário na query acima). Só usado como ÚLTIMO
      // recurso, quando não há contrato: um modelo pode ter várias tarifas
      // ativas e aqui não há como saber qual é a do motorista.
      const modeloTvdeTarifaMap: Record<string, number> = {};
      // Mapa: `${tarifa_id}|${modelo_id}` → preco_semana. É por aqui que se
      // resolve o preço da tarifa QUE O CONTRATO indica.
      // Construídos por buildPrecoPorTarifaModelo/buildTvdeModeloPrecoMap, e
      // não por `map[chave] = valor` num forEach: com duas tarifas activas a
      // dar preço ao mesmo modelo, ficava a última que a base devolvesse — e a
      // base não promete ordem. Ver tvdeModeloPreco.ts.
      const linhasTarifaModelo = (tarifasTvdeModeloResult.data || []) as TarifaModeloRow[];
      const precoPorTarifaModelo = buildPrecoPorTarifaModelo(linhasTarifaModelo);
      for (const [modeloId, preco] of buildTvdeModeloPrecoMap(linhasTarifaModelo)) {
        modeloTvdeTarifaMap[modeloId] = preco;
      }

      // Mapa: tarifa_id → preco_semana (tarifas de grupo, regime renting).
      const precoPorTarifaId: Record<string, number> = {};
      (tarifasResult.data || []).forEach((t: any) => {
        if (t.id && t.preco_semana != null) precoPorTarifaId[t.id] = Number(t.preco_semana) || 0;
      });

      // Mapa: viatura_id → tarifa do CONTRATO. Prefere o contrato em curso;
      // se não houver, o mais recente da viatura (há viaturas a faturar há
      // meses cujo último contrato já expirou — sem este fallback ficariam a
      // 0 € de aluguer). A ordenação é explícita para o resultado não
      // depender da ordem física das linhas.
      const contratoTarifaPorViatura: Record<string, string> = {};
      const contratosOrdenados = [...((contratosResult.data as any[]) || [])].sort((a, b) => {
        const emCurso = (c: any) => (c.estado_operacional === 'em_curso' ? 1 : 0);
        if (emCurso(a) !== emCurso(b)) return emCurso(a) - emCurso(b);
        return String(a.data_inicio ?? a.created_at ?? '').localeCompare(
          String(b.data_inicio ?? b.created_at ?? '')
        );
      });
      // Ordem crescente de prioridade → o último a escrever é o melhor.
      contratosOrdenados.forEach((c: any) => {
        if (c.viatura_id && c.tarifa_id) contratoTarifaPorViatura[c.viatura_id] = c.tarifa_id;
      });

      /** Preço semanal da viatura, pela cascata acordada: tarifa do contrato →
       *  tarifa do grupo → tarifa TVDE do modelo. `estimado` assinala que o
       *  preço NÃO veio de um contrato, para o resumo poder avisar em vez de
       *  mostrar um número de origem desconhecida como se fosse certo. */
      const precoSemanalViatura = (
        viaturaId: string | null,
        grupoId: string | null,
        modeloId: string | null
      ): { preco: number | null; estimado: boolean } => {
        const tarifaContrato = viaturaId ? contratoTarifaPorViatura[viaturaId] : undefined;
        if (tarifaContrato) {
          const doModelo = modeloId
            ? precoPorTarifaModelo.get(`${tarifaContrato}|${modeloId}`)
            : undefined;
          if (doModelo != null) return { preco: doModelo, estimado: false };
          const doGrupo = precoPorTarifaId[tarifaContrato];
          if (doGrupo != null) return { preco: doGrupo, estimado: false };
        }
        const fallback =
          (grupoId ? grupoTarifaMap[grupoId] : undefined) ??
          (modeloId ? modeloTvdeTarifaMap[modeloId] : undefined) ??
          null;
        return { preco: fallback, estimado: fallback != null };
      };

      // Mapa: motorista_id → aluguer da semana. Usa o MESMO cálculo do
      // "Aluguer — Detalhe" do resumo individual (buildSlotPeriodos): dias
      // realmente cobertos × taxa diária, agrupados por veículo. Antes esta
      // tabela cobrava a semana inteira por atribuição activa e o detalhe
      // fazia pro-rata — os dois números discordavam no mesmo ecrã (o
      // detalhe é o que vai impresso/enviado ao motorista).
      const viaturasPorMotorista = new Map<string, ViaturaPeriodoInput[]>();
      // motorista_id → true quando o aluguer NÃO veio de um contrato. Mostra-se
      // como aviso no resumo: melhor dizer "sem contrato" do que apresentar um
      // preço de origem desconhecida como se fosse acordado.
      const aluguerEstimadoMap: Record<string, boolean> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (!mv.motorista_id) return;
        const grupoId = (mv.viaturas as any)?.grupo_id ?? null;
        const modeloId = (mv.viaturas as any)?.modelo_id ?? null;
        const { preco, estimado } = precoSemanalViatura(mv.viatura_id, grupoId, modeloId);
        if (estimado) aluguerEstimadoMap[mv.motorista_id] = true;
        const lista = viaturasPorMotorista.get(mv.motorista_id) ?? [];
        lista.push({
          viatura_id: mv.viatura_id,
          data_inicio: mv.data_inicio,
          data_fim: mv.data_fim,
          preco_semana: preco,
          viaturas: null,
        });
        viaturasPorMotorista.set(mv.motorista_id, lista);
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

      // Mapa: motorista_id → total reparações da semana
      const reparacoesByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → total outros custos (débitos)
      const adhocByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → ganhos extras (créditos)
      const extrasByMotorista: Record<string, number> = {};

      let rendaAluguerTotal = 0;

      (financeiroResult.data || []).forEach((m: any) => {
        if (!m.motorista_id) return;
        const val = Number(m.valor) || 0;

        if (m.tipo === 'credito') {
          // Não incluir caução como receita/crédito no recibo semanal
          if (m.categoria === 'caucao') return;
          extrasByMotorista[m.motorista_id] = (extrasByMotorista[m.motorista_id] || 0) + val;
          return;
        }

        // De aqui em diante são só débitos
        if (m.categoria === 'reparacao') {
          reparacoesByMotorista[m.motorista_id] =
            (reparacoesByMotorista[m.motorista_id] || 0) + val;
        } else if (m.categoria === 'renda_viatura') {
          aluguerByMotorista[m.motorista_id] = (aluguerByMotorista[m.motorista_id] || 0) + val;
          rendaAluguerTotal += val;
        } else {
          adhocByMotorista[m.motorista_id] = (adhocByMotorista[m.motorista_id] || 0) + val;
        }
      });

      setRendaAluguerSemana(rendaAluguerTotal);

      // Mapa de viagens reais da atividade Uber (por uber_driver_id)
      const uberViagensByDriver: Record<string, number> = {};
      (atividadeResult.data || []).forEach((a) => {
        if (a.uber_driver_id) {
          uberViagensByDriver[a.uber_driver_id] =
            (uberViagensByDriver[a.uber_driver_id] || 0) + (a.viagens_concluidas || 0);
        }
      });

      // Mapa uber_driver_id → motorista_id (via uber_drivers table)
      const uberDriverToMotoristaMap: Record<string, string> = {};
      const uberDriverNameMap: Record<string, string> = {};
      (uberDriversResult.data || []).forEach((d) => {
        if (d.uber_driver_id) {
          if (d.motorista_id) uberDriverToMotoristaMap[d.uber_driver_id] = d.motorista_id;
          if (d.full_name) uberDriverNameMap[d.uber_driver_id] = d.full_name;
        }
      });

      // 5. Agrupar por motorista_id (chave unificadora)
      interface AgrupadoEntry {
        motorista_id: string | null;
        driver_name: string;
        driver_uuid: string;
        faturado_bolt: number;
        faturado_uber: number;
        viagens_bolt: number;
        viagens_uber: number;
        /** Gorjetas (Bolt + Uber). Opcional: somado com `|| 0` para não tocar nas inits. */
        gorjeta?: number;
        identificador_bolt?: string;
      }
      const agrupado: Record<string, AgrupadoEntry> = {};

      // 5a. Processar Bolt
      (boltResult.data || []).forEach((v) => {
        const driverUuid = v.driver_uuid || 'unknown';
        const identificadorBolt = (v as any).raw_data?.['Identificador do motorista'] || '';

        // ORDEM DE MATCHING BOLT:
        // 1. Pelo bolt_id gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela bolt_drivers
        // 3. Pelo match inteligente de nomes
        let motoristaId =
          identificadorBolt && boltIdMap[identificadorBolt]
            ? boltIdMap[identificadorBolt]
            : boltToMotoristaMap[driverUuid] || null;

        let displayName = v.driver_name || 'Desconhecido';

        // Se não tem mapeamento directo, tentar match inteligente
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

      // 5a-bis. Processar resumos semanais Bolt (CSV) — complementar dados da API
      const boltResumosTracked = new Set<string>();
      Object.entries(agrupado).forEach(([key, entry]) => {
        if (entry.faturado_bolt > 0) boltResumosTracked.add(key);
      });

      // Gorjeta do Bolt: vive no relatório semanal (bolt_resumos_semanais.gorjetas),
      // por motorista. Capturada à parte para somar mesmo quando os ganhos vêm da API.
      const gorjetaBoltById: Record<string, number> = {};

      (boltResumosResult.data || []).forEach((r: any) => {
        let motoristaId: string | null = r.motorista_id || null;
        const identificadorBolt = r.identificador_motorista || '';

        // Tentar match por ID se não veio no registo
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

        // Gorjeta Bolt (CSV) — somar por motorista, mesmo que os ganhos venham da API.
        if (motoristaId) {
          gorjetaBoltById[motoristaId] =
            (gorjetaBoltById[motoristaId] || 0) + (Number(r.gorjetas) || 0);
        }

        // Não há precedência entre origens: bolt_resumos_semanais é a fonte
        // única e ganhos_liquidos já traz o valor certo, venha da API ou do CSV.

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
        agrupado[key].faturado_bolt += Number(r.ganhos_liquidos) || 0;
        agrupado[key].viagens_bolt += Number(r.viagens_terminadas) || 0;
        if (identificadorBolt && !agrupado[key].identificador_bolt) {
          agrupado[key].identificador_bolt = identificadorBolt;
        }
      });

      // 5b. Processar Uber — aggregate by uber_driver_id
      const uberByDriver: Record<
        string,
        { firstName: string; lastName: string; total: number; count: number; gorjeta: number }
      > = {};
      // Uma linha por motorista e semana — o nome e a gorjeta já vêm no
      // resumo, extraídos pelo gatilho. Não é preciso abrir o raw_transaction.
      (uberResult.data || []).forEach((t) => {
        const driverId = t.uber_driver_id || 'unknown';
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
        // As viagens vêm da atividade (viagens_concluidas), que é o número que
        // a Uber reporta; o resumo só conta linhas de transacção.
        uberByDriver[driverId].count = uberViagensByDriver[driverId] || 0;
      });

      // Also inject drivers that only have atividade but no payment transactions
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

      // Match each Uber driver with motorista_id
      Object.entries(uberByDriver).forEach(([uberDriverId, uberData]) => {
        const uberFullName = `${uberData.firstName} ${uberData.lastName}`.trim();

        // ORDEM DE MATCHING UBER:
        // 1. Pelo uber_uuid gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela uber_drivers.motorista_id
        // 3. Pelo match inteligente de nomes
        let matchedMotoristaId: string | null =
          uberIdMap[uberDriverId] || uberDriverToMotoristaMap[uberDriverId] || null;
        let matchedName = uberFullName || uberDriverNameMap[uberDriverId] || uberDriverId;

        if (matchedMotoristaId) {
          // Use name from motoristas_ativos if available
          const motData = motoristaById.get(matchedMotoristaId);
          if (motData) {
            matchedName = motData.nome;
            reciboVerdeMap[motData.id] = motData.recibo_verde;
          }
        } else {
          // Priority 3: smart match
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
          // Já existe (provavelmente do Bolt) — adicionar Uber
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

      // 5b-bis. Ensure drivers with ONLY fuel/reparacoes are added to agrupado
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

      for (const [motoristaId, totalAdhoc] of Object.entries(adhocByMotorista)) {
        if (!agrupado[motoristaId] && totalAdhoc > 0) {
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

      // 5c. Dedup final
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

      // (1) Fusão por motorista_id
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

      // (2) Fusão FINAL por nome normalizado COMPLETO — abrange TODAS as entradas
      // (com e sem motorista_id). Garante que o mesmo nome nunca dá 2 linhas.
      // Segurança: não funde duas entradas com motorista_id DIFERENTE (homónimos reais).
      const nameDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        const nomeCanon =
          (entry.motorista_id && crmNomeById[entry.motorista_id]) || entry.driver_name;
        const norm = normalizeName(nomeCanon);
        if (norm) (nameDedupMap[norm] ||= []).push(key);
      }
      for (const keys of Object.values(nameDedupMap)) {
        if (keys.length <= 1) continue;
        // Primária: preferir uma com motorista_id (e key "real", não bolt_/uber_)
        const comId = keys.filter((k) => agrupado[k]?.motorista_id);
        const idsDistintos = new Set(comId.map((k) => agrupado[k]!.motorista_id));
        if (idsDistintos.size > 1) {
          // Homónimos reais (motorista_ids diferentes) — não fundir entre si.
          // Mas ainda podemos agregar os SEM id ao primeiro com id.
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
        // Nome canónico: se há motorista_id mapeado, usar SEMPRE o nome do CRM
        // (evita mostrar "Roberto Guilherme Neto" da plataforma quando o CRM diz "Roberto Rocha").
        const displayNameFinal = (m.motorista_id && crmNomeById[m.motorista_id]) || m.driver_name;
        const extrasValor = m.motorista_id ? extrasByMotorista[m.motorista_id] || 0 : 0;
        const totalFaturado = m.faturado_bolt + m.faturado_uber + extrasValor;
        const totalViagens = m.viagens_bolt + m.viagens_uber;
        const passaReciboVerde = m.motorista_id ? (reciboVerdeMap[m.motorista_id] ?? true) : true;

        // Gorjeta (Bolt + Uber) nunca passa pela divisão de recibo verde
        // (÷1.06). O faturado_bolt e faturado_uber já incluem a gorjeta, por
        // isso extraímos a gorjeta antes de aplicar ÷1.06 e somamo-la de
        // volta. Sem coluna própria na tabela (a gorjeta já fica embutida).
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
        const liquido =
          receita - combustivelValor - portagensValor - aluguerValor - reparacoesValor - adhocValor;

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
          outros_custos: adhocValor,
          aluguer: aluguerValor,
          identificador_bolt: m.identificador_bolt,
        };
      });

      resumosCalculados.sort((a, b) => b.total_faturado - a.total_faturado);
      // Atribuir _uid único e estável por linha (usado em selectedIds e React keys).
      const comUid: MotoristaResumo[] = resumosCalculados.map((r, idx) => ({
        ...r,
        _uid: r.motorista_id || r.driver_uuid || `${r.driver_name || 'sem-nome'}__${idx}`,
      }));
      setResumos(comUid);

      // Saldo pendente em lote (uma RPC para todos os motoristas da página,
      // não N chamadas) — mesmo valor mostrado no separador Financeiro do
      // motorista e no portal dele. Não bloqueia a tabela principal: chega
      // depois, por cima.
      const motoristaIdsComSaldo = comUid
        .map((r) => r.motorista_id)
        .filter((id): id is string => !!id);
      if (motoristaIdsComSaldo.length > 0) {
        const { data: saldos, error: erroSaldos } = await supabase.rpc(
          'motoristas_saldo_pendente_lote',
          { p_motorista_ids: motoristaIdsComSaldo }
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

  // As datas em TEXTO, não os Date. weekStart/weekEnd recebidos são objectos
  // novos a cada render do consumidor; postos directamente nas dependências
  // de um efeito que muda estado, davam um ciclo infinito (efeito → setState
  // → render → Date novos → efeito) — o mesmo problema documentado em
  // ContasResumoTab junto de `semanaInicioStr`/`semanaFimStr`. Aqui replica-se
  // a mesma técnica para preservar exactamente o gate que antes vivia no
  // useEffect do componente, dependente de `selectedWeek` (uma referência
  // estável que só muda quando o utilizador navega de semana).
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
    // Exposto além dos 10 valores base: ContasResumoTab reutiliza este MESMO
    // estado de loading como indicador de ocupado durante a exportação de
    // PDFs em lote (gerarRelatoriosIndividuaisPDF recebe `setLoading`
    // directamente) — comportamento pré-existente que teve de continuar a
    // funcionar depois da extracção.
    setLoading,
    statusAtivoMap,
    rendaAluguerSemana,
    motoristasList,
    matriculaMap,
    gestorMap,
    desativadoEmMap,
    dataContratacaoMap,
    aluguerEstimadoMap,
    recarregar,
  };
}
