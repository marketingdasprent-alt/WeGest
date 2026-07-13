export interface DepreciationEntry {
  ano: number;
  depreciacaoAnual: number;
  valorContabil: number;
}

/**
 * Calcula o total da viatura incluindo IVA com base nos custos parciais.
 */
export function calculateTotalViatura(
  custoViatura?: string | null,
  custosOperacionais?: string | null,
  custosAdicionais?: string | null,
  impostosAquisicao?: string | null,
  ivaTipo?: string | null,
): number {
  const cv = parseFloat(custoViatura || '0');
  const co = parseFloat(custosOperacionais || '0');
  const ca = parseFloat(custosAdicionais || '0');
  const im = parseFloat(impostosAquisicao || '0');
  const iva = ivaTipo || 'ISENTO';

  const subtotal = cv + co + ca + im;
  let taxMultiplier = 1;

  if (iva === '23%') taxMultiplier = 1.23;
  else if (iva === '13%') taxMultiplier = 1.13;
  else if (iva === '6%') taxMultiplier = 1.06;

  return subtotal * taxMultiplier;
}

/**
 * Calcula o plano de depreciação com base no método escolhido.
 * Suporta: linear, reducao_dupla, soma_digitos
 */
export function calculateDepreciationSchedule(
  totalCost: number,
  years: number,
  method: string = 'linear',
): DepreciationEntry[] {
  if (totalCost <= 0 || years <= 0) return [];

  const schedule: DepreciationEntry[] = [];
  let currentBookValue = totalCost;

  if (method === 'linear') {
    const annualDepreciation = totalCost / years;
    for (let i = 1; i <= years; i++) {
      currentBookValue -= annualDepreciation;
      schedule.push({
        ano: i,
        depreciacaoAnual: annualDepreciation,
        valorContabil: Math.max(0, currentBookValue),
      });
    }
  } else if (method === 'reducao_dupla') {
    const rate = 2 / years;
    for (let i = 1; i <= years; i++) {
      const annualDepreciation = currentBookValue * rate;
      currentBookValue -= annualDepreciation;
      schedule.push({
        ano: i,
        depreciacaoAnual: annualDepreciation,
        valorContabil: Math.max(0, currentBookValue),
      });
    }
  } else if (method === 'soma_digitos') {
    const sumOfDigits = (years * (years + 1)) / 2;
    for (let i = 1; i <= years; i++) {
      const remainingLife = years - i + 1;
      const annualDepreciation = (remainingLife / sumOfDigits) * totalCost;
      currentBookValue -= annualDepreciation;
      schedule.push({
        ano: i,
        depreciacaoAnual: annualDepreciation,
        valorContabil: Math.max(0, currentBookValue),
      });
    }
  }

  return schedule;
}

/**
 * Calcula quantos meses restam de financiamento.
 */
export function calculateRestanteFinanciamento(
  tipo: string | null,
  dataInicioStr: string | null | undefined,
  totalPrestacoes: number,
): string {
  if (tipo === 'sem_financiamento' || !tipo) return 'N/A';
  if (!dataInicioStr || totalPrestacoes === 0) return '0';

  const dataInicio = new Date(dataInicioStr);
  const hoje = new Date();

  const diffMeses =
    (hoje.getFullYear() - dataInicio.getFullYear()) * 12 +
    (hoje.getMonth() - dataInicio.getMonth());
  const restante = Math.max(0, totalPrestacoes - diffMeses);
  return restante.toString();
}
