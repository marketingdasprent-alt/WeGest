// Modelo base para emails de notificação da WeGest — construído à volta das
// cores reais do logótipo (navy #1B3A66 / verde #17BF7E), não de uma cor
// genérica escolhida à parte. O logo (public/Logo.png) tem fundo branco, por
// isso o cabeçalho do email é claro, não escuro — um bloco navy por trás do
// logo tapava-o.
//
// Quando `emissorNome` é passado (ex.: um contrato de aluguer enviado a um
// condutor), o email passa a identidade principal para a EMPRESA CLIENTE —
// o cabeçalho mostra o logo/nome dela em vez do logo da WeGest, e a WeGest
// desce para o rodapé como a plataforma licenciada. Sem `emissorNome`
// (emails internos/administrativos da própria WeGest), o cabeçalho mantém o
// logo da WeGest como está hoje.
//
// Os campos destinatarioNome/empresaNome/motoristaNome/condutorNome são
// todos opcionais: só aparecem no painel de contexto quando fornecidos — usa
// consoante a notificação precisar (ex.: um alerta sem condutor associado
// simplesmente não mostra essa linha).
export interface NotificacaoTemplateInput {
  /** Título principal da notificação, ex.: "Documento a Expirar" */
  titulo: string;
  /** Rótulo pequeno no canto superior direito do cabeçalho, ex.: "Alerta" */
  categoria?: string;
  /** Nome de quem recebe o email — nem sempre é o gestor */
  destinatarioNome?: string;
  /** Primeira linha de texto a seguir à saudação (contexto rápido) */
  introducao?: string;
  empresaNome?: string;
  motoristaNome?: string;
  condutorNome?: string;
  /** Corpo HTML principal da notificação (parágrafos, listas, tabelas…) */
  corpo: string;
  /** Botão de ação opcional */
  ctaLabel?: string;
  ctaUrl?: string;
  rodape?: string;
  /**
   * Empresa cliente que está a enviar este email (org.nome). Quando
   * definido, o cabeçalho passa a mostrar esta empresa em vez do logo da
   * WeGest, e o rodapé passa a referenciar "plataforma WeGest licenciada a
   * {emissorNome}".
   */
  emissorNome?: string;
  /** Logo da empresa cliente (org.logo_url). Sem isto, usa-se o nome em texto. */
  emissorLogoUrl?: string | null;
  /**
   * Tom da notificação — muda a faixa de topo, a etiqueta de categoria, o
   * painel de contexto e o botão de ação. 'info' (verde, omissão) para
   * factos neutros/positivos (contrato criado, lembrete); 'aviso' (âmbar)
   * para algo a precisar de atenção em breve (documento a expirar,
   * reparação parada há muito tempo); 'critico' (vermelho) para algo já
   * fora do prazo ou sensível (documento expirado, cobrança em atraso,
   * login suspeito).
   */
  severidade?: 'info' | 'aviso' | 'critico';
}

const LOGO_URL = 'https://wegest.pt/Logo.png';
const COR_NAVY = '#1B3A66';
const COR_MUTED = '#67707C';
const COR_LINHA = '#E6E9EE';

const SEVERIDADE_COR: Record<'info' | 'aviso' | 'critico', { accent: string; tint: string }> = {
  info: { accent: '#17BF7E', tint: '#EAFBF3' },
  aviso: { accent: '#F59E0B', tint: '#FEF3E2' },
  critico: { accent: '#DC2626', tint: '#FDEAEA' },
};

function buildInfoField(label: string, valor?: string): string {
  if (!valor) return '';
  return `
          <td style="padding:0 18px 0 0;vertical-align:top">
            <div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COR_MUTED};margin-bottom:2px">${label}</div>
            <div style="font-size:14px;font-weight:600;color:${COR_NAVY}">${valor}</div>
          </td>`;
}

