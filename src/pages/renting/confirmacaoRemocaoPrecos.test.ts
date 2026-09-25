import { describe, expect, it } from 'vitest';
import { pedeConfirmacaoRemocaoPrecos } from './confirmacaoRemocaoPrecos';

// Forma do erro que o supabase-js devolve para um RAISE EXCEPTION ... USING HINT.
const erroPostgrest = (hint: string | null) => ({
  code: 'P0001',
  message: 'Preço em uso em contratos abertos: Astra — contrato #16 (BT-21-UN).',
  details: null,
  hint,
});

describe('pedeConfirmacaoRemocaoPrecos', () => {
  it('reconhece a recusa por preço em uso pelo HINT da função', () => {
    expect(pedeConfirmacaoRemocaoPrecos(erroPostgrest('confirmar_remocao_precos'))).toBe(true);
  });

  it('não confunde outro erro P0001 com o pedido de confirmação', () => {
    expect(pedeConfirmacaoRemocaoPrecos(erroPostgrest(null))).toBe(false);
  });

  it('ignora erros sem HINT, como um Error comum ou valores soltos', () => {
    expect(pedeConfirmacaoRemocaoPrecos(new Error('rede em baixo'))).toBe(false);
    expect(pedeConfirmacaoRemocaoPrecos(null)).toBe(false);
    expect(pedeConfirmacaoRemocaoPrecos('confirmar_remocao_precos')).toBe(false);
  });
});
