import { describe, it, expect, vi } from 'vitest';
import type { supabase } from '@/integrations/supabase/client';
import {
  ESTADOS_QUE_ENTRAM_EM_MANUTENCAO,
  gravarFechoTicket,
  marcarViaturaEmManutencao,
  type FechoTicketParams,
} from './ticketEstadoViatura';

type Db = typeof supabase;

interface Chamada {
  tabela: string;
  op: string;
  payload?: unknown;
  filtros: unknown[][];
}

/** Cliente falso que regista cada query pela ordem em que foi feita. */
function criarDb(opts: { assocExistente?: boolean; falhaEm?: string } = {}) {
  const chamadas: Chamada[] = [];
  const from = vi.fn((tabela: string) => {
    const reg: Chamada = { tabela, op: '', filtros: [] };
    chamadas.push(reg);
    const b: Record<string, unknown> = {};
    const filtro =
      (nome: string) =>
      (...args: unknown[]) => {
        reg.filtros.push([nome, ...args]);
        return b;
      };
    b.select = (cols: unknown) => {
      reg.op = 'select';
      reg.payload = cols;
      return b;
    };
    b.insert = (p: unknown) => {
      reg.op = 'insert';
      reg.payload = p;
      return b;
    };
    b.update = (p: unknown) => {
      reg.op = 'update';
      reg.payload = p;
      return b;
    };
    b.eq = filtro('eq');
    b.is = filtro('is');
    b.in = filtro('in');
    b.maybeSingle = () =>
      Promise.resolve({ data: opts.assocExistente ? { id: 'mv1' } : null, error: null });
    // 0 linhas afectadas: PostgREST devolve [] sem erro.
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({
        data: [],
        error: opts.falhaEm === `${tabela}:${reg.op}` ? { message: `falhou ${tabela}` } : null,
      }).then(res, rej);
    return b;
  });
  return { db: { from } as unknown as Db, chamadas };
}

const passos = (chamadas: Chamada[]) => chamadas.map((c) => `${c.tabela}:${c.op}`);

describe('marcarViaturaEmManutencao', () => {
  it('só mexe em disponivel/em_uso/reservada — o mesmo guard da trigger', async () => {
    const { db, chamadas } = criarDb();
    await marcarViaturaEmManutencao(db, 'v1');

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].payload).toEqual({ status: 'manutencao' });
    expect(chamadas[0].filtros).toEqual([
      ['eq', 'id', 'v1'],
      ['in', 'status', ['disponivel', 'em_uso', 'reservada']],
    ]);
    expect(ESTADOS_QUE_ENTRAM_EM_MANUTENCAO).not.toContain('inativo');
  });

  it('0 linhas afectadas (viatura inativa) não é erro; erro do Postgres propaga', async () => {
    await expect(marcarViaturaEmManutencao(criarDb().db, 'v1')).resolves.toBeUndefined();
    await expect(
      marcarViaturaEmManutencao(criarDb({ falhaEm: 'viaturas:update' }).db, 'v1')
    ).rejects.toEqual({ message: 'falhou viaturas' });
  });
});

