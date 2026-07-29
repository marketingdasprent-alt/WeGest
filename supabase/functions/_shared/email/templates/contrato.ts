// Contrato de aluguer — criado ou renovado. Vai para o motorista/condutor,
// por isso é white-label por omissão (a empresa é quem "assina" o email;
// a WeGest passa para o rodapé — ver notificacao.ts).
import { notificacaoTemplate } from './notificacao.ts';

export interface ContratoInput {
  tipo: 'criado' | 'renovacao';
  destinatarioNome: string;
  matricula: string;
  marcaModelo?: string;
  dataInicioFmt?: string;
  dataFimFmt?: string;
  valorMensal?: number;
  motoristaNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
}

export function contratoTemplate(input: ContratoInput): { subject: string; html: string } {
  const {
    tipo,
    destinatarioNome,
    matricula,
    marcaModelo,
    dataInicioFmt,
    dataFimFmt,
    valorMensal,
    motoristaNome,
    emissorNome,
    emissorLogoUrl,
    ctaUrl,
  } = input;

  const veiculo = [matricula, marcaModelo].filter(Boolean).join(' — ');
  const titulo = tipo === 'criado' ? 'Contrato de Aluguer Disponível' : 'Contrato Renovado';
  const introducao =
    tipo === 'criado'
      ? 'O seu contrato de aluguer foi gerado e está pronto para consulta e assinatura.'
      : 'O seu contrato de aluguer foi renovado. Seguem os novos termos.';

  const corpo = `
      <p style="margin:0 0 8px"><strong>Viatura:</strong> ${veiculo}</p>
      ${dataInicioFmt ? `<p style="margin:0 0 8px"><strong>${tipo === 'criado' ? 'Início' : 'Início da renovação'}:</strong> ${dataInicioFmt}</p>` : ''}
      ${dataFimFmt ? `<p style="margin:0 0 8px"><strong>Válido até:</strong> ${dataFimFmt}</p>` : ''}
      ${valorMensal != null ? `<p style="margin:0"><strong>Valor mensal:</strong> ${valorMensal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</p>` : ''}
    `;

  const html = notificacaoTemplate({
    titulo,
    categoria: 'Contrato',
    severidade: 'info',
    destinatarioNome,
    introducao,
    motoristaNome,
    corpo,
    ctaLabel: ctaUrl ? (tipo === 'criado' ? 'Ver e Assinar Contrato' : 'Ver Contrato') : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  const subject =
    tipo === 'criado' ? `O seu contrato de aluguer — ${matricula}` : `Contrato renovado — ${matricula}`;

  return { subject, html };
}
