import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

/** Linha de `motorista_liquido_semanal` tal como vem da BD. */
export interface LinhaLiquido {
  motorista_id: string;
  motorista_nome: string | null;
  liquido: number;
}

export interface MotoristaNegativo {
  id: string;
  nome: string;
  liquido: number;
}

export interface GestorContagem {
  /** Nome normalizado — é por aqui que se agrupa; vazio = sem gestor. */
  chave: string;
  /** Grafia a mostrar (a mais usada), ou "Sem gestor". */
  nome: string;
  total: number;
}

export interface Semana {
  inicio: string;
  fim: string;
}

/**
 * Chave de agrupamento de um gestor. `gestor_responsavel` é texto livre, por
 * isso a mesma pessoa aparece com e sem acentos, com caixa diferente e com
 * espaços a mais; sem normalizar, o cartão mostrava-a duas vezes.
 */
function chaveGestor(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Última semana já terminada à data de `hoje`. A semana a decorrer fica de
 * fora de propósito: só tem os lançamentos que já entraram, e nessa altura
 * quase todos os motoristas ainda estão negativos — contá-la dava um retrato
 * falso. Uma semana só conta como fechada no dia seguinte ao `semana_fim`.
 */
export function escolherSemanaFechada(
  semanas: { semana_inicio: string; semana_fim: string }[],
  hoje: Date = new Date()
): Semana | null {
  const hojeISO = format(hoje, 'yyyy-MM-dd');
  let melhor: Semana | null = null;
  for (const s of semanas) {
    if (s.semana_fim >= hojeISO) continue;
    if (!melhor || s.semana_inicio > melhor.inicio) {
      melhor = { inicio: s.semana_inicio, fim: s.semana_fim };
    }
  }
  return melhor;
}

/** Contagem de motoristas por gestor, do maior para o menor. */
export function agruparPorGestor(
  motoristas: { gestor_responsavel: string | null }[]
): GestorContagem[] {
  // Por chave: total e quantas vezes cada grafia original apareceu.
  const grupos = new Map<string, { total: number; grafias: Map<string, number> }>();

  for (const m of motoristas) {
    const chave = chaveGestor(m.gestor_responsavel);
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { total: 0, grafias: new Map() };
      grupos.set(chave, grupo);
    }
    grupo.total += 1;
    const grafia = (m.gestor_responsavel ?? '').trim();
    if (grafia) grupo.grafias.set(grafia, (grupo.grafias.get(grafia) ?? 0) + 1);
  }

  const linhas: GestorContagem[] = [];
  for (const [chave, grupo] of grupos) {
    let nome = 'Sem gestor';
    let melhor = 0;
    for (const [grafia, vezes] of grupo.grafias) {
      if (vezes > melhor) {
        melhor = vezes;
        nome = grafia;
      }
    }
    linhas.push({ chave, nome, total: grupo.total });
  }

  return linhas.sort((a, b) => {
    // "Sem gestor" é o resto, não um gestor: vai sempre para o fim.
    if (!a.chave !== !b.chave) return a.chave ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.nome.localeCompare(b.nome, 'pt');
  });
}

/** Só os líquidos negativos da semana, do mais negativo para o menos. */
export function ordenarNegativos(linhas: LinhaLiquido[]): MotoristaNegativo[] {
  return linhas
    .map((l) => ({
      id: l.motorista_id,
      nome: l.motorista_nome?.trim() || 'Motorista sem nome',
      liquido: Number(l.liquido) || 0,
    }))
    .filter((m) => m.liquido < 0)
    .sort((a, b) => a.liquido - b.liquido);
}

/** "7–13 set" dentro do mesmo mês, "31 ago – 6 set" quando o atravessa. */
export function formatarIntervaloSemana(inicio: string, fim: string): string {
  const di = parseISO(inicio);
  const df = parseISO(fim);
  const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7);
  if (mesmoMes) {
    return `${format(di, 'd', { locale: pt })}–${format(df, 'd MMM', { locale: pt })}`;
  }
  return `${format(di, 'd MMM', { locale: pt })} – ${format(df, 'd MMM', { locale: pt })}`;
}
