import type { MotoristaTab } from './motoristaNav';
import type { DocAExpirar } from './dashboardStats';

export type TomAlerta = 'perigo' | 'aviso' | 'info';

export interface AlertaMotorista {
  id: string;
  tom: TomAlerta;
  titulo: string;
  detalhe?: string;
  /** Secção do painel onde o motorista resolve isto. */
  tab: MotoristaTab;
}

export interface EntradaAlertas {
  docsExpirando: Pick<DocAExpirar, 'label' | 'data' | 'validade'>[];
  semanasEmFalta: number;
  recibosEmValidacao: number;
  acordosAtivos: number;
  usaRecibos: boolean;
  hoje?: Date;
}

/**
 * A faixa de alertas do Início: só o que pede uma acção ao motorista, cada
 * um a apontar para a secção onde se resolve. Os quilómetros da semana NÃO
 * entram aqui — têm cartão próprio no Início, porque a acção (fotografar) é
 * feita ali e não noutra secção.
 *
 * Ordem = urgência: o que já expirou primeiro, depois o que expira, depois
 * recibos, depois informação.
 */
export function construirAlertas(e: EntradaAlertas): AlertaMotorista[] {
  const hoje = e.hoje ?? new Date();
  const alertas: AlertaMotorista[] = [];

  const docs = [...e.docsExpirando].sort((a, b) => a.validade.getTime() - b.validade.getTime());
  for (const d of docs) {
    const expirado = d.validade < hoje;
    alertas.push({
      id: `doc-${d.label}`,
      tom: expirado ? 'perigo' : 'aviso',
      titulo: expirado ? `${d.label} expirou` : `${d.label} expira em breve`,
      detalhe: `Validade: ${d.data}`,
      tab: 'documentos',
    });
  }

  if (e.usaRecibos && e.semanasEmFalta > 0) {
    alertas.push({
      id: 'recibos-em-falta',
      tom: 'aviso',
      titulo:
        e.semanasEmFalta === 1
          ? '1 recibo verde em falta'
          : `${e.semanasEmFalta} recibos verdes em falta`,
      detalhe: 'Submeta-os para o saldo ser processado.',
      tab: 'documentos',
    });
  }

  if (e.usaRecibos && e.recibosEmValidacao > 0) {
    alertas.push({
      id: 'recibos-em-validacao',
      tom: 'info',
      titulo:
        e.recibosEmValidacao === 1
          ? '1 recibo verde em validação'
          : `${e.recibosEmValidacao} recibos verdes em validação`,
      detalhe: 'Aguardam aprovação do gestor.',
      tab: 'documentos',
    });
  }

  if (e.acordosAtivos > 0) {
    alertas.push({
      id: 'acordos',
      tom: 'info',
      titulo:
        e.acordosAtivos === 1
          ? 'Tem um plano de pagamento activo'
          : `Tem ${e.acordosAtivos} planos de pagamento activos`,
      detalhe: 'Veja as prestações em Contas.',
      tab: 'contas',
    });
  }

  return alertas;
}
