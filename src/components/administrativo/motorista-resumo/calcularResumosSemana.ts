import { type MotoristaResumo } from '@/components/administrativo/contasResumoExports';
import { normalizeName } from '@/components/administrativo/motoristaNomeMatching';
import { construirDetalheResumo } from '@/lib/resumoSemanalDetalhe';
import { classificarMovimento } from '@shared/movimentosMotorista';
import {
  agruparReceitasPlataformas,
  deduplicarAgrupado,
  type IndicesMotoristas,
  type MotoristaNomeado,
} from './agruparReceitasPlataformas';
import type { DadosResumoSemana, TransacaoMotoristaRow } from './dadosResumoSemana';
import { motoristasComCustos } from './motoristasComCustos';
import { periodosDeContratos } from './periodosDoContrato';
import {
  calcularRetencao,
  corteSemReciboDaFicha,
  divisorCorte,
  taxasRetencaoDaFicha,
  type TaxasRetencao,
} from './retencaoIrs';
import { buildSlotPeriodos, type SlotPeriodo, type ViaturaPeriodoInput } from './slotPeriodos';
import { buildPrecoPorTarifaModelo, buildTvdeModeloPrecoMap } from './tvdeModeloPreco';

export interface MapasDaFicha {
  gestorMap: Record<string, string>;
  dataContratacaoMap: Record<string, string>;
  statusAtivoMap: Record<string, boolean>;
  desativadoEmMap: Record<string, string>;
  /** A ficha do CRM é a própria empresa ("PREMIUM RIDE"), não uma pessoa — ver 20260917110001. */
  contaFrotaMap: Record<string, boolean>;
  matriculaMap: Record<string, string>;
  aluguerEstimadoMap: Record<string, boolean>;
}

export interface ResultadoResumosSemana extends MapasDaFicha {
  resumos: MotoristaResumo[];
  motoristasList: Array<{ id: string; nome: string }>;
}

type PorMotorista = Record<string, number>;

const somarPorMotorista = (linhas: TransacaoMotoristaRow[]) => {
  const total: PorMotorista = {};
  for (const t of linhas) {
    if (t.motorista_id)
      total[t.motorista_id] = (total[t.motorista_id] || 0) + (Number(t.amount) || 0);
  }
  return total;
};

function indicesDasFichas(dados: DadosResumoSemana) {
  const statusAtivoPorId: Record<string, boolean> = {};
  for (const m of dados.motoristas) statusAtivoPorId[m.id] = m.status_ativo !== false;

  const indices: IndicesMotoristas = {
    uberIdMap: {},
    boltIdMap: {},
    nomeToMotoristaMap: {},
    motoristaById: new Map<string, MotoristaNomeado>(),
    reciboVerdeMap: {},
  };
  const crmNomeById: Record<string, string> = {};
  const retencaoPorId: Record<string, TaxasRetencao | null> = {};
  const cortePorId: Record<string, number> = {};

  for (const m of dados.motoristas) {
    retencaoPorId[m.id] = taxasRetencaoDaFicha(m);
    cortePorId[m.id] = corteSemReciboDaFicha(m);
    indices.nomeToMotoristaMap[normalizeName(m.nome)] = {
      id: m.id,
      nome: m.nome,
      recibo_verde: m.recibo_verde ?? true,
    };
    crmNomeById[m.id] = m.nome;
    // Um id de plataforma em duas fichas: a ativa ganha à inativa.
    const ganhaSobre = (existenteId: string | undefined) =>
      !existenteId || (m.status_ativo !== false && statusAtivoPorId[existenteId] === false);
    if (m.uber_uuid && ganhaSobre(indices.uberIdMap[m.uber_uuid]))
      indices.uberIdMap[m.uber_uuid] = m.id;
    if (m.bolt_id && ganhaSobre(indices.boltIdMap[m.bolt_id])) indices.boltIdMap[m.bolt_id] = m.id;
    if (!(m.id in indices.reciboVerdeMap)) indices.reciboVerdeMap[m.id] = m.recibo_verde ?? true;
  }
  for (const v of Object.values(indices.nomeToMotoristaMap)) {
    if (!indices.motoristaById.has(v.id)) indices.motoristaById.set(v.id, v);
  }
  return { indices, crmNomeById, retencaoPorId, cortePorId };
}

function mapasDasFichas(
  dados: DadosResumoSemana
): Omit<MapasDaFicha, 'matriculaMap' | 'aluguerEstimadoMap'> {
  const mapas = {
    gestorMap: {} as Record<string, string>,
    dataContratacaoMap: {} as Record<string, string>,
    statusAtivoMap: {} as Record<string, boolean>,
    desativadoEmMap: {} as Record<string, string>,
    contaFrotaMap: {} as Record<string, boolean>,
  };
  for (const m of dados.motoristas) {
    if (m.gestor_responsavel) mapas.gestorMap[m.id] = m.gestor_responsavel;
    mapas.dataContratacaoMap[m.id] = m.data_contratacao || m.created_at;
    mapas.statusAtivoMap[m.id] = m.status_ativo !== false;
    if (m.desativado_em) mapas.desativadoEmMap[m.id] = m.desativado_em;
    if (m.is_conta_frota) mapas.contaFrotaMap[m.id] = true;
  }
  return mapas;
}

