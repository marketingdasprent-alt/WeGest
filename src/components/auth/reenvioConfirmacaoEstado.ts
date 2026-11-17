import { errorMessage } from '@/utils/errorMessage';

// O Supabase só deixa pedir outro email de confirmação de 60 em 60 segundos.
export const ESPERA_REENVIO_SEGUNDOS = 60;

// Hora (em ms) em que acaba a espera de cada email e se o link já foi enviado.
// Vive fora do componente: este desmonta e volta a montar quando o motorista
// tenta entrar outra vez ou muda de página, e a contagem não pode reiniciar.
const esperaAte = new Map<string, number>();
const jaEnviados = new Set<string>();

export const chaveDoEmail = (email: string) => email.trim().toLowerCase();

export const segundosDeEspera = (chave: string, agora: number): number =>
  Math.max(0, Math.ceil(((esperaAte.get(chave) ?? 0) - agora) / 1000));

export const foiEnviado = (chave: string): boolean => jaEnviados.has(chave);

export const marcarEnviado = (chave: string, agora: number) => {
  jaEnviados.add(chave);
  esperaAte.set(chave, agora + ESPERA_REENVIO_SEGUNDOS * 1000);
};

export const marcarEspera = (chave: string, segundos: number, agora: number) => {
  esperaAte.set(chave, agora + segundos * 1000);
};

/** Só para testes: apaga o que o componente lembra entre montagens. */
export const limparEsperasReenvio = () => {
  esperaAte.clear();
  jaEnviados.clear();
};

// O Supabase diz "you can only request this after 52 seconds": usa o número
// dele, em vez de supor 60.
export const segundosDoLimite = (error: unknown): number | null => {
  const m = /after (\d+) seconds?/i.exec(errorMessage(error, ''));
  return m ? Number(m[1]) : null;
};
