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

export function validarDadosObrigatorios(
  km: string,
  combustivel: string,
  isTroca: boolean,
  kmAntiga?: string,
  combustivelAntiga?: string,
  tipoCombustivel?: string | null,
  eletricidade?: string,
  tipoCombustivelAntiga?: string | null,
  eletricidadeAntiga?: string
): string | null {
  if (!km.trim() || !nivelPreenchido(tipoCombustivel, combustivel, eletricidade ?? '')) {
    return 'Preenche o km e o nível de combustível/bateria antes de continuar.';
  }
  if (
    isTroca &&
    (!kmAntiga?.trim() ||
      !nivelPreenchido(tipoCombustivelAntiga, combustivelAntiga ?? '', eletricidadeAntiga ?? ''))
  ) {
    return 'Preenche também o km e combustível/bateria da viatura devolvida.';
  }
  return null;
}
