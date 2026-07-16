const fmtEur = (v: number | null | undefined): string =>
  v == null ? '' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

export interface ReciboAnuladoInput {
  reciboCodigo: string | number;
  valor?: number | null;
  motivo?: string | null;
  motoristaNome?: string | null;
  gestorNome?: string | null;
}

function wrap(corpo: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background: #111827; padding: 24px; border-radius: 10px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Recibo anulado</h1>
        <p style="color: #cbd5e1; margin: 6px 0 0;">WeGest</p>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px; margin-top: 16px;">
        ${corpo}
      </div>
      <p style="text-align:center;color:#666;font-size:13px;margin-top:16px;">
        Este é um email automático, não responda a esta mensagem.
      </p>
    </div>
  `;
}

export function reciboAnuladoMotoristaTemplate(p: ReciboAnuladoInput): { subject: string; html: string } {
  const valor = fmtEur(p.valor);
  const html = wrap(`
    <p>Olá${p.motoristaNome ? ' ' + p.motoristaNome : ''},</p>
    <p>Informamos que o recibo <strong>nº ${p.reciboCodigo}</strong>${valor ? ` (${valor})` : ''} foi <strong>anulado</strong>.</p>
    ${p.motivo ? `<p style="background:#e9ecef;padding:12px 16px;border-radius:6px;"><strong>Motivo:</strong> ${p.motivo}</p>` : ''}
    <p>Se tiver dúvidas, contacte o seu gestor.</p>
  `);
  return { subject: `Recibo nº ${p.reciboCodigo} anulado`, html };
}

export function reciboAnuladoGestorTemplate(p: ReciboAnuladoInput): { subject: string; html: string } {
  const valor = fmtEur(p.valor);
  const html = wrap(`
    <p>Olá${p.gestorNome ? ' ' + p.gestorNome : ''},</p>
    <p>O recibo <strong>nº ${p.reciboCodigo}</strong>${valor ? ` (${valor})` : ''} do motorista
      <strong>${p.motoristaNome || 'desconhecido'}</strong> foi anulado.</p>
    ${p.motivo ? `<p><strong>Motivo:</strong> ${p.motivo}</p>` : ''}
    <p>O motorista foi notificado por email.</p>
  `);
  return { subject: `Recibo nº ${p.reciboCodigo} anulado`, html };
}
