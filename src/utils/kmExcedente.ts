export interface KmExcedenteInput {
  kmSaida: number | null | undefined;
  kmEntrada: number | null | undefined;
  /** null = km ilimitados. */
  kmsIncluidos: number | null | undefined;
  /** €/km acima do limite. */
  kmAdicionalValor: number | null | undefined;
}

export interface KmExcedente {
  kmPercorridos: number;
  kmExcedente: number;
  valor: number;
}

/**
 * Km acima do limite do contrato e quanto custam — a mesma conta que
 * lancar_km_excedente_fecho faz na BD; aqui serve para o gestor a ver antes de
 * fechar. null quando não há como calcular (falta um km ou o km desceu).
 */
export function calcularKmExcedente({
  kmSaida,
  kmEntrada,
  kmsIncluidos,
  kmAdicionalValor,
}: KmExcedenteInput): KmExcedente | null {
  if (kmSaida == null || kmEntrada == null || Number.isNaN(kmEntrada)) return null;
  const kmPercorridos = kmEntrada - kmSaida;
  if (kmPercorridos < 0) return null;

  const valorKm = kmAdicionalValor ?? 0;
  if (kmsIncluidos == null || valorKm <= 0 || kmPercorridos <= kmsIncluidos) {
    return { kmPercorridos, kmExcedente: 0, valor: 0 };
  }
  const kmExcedente = kmPercorridos - kmsIncluidos;
  return { kmPercorridos, kmExcedente, valor: Math.round(kmExcedente * valorKm * 100) / 100 };
}
