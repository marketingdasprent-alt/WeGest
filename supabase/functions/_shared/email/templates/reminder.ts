const TIPO_LABELS: Record<string, string> = {
  entrega: 'Entrega',
  recolha: 'Recolha',
  devolucao: 'Devolução',
};

function fmtMatricula(val: string): string {
  const clean = val.replace(/[-\s]/g, '').toUpperCase();
  return clean.match(/.{1,2}/g)?.join('-') || clean;
}

export interface ReminderInput {
  titulo: string;
  tipo: string;
  cidade?: string | null;
  dataInicio: string;
  diaTodo?: boolean;
  variant: 'vespera' | 'dia';
}

export function reminderTemplate(input: ReminderInput): { subject: string; html: string } {
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

  const isVespera = input.variant === 'vespera';
  const matriculaFmt = fmtMatricula(input.titulo);
  const cidadeFmt = input.cidade ? input.cidade.toUpperCase() : '';
  const tipoLabel = TIPO_LABELS[input.tipo] || input.tipo;
  const displayTitle = `${matriculaFmt}${cidadeFmt ? ' ' + cidadeFmt : ''}`;

  const subject = isVespera
    ? `📅 Amanhã: ${tipoLabel} - ${displayTitle}`
    : `📅 Hoje: ${tipoLabel} - ${displayTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; padding: 24px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">
          ${isVespera ? '🔔 Lembrete - Amanhã' : '🔔 Lembrete - Hoje'}
        </h1>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px;">
        <h2 style="margin-top: 0;">${displayTitle}</h2>
        <p><strong>Tipo:</strong> ${tipoLabel}</p>
        <p><strong>Data:</strong> ${dataFormatada}</p>
        <p><strong>Hora:</strong> ${horaFormatada}</p>
      </div>
      <p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">
        © ${new Date().getFullYear()} Década Ousada. Email automático.
      </p>
    </body>
    </html>
  `;

  return { subject, html };
}
