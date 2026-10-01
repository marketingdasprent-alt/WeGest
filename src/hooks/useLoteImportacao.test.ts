import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { AnaliseImportacao } from '@/hooks/useImportacaoAutomatica';
import type { ContaImportacao } from '@/utils/importacaoAutomatica';

let proximaAnalise: AnaliseImportacao;
vi.mock('@/hooks/useImportacaoAutomatica', () => ({
  chaveDoFicheiro: (f: File) => f.name,
  contasComDadosNaSemana: vi.fn().mockResolvedValue([]),
  useAnalisarFicheiros: () => ({
    mutate: (_f: File[], o: { onSuccess: (a: AnaliseImportacao) => void }) =>
      o.onSuccess(proximaAnalise),
    isPending: false,
    error: null,
  }),
}));

import { useLoteImportacao } from './useLoteImportacao';

const contas: ContaImportacao[] = [
  { id: 'acores', nome: 'Uber Açores', nomeEmpresa: null, plataforma: 'uber' },
  { id: 'urbango', nome: 'Uber Urbango', nomeEmpresa: null, plataforma: 'uber' },
];
const semana = { inicio: '2026-09-21', fim: '2026-09-27' };
const ficheiro = (nome: string) => new File(['x'], nome);
const analisado = (nome: string, contaId: string | null, estado: 'ok' | 'conflito') => ({
  chave: nome,
  ficheiro: ficheiro(nome),
  texto: 'csv',
  plataforma: 'uber' as const,
  periodo: semana,
  identificadores: 18,
  deteccao: { contaId, estado, motivo: estado === 'ok' ? 'Detectada.' : 'Conflito.' },
});

describe('useLoteImportacao', () => {
  beforeEach(() => {
    proximaAnalise = { ficheiros: [], comDados: {} };
  });

  it('conflito: não está pronto até a pessoa escolher a conta', () => {
    proximaAnalise = {
      ficheiros: [analisado('a.csv', null, 'conflito')],
      comDados: { '2026-09-21': ['urbango'] },
    };
    const { result } = renderHook(() => useLoteImportacao(contas));
    act(() => result.current.adicionar([ficheiro('a.csv')]));
    expect(result.current.linhas[0].falta).toBe('Escolha a conta.');
    expect(result.current.pronto).toBe(false);

    act(() => result.current.escolher('a.csv', { contaId: 'urbango' }));
    expect(result.current.linhas[0]).toMatchObject({
      contaId: 'urbango',
      motivo: 'Conta escolhida à mão.',
      substitui: true,
    });
    expect(result.current.pronto).toBe(true);
  });

  it('dois ficheiros para a mesma conta e semana bloqueiam o lote', () => {
    proximaAnalise = {
      ficheiros: [analisado('a.csv', 'urbango', 'ok'), analisado('b.csv', 'urbango', 'ok')],
      comDados: { '2026-09-21': [] },
    };
    const { result } = renderHook(() => useLoteImportacao(contas));
    act(() => result.current.adicionar([ficheiro('a.csv'), ficheiro('b.csv')]));
    expect(result.current.linhas.every((l) => l.repetido)).toBe(true);
    expect(result.current.pronto).toBe(false);
  });

  it('diz que conta ainda falta nessa semana', () => {
    proximaAnalise = {
      ficheiros: [analisado('urbango.csv', 'urbango', 'ok')],
      comDados: { '2026-09-21': [] },
    };
    const { result } = renderHook(() => useLoteImportacao(contas));
    act(() => result.current.adicionar([ficheiro('urbango.csv')]));
    expect(result.current.faltas[0].contas.map((c) => c.nome)).toEqual(['Uber Açores']);
  });

  it('o mesmo ficheiro largado duas vezes conta uma', () => {
    proximaAnalise = { ficheiros: [analisado('a.csv', 'urbango', 'ok')], comDados: {} };
    const { result } = renderHook(() => useLoteImportacao(contas));
    act(() => result.current.adicionar([ficheiro('a.csv')]));
    act(() => result.current.adicionar([ficheiro('a.csv')]));
    expect(result.current.linhas).toHaveLength(1);
  });

  it('os pedidos levam a conta, a semana e o texto de cada ficheiro', () => {
    proximaAnalise = { ficheiros: [analisado('a.csv', 'urbango', 'ok')], comDados: {} };
    const { result } = renderHook(() => useLoteImportacao(contas));
    act(() => result.current.adicionar([ficheiro('a.csv')]));
    expect(result.current.pedidos()).toEqual([
      {
        chave: 'a.csv',
        plataforma: 'uber',
        contaId: 'urbango',
        periodo: semana,
        texto: 'csv',
        nomeFicheiro: 'a.csv',
      },
    ]);
  });
});