export function notificacaoTemplate(input: NotificacaoTemplateInput): string {
  const {
    titulo,
    categoria,
    destinatarioNome,
    introducao,
    empresaNome,
    motoristaNome,
    condutorNome,
    corpo,
    ctaLabel,
    ctaUrl,
    rodape,
    emissorNome,
    emissorLogoUrl,
    severidade,
  } = input;

  const { accent: COR_ACENTO, tint: COR_ACENTO_TINT } = SEVERIDADE_COR[severidade ?? 'info'];

  const saudacao = destinatarioNome ? `Olá, ${destinatarioNome}.` : 'Olá.';

  const infoFields = [
    buildInfoField('Empresa', empresaNome),
    buildInfoField('Motorista', motoristaNome),
    buildInfoField('Condutor', condutorNome),
  ].join('');

  const infoBlock = infoFields
    ? `
              <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0;background:${COR_ACENTO_TINT};border-left:3px solid ${COR_ACENTO};border-radius:6px">
                <tr><td style="padding:14px 16px">
                  <table role="presentation" style="border-collapse:collapse"><tr>${infoFields}</tr></table>
                </td></tr>
              </table>`
    : '';

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
              <table role="presentation" style="margin:28px auto 4px">
                <tr><td style="border-radius:8px;background:${COR_ACENTO}">
                  <a href="${ctaUrl}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">
                    ${ctaLabel}
                  </a>
                </td></tr>
              </table>`
      : '';

  // Cabeçalho: identidade da empresa emissora quando definida, senão a WeGest.
  const headerBrand = emissorNome
    ? emissorLogoUrl
      ? `<img src="${emissorLogoUrl}" alt="${emissorNome}" height="72" style="height:72px;max-width:320px;width:auto;display:block" />`
      : `<span style="font-size:25px;font-weight:800;color:${COR_NAVY};letter-spacing:-0.01em">${emissorNome}</span>`
    : `<img src="${LOGO_URL}" alt="WeGest" height="60" style="height:60px;width:auto;display:block" />`;

  // Rodapé: quando há empresa emissora, a WeGest passa a nota de rodapé
  // ("plataforma licenciada a X"); sem emissor, mantém-se o rodapé da WeGest.
  const rodapeBlock = emissorNome
    ? `
              <table role="presentation" style="margin:0 auto 14px"><tr><td align="center">
                <img src="${LOGO_URL}" alt="WeGest" height="40" style="height:40px;width:auto;display:block;opacity:.85" />
              </td></tr></table>
              <p style="margin:0 0 6px;color:${COR_MUTED};font-size:11.5px;line-height:1.5;text-align:center">
                Plataforma de gestão de frotas licenciada a <strong>${emissorNome}</strong>.
              </p>
              <p style="margin:0;color:${COR_MUTED};font-size:11.5px;line-height:1.5;text-align:center">
                ${rodape ?? 'Não responda a esta mensagem — em caso de dúvida, contacte diretamente a empresa.'}
              </p>`
    : `
              <p style="margin:0;color:${COR_MUTED};font-size:12px;line-height:1.5;text-align:center">
                ${rodape ?? 'Email automático gerado pelo sistema WeGest. Não responda a esta mensagem.'}
              </p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background:#F3F5F8;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1f29">
  <table role="presentation" style="width:100%;background:#F3F5F8;padding:36px 16px">
    <tr>
      <td align="center">
        <table role="presentation" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;border:1px solid ${COR_LINHA};overflow:hidden">

          <!-- Faixa de marca -->
          <tr>
            <td style="height:5px;background:${COR_ACENTO};line-height:0;font-size:0">&nbsp;</td>
          </tr>

          <!-- Cabeçalho: identidade (empresa ou WeGest) + categoria -->
          <tr>
            <td style="padding:26px 32px 20px">
              <table role="presentation" style="width:100%"><tr>
                <td style="vertical-align:middle">
                  ${headerBrand}
                </td>
                <td style="vertical-align:middle;text-align:right">
                  <span style="display:inline-block;background:${COR_ACENTO_TINT};color:${COR_NAVY};font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:999px">
                    ${categoria ?? 'Notificação'}
                  </span>
                </td>
              </tr></table>
            </td>
          </tr>

          <tr><td style="padding:0 32px"><div style="border-top:1px solid ${COR_LINHA}"></div></td></tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:26px 32px 8px">
              <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;font-weight:800;color:${COR_NAVY};letter-spacing:-0.01em">${titulo}</h1>
              <p style="margin:0 0 4px;font-size:14px;color:#1a1f29">${saudacao}</p>
              ${introducao ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.55;color:${COR_MUTED}">${introducao}</p>` : ''}
              ${infoBlock}
              <div style="font-size:14px;line-height:1.65;color:#1a1f29">
                ${corpo}
              </div>
              <table role="presentation" style="width:100%"><tr><td align="center">
                ${ctaBlock}
              </td></tr></table>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:22px 32px;border-top:1px solid ${COR_LINHA}">
              ${rodapeBlock}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
