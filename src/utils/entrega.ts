/**
 * Helpers e tipos para o fluxo de realizar entrega/recolha/troca.
 * Lógica pura, sem dependências React.
 */

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

export async function dataUrlToFile(
  dataUrl: string,
  name: string,
  type: string
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type });
}

// ── Validação ────────────────────────────────────────────────────────────────

export function validarDadosObrigatorios(
  km: string,
  combustivel: string,
  isTroca: boolean,
  kmAntiga?: string,
  combustivelAntiga?: string
): string | null {
  if (!km.trim() || !combustivel) {
    return 'Preenche o km e o nível de combustível antes de continuar.';
  }
  if (isTroca && (!kmAntiga?.trim() || !combustivelAntiga)) {
    return 'Preenche também o km e combustível da viatura devolvida.';
  }
  return null;
}
