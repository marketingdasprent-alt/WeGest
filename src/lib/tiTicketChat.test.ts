import { describe, it, expect } from 'vitest';
import {
  agruparAnexos,
  aguardaSuporte,
  contarPorSeparador,
  filtrarTickets,
  iniciais,
  rotuloDia,
  ultimaActividade,
} from './tiTicketChat';
import type { EstadoTicket } from './tiTicketEstados';

function ticket(
  numero: number,
  status: EstadoTicket,
  mensagens: { autor_tipo: 'suporte' | 'autor'; created_at: string; texto?: string }[] = [],
  extra: Partial<{ autor_nome: string; descricao: string; empresa: string }> = {}
) {
  return {
    numero,
    autor_nome: extra.autor_nome ?? `Pessoa ${numero}`,
    descricao: extra.descricao ?? `Problema ${numero}`,
    status,
    created_at: `2026-10-0${numero}T09:00:00Z`,
    organizacao: { nome: extra.empresa ?? 'Década' },
    mensagens: mensagens.map((m) => ({ texto: '', ...m })),
  };
}

describe('aguardaSuporte', () => {
  it('pedido sem resposta está à espera do suporte', () => {
    expect(aguardaSuporte(ticket(1, 'aberto'))).toBe(true);
  });

  it('a última palavra decide de quem é a vez, seja qual for a ordem da lista', () => {
    const t = ticket(1, 'aberto', [
      { autor_tipo: 'autor', created_at: '2026-10-01T12:00:00Z' },
      { autor_tipo: 'suporte', created_at: '2026-10-01T10:00:00Z' },
    ]);
    expect(aguardaSuporte(t)).toBe(true);
    expect(
      aguardaSuporte(
        ticket(1, 'aberto', [{ autor_tipo: 'suporte', created_at: '2026-10-01T10:00:00Z' }])
      )
    ).toBe(false);
  });

  it('resolvido nunca está por responder', () => {
    expect(aguardaSuporte(ticket(1, 'resolvido'))).toBe(false);
  });
});

describe('ultimaActividade', () => {
  it('sem mensagens é a própria descrição', () => {
    expect(ultimaActividade(ticket(1, 'aberto'))).toEqual({
      em: '2026-10-01T09:00:00Z',
      texto: 'Problema 1',
    });
  });

  it('mensagem só com anexo aparece como "Anexo"', () => {
    const t = ticket(1, 'aberto', [{ autor_tipo: 'autor', created_at: '2026-10-02T09:00:00Z' }]);
    expect(ultimaActividade(t).texto).toBe('Anexo');
  });
});

describe('filtrarTickets', () => {
  const lista = [
    ticket(1, 'aberto', [], { empresa: 'Década', autor_nome: 'Franciele Silva' }),
    ticket(2, 'resolvido', [], { empresa: 'Premium' }),
    ticket(
      3,
      'presencial',
      [{ autor_tipo: 'suporte', created_at: '2026-10-05T09:00:00Z', texto: 'Vou aí amanhã' }],
      {
        empresa: 'Premium',
      }
    ),
  ];
  const base = { separador: 'todos' as const, empresa: null, pesquisa: '' };

  it('separadores', () => {
    expect(filtrarTickets(lista, { ...base, separador: 'abertos' }).map((t) => t.numero)).toEqual([
      3, 1,
    ]);
    expect(
      filtrarTickets(lista, { ...base, separador: 'resolvidos' }).map((t) => t.numero)
    ).toEqual([2]);
    expect(
      filtrarTickets(lista, { ...base, separador: 'por_responder' }).map((t) => t.numero)
    ).toEqual([1]);
  });

  it('ordena pela última actividade, mais recente primeiro', () => {
    expect(filtrarTickets(lista, base).map((t) => t.numero)).toEqual([3, 2, 1]);
  });

  it('filtra por empresa e pesquisa em número, nome, descrição e mensagens', () => {
    expect(filtrarTickets(lista, { ...base, empresa: 'Premium' }).map((t) => t.numero)).toEqual([
      3, 2,
    ]);
    expect(filtrarTickets(lista, { ...base, pesquisa: 'franciele' }).map((t) => t.numero)).toEqual([
      1,
    ]);
    expect(filtrarTickets(lista, { ...base, pesquisa: 'amanhã' }).map((t) => t.numero)).toEqual([
      3,
    ]);
    expect(filtrarTickets(lista, { ...base, pesquisa: '2' }).map((t) => t.numero)).toEqual([2]);
  });

  it('conta por separador', () => {
    expect(contarPorSeparador(lista)).toEqual({
      abertos: 2,
      por_responder: 1,
      resolvidos: 1,
      todos: 3,
    });
  });
});

describe('agruparAnexos', () => {
  it('separa os da submissão dos de cada mensagem', () => {
    const { iniciais: ini, porMensagem } = agruparAnexos([
      { id: 'a', mensagem_id: null },
      { id: 'b', mensagem_id: 'm1' },
      { id: 'c', mensagem_id: 'm1' },
    ]);
    expect(ini.map((a) => a.id)).toEqual(['a']);
    expect(porMensagem.get('m1')?.map((a) => a.id)).toEqual(['b', 'c']);
  });
});

describe('iniciais e rotuloDia', () => {
  it('iniciais do primeiro e último nome', () => {
    expect(iniciais('Franciele Silva')).toBe('FS');
    expect(iniciais('  ana  ')).toBe('A');
    expect(iniciais('')).toBe('?');
  });

  it('hoje, ontem, ou a data', () => {
    const agora = new Date('2026-10-26T15:00:00');
    expect(rotuloDia('2026-10-26T08:00:00', agora)).toBe('Hoje');
    expect(rotuloDia('2026-10-25T23:00:00', agora)).toBe('Ontem');
    expect(rotuloDia('2026-10-21T11:41:00', agora)).toMatch(/^21 out\.? 2026$/);
  });
});