/** Aluguer da semana a partir dos CONTRATOS (datas e preço do contrato). */
function aluguerDosContratos(dados: DadosResumoSemana, weekStart: Date, weekEnd: Date) {
  const porGrupo: PorMotorista = {};
  const porTarifa: PorMotorista = {};
  for (const t of dados.tarifas) {
    if (t.preco_semana == null) continue;
    if (t.grupo_id) porGrupo[t.grupo_id] = Number(t.preco_semana) || 0;
    if (t.id) porTarifa[t.id] = Number(t.preco_semana) || 0;
  }
  const porModelo: PorMotorista = {};
  for (const [modeloId, preco] of buildTvdeModeloPrecoMap(dados.tarifasModelo))
    porModelo[modeloId] = preco;
  const precos = {
    porTarifaModelo: buildPrecoPorTarifaModelo(dados.tarifasModelo),
    porTarifa,
    porGrupo,
    porModelo,
  };

  // A lista lia a matrícula por um motorista_id que o contrato não tem: o mapa
  // sempre saiu vazio (coluna "—" na exportação). Mantém-se; corrigir é à parte.
  const matriculaMap: Record<string, string> = {};
  const aluguerEstimadoMap: Record<string, boolean> = {};
  const linhasPorMotorista = new Map<string, ViaturaPeriodoInput[]>();
  for (const ct of dados.contratos) {
    const condutores = Array.isArray(ct.contrato_condutores)
      ? ct.contrato_condutores
      : ct.contrato_condutores
        ? [ct.contrato_condutores]
        : [];
    const { periodos, estimado } = periodosDeContratos([ct], precos);
    if (periodos.length === 0) continue;
    for (const c of condutores) {
      if (!c?.motorista_id) continue;
      if (estimado) aluguerEstimadoMap[c.motorista_id] = true;
      const lista = linhasPorMotorista.get(c.motorista_id) ?? [];
      lista.push(...periodos);
      linhasPorMotorista.set(c.motorista_id, lista);
    }
  }

  const total: PorMotorista = {};
  const periodosPorMotorista: Record<string, SlotPeriodo[]> = {};
  for (const [motoristaId, linhas] of linhasPorMotorista) {
    const periodos = buildSlotPeriodos(linhas, weekStart, weekEnd, new Map());
    const soma = periodos.reduce((s, p) => s + p.custo, 0);
    if (soma > 0) {
      total[motoristaId] = soma;
      periodosPorMotorista[motoristaId] = periodos;
    }
  }
  return { total, periodosPorMotorista, matriculaMap, aluguerEstimadoMap };
}

function movimentosPorDestino(dados: DadosResumoSemana) {
  const r = {
    reparacoes: {} as PorMotorista,
    adhoc: {} as PorMotorista,
    caucao: {} as PorMotorista,
    seguros: {} as PorMotorista,
    slot: {} as PorMotorista,
    extras: {} as PorMotorista,
  };
  const somar = (mapa: PorMotorista, id: string, v: number) => (mapa[id] = (mapa[id] || 0) + v);
  for (const m of dados.financeiro) {
    if (!m.motorista_id) continue;
    const val = Number(m.valor) || 0;
    if (m.tipo === 'debito' && (m.categoria ?? '').trim().toLowerCase() === 'reparacao') {
      somar(r.reparacoes, m.motorista_id, val);
      continue;
    }
    const { destino } = classificarMovimento(m);
    if (destino === 'receita_outras') somar(r.extras, m.motorista_id, val);
    else if (destino === 'caucao') somar(r.caucao, m.motorista_id, val);
    else if (destino === 'seguros') somar(r.seguros, m.motorista_id, val);
    else if (destino === 'slot') somar(r.slot, m.motorista_id, val);
    else if (destino === 'outros') somar(r.adhoc, m.motorista_id, val);
  }
  return r;
}

/**
 * A conta do resumo semanal: a lista de Contas/Resumo e a ficha do motorista
 * chamam ESTA função. A ficha só lhe passa menos linhas (as do motorista).
 */
