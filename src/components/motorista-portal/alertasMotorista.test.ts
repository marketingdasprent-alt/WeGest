import { describe, it, expect } from 'vitest';
import { construirAlertas, type EntradaAlertas } from './alertasMotorista';

const HOJE = new Date(2026, 8, 21); // 21 set 2026

function entrada(over: Partial<EntradaAlertas> = {}): EntradaAlertas {
  return {
    docsExpirando: [],
    semanasEmFalta: 0,
    recibosEmValidacao: 0,
    acordosAtivos: 0,
    usaRecibos: true,
    hoje: HOJE,
    ...over,
  };
}

describe('construirAlertas', () => {
  it('sem nada pendente não há alertas — a faixa não ocupa espaço', () => {
    expect(construirAlertas(entrada())).toEqual([]);
  });

  it('documento a expirar é aviso; já expirado é perigo — e vem primeiro', () => {
    const alertas = construirAlertas(
      entrada({
        docsExpirando: [
          { label: 'Licença TVDE', data: '10/10/2026', validade: new Date(2026, 9, 10) },
          { label: 'Carta de Condução', data: '01/09/2026', validade: new Date(2026, 8, 1) },
        ],
      })
    );
    expect(alertas.map((a) => [a.tom, a.titulo])).toEqual([
      ['perigo', 'Carta de Condução expirou'],
      ['aviso', 'Licença TVDE expira em breve'],
    ]);
    expect(alertas.every((a) => a.tab === 'documentos')).toBe(true);
  });

  it('recibos em falta e em validação apontam para Documentos, com singular/plural certos', () => {
    const alertas = construirAlertas(entrada({ semanasEmFalta: 1, recibosEmValidacao: 3 }));
    expect(alertas.map((a) => a.titulo)).toEqual([
      '1 recibo verde em falta',
      '3 recibos verdes em validação',
    ]);
    expect(alertas.every((a) => a.tab === 'documentos')).toBe(true);
  });

  it('quem não passa recibos verdes nunca vê alertas de recibos', () => {
    // recibo_verde = false: os números até podem existir por engano na base,
    // mas mostrá-los era pedir ao motorista uma coisa que ele não faz.
    const alertas = construirAlertas(
      entrada({ usaRecibos: false, semanasEmFalta: 4, recibosEmValidacao: 2 })
    );
    expect(alertas).toEqual([]);
  });

  it('plano de pagamento activo leva a Contas', () => {
    const [alerta] = construirAlertas(entrada({ acordosAtivos: 1 }));
    expect(alerta.tab).toBe('contas');
    expect(alerta.titulo).toBe('Tem um plano de pagamento activo');
  });

  it('ids são únicos para servirem de key', () => {
    const alertas = construirAlertas(
      entrada({
        docsExpirando: [
          { label: 'Licença TVDE', data: '10/10/2026', validade: new Date(2026, 9, 10) },
          { label: 'Carta de Condução', data: '12/10/2026', validade: new Date(2026, 9, 12) },
        ],
        semanasEmFalta: 2,
        recibosEmValidacao: 1,
        acordosAtivos: 2,
      })
    );
    const ids = alertas.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
