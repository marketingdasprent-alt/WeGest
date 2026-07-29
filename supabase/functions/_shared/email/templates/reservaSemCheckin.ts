// Aviso ao gestor de que uma reserva passou da hora prevista sem check-in
// registado. Alerta operacional interno, não é white-label.
import { notificacaoTemplate } from './notificacao.ts';

export interface ReservaSemCheckinInput {
  matricula: string;
  marcaModelo?: string;
  motoristaNome?: string;
  dataHoraPrevistaFmt: string;
  destinatarioNome?: string;
  empresaNome?: string;
  ctaUrl?: string;
}

export function reservaSemCheckinTemplate(input: ReservaSemCheckinInput): { subject: string; html: string } {
  const { matricula, marcaModelo, motoristaNome, dataHoraPrevistaFmt, destinatarioNome, empresaNome, ctaUrl } =
    input;
  const veiculo = [matricula, marcaModelo].filter(Boolean).join(' — ');

  const corpo = `
      <p style="margin:0 0 8px"><strong>Viatura:</strong> ${veiculo}</p>
      <p style="margin:0"><strong>Hora prevista de check-in:</strong> ${dataHoraPrevistaFmt}</p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Reserva Sem Check-in',
    categoria: 'Reserva',
    severidade: 'aviso',
    destinatarioNome,
    introducao: 'Esta reserva já deveria ter check-in registado e ainda não tem.',
    empresaNome,
    motoristaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Ver Reserva' : undefined,
    ctaUrl,
  });

  return { subject: `⚠️ Reserva sem check-in — ${matricula}`, html };
}