export function calcularResumosSemana(
  dados: DadosResumoSemana,
  weekStart: Date,
  weekEnd: Date
): ResultadoResumosSemana {
  const { indices, crmNomeById, retencaoPorId, cortePorId } = indicesDasFichas(dados);
  const combustivel = somarPorMotorista(dados.combustivel);
  const portagens = somarPorMotorista(dados.portagens);
  const aluguer = aluguerDosContratos(dados, weekStart, weekEnd);
  const mov = movimentosPorDestino(dados);

  const { agrupado, gorjetaBoltById } = agruparReceitasPlataformas(dados, indices);

  // Outros custos contam somados, como antes (um crédito pode anular um débito).
  const outrosCustos: PorMotorista = {};
  for (const mapa of [mov.adhoc, mov.caucao, mov.seguros]) {
    for (const [id, valor] of Object.entries(mapa))
      outrosCustos[id] = (outrosCustos[id] || 0) + valor;
  }
  for (const motoristaId of motoristasComCustos([
    combustivel,
    mov.reparacoes,
    outrosCustos,
    mov.slot,
    aluguer.total,
    portagens,
  ])) {
    agrupado[motoristaId] ??= {
      motorista_id: motoristaId,
      driver_name: indices.motoristaById.get(motoristaId)?.nome || 'Desconhecido',
      driver_uuid: '',
      faturado_bolt: 0,
      faturado_uber: 0,
      viagens_bolt: 0,
      viagens_uber: 0,
    };
  }
  deduplicarAgrupado(agrupado, crmNomeById);

  const resumos = Object.values(agrupado).map((m) => {
    const id = m.motorista_id;
    const de = (mapa: PorMotorista) => (id ? mapa[id] || 0 : 0);
    const extrasValor = de(mov.extras);
    const totalViagens = m.viagens_bolt + m.viagens_uber;
    const passaReciboVerde = id ? (indices.reciboVerdeMap[id] ?? true) : true;
    const gorjetaBolt = de(gorjetaBoltById);
    const gorjetaUber = m.gorjeta || 0;
    const taxasRetencao = id ? (retencaoPorId[id] ?? null) : null;
    const corteSemRecibo = id ? cortePorId[id] : undefined;
    const divisor = divisorCorte(passaReciboVerde, !!taxasRetencao, corteSemRecibo);
    // A gorjeta não é dividida pelo corte.
    const ajustarBase = (total: number, gorjeta: number) => (total - gorjeta) / divisor + gorjeta;
    const receita =
      ajustarBase(m.faturado_bolt, gorjetaBolt) +
      ajustarBase(m.faturado_uber, gorjetaUber) +
      extrasValor;
    const despesas = {
      aluguer: de(aluguer.total),
      combustivel: de(combustivel),
      portagens: de(portagens),
      outros_custos: de(mov.adhoc),
      slot: de(mov.slot),
      caucao: de(mov.caucao),
      seguros: de(mov.seguros),
      reparacoes: de(mov.reparacoes),
    };
    // Subtrai pela ordem de sempre: os cêntimos gravados não podem mudar por arredondamento.
    const totalLiquido =
      receita -
      despesas.combustivel -
      despesas.portagens -
      despesas.aluguer -
      despesas.reparacoes -
      despesas.outros_custos -
      despesas.caucao -
      despesas.seguros -
      despesas.slot;
    // Mesma conta do resumo individual (deriveResumoFinanceiro).
    const retencao = taxasRetencao ? calcularRetencao(totalLiquido, taxasRetencao) : null;
    const liquido = retencao ? retencao.totalAReceber : totalLiquido;

    return {
      driver_name: (id && crmNomeById[id]) || m.driver_name,
      driver_uuid: m.driver_uuid,
      motorista_id: id || undefined,
      total_faturado: m.faturado_bolt + m.faturado_uber + extrasValor,
      faturado_bolt: m.faturado_bolt,
      faturado_uber: m.faturado_uber,
      gorjeta_bolt: gorjetaBolt,
      gorjeta_uber: gorjetaUber,
      total_viagens: totalViagens,
      viagens_bolt: m.viagens_bolt,
      viagens_uber: m.viagens_uber,
      recibo_verde: passaReciboVerde,
      corte_sem_recibo: corteSemRecibo,
      retencao,
      liquido,
      combustivel: despesas.combustivel,
      portagens: despesas.portagens,
      reparacoes: despesas.reparacoes,
      outros_custos: despesas.outros_custos + despesas.caucao + despesas.seguros,
      slot: despesas.slot,
      aluguer: despesas.aluguer,
      identificador_bolt: m.identificador_bolt,
      detalhe: construirDetalheResumo({
        faturadoBolt: m.faturado_bolt,
        faturadoUber: m.faturado_uber,
        outrasReceitas: extrasValor,
        receitaAjustada: receita,
        despesas,
        retencao,
        liquido,
        aluguerDetalhe: id ? aluguer.periodosPorMotorista[id] : undefined,
        viagens: totalViagens,
      }),
    };
  });

  resumos.sort((a, b) => b.total_faturado - a.total_faturado);
  return {
    resumos: resumos.map((r, idx) => ({
      ...r,
      _uid: r.motorista_id || r.driver_uuid || `${r.driver_name || 'sem-nome'}__${idx}`,
    })),
    motoristasList: dados.motoristas.map((m) => ({ id: m.id, nome: m.nome })),
    ...mapasDasFichas(dados),
    matriculaMap: aluguer.matriculaMap,
    aluguerEstimadoMap: aluguer.aluguerEstimadoMap,
  };
}
