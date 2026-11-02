interface LinhaSaldo {
  motorista_id?: string;
  liquido: number;
}

/**
 * Filtro "Negativos" das contas semanais. Quem não faturou mas pagou viatura,
 * portagens ou combustível conta — o negativo é real. Só fica de fora quem
 * foi contratado nessa semana (ainda a arrancar).
 */
export function entraNosNegativos(
  linha: LinhaSaldo,
  dataContratacao: string | undefined,
  weekStart: Date,
  weekEnd: Date
): boolean {
  if (linha.liquido >= 0) return false;
  if (linha.motorista_id && dataContratacao) {
    const dc = new Date(dataContratacao);
    if (dc >= weekStart && dc <= weekEnd) return false;
  }
  return true;
}
