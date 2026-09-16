export type ToneSaldoMotorista = 'positivo' | 'negativo' | 'neutro';

export interface LegendaSaldoMotorista {
  texto: string;
  tone: ToneSaldoMotorista;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function legendaSaldoMotorista(saldo: number): LegendaSaldoMotorista {
  if (saldo > 0.005) {
    return { texto: `${formatCurrency(saldo)} disponível para levantamento`, tone: 'positivo' };
  }
  if (saldo < -0.005) {
    return { texto: `${formatCurrency(Math.abs(saldo))} em dívida`, tone: 'negativo' };
  }
  return { texto: 'Tudo regularizado', tone: 'neutro' };
}
