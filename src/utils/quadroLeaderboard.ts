import type { GestorScore } from './quadroLive.types';

export interface EventoBruto {
  tipo: 'entrega' | 'devolucao' | 'recolha' | 'troca' | 'upgrade';
  gestorId: string;
}

const SEM_GESTOR = 'Sem gestor';

/**
 * Semana atual [segunda 00:00, domingo 23:59:59.999] no fuso local de `agora`,
 * devolvida em ISO. Segunda = início (ISO weekday 1).
 */
export function boundsSemana(agora: Date): { inicio: string; fim: string } {
  const diaSemana = (agora.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
  const inicio = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() - diaSemana,
    0,
    0,
    0,
    0
  );
  const fim = new Date(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate() + 6,
    23,
    59,
    59,
    999
  );
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export function construirLeaderboard(
  eventos: EventoBruto[],
  nomePorId: Map<string, string>
): GestorScore[] {
  const mapa = new Map<string, GestorScore>();
  const get = (gestorId: string): GestorScore => {
    let g = mapa.get(gestorId);
    if (!g) {
      g = {
        gestor: nomePorId.get(gestorId) ?? SEM_GESTOR,
        alugados: 0,
        devolvidos: 0,
        trocas: 0,
        upgrades: 0,
      };
      mapa.set(gestorId, g);
    }
    return g;
  };
  for (const ev of eventos) {
    const g = get(ev.gestorId);
    if (ev.tipo === 'entrega') g.alugados += 1;
    else if (ev.tipo === 'devolucao' || ev.tipo === 'recolha') g.devolvidos += 1;
    else if (ev.tipo === 'troca') g.trocas += 1;
    else if (ev.tipo === 'upgrade') g.upgrades += 1;
  }
  return [...mapa.values()].sort(
    (a, b) =>
      b.alugados - a.alugados || b.devolvidos - a.devolvidos || a.gestor.localeCompare(b.gestor)
  );
}
