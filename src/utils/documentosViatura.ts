import { differenceInCalendarDays, parseISO } from 'date-fns';

/** Antecedência com que um documento passa a "a vencer" (a mesma de sempre na Frota). */
export const DIAS_AVISO_DOCUMENTOS = 30;

export type DocumentoViatura = 'inspecao' | 'seguro';

export interface AlertaDocumento {
  documento: DocumentoViatura;
  vencido: boolean;
  /** Dias até ao fim da validade (negativo = já passou). */
  dias: number;
  data: string;
}

interface ComDocumentos {
  inspecao_validade?: string | null;
  seguro_validade?: string | null;
}

const NOMES: Record<DocumentoViatura, string> = { inspecao: 'Inspeção', seguro: 'Seguro' };

/** Documentos vencidos ou a vencer, o mais urgente primeiro. */
export function alertasDocumentos(
  v: ComDocumentos,
  hoje: Date = new Date(),
  diasAviso: number = DIAS_AVISO_DOCUMENTOS
): AlertaDocumento[] {
  const alertas: AlertaDocumento[] = [];
  const ver = (documento: DocumentoViatura, data: string | null | undefined) => {
    if (!data) return;
    const dias = differenceInCalendarDays(parseISO(data), hoje);
    if (dias <= diasAviso) alertas.push({ documento, vencido: dias < 0, dias, data });
  };
  ver('inspecao', v.inspecao_validade);
  ver('seguro', v.seguro_validade);
  return alertas.sort((a, b) => a.dias - b.dias);
}

/** Texto curto para a linha: "Seguro vencido há 3 dias", "Inspeção vence hoje". */
export function textoAlerta(a: AlertaDocumento): string {
  const nome = NOMES[a.documento];
  if (a.vencido)
    return `${nome} vencid${a.documento === 'inspecao' ? 'a' : 'o'} há ${-a.dias} ${-a.dias === 1 ? 'dia' : 'dias'}`;
  if (a.dias === 0) return `${nome} vence hoje`;
  return `${nome} vence em ${a.dias} ${a.dias === 1 ? 'dia' : 'dias'}`;
}

/** Validade mais próxima (para ordenar a coluna Documentos). */
export function proximaValidade(v: ComDocumentos): string | null {
  const datas = [v.inspecao_validade, v.seguro_validade].filter((d): d is string => !!d);
  return datas.length ? datas.sort()[0] : null;
}

/** Quantas viaturas têm documentos vencidos / só a vencer (vendidas e inativas não contam). */
export function resumoAtencao<V extends ComDocumentos & { is_vendida?: boolean | null }>(
  viaturas: readonly V[],
  estadoDe: (v: V) => string,
  hoje: Date = new Date()
): { vencidas: number; aVencer: number } {
  let vencidas = 0;
  let aVencer = 0;
  for (const v of viaturas) {
    if (v.is_vendida || estadoDe(v) === 'inativo') continue;
    const alertas = alertasDocumentos(v, hoje);
    if (alertas.some((a) => a.vencido)) vencidas++;
    else if (alertas.length) aVencer++;
  }
  return { vencidas, aVencer };
}
