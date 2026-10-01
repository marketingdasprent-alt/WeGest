// A semana Bolt usa fronteiras civis de Lisboa; calculá-la em UTC desloca-a no
// horário de verão e imputa viagens à semana errada.

export const FUSO_LISBOA = 'Europe/Lisbon';

export interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

export interface Semana {
  inicio: string;
  fim: string;
  start_ts: number;
  end_ts: number;
  periodo: string;
}

const MS_DIA = 24 * 60 * 60 * 1000;

const FORMATADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_LISBOA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface RelogioCivil extends DataCivil {
  hora: number;
  minuto: number;
  segundo: number;
}

function relogioEmLisboa(instante: Date): RelogioCivil {
  const partes = FORMATADOR.formatToParts(instante);
  const ler = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo)?.value ?? '0';
    // Alguns runtimes devolvem 24 à meia-noite com `hour12: false`.
    const n = Number(parte);
    return Number.isFinite(n) ? n : 0;
  };
  const hora = ler('hour');
  return {
    ano: ler('year'),
    mes: ler('month'),
    dia: ler('day'),
    hora: hora === 24 ? 0 : hora,
    minuto: ler('minute'),
    segundo: ler('second'),
  };
}

function desvioLisboaMs(instante: Date): number {
  const r = relogioEmLisboa(instante);
  return (
    Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo) -
    Math.floor(instante.getTime() / 1000) * 1000
  );
}

// A segunda passagem corrige o desvio quando o palpite cruza uma mudança de hora.
export function instanteEmLisboa(data: DataCivil, hora = 0, minuto = 0, segundo = 0): number {
  const palpite = Date.UTC(data.ano, data.mes - 1, data.dia, hora, minuto, segundo);
  let ms = palpite - desvioLisboaMs(new Date(palpite));
  ms = palpite - desvioLisboaMs(new Date(ms));
  return ms;
}

export function hojeEmLisboa(agora: Date = new Date()): DataCivil {
  const { ano, mes, dia } = relogioEmLisboa(agora);
  return { ano, mes, dia };
}

// Em UTC, a aritmética civil não encontra dias de 23 ou 25 horas.
export function somarDias(data: DataCivil, dias: number): DataCivil {
  const d = new Date(Date.UTC(data.ano, data.mes - 1, data.dia) + dias * MS_DIA);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

export function diaDaSemana(data: DataCivil): number {
  return new Date(Date.UTC(data.ano, data.mes - 1, data.dia)).getUTCDay();
}

export function formatarData(data: DataCivil): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${data.ano}-${dois(data.mes)}-${dois(data.dia)}`;
}

export function analisarData(texto: unknown): DataCivil | null {
  if (typeof texto !== 'string') return null;
  const encontrado = texto.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!encontrado) return null;

  const ano = Number(encontrado[1]);
  const mes = Number(encontrado[2]);
  const dia = Number(encontrado[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // O construtor normaliza datas inválidas; confirme os componentes originais.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) {
    return null;
  }
  return { ano, mes, dia };
}

export function segundaDaSemana(data: DataCivil): DataCivil {
  const dow = diaDaSemana(data);
  return somarDias(data, -(dow === 0 ? 6 : dow - 1));
}

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

export function semanaPassada(agora: Date = new Date()): Semana {
  const segundaPassada = somarDias(segundaDaSemana(hojeEmLisboa(agora)), -7);
  return semanaEntre(segundaPassada, somarDias(segundaPassada, 6));
}
