import { notificacaoTemplate } from './notificacao.ts';

// Reparação concluída com valor a cobrar ao motorista — vai para o
// motorista, por isso é white-label por omissão.
export interface ReparacaoConcluidaInput {
  destinatarioNome: string;
  matricula: string;
  marcaModelo?: string;
  descricaoReparacao: string;
  valorACobrar: number;
  motoristaNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
}

export function reparacaoConcluidaTemplate(input: ReparacaoConcluidaInput): { subject: string; html: string } {
  const {
    destinatarioNome,
    matricula,
    marcaModelo,
    descricaoReparacao,
    valorACobrar,
    motoristaNome,
    emissorNome,
    emissorLogoUrl,
    ctaUrl,
  } = input;
  const veiculo = [matricula, marcaModelo].filter(Boolean).join(' — ');

  const corpo = `
      <p style="margin:0 0 8px"><strong>Viatura:</strong> ${veiculo}</p>
      <p style="margin:0 0 8px"><strong>Reparação:</strong> ${descricaoReparacao}</p>
      <p style="margin:0"><strong>Valor a cobrar:</strong> <span style="font-weight:700">${valorACobrar.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</span></p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Reparação Concluída',
    categoria: 'Reparação',
    severidade: 'aviso',
    destinatarioNome,
    introducao: 'A reparação da sua viatura foi concluída e tem um valor associado a cobrar.',
    motoristaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Ver Detalhes' : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: `Reparação concluída — ${matricula} (valor a cobrar)`, html };
}

// Reparação aberta há demasiado tempo — alerta interno ao gestor, sem
// white-label.
export interface ReparacaoAbertaDemoradaInput {
  matricula: string;
  marcaModelo?: string;
  descricaoReparacao: string;
  diasAberta: number;
  destinatarioNome?: string;
  empresaNome?: string;
  ctaUrl?: string;
}

export function reparacaoAbertaDemoradaTemplate(input: ReparacaoAbertaDemoradaInput): {
  subject: string;
  html: string;
} {
  const { matricula, marcaModelo, descricaoReparacao, diasAberta, destinatarioNome, empresaNome, ctaUrl } = input;
  const veiculo = [matricula, marcaModelo].filter(Boolean).join(' — ');

  const corpo = `
      <p style="margin:0 0 8px"><strong>Viatura:</strong> ${veiculo}</p>
      <p style="margin:0 0 8px"><strong>Reparação:</strong> ${descricaoReparacao}</p>
      <p style="margin:0"><strong>Tempo em aberto:</strong> <span style="color:#d97706;font-weight:700">${diasAberta} dias</span></p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Reparação Aberta Há Demasiado Tempo',
    categoria: 'Reparação',
    severidade: 'aviso',
    destinatarioNome,
    introducao: 'Esta reparação está em aberto há mais tempo do que o habitual e pode precisar de atenção.',
    empresaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Ver Reparação' : undefined,
    ctaUrl,
  });

  return { subject: `⚠️ Reparação parada há ${diasAberta} dias — ${matricula}`, html };
}
