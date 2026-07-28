import { notificacaoTemplate } from './notificacao.ts';

// Envio de fatura ao cliente — white-label por omissão. O PDF da fatura é
// enviado como anexo pelo EmailService (ver sendFaturaCliente), este
// template só trata do corpo do email.
export interface FaturaClienteInput {
  destinatarioNome: string;
  numeroFatura: string;
  valorTotal: number;
  dataEmissaoFmt: string;
  dataVencimentoFmt?: string;
  empresaNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
}

export function faturaClienteTemplate(input: FaturaClienteInput): { subject: string; html: string } {
  const {
    destinatarioNome,
    numeroFatura,
    valorTotal,
    dataEmissaoFmt,
    dataVencimentoFmt,
    empresaNome,
    emissorNome,
    emissorLogoUrl,
    ctaUrl,
  } = input;

  const corpo = `
      <p style="margin:0 0 8px"><strong>Fatura n.º:</strong> ${numeroFatura}</p>
      <p style="margin:0 0 8px"><strong>Data de emissão:</strong> ${dataEmissaoFmt}</p>
      ${dataVencimentoFmt ? `<p style="margin:0 0 8px"><strong>Vencimento:</strong> ${dataVencimentoFmt}</p>` : ''}
      <p style="margin:0"><strong>Valor total:</strong> <span style="font-weight:700">${valorTotal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</span></p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Nova Fatura Disponível',
    categoria: 'Fatura',
    severidade: 'info',
    destinatarioNome,
    introducao: 'Segue em anexo a fatura referente aos serviços prestados.',
    empresaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Ver Fatura' : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: `Fatura ${numeroFatura}`, html };
}

// Lembrete de cobrança em atraso — tom mais urgente (crítico), white-label
// por omissão.
export interface CobrancaAtrasoInput {
  destinatarioNome: string;
  numeroFatura: string;
  valorTotal: number;
  diasAtraso: number;
  empresaNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
}

export function cobrancaAtrasoTemplate(input: CobrancaAtrasoInput): { subject: string; html: string } {
  const { destinatarioNome, numeroFatura, valorTotal, diasAtraso, empresaNome, emissorNome, emissorLogoUrl, ctaUrl } =
    input;

  const corpo = `
      <p style="margin:0 0 8px"><strong>Fatura n.º:</strong> ${numeroFatura}</p>
      <p style="margin:0 0 8px"><strong>Valor em dívida:</strong> <span style="font-weight:700">${valorTotal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</span></p>
      <p style="margin:0"><strong>Atraso:</strong> <span style="color:#dc2626;font-weight:700">${diasAtraso} dias</span></p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Pagamento em Atraso',
    categoria: 'Cobrança',
    severidade: 'critico',
    destinatarioNome,
    introducao: 'Identificámos um pagamento pendente com a fatura abaixo. Regularize o mais breve possível.',
    empresaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Regularizar Pagamento' : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: `⚠️ Pagamento em atraso (${diasAtraso} dias) — Fatura ${numeroFatura}`, html };
}
