import { emailLayout } from './layout.ts';

const TIPO_LABELS: Record<string, string> = {
  entrega: 'Entrega',
  recolha: 'Recolha',
  devolucao: 'Devolucao',
  troca: 'Troca',
  upgrade: 'Upgrade',
};

export function formatMatricula(val: string): string {
  const clean = val.replace(/[-\s]/g, '').toUpperCase();
  return clean.match(/.{1,2}/g)?.join('-') || clean;
}

export interface CalendarNotificationInput {
  matricula: string;
  cidade?: string | null;
  tipo: string;
  dataInicio: string;
  diaTodo?: boolean;
}

export function calendarNotificationTemplate(input: CalendarNotificationInput): {
  subject: string;
  html: string;
} {
  const dataEvento = new Date(input.dataInicio);
  const dataFormatada = dataEvento.toLocaleDateString('pt-PT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const horaFormatada = input.diaTodo
    ? 'Dia inteiro'
    : dataEvento.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const matriculaFormatada = formatMatricula(input.matricula);
  const cidadeFormatada = input.cidade ? input.cidade.toUpperCase() : '';
  const tipoLabel = TIPO_LABELS[input.tipo] || input.tipo;
  const titulo = `${matriculaFormatada}${cidadeFormatada ? ' - ' + cidadeFormatada : ''}`;

  const subject = `Novo evento: ${tipoLabel} - ${matriculaFormatada}${cidadeFormatada ? ' ' + cidadeFormatada : ''}`;

  const html = emailLayout({
    titulo: 'Novo Evento no Calendário',
    corpo: `
      <h2 style="margin-top: 0;">${titulo}</h2>
      <p><strong>Tipo:</strong> ${tipoLabel}</p>
      <p><strong>Data:</strong> ${dataFormatada}</p>
      <p><strong>Hora:</strong> ${horaFormatada}</p>
    `,
  });

  return { subject, html };
}
