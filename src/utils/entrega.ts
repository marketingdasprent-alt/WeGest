/**
 * Helpers e tipos para o fluxo de realizar entrega/recolha/troca.
 * Lógica pura, sem dependências React.
 */
import { precisaCombustivel, precisaEletrico } from './combustivel';

// ── Localizações de fotos ────────────────────────────────────────────────────

export const LOCALIZACOES = [
  { value: 'frente', label: 'Frente' },
  { value: 'traseira', label: 'Traseira' },
  { value: 'lateral_esq', label: 'Lateral Esquerda' },
  { value: 'lateral_dir', label: 'Lateral Direita' },
  { value: 'teto', label: 'Teto' },
  { value: 'interior', label: 'Interior' },
  { value: 'motor', label: 'Motor' },
  { value: 'outro', label: 'Outro' },
] as const;

export const LOCALIZACAO_LABEL: Record<string, string> = Object.fromEntries(
  LOCALIZACOES.map((l) => [l.value, l.label])
);

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface FilePreview {
  id: string;
  file: File;
  url: string;
  localizacao: string;
  descricao: string;
  valor: string;
}

export interface RascunhoCache {
  km: string;
  combustivel: string;
  eletricidade?: string;
  observacoes: string;
  fotos: {
    name: string;
    type: string;
    dataUrl: string;
    localizacao: string;
    descricao: string;
    valor: string;
  }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export type TipoEvento = 'entrega' | 'recolha' | 'troca';

export function tipoLabel(tipo: TipoEvento | undefined): string {
  if (tipo === 'entrega') return 'Entrega';
  if (tipo === 'troca') return 'Troca';
  return 'Recolha';
}

export function cacheKey(token: string): string {
  return `realizar-rascunho-${token}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, name: string, type: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type });
}

// ── Validação ────────────────────────────────────────────────────────────────

/** Valida se os níveis exigidos por este tipo de viatura estão preenchidos —
 *  combustível para combustão/híbrido, bateria para elétrico/híbrido. */
export function nivelPreenchido(
  tipoCombustivel: string | null | undefined,
  combustivel: string,
  eletricidade: string
): boolean {
  const okCombustivel = !precisaCombustivel(tipoCombustivel) || !!combustivel;
  const okEletrico = !precisaEletrico(tipoCombustivel) || !!eletricidade;
  return okCombustivel && okEletrico;
}

/**
 * O km de saída/entrada tem de ser >= ao odómetro actual da viatura: o carro
 * não anda para trás, logo não se pode "abrir" (ou fechar) com menos km do que
 * a viatura já tem (ex.: 35 km num carro com 350000). `kmMinimo` é o
 * `viaturas.km_atual` no momento — quando é null/desconhecido, não se bloqueia
 * (não há baseline para comparar). Devolve a mensagem de erro ou null.
 */
export function validarKmContraViatura(km: string, kmMinimo?: number | null): string | null {
  if (kmMinimo == null) return null;
  if (!km.trim()) return null; // vazio → "km obrigatório" é apanhado antes (Number('') é 0!)
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  if (n < kmMinimo) {
    return `O km introduzido (${n.toLocaleString('pt-PT')}) não pode ser inferior ao km atual da viatura (${kmMinimo.toLocaleString('pt-PT')}).`;
  }
  return null;
}

export function validarDadosObrigatorios(
  km: string,
  combustivel: string,
  isTroca: boolean,
  kmAntiga?: string,
  combustivelAntiga?: string,
  tipoCombustivel?: string | null,
  eletricidade?: string,
  tipoCombustivelAntiga?: string | null,
  eletricidadeAntiga?: string,
  /** Odómetro actual da viatura (viaturas.km_atual) — bloqueia km inferior. */
  kmMinimo?: number | null,
  /** Odómetro actual da viatura devolvida na troca. */
  kmMinimoAntiga?: number | null
): string | null {
  if (!km.trim() || !nivelPreenchido(tipoCombustivel, combustivel, eletricidade ?? '')) {
    return 'Preenche o km e o nível de combustível/bateria antes de continuar.';
  }
  const errKm = validarKmContraViatura(km, kmMinimo);
  if (errKm) return errKm;
  if (
    isTroca &&
    (!kmAntiga?.trim() ||
      !nivelPreenchido(tipoCombustivelAntiga, combustivelAntiga ?? '', eletricidadeAntiga ?? ''))
  ) {
    return 'Preenche também o km e combustível/bateria da viatura devolvida.';
  }
  if (isTroca) {
    const errKmAntiga = validarKmContraViatura(kmAntiga ?? '', kmMinimoAntiga);
    if (errKmAntiga) return errKmAntiga;
  }
  return null;
}
