// Formulário das estações (Definições → Estações): converte o que se escreve
// no ecrã para a linha de public.estacoes. Horário e coordenadas são lidos pela
// API de rent-a-car (/v1/localizacoes).

export interface EstacaoForm {
  nome: string;
  morada: string;
  cidade: string;
  ativa: boolean;
  horario: string;
  latitude: string;
  longitude: string;
}

export interface EstacaoPayload {
  nome: string;
  morada: string | null;
  cidade: string | null;
  ativa: boolean;
  horario: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface LinhaEstacao {
  nome: string;
  morada: string | null;
  cidade: string | null;
  ativa: boolean;
  horario?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export const estacaoFormVazio: EstacaoForm = {
  nome: '',
  morada: '',
  cidade: '',
  ativa: true,
  horario: '',
  latitude: '',
  longitude: '',
};

function coordenada(texto: string, limite: number, nome: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || Math.abs(n) > limite) {
    throw new Error(`${nome} entre -${limite} e ${limite}`);
  }
  return n;
}

/** Lança Error com a mensagem PT quando uma coordenada é impossível. */
export function estacaoPayload(f: EstacaoForm): EstacaoPayload {
  return {
    nome: f.nome.trim(),
    morada: f.morada.trim() || null,
    cidade: f.cidade.trim() || null,
    ativa: f.ativa,
    horario: f.horario.trim() || null,
    latitude: coordenada(f.latitude, 90, 'Latitude'),
    longitude: coordenada(f.longitude, 180, 'Longitude'),
  };
}

export function estacaoFormDeLinha(e: LinhaEstacao): EstacaoForm {
  return {
    nome: e.nome,
    morada: e.morada ?? '',
    cidade: e.cidade ?? '',
    ativa: e.ativa,
    horario: e.horario ?? '',
    latitude: e.latitude == null ? '' : String(e.latitude),
    longitude: e.longitude == null ? '' : String(e.longitude),
  };
}
