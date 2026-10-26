import { format, isSameDay, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { EstadoTicket } from '@/lib/tiTicketEstados';

/** Igual ao limite de `_shared/ti-tickets/mensagem.ts`. Aqui evita o erro; lá é que manda. */
export const TI_MENSAGEM_MAX_CARACTERES = 2000;

export type LadoConversa = 'suporte' | 'autor';

export interface TiMensagem {
  id: string;
  autor_tipo: LadoConversa;
  criado_por_nome: string;
  texto: string;
  created_at: string;
}

/** Anexo pronto a mostrar: `url` assinada, ou nula enquanto não há (ou se falhou). */
export interface TiAnexoVisivel {
  id: string;
  /** Nulo = anexado na submissão do pedido. */
  mensagem_id: string | null;
  nome: string;
  mime_type: string | null;
  url: string | null;
}

export type SeparadorCaixa = 'abertos' | 'por_responder' | 'resolvidos' | 'todos';

interface TicketResumo {
  numero: number;
  autor_nome: string;
  descricao: string;
  status: EstadoTicket;
  created_at: string;
  organizacao: { nome: string } | null;
  mensagens: Pick<TiMensagem, 'autor_tipo' | 'created_at' | 'texto'>[];
}

function ultimaMensagem<T extends TicketResumo>(t: T) {
  return t.mensagens.reduce<T['mensagens'][number] | null>(
    (ultima, m) => (!ultima || m.created_at > ultima.created_at ? m : ultima),
    null
  );
}

/**
 * A vez é do suporte: o pedido está por resolver e a última palavra foi de quem
 * pediu (ou ninguém respondeu ainda). É o que a caixa de entrada destaca.
 */
export function aguardaSuporte(t: TicketResumo): boolean {
  if (t.status === 'resolvido') return false;
  return (ultimaMensagem(t)?.autor_tipo ?? 'autor') === 'autor';
}

/** Última coisa que aconteceu na conversa, para ordenar e para a pré-visualização. */
export function ultimaActividade(t: TicketResumo): { em: string; texto: string } {
  const ultima = ultimaMensagem(t);
  if (!ultima) return { em: t.created_at, texto: t.descricao };
  return { em: ultima.created_at, texto: ultima.texto || 'Anexo' };
}

export interface FiltrosCaixa {
  separador: SeparadorCaixa;
  /** `null` = todas as empresas. */
  empresa: string | null;
  pesquisa: string;
}

export function filtrarTickets<T extends TicketResumo>(tickets: T[], f: FiltrosCaixa): T[] {
  const termo = f.pesquisa.trim().toLowerCase();
  return tickets
    .filter((t) => {
      if (f.separador === 'abertos' && t.status === 'resolvido') return false;
      if (f.separador === 'resolvidos' && t.status !== 'resolvido') return false;
      if (f.separador === 'por_responder' && !aguardaSuporte(t)) return false;
      if (f.empresa && t.organizacao?.nome !== f.empresa) return false;
      if (!termo) return true;
      // Número, nome de quem pediu, ou texto — o que quem procura costuma ter à mão.
      return (
        String(t.numero).includes(termo) ||
        t.autor_nome.toLowerCase().includes(termo) ||
        t.descricao.toLowerCase().includes(termo) ||
        t.mensagens.some((m) => m.texto.toLowerCase().includes(termo))
      );
    })
    .sort((a, b) => ultimaActividade(b).em.localeCompare(ultimaActividade(a).em));
}

export function contarPorSeparador(tickets: TicketResumo[]): Record<SeparadorCaixa, number> {
  return {
    abertos: tickets.filter((t) => t.status !== 'resolvido').length,
    por_responder: tickets.filter(aguardaSuporte).length,
    resolvidos: tickets.filter((t) => t.status === 'resolvido').length,
    todos: tickets.length,
  };
}

/** Separa os anexos da submissão dos de cada mensagem. */
export function agruparAnexos<A extends { mensagem_id: string | null }>(
  anexos: A[]
): { iniciais: A[]; porMensagem: Map<string, A[]> } {
  const iniciais: A[] = [];
  const porMensagem = new Map<string, A[]>();
  for (const a of anexos) {
    if (!a.mensagem_id) {
      iniciais.push(a);
      continue;
    }
    porMensagem.set(a.mensagem_id, [...(porMensagem.get(a.mensagem_id) ?? []), a]);
  }
  return { iniciais, porMensagem };
}

export function ehImagem(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

/** Iniciais para o avatar: "Franciele Silva" → "FS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/** Separador de dia na conversa: "Hoje", "Ontem" ou "21 out 2026". */
export function rotuloDia(iso: string, agora: Date = new Date()): string {
  const dia = new Date(iso);
  if (isSameDay(dia, agora)) return 'Hoje';
  if (isSameDay(dia, subDays(agora, 1))) return 'Ontem';
  return format(dia, 'd MMM yyyy', { locale: pt });
}
