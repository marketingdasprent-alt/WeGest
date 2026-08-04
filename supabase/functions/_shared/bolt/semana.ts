/**
 * Fronteiras da semana Bolt em Europe/Lisbon.
 *
 * PORQUE É QUE ISTO NÃO É UM new Date() E PRONTO:
 * a semana da Bolt é 2ª 00:00 → Dom 23:59:59 HORA DE LISBOA. As edge functions
 * correm em UTC. De Março a Outubro Lisboa está em UTC+1, portanto uma semana
 * calculada em UTC começa às 01:00 de segunda e acaba às 00:59 de segunda
 * seguinte — perde a primeira hora de segunda e rouba uma hora à semana
 * seguinte. Numa frota TVDE a madrugada de domingo para segunda é das horas com
 * mais viagens; essa hora vale dinheiro e cai sempre na semana errada.
 *
 * O getLastWeekDates do bolt-import-csv tem exactamente esse defeito (usa
 * getDay()/setHours sobre a hora do runtime). Aqui as datas civis são lidas com
 * Intl na zona certa e só depois convertidas em instantes.
 *
 * Lógica pura: só Date e Intl, sem rede e sem permissões.
 */

export const FUSO_LISBOA = "Europe/Lisbon";

/** Uma data civil (o que está no calendário), sem hora e sem fuso. */
export interface DataCivil {
  ano: number;
  mes: number; // 1-12
  dia: number; // 1-31
}

export interface Semana {
  /** 'YYYY-MM-DD' da segunda-feira. */
  inicio: string;
  /** 'YYYY-MM-DD' do domingo. */
  fim: string;
  /** Segunda 00:00:00 de Lisboa, em segundos epoch. */
  start_ts: number;
  /** Domingo 23:59:59 de Lisboa, em segundos epoch. */
  end_ts: number;
  /** 'YYYY-MM-DD a YYYY-MM-DD' — o formato exacto de bolt_resumos_semanais.periodo. */
  periodo: string;
}

const MS_DIA = 24 * 60 * 60 * 1000;

const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_LISBOA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

interface RelogioCivil extends DataCivil {
  hora: number;
  minuto: number;
  segundo: number;
}

/** Que horas são em Lisboa neste instante. */
function relogioEmLisboa(instante: Date): RelogioCivil {
  const partes = FORMATADOR.formatToParts(instante);
  const ler = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo)?.value ?? "0";
    // 'en-CA' com hour12:false pode devolver 24 à meia-noite em alguns runtimes.
    const n = Number(parte);
    return Number.isFinite(n) ? n : 0;
  };
  const hora = ler("hour");
  return {
    ano: ler("year"),
    mes: ler("month"),
    dia: ler("day"),
    hora: hora === 24 ? 0 : hora,
    minuto: ler("minute"),
    segundo: ler("second"),
  };
}

/** Quanto é que a hora civil de Lisboa está à frente do UTC neste instante (ms). */
function desvioLisboaMs(instante: Date): number {
  const r = relogioEmLisboa(instante);
  return Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo) -
    Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Instante (epoch ms) de uma hora civil de Lisboa.
 *
 * Duas passagens: a primeira usa o desvio do palpite em UTC, a segunda corrige
 * quando esse palpite caiu do lado errado de uma mudança de hora (Março e
 * Outubro). Sem a segunda passagem, a última semana de Março ficava uma hora ao
 * lado.
 */
export function instanteEmLisboa(
  data: DataCivil,
  hora = 0,
  minuto = 0,
  segundo = 0,
): number {
  const palpite = Date.UTC(data.ano, data.mes - 1, data.dia, hora, minuto, segundo);
  let ms = palpite - desvioLisboaMs(new Date(palpite));
  ms = palpite - desvioLisboaMs(new Date(ms));
  return ms;
}

/** Data civil de hoje em Lisboa. */
export function hojeEmLisboa(agora: Date = new Date()): DataCivil {
  const { ano, mes, dia } = relogioEmLisboa(agora);
  return { ano, mes, dia };
}

/** Aritmética de calendário — feita em UTC, onde nenhum dia tem 23 ou 25 horas. */
export function somarDias(data: DataCivil, dias: number): DataCivil {
  const d = new Date(Date.UTC(data.ano, data.mes - 1, data.dia) + dias * MS_DIA);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** 0=domingo … 6=sábado, para a data civil (independente de fuso). */
export function diaDaSemana(data: DataCivil): number {
  return new Date(Date.UTC(data.ano, data.mes - 1, data.dia)).getUTCDay();
}

export function formatarData(data: DataCivil): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${data.ano}-${dois(data.mes)}-${dois(data.dia)}`;
}

/** Aceita 'YYYY-MM-DD' (e ignora o que venha a seguir, como 'T00:00:00Z'). */
export function analisarData(texto: unknown): DataCivil | null {
  if (typeof texto !== "string") return null;
  const encontrado = texto.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!encontrado) return null;

  const ano = Number(encontrado[1]);
  const mes = Number(encontrado[2]);
  const dia = Number(encontrado[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // Rejeita datas que não existem (31 de Fevereiro e afins).
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) {
    return null;
  }
  return { ano, mes, dia };
}

/** Segunda-feira da semana a que esta data pertence. */
export function segundaDaSemana(data: DataCivil): DataCivil {
  const dow = diaDaSemana(data);
  return somarDias(data, -(dow === 0 ? 6 : dow - 1));
}

/** Constrói a semana a partir das duas datas civis, com as fronteiras de Lisboa. */
export function semanaEntre(inicio: DataCivil, fim: DataCivil): Semana {
  const textoInicio = formatarData(inicio);
  const textoFim = formatarData(fim);
  return {
    inicio: textoInicio,
    fim: textoFim,
    start_ts: Math.floor(instanteEmLisboa(inicio, 0, 0, 0) / 1000),
    end_ts: Math.floor(instanteEmLisboa(fim, 23, 59, 59) / 1000),
    periodo: `${textoInicio} a ${textoFim}`,
  };
}

/** Semana passada (2ª a Dom) relativa a agora, em Lisboa. */
export function semanaPassada(agora: Date = new Date()): Semana {
  const segundaPassada = somarDias(segundaDaSemana(hojeEmLisboa(agora)), -7);
  return semanaEntre(segundaPassada, somarDias(segundaPassada, 6));
}
