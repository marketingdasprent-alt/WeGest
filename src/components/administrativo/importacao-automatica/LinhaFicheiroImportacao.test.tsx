import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { LinhaFicheiroImportacao } from './LinhaFicheiroImportacao';

const base = {
  nome: '20260921-20260927-UBER AÇORES.csv',
  plataforma: 'uber' as const,
  contaId: 'acores',
  periodo: { inicio: '2026-09-21', fim: '2026-09-27' },
  motivo: '13 dos 13 motoristas já trabalham nesta conta.',
  falta: null,
  contas: [{ id: 'acores', nome: 'Uber Açores', nomeEmpresa: null, plataforma: 'uber' as const }],
  semanas: [{ inicio: '2026-09-21', fim: '2026-09-27' }],
  substitui: false,
  repetido: false,
  bloqueada: false,
  onContaChange: vi.fn(),
  onPeriodoChange: vi.fn(),
  onRetirar: vi.fn(),
};

const texto = () => screen.getByTestId('linha-importacao').textContent ?? '';

describe('LinhaFicheiroImportacao', () => {
  it('mostra a plataforma, a semana e porque escolheu a conta', () => {
    render(<LinhaFicheiroImportacao {...base} />);
    expect(texto()).toContain('Uber');
    expect(texto()).toContain('21/09 a 27/09/2026');
    expect(texto()).toContain('13 dos 13 motoristas');
  });

  it('avisa que vai substituir o que a conta já tem dessa semana', () => {
    render(<LinhaFicheiroImportacao {...base} substitui />);
    expect(texto()).toContain('vão ser substituídos');
  });

  it('conflito: explica e diz o que falta', () => {
    render(
      <LinhaFicheiroImportacao
        {...base}
        contaId={null}
        falta="Escolha a conta."
        motivo="O nome do ficheiro aponta para Uber Açores, mas 18 dos 18 motoristas trabalham na Uber Urbango."
      />
    );
    expect(texto()).toContain('Uber Urbango');
    expect(texto()).toContain('Escolha a conta.');
  });

  it('dois ficheiros para a mesma conta e semana', () => {
    render(<LinhaFicheiroImportacao {...base} repetido />);
    expect(texto()).toContain('retire um');
  });

  it('depois de importar: quantos gravou e quantos substituiu', () => {
    const resultado = {
      chave: 'x',
      ok: true as const,
      resultado: {
        gravados: 13,
        lidas: 13,
        ignoradas: 0,
        deduplicadas: 0,
        erros: 0,
        semTitular: 0,
        substituidas: 18,
        periodo: null,
        colunas: [],
      },
    };
    render(<LinhaFicheiroImportacao {...base} resultado={resultado} bloqueada />);
    expect(texto()).toContain('13 gravados, 18 da importação anterior substituídos');
  });

  it('erro de um ficheiro aparece na linha dele', () => {
    render(
      <LinhaFicheiroImportacao
        {...base}
        resultado={{ chave: 'x', ok: false, erro: 'Sessão inválida' }}
      />
    );
    expect(texto()).toContain('Sessão inválida');
  });

  it('retirar o ficheiro do lote', () => {
    const onRetirar = vi.fn();
    render(<LinhaFicheiroImportacao {...base} onRetirar={onRetirar} />);
    fireEvent.click(screen.getByRole('button', { name: `Retirar ${base.nome}` }));
    expect(onRetirar).toHaveBeenCalled();
  });
});
