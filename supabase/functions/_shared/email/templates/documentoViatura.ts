// Alertas de documentos/manutenção da viatura a expirar (ou expirados) —
// seguro, IPO, IUC, extintor/documentos em geral, manutenção preventiva.
// São todos a mesma forma (viatura + prazo + estado), por isso é UMA função
// parametrizada por `tipo`, não cinco templates quase-idênticos.
import { notificacaoTemplate } from './notificacao.ts';

export type TipoDocumentoViatura = 'seguro' | 'ipo' | 'iuc' | 'documento' | 'manutencao_preventiva';

const TIPO_CONFIG: Record<TipoDocumentoViatura, { label: string; categoria: string }> = {
  seguro: { label: 'Seguro Automóvel', categoria: 'Seguro' },
  ipo: { label: 'Inspeção Periódica (IPO)', categoria: 'IPO' },
  iuc: { label: 'Imposto Único de Circulação (IUC)', categoria: 'IUC' },
  documento: { label: 'Documento da Viatura', categoria: 'Documento' },
  manutencao_preventiva: { label: 'Manutenção Preventiva', categoria: 'Manutenção' },
};

export interface DocumentoViaturaInput {
  tipo: TipoDocumentoViatura;
  matricula: string;
  marcaModelo?: string;
  /** Data de validade / próxima manutenção, formatada (ex.: "03/08/2026") */
  dataValidadeFmt: string;
  /** Dias até expirar — negativo se já expirou */
  diasRestantes: number;
  destinatarioNome?: string;
  empresaNome?: string;
  motoristaNome?: string;
  condutorNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
  /** Só para manutenção preventiva: km previstos para a intervenção */
  kmPrevistos?: number;
}

export function documentoViaturaTemplate(input: DocumentoViaturaInput): { subject: string; html: string } {
  const {
    tipo,
    matricula,
    marcaModelo,
    dataValidadeFmt,
    diasRestantes,
    destinatarioNome,
    empresaNome,
    motoristaNome,
    condutorNome,
    emissorNome,
    emissorLogoUrl,
    ctaUrl,
    kmPrevistos,
  } = input;

  const { label, categoria } = TIPO_CONFIG[tipo];
  const isExpirado = diasRestantes < 0;
  const isUrgente = !isExpirado && diasRestantes <= 7;
  const severidade = isExpirado ? 'critico' : isUrgente ? 'aviso' : 'info';

  const estadoTexto = isExpirado
    ? `Expirado há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) === 1 ? '' : 's'}`
    : `Expira em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`;
  const estadoCor = isExpirado ? '#dc2626' : isUrgente ? '#d97706' : '#17BF7E';

  const titulo = isExpirado ? `${label} Expirado` : `${label} a Expirar`;
  const veiculo = [matricula, marcaModelo].filter(Boolean).join(' — ');

  const corpo = `
      <p style="margin:0 0 8px"><strong>Viatura:</strong> ${veiculo}</p>
      <p style="margin:0 0 8px"><strong>${tipo === 'manutencao_preventiva' ? 'Data prevista' : 'Validade'}:</strong> ${dataValidadeFmt}</p>
      ${kmPrevistos ? `<p style="margin:0 0 8px"><strong>Km previstos:</strong> ${kmPrevistos.toLocaleString('pt-PT')} km</p>` : ''}
      <p style="margin:0"><strong>Estado:</strong> <span style="color:${estadoCor};font-weight:700">${estadoTexto}</span></p>
    `;

  const html = notificacaoTemplate({
    titulo,
    categoria,
    severidade,
    destinatarioNome,
    introducao: `Foi identificada uma pendência de ${label.toLowerCase()} associada a esta viatura.`,
    empresaNome,
    motoristaNome,
    condutorNome,
    corpo,
    ctaLabel: ctaUrl ? 'Ver na Plataforma' : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  const emoji = isExpirado ? '🔴' : isUrgente ? '⚠️' : '📋';
  const subject = `${emoji} ${label} ${isExpirado ? 'expirado' : 'a expirar'} — ${matricula}`;

  return { subject, html };
}
