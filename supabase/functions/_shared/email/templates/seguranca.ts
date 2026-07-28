// Deteção de tentativa de login suspeita. Email de segurança de conta —
// NUNCA white-label (tem de parecer inequivocamente vindo da própria
// plataforma para o utilizador confiar nele, não da empresa cliente).
import { notificacaoTemplate } from './notificacao.ts';

export interface LoginSuspeitoInput {
  destinatarioNome?: string;
  dataHoraFmt: string;
  ip?: string;
  localizacaoAprox?: string;
  dispositivo?: string;
  ctaUrl?: string;
}

export function loginSuspeitoTemplate(input: LoginSuspeitoInput): { subject: string; html: string } {
  const { destinatarioNome, dataHoraFmt, ip, localizacaoAprox, dispositivo, ctaUrl } = input;

  const corpo = `
      <p style="margin:0 0 8px"><strong>Data e hora:</strong> ${dataHoraFmt}</p>
      ${ip ? `<p style="margin:0 0 8px"><strong>Endereço IP:</strong> ${ip}</p>` : ''}
      ${localizacaoAprox ? `<p style="margin:0 0 8px"><strong>Localização aproximada:</strong> ${localizacaoAprox}</p>` : ''}
      ${dispositivo ? `<p style="margin:0 0 8px"><strong>Dispositivo:</strong> ${dispositivo}</p>` : ''}
      <p style="margin:12px 0 0;color:#374151">Se foi você, pode ignorar este email. Se não reconhece esta atividade, altere a sua palavra-passe imediatamente.</p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Tentativa de Login Suspeita',
    categoria: 'Segurança',
    severidade: 'critico',
    destinatarioNome,
    introducao: 'Detetámos uma tentativa de acesso à sua conta com características fora do habitual.',
    corpo,
    ctaLabel: ctaUrl ? 'Rever Segurança da Conta' : undefined,
    ctaUrl,
    rodape: 'Email de segurança gerado automaticamente pela WeGest. Não responda a esta mensagem.',
  });

  return { subject: '🔒 Tentativa de login suspeita na sua conta', html };
}