describe('gravarFechoTicket — ordem das escritas', () => {
  const base: FechoTicketParams = {
    ticketId: 't1',
    ticketUpdates: { km_fim: 123, combustivel_fim: 'meio' },
    viaturaId: 'v1',
    motoristaId: 'm1',
    kmFim: 123,
    viaturaSubstitutaId: null,
    substDecisao: null,
    hoje: '2026-10-21',
  };

  it('associação ao motorista é reposta ANTES de resolver o ticket (a trigger lê-a)', async () => {
    const { db, chamadas } = criarDb();
    await gravarFechoTicket(db, base);

    expect(passos(chamadas)).toEqual([
      'viaturas:update',
      'motorista_viaturas:select',
      'motorista_viaturas:insert',
      'assistencia_tickets:update',
    ]);
    expect(chamadas[2].payload).toEqual({
      motorista_id: 'm1',
      viatura_id: 'v1',
      data_inicio: '2026-10-21',
      status: 'ativo',
      tipo: 'normal',
    });
    const ticket = chamadas[3];
    expect(ticket.payload).toMatchObject({ km_fim: 123, status: 'resolvido' });
    expect((ticket.payload as { data_resolucao?: string }).data_resolucao).toBeTruthy();
    expect(ticket.filtros).toEqual([['eq', 'id', 't1']]);
  });

  it('nunca escreve o estado da viatura original: só o km, e só quando há leitura', async () => {
    const comKm = criarDb();
    await gravarFechoTicket(comKm.db, base);
    const escritasOriginal = comKm.chamadas.filter(
      (c) => c.tabela === 'viaturas' && c.filtros.some((f) => f[0] === 'eq' && f[2] === 'v1')
    );
    expect(escritasOriginal).toHaveLength(1);
    expect(escritasOriginal[0].payload).toEqual({ km_atual: 123 });

    const semKm = criarDb();
    await gravarFechoTicket(semKm.db, { ...base, kmFim: null });
    expect(passos(semKm.chamadas)).not.toContain('viaturas:update');
  });

  it('com a associação ainda activa não a duplica', async () => {
    const { db, chamadas } = criarDb({ assocExistente: true });
    await gravarFechoTicket(db, base);
    expect(passos(chamadas)).toEqual([
      'viaturas:update',
      'motorista_viaturas:select',
      'assistencia_tickets:update',
    ]);
  });

  it('sem motorista não toca em motorista_viaturas', async () => {
    const { db, chamadas } = criarDb();
    await gravarFechoTicket(db, { ...base, motoristaId: null, viaturaSubstitutaId: 's1' });
    expect(passos(chamadas)).toEqual(['viaturas:update', 'assistencia_tickets:update']);
  });

  it('devolver a substituta: encerra a associação e liberta-a antes de resolver', async () => {
    const { db, chamadas } = criarDb({ assocExistente: true });
    await gravarFechoTicket(db, { ...base, viaturaSubstitutaId: 's1', substDecisao: 'devolver' });

    expect(passos(chamadas)).toEqual([
      'viaturas:update',
      'motorista_viaturas:select',
      'motorista_viaturas:update',
      'viaturas:update',
      'assistencia_tickets:update',
    ]);
    expect(chamadas[2].payload).toEqual({ data_fim: '2026-10-21', status: 'encerrado' });
    expect(chamadas[2].filtros).toEqual([
      ['eq', 'viatura_id', 's1'],
      ['eq', 'motorista_id', 'm1'],
      ['eq', 'tipo', 'substituta'],
      ['is', 'data_fim', null],
    ]);
    expect(chamadas[3].payload).toEqual({ status: 'disponivel' });
    expect(chamadas[3].filtros).toEqual([['eq', 'id', 's1']]);
  });

  it('ficar com a substituta: passa a normal, sem mexer no estado dela', async () => {
    const { db, chamadas } = criarDb({ assocExistente: true });
    await gravarFechoTicket(db, {
      ...base,
      viaturaSubstitutaId: 's1',
      substDecisao: 'definitivo',
    });

    expect(passos(chamadas)).toEqual([
      'viaturas:update',
      'motorista_viaturas:select',
      'motorista_viaturas:update',
      'assistencia_tickets:update',
    ]);
    expect(chamadas[2].payload).toEqual({ tipo: 'normal' });
  });

  it('se a associação falhar, o ticket fica por resolver (nada é meio gravado)', async () => {
    const { db, chamadas } = criarDb({ falhaEm: 'motorista_viaturas:insert' });
    await expect(gravarFechoTicket(db, base)).rejects.toEqual({
      message: 'falhou motorista_viaturas',
    });
    expect(passos(chamadas)).not.toContain('assistencia_tickets:update');
  });
});
