import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function e o Vitest usam o mesmo ficheiro.
import {
  recusaPorEmissaoIncerta,
  verificarEmissaoIncerta,
} from '../../supabase/functions/_shared/faturacao/reemissao';
import { linhaDeFalhaEmissao } from '../../supabase/functions/_shared/faturacao/falhas';

/** A linha que a faturacao-emitir grava numa falha, para o teste seguir o formato real. */
function falha(classe: 'unknown' | 'known_failed', provider: string | null) {
  const linha = linhaDeFalhaEmissao({
    orgId: 'org',
    pedido: { tipo: 'FT', cobranca_id: 'cob-1' },
    erro: 'x',
    classe,
    provider,
  })!;
  return { payload: linha.payload };
}

describe('verificarEmissaoIncerta', () => {
  it('só FT e FR com cobrança', () => {
    expect(verificarEmissaoIncerta('FT', 'cob-1')).toBe(true);
    expect(verificarEmissaoIncerta('FR', 'cob-1')).toBe(true);
    expect(verificarEmissaoIncerta('FT', undefined)).toBe(false);
    expect(verificarEmissaoIncerta('NC', 'cob-1')).toBe(false);
    expect(verificarEmissaoIncerta('RC', 'cob-1')).toBe(false);
  });
});

describe('recusaPorEmissaoIncerta', () => {
  it('sem falhas, ou só falhas conhecidas, deixa emitir', () => {
    expect(recusaPorEmissaoIncerta([])).toBeNull();
    expect(recusaPorEmissaoIncerta([falha('known_failed', 'primavera')])).toBeNull();
  });

  it('uma falha incerta recusa e nomeia o fornecedor da tentativa original', () => {
    const msg = recusaPorEmissaoIncerta([
      falha('known_failed', 'keyinvoice'),
      falha('unknown', 'primavera'),
    ]);
    expect(msg).toBe(
      'Há uma emissão anterior desta cobrança com resultado incerto. Confirme no Primavera se ' +
        'o documento foi criado e marque o alerta como resolvido em Automação antes de emitir de novo.'
    );
  });

  it('sem fornecedor no registo diz "software de faturação"', () => {
    expect(recusaPorEmissaoIncerta([falha('unknown', null)])).toContain(
      'Confirme no software de faturação se'
    );
    expect(recusaPorEmissaoIncerta([{ payload: { classe: 'unknown' } }])).toContain(
      'software de faturação'
    );
  });

  it('payload sem forma não rebenta nem recusa', () => {
    expect(recusaPorEmissaoIncerta([{ payload: null }, { payload: 'unknown' }])).toBeNull();
  });
});
