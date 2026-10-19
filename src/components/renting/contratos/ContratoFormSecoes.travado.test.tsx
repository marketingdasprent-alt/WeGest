// Num contrato gravado só o bloco Tarifa & Faturação fica travado: o preço, os
// kms e a franquia mudam por pedido ao supervisor. Tudo o resto edita-se — o
// bloqueio total (07-09) foi desfeito a 2026-10-19 a pedido dos gestores.
//
// O bloqueio é um `<fieldset disabled>`, e um fieldset desactivado desactiva
// todos os descendentes — um aninhado NÃO os reactiva. Por isso o que fica
// livre não pode estar lá dentro, e é isso que estes testes fixam.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';

// Só os dois hooks de rede; o resto do módulo (calcularFaturacaoRenting e
// companhia) fica como está — substituí-lo por inteiro tirava exports que o
// componente usa.
vi.mock('@/hooks/useRentingGruposTarifas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRentingGruposTarifas')>()),
  useRentingTarifasMin: () => ({ data: [] }),
  useRentingTarifaPrecosModelo: () => ({ data: [] }),
}));
vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  usePedidoTrocaKmsPendente: () => ({ data: null }),
}));

// As secções viram marcadores: o que se testa é onde ficam, não o que mostram.
// `function` declarada, e não `const`: vi.mock() é hoisted para o topo do
// ficheiro e uma const estaria em TDZ quando o factory corre.
function marcador(nome: string) {
  return () => <div data-testid={nome} />;
}
vi.mock('./SectionRegime', () => ({ SectionRegime: marcador('sec-regime') }));
vi.mock('./SectionEmpresaEmissora', () => ({
  SectionEmpresaEmissora: marcador('sec-emissora'),
}));
vi.mock('./SectionCliente', () => ({ SectionCliente: marcador('sec-cliente') }));
vi.mock('./SectionEntregaRecolha', () => ({
  SectionEntregaRecolha: marcador('sec-entrega'),
}));
vi.mock('./SectionViatura', () => ({ SectionViatura: marcador('sec-viatura') }));
vi.mock('@/components/renting/shared/CondutoresFields', () => ({
  CondutoresFields: marcador('sec-condutores'),
}));
vi.mock('./TrocaViaturaInfo', () => ({ TrocaViaturaInfo: marcador('sec-troca') }));
vi.mock('@/components/renting/shared/ALDFields', () => ({ ALDFields: marcador('sec-ald') }));

import { ContratoFormSecoes } from './ContratoFormSecoes';
import { textoPrecoSemanaTvde } from '@/utils/precoContratoTvde';

// Form a sério: o bloco "Tarifa & Faturação" é inline neste componente e usa
// FormField com o `control` verdadeiro — um duplo fino não chega.
function Harness({
  travado,
  contratoId,
  regime = 'tvde',
}: {
  travado: boolean;
  contratoId?: string;
  regime?: string;
}) {
  const form = useForm({ defaultValues: { regime, viatura_id: null, tarifa_id: null } });
  return (
    <FormProvider {...form}>
      <ContratoFormSecoes
        form={form as never}
        clientes={[]}
        motoristas={[]}
        viaturas={[]}
        grupos={[]}
        estacoes={[]}
        travado={travado}
        contratoId={contratoId}
      />
    </FormProvider>
  );
}

const renderSecoes = (travado: boolean) => render(<Harness travado={travado} />);

/** O fieldset desactivado mais próximo, ou null se não houver nenhum. */
const fieldsetTravadoDe = (testid: string) =>
  screen.getByTestId(testid).closest('fieldset[disabled]');

describe('ContratoFormSecoes — contrato gravado', () => {
  it('as secções do contrato ficam FORA do bloqueio', () => {
    renderSecoes(true);
    for (const sec of [
      'sec-regime',
      'sec-emissora',
      'sec-cliente',
      'sec-entrega',
      'sec-troca',
      'sec-ald',
      'sec-viatura',
      'sec-condutores',
    ]) {
      expect(fieldsetTravadoDe(sec)).toBeNull();
    }
  });

  it('observações públicas e internas editam-se', () => {
    renderSecoes(true);
    expect(screen.getByLabelText(/Observações Internas/)).toBeEnabled();
    expect(screen.getByLabelText(/Observações Públicas/)).toBeEnabled();
  });

  // O preço muda por pedido: escolher outra tarifa reescrevia-o por fora dele.
  it('a escolha da tarifa fica travada', () => {
    renderSecoes(true);
    const tarifa = screen.getByRole('combobox');
    const bloco = tarifa.closest('fieldset[disabled]');
    expect(bloco).not.toBeNull();
    // pointer-events-none trava o Select da Radix, que abre pelo próprio estado em JS.
    expect(bloco).toHaveClass('[&_[role=combobox]]:pointer-events-none');
  });

  it('contrato novo: nem a tarifa fica travada', () => {
    renderSecoes(false);
    expect(screen.getByRole('combobox').closest('fieldset[disabled]')).toBeNull();
  });
});

// Os pedidos só existem num contrato gravado, que tem a tarifa travada: dentro
// desse fieldset os botões nunca se podiam carregar (aconteceu aos de kms e
// franquia entre 07-09 e 19-10).
describe('ContratoFormSecoes — pedidos de alteração num contrato aberto', () => {
  const renderGravado = (regime = 'tvde') =>
    render(<Harness travado contratoId="c-1" regime={regime} />);

  it.each(['Pedir alteração de kms', 'Pedir alteração de franquia'])(
    '"%s" fica fora do bloqueio e carregável',
    (label) => {
      renderGravado();
      const botao = screen.getByRole('button', { name: label });
      expect(botao.closest('fieldset[disabled]')).toBeNull();
      expect(botao).toBeEnabled();
    }
  );

  it('em rent-a-car os pedidos de kms e franquia também ficam carregáveis', () => {
    renderGravado('rent_a_car');
    expect(screen.getByRole('button', { name: 'Pedir alteração de kms' })).toBeEnabled();
  });
});

describe('textoPrecoSemanaTvde', () => {
  it('negociado diferente da tabela mostra os dois', () => {
    expect(textoPrecoSemanaTvde(180, 200)).toBe('180 € · tabela 200 €');
  });
  it('negociado igual à tabela mostra só um', () => {
    expect(textoPrecoSemanaTvde(200, 200)).toBe('200 €');
  });
  it('0 negociado é um preço, não "sem preço"', () => {
    expect(textoPrecoSemanaTvde(0, 200)).toBe('0 € · tabela 200 €');
  });
  it('sem negociado segue a tabela', () => {
    expect(textoPrecoSemanaTvde(null, 200)).toBe('200 €');
    expect(textoPrecoSemanaTvde(null, null)).toBe('Sem preço');
  });
});
