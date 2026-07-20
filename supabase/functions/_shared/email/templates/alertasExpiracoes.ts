// deno-lint-ignore-file no-explicit-any
export interface AlertasExpiracoesInput {
  orgNome: string;
  today: Date;
  extintores: any[];
  contratos: any[];
  recipientName?: string;
}

function diffDays(dateStr: string, today: Date): number {
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

function buildExtRows(list: any[], today: Date): string {
  return list
    .map((e) => {
      const diff = diffDays(e.extintor_validade, today);
      const isExpired = diff < 0;
      const color = isExpired ? '#dc2626' : '#ea580c';
      const status = isExpired ? `Expirado há ${Math.abs(diff)} dias` : `Expira em ${diff} dias`;
      return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${e.motoristas?.nome || '-'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${e.viaturas?.matricula || '-'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${e.extintor_numero || '-'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${new Date(e.extintor_validade).toLocaleDateString('pt-PT')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${color};font-weight:600">${status}</td>
        </tr>`;
    })
    .join('');
}

function buildCtRows(list: any[], today: Date): string {
  return list
    .map((c) => {
      const expiry = new Date(c.contrato_prestacao_assinatura);
      expiry.setFullYear(expiry.getFullYear() + 1);
      const diff = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
      const isExpired = diff < 0;
      const color = isExpired ? '#dc2626' : '#2563eb';
      const status = isExpired ? `Expirado há ${Math.abs(diff)} dias` : `Expira em ${diff} dias`;
      return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${c.motoristas?.nome || '-'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${c.viaturas?.matricula || '-'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${new Date(c.contrato_prestacao_assinatura).toLocaleDateString('pt-PT')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${expiry.toLocaleDateString('pt-PT')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:${color};font-weight:600">${status}</td>
        </tr>`;
    })
    .join('');
}

export function alertasExpiracoesTemplate(input: AlertasExpiracoesInput): {
  subject: string;
  html: string;
} {
  const { orgNome, today, extintores, contratos, recipientName } = input;
  const greeting = recipientName ? `Olá, <strong>${recipientName}</strong>!` : 'Olá!';
  const dateStr = today.toLocaleDateString('pt-PT');

  const extSection =
    extintores.length > 0
      ? `
        <div style="background:white;padding:24px;border-radius:12px;margin-bottom:20px">
          <h2 style="color:#ea580c;margin-top:0;font-size:16px">🔥 Extintores a Expirar (${extintores.length})</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#fef3c7">
                <th style="text-align:left;padding:8px 12px;color:#92400e">Motorista</th>
                <th style="text-align:left;padding:8px 12px;color:#92400e">Viatura</th>
                <th style="text-align:left;padding:8px 12px;color:#92400e">Nº Extintor</th>
                <th style="text-align:left;padding:8px 12px;color:#92400e">Validade</th>
                <th style="text-align:left;padding:8px 12px;color:#92400e">Estado</th>
              </tr>
            </thead>
            <tbody>${buildExtRows(extintores, today)}</tbody>
          </table>
        </div>`
      : '';

  const ctSection =
    contratos.length > 0
      ? `
        <div style="background:white;padding:24px;border-radius:12px;margin-bottom:20px">
          <h2 style="color:#2563eb;margin-top:0;font-size:16px">📋 Contratos de Prestação a Expirar (${contratos.length})</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#dbeafe">
                <th style="text-align:left;padding:8px 12px;color:#1e40af">Motorista</th>
                <th style="text-align:left;padding:8px 12px;color:#1e40af">Viatura</th>
                <th style="text-align:left;padding:8px 12px;color:#1e40af">Data Assinatura</th>
                <th style="text-align:left;padding:8px 12px;color:#1e40af">Data Expiração</th>
                <th style="text-align:left;padding:8px 12px;color:#1e40af">Estado</th>
              </tr>
            </thead>
            <tbody>${buildCtRows(contratos, today)}</tbody>
          </table>
        </div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%);padding:28px;border-radius:12px;text-align:center;margin-bottom:24px">
    <h1 style="color:white;margin:0;font-size:22px">⚠️ Alertas de Renovação</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">${orgNome} — ${dateStr}</p>
  </div>
  <div style="background:white;padding:24px;border-radius:12px;margin-bottom:20px">
    <p style="margin-top:0">${greeting}</p>
    <p style="margin-bottom:0">Relatório automático de contratos e extintores com renovação pendente nos próximos <strong>15 dias</strong>.</p>
  </div>
  ${extSection}
  ${ctSection}
  <div style="text-align:center;color:#888;font-size:12px;padding:16px">
    <p>Email automático — ${orgNome} CRM. Não responda a esta mensagem.</p>
  </div>
</body>
</html>`;

  return { subject: `⚠️ Alertas de Renovação — ${dateStr}`, html };
}
