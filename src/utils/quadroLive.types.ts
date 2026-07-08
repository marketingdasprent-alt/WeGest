// Tipos do payload do Quadro TV (leaderboard semanal). Partilhados entre a
// edge function `quadro-live` (shape do output) e o frontend (consumo).

export interface GestorScore {
  gestor: string;
  alugados: number;
  devolvidos: number;
  trocas: number;
  upgrades: number;
}

export interface ViaturaDisp {
  matricula: string;
  modelo: string;
}

export interface AlugadoSemana {
  matricula: string;
  gestor: string;
  hora: string; // ISO (data_inicio da entrega)
}

export interface QuadroKpis {
  alugados: number;
  devolvidos: number;
  trocas: number;
  upgrades: number;
  disponiveis: number;
}

export interface QuadroPayload {
  org_nome: string;
  gerado_em: string; // ISO
  semana_inicio: string; // ISO segunda
  semana_fim: string; // ISO domingo
  leaderboard: GestorScore[]; // ordenado: alugados desc, devolvidos desc, nome asc
  kpis: QuadroKpis;
  porDia: number[]; // 7 valores Seg..Dom — alugados por dia da semana
  disponiveis: ViaturaDisp[];
  alugadosSemana: AlugadoSemana[]; // ordenado por hora asc
}
