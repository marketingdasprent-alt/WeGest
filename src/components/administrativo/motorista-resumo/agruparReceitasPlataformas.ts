import { normalizeName, isNameMatch } from '@/components/administrativo/motoristaNomeMatching';
import type { BoltResumoRow, DadosResumoSemana } from './dadosResumoSemana';

export interface ReceitaAgrupada {
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

export interface MotoristaNomeado {
  id: string;
  nome: string;
  recibo_verde: boolean;
}

/** Índices da ficha que o emparelhamento das plataformas usa. */
export interface IndicesMotoristas {
  uberIdMap: Record<string, string>;
  boltIdMap: Record<string, string>;
  nomeToMotoristaMap: Record<string, MotoristaNomeado>;
  motoristaById: Map<string, MotoristaNomeado>;
  /** Mutado: um emparelhamento por nome confirma o recibo verde da ficha. */
  reciboVerdeMap: Record<string, boolean>;
}

/** Primeira ficha cujo nome bate certo com o nome da plataforma. */
function porNome(nome: string, indices: IndicesMotoristas): MotoristaNomeado | null {
  for (const mData of Object.values(indices.nomeToMotoristaMap)) {
    if (isNameMatch(nome, mData.nome)) {
      indices.reciboVerdeMap[mData.id] = mData.recibo_verde;
      return mData;
    }
  }
  return null;
}

function agruparBolt(
  linhas: BoltResumoRow[],
  indices: IndicesMotoristas,
  agrupado: Record<string, ReceitaAgrupada>,
  gorjetaBoltById: Record<string, number>
) {
  for (const r of linhas) {
    let motoristaId: string | null = r.motorista_id || null;
    const identificadorBolt = r.identificador_motorista || '';
    if (!motoristaId && identificadorBolt && indices.boltIdMap[identificadorBolt]) {
      motoristaId = indices.boltIdMap[identificadorBolt];
    }

    let displayName = r.motorista_nome || 'Desconhecido';
    if (!motoristaId && displayName !== 'Desconhecido') {
      const m = porNome(displayName, indices);
      if (m) {
        motoristaId = m.id;
        displayName = m.nome;
      }
    }

    const key = motoristaId || `bolt_csv_${r.identificador_motorista || displayName}`;
    if (motoristaId) {
      gorjetaBoltById[motoristaId] =
        (gorjetaBoltById[motoristaId] || 0) + (Number(r.gorjetas) || 0);
    }
    agrupado[key] ??= {
      motorista_id: motoristaId,
      driver_name: displayName,
      driver_uuid: '',
      faturado_bolt: 0,
      faturado_uber: 0,
      viagens_bolt: 0,
      viagens_uber: 0,
    };
    agrupado[key].faturado_bolt += Number(r.liquido_a_pagar) || 0;
    agrupado[key].viagens_bolt += Number(r.viagens_terminadas) || 0;
    if (identificadorBolt && !agrupado[key].identificador_bolt) {
      agrupado[key].identificador_bolt = identificadorBolt;
    }
  }
}

interface UberPorConta {
  firstName: string;
  lastName: string;
  total: number;
  count: number;
  gorjeta: number;
}

function totaisUberPorConta(dados: DadosResumoSemana) {
  // Contas de frota não são motoristas — fora dos resumos (migração conta_frota_fora_dos_resumos_uber).
  const contasFrota = new Set(
    dados.uberDrivers.filter((d) => d.is_conta_frota).map((d) => d.uber_driver_id)
  );

  const viagensPorConta: Record<string, number> = {};
  for (const a of dados.atividadeUber) {
    if (a.uber_driver_id && !contasFrota.has(a.uber_driver_id)) {
      viagensPorConta[a.uber_driver_id] =
        (viagensPorConta[a.uber_driver_id] || 0) + (a.viagens_concluidas || 0);
    }
  }

  const motoristaPorConta: Record<string, string> = {};
  const nomePorConta: Record<string, string> = {};
  for (const d of dados.uberDrivers) {
    if (d.uber_driver_id && !contasFrota.has(d.uber_driver_id)) {
      if (d.motorista_id) motoristaPorConta[d.uber_driver_id] = d.motorista_id;
      if (d.full_name) nomePorConta[d.uber_driver_id] = d.full_name;
    }
  }

  const porConta: Record<string, UberPorConta> = {};
  for (const t of dados.uberResumos) {
    const driverId = t.uber_driver_id || 'unknown';
    if (contasFrota.has(driverId)) continue;
    const nome = (t.motorista_nome || '').trim();
    const espaco = nome.indexOf(' ');
    porConta[driverId] ??= {
      firstName: espaco > 0 ? nome.slice(0, espaco) : nome,
      lastName: espaco > 0 ? nome.slice(espaco + 1) : '',
      total: 0,
      count: 0,
      gorjeta: 0,
    };
    porConta[driverId].total += Number(t.ganhos_brutos) || 0;
    porConta[driverId].gorjeta += Number(t.gorjetas) || 0;
    porConta[driverId].count = viagensPorConta[driverId] || 0;
  }
  for (const [driverId, viagens] of Object.entries(viagensPorConta)) {
    porConta[driverId] ??= {
      firstName: nomePorConta[driverId]?.split(' ')[0] || '',
      lastName: nomePorConta[driverId]?.split(' ').slice(1).join(' ') || '',
      total: 0,
      count: viagens,
      gorjeta: 0,
    };
  }
  return { porConta, motoristaPorConta, nomePorConta };
}

function agruparUber(
  dados: DadosResumoSemana,
  indices: IndicesMotoristas,
  agrupado: Record<string, ReceitaAgrupada>
) {
  const { porConta, motoristaPorConta, nomePorConta } = totaisUberPorConta(dados);
  for (const [uberDriverId, uber] of Object.entries(porConta)) {
    const nomeUber = `${uber.firstName} ${uber.lastName}`.trim();
    let motoristaId: string | null =
      indices.uberIdMap[uberDriverId] || motoristaPorConta[uberDriverId] || null;
    let nome = nomeUber || nomePorConta[uberDriverId] || uberDriverId;

    if (motoristaId) {
      const m = indices.motoristaById.get(motoristaId);
      if (m) {
        nome = m.nome;
        indices.reciboVerdeMap[m.id] = m.recibo_verde;
      }
    } else {
      const m = porNome(nome, indices);
      if (m) {
        motoristaId = m.id;
        nome = m.nome;
      }
    }

    const key = motoristaId || `uber_${uberDriverId}`;
    if (agrupado[key]) {
      agrupado[key].faturado_uber += uber.total;
      agrupado[key].viagens_uber += uber.count;
    } else {
      agrupado[key] = {
        motorista_id: motoristaId,
        driver_name: nome,
        driver_uuid: '',
        faturado_bolt: 0,
        faturado_uber: uber.total,
        viagens_bolt: 0,
        viagens_uber: uber.count,
      };
    }
    agrupado[key].gorjeta = (agrupado[key].gorjeta || 0) + (uber.gorjeta || 0);
  }
}

/** Receita Bolt e Uber por motorista (ou por conta sem ficha). */
export function agruparReceitasPlataformas(dados: DadosResumoSemana, indices: IndicesMotoristas) {
  const agrupado: Record<string, ReceitaAgrupada> = {};
  const gorjetaBoltById: Record<string, number> = {};
  agruparBolt(dados.boltResumos, indices, agrupado, gorjetaBoltById);
  agruparUber(dados, indices, agrupado);
  return { agrupado, gorjetaBoltById };
}

/** Funde entradas do mesmo motorista: primeiro pelo id, depois pelo nome da ficha. */
export function deduplicarAgrupado(
  agrupado: Record<string, ReceitaAgrupada>,
  crmNomeById: Record<string, string>
) {
  const fundir = (alvoKey: string, dupKey: string) => {
    if (alvoKey === dupKey) return;
    const dup = agrupado[dupKey];
    const alvo = agrupado[alvoKey];
    if (!dup || !alvo) return;
    alvo.faturado_bolt += dup.faturado_bolt;
    alvo.faturado_uber += dup.faturado_uber;
    alvo.gorjeta = (alvo.gorjeta || 0) + (dup.gorjeta || 0);
    alvo.viagens_bolt += dup.viagens_bolt;
    alvo.viagens_uber += dup.viagens_uber;
    if (!alvo.motorista_id && dup.motorista_id) alvo.motorista_id = dup.motorista_id;
    if (!alvo.identificador_bolt && dup.identificador_bolt) {
      alvo.identificador_bolt = dup.identificador_bolt;
    }
    delete agrupado[dupKey];
  };
  const semPrefixo = (k: string) => !k.startsWith('bolt_') && !k.startsWith('uber_');

  const porId: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(agrupado)) {
    if (entry.motorista_id) (porId[entry.motorista_id] ||= []).push(key);
  }
  for (const keys of Object.values(porId)) {
    if (keys.length <= 1) continue;
    const primaria = keys.find(semPrefixo) || keys[0];
    keys.forEach((k) => fundir(primaria, k));
  }

  const porNomeCanon: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(agrupado)) {
    const nomeCanon = (entry.motorista_id && crmNomeById[entry.motorista_id]) || entry.driver_name;
    const norm = normalizeName(nomeCanon);
    if (norm) (porNomeCanon[norm] ||= []).push(key);
  }
  for (const keys of Object.values(porNomeCanon)) {
    if (keys.length <= 1) continue;
    const comId = keys.filter((k) => agrupado[k]?.motorista_id);
    const idsDistintos = new Set(comId.map((k) => agrupado[k]!.motorista_id));
    if (idsDistintos.size > 1) {
      // Homónimos com fichas diferentes: só as contas sem ficha se juntam.
      const primaria = comId[0];
      keys.filter((k) => !agrupado[k]?.motorista_id).forEach((k) => fundir(primaria, k));
      continue;
    }
    const primaria = comId.find(semPrefixo) || comId[0] || keys[0];
    keys.forEach((k) => fundir(primaria, k));
  }
}
