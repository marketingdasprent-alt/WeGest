import { format } from 'date-fns';

export type CanalEnvio = 'whatsapp' | 'email' | 'app';

export const NOMES_CANAL: Record<CanalEnvio, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  app: 'Perfil App',
};

/** Número só com dígitos para o wa.me; sem indicativo assume Portugal. Null se não servir. */
export function telefoneParaWhatsApp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  let digitos = telefone.replace(/[^\d+]/g, '');
  if (digitos.startsWith('+')) digitos = digitos.slice(1);
  else if (digitos.startsWith('00')) digitos = digitos.slice(2);
  else if (/^[29]\d{8}$/.test(digitos)) digitos = `351${digitos}`;
  return /^\d{9,15}$/.test(digitos) ? digitos : null;
}

interface DadosMensagemEnvio {
  nome: string;
  inicio: Date;
  fim: Date;
  liquido: number;
  fmt: (valor: number) => string;
}

export function montarMensagemEnvio({
  nome,
  inicio,
  fim,
  liquido,
  fmt,
}: DadosMensagemEnvio): string {
  return (
    `Olá ${nome},\n\n` +
    `O seu resumo de ${format(inicio, 'dd/MM/yyyy')} a ${format(fim, 'dd/MM/yyyy')} já está disponível na app WeGest.\n\n` +
    `Líquido da semana: ${fmt(liquido)}\n\n` +
    'Se tiver alguma dúvida, por favor contacte-nos.'
  );
}

export function linkWhatsAppPara(telefone: string, texto: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
}

export function emailValido(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
