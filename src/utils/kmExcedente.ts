export interface KmExcedenteInput {
  kmSaida: number | null | undefined;
  kmEntrada: number | null | undefined;
  /** null = km ilimitados. */
  kmsIncluidos: number | null | undefined;
  /** €/km acima do limite. */
  kmAdicionalValor: number | null | undefined;
}

/**
 * Onde os km extra vão ser cobrados — espelha km_excedente_cobrar: TVDE na
 * conta-corrente do motorista, rent-a-car (e TVDE sem motorista) nos extras do
 * contrato. Rent-a-car paga-se quase sempre antes do fecho: aí a linha já não
 * entra na fatura e tem de se faturar à parte.
 */
export function destinoKmExtra(ctx: {
  regime: string | null | undefined;
  temMotorista: boolean;
  faturado: boolean;
}): { texto: string; faturarAParte: boolean } {
  if (ctx.regime === 'tvde' && ctx.temMotorista) {
    return {
      texto: 'Fica como débito pendente na conta-corrente do motorista.',
      faturarAParte: false,
    };
  }
  if (ctx.faturado) {
    return {
      texto:
        'Contrato já faturado — fica nos extras e tens de emitir à parte a fatura dos km extra.',
      faturarAParte: true,
    };
  }
  return { texto: 'Fica nos extras do contrato e entra na fatura.', faturarAParte: false };
}

/** Km de saída escrito pelo gestor no fecho. null = não está a corrigir ou ainda não é um km. */
export function lerKmSaidaCorrigido(texto: string | null): number | null {
  if (texto == null || !texto.trim()) return null;
  const n = Number(texto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Km de entrada abaixo do de saída: km mal escrito, o fecho não avança. */
export function kmAbaixoDaSaida(
  kmSaida: number | null | undefined,
  kmEntrada: number | null | undefined
): boolean {
  if (!kmSaida || kmSaida < 0 || kmEntrada == null || Number.isNaN(kmEntrada)) return false;
  return kmEntrada < kmSaida;
}

/**
 * Porque é que não há conta, quando calcularKmExcedente devolve null. O km a
 * descer é quase sempre um km mal escrito — dizer só "sem km de saída"
 * escondia-o (#20 da Premium Ride, 29-10).
 */
export function motivoSemCalculo(
  kmSaida: number | null | undefined,
  kmEntrada: number | null | undefined
): string {
  if (!kmSaida || kmSaida < 0) {
    return 'Sem km de saída registado neste contrato — os km extra não são calculados.';
  }
  if (kmAbaixoDaSaida(kmSaida, kmEntrada) && kmEntrada != null) {
    return `O km de entrada (${kmEntrada.toLocaleString('pt-PT')}) é menor que o km com que a viatura saiu (${kmSaida.toLocaleString('pt-PT')}). Corrige o km de entrada — ou o de saída, se for esse o errado — para poder fechar o contrato.`;
  }
  return 'Indica o km de entrada para calcular os km extra.';
}

export interface KmExcedente {
  kmPercorridos: number;
  kmExcedente: number;
  valor: number;
}

/**
 * Km acima do limite do contrato e quanto custam — a mesma conta que
 * km_excedente_calcular faz na BD; aqui serve para o gestor a ver antes de
 * fechar. null quando não há como calcular (km em falta, a 0 ou a descer).
 */
export function calcularKmExcedente({
  kmSaida,
  kmEntrada,
  kmsIncluidos,
  kmAdicionalValor,
}: KmExcedenteInput): KmExcedente | null {
  // Km de saída 0 é "não registado": contava o conta-quilómetros inteiro.
  if (!kmSaida || kmSaida < 0 || kmEntrada == null || Number.isNaN(kmEntrada)) return null;
  const kmPercorridos = kmEntrada - kmSaida;
  if (kmPercorridos < 0) return null;

  const valorKm = kmAdicionalValor ?? 0;
  if (kmsIncluidos == null || valorKm <= 0 || kmPercorridos <= kmsIncluidos) {
    return { kmPercorridos, kmExcedente: 0, valor: 0 };
  }
  const kmExcedente = kmPercorridos - kmsIncluidos;
  return { kmPercorridos, kmExcedente, valor: Math.round(kmExcedente * valorKm * 100) / 100 };
}
