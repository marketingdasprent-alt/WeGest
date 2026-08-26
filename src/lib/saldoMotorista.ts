/**
 * Legenda/tom do saldo pendente do motorista (motorista_saldo_pendente,
 * Σcrédito − Σdébito só sobre status='pendente'). Convenção de sinal
 * preservada da que já estava em produção no cartão "Saldo Atual" do
 * próprio motorista (MotoristaDashboard.tsx): positivo = a favor do
 * motorista (falta receber); negativo = motorista deve.
 *
 * O significado não pode depender só da cor — por isso devolve sempre um
 * texto também (mesmo padrão de legendaSaldo() em ClienteContaCorrenteTab.tsx,
 * que usa a convenção de sinal oposta — conta-corrente de clientes Renting,
 * entidade diferente, não confundir).
 */
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
