// Num contrato já aberto tudo fica travado MENOS a viatura: trocar o cliente
// de carro é a única alteração permitida sem refazer o contrato.
//
// O bloqueio é feito com `<fieldset disabled>`, e um fieldset desactivado
// desactiva todos os descendentes — um fieldset aninhado NÃO os reactiva. Por
// isso a única forma de deixar a Viatura de fora é ela não estar lá dentro, e
// é exactamente isso que este teste fixa: se alguém voltar a embrulhar o
// separador inteiro num só fieldset, a troca de viatura deixa de funcionar e
// ninguém dá por isso até um cliente ficar sem carro.
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

describe('ContratoFormSecoes — contrato aberto', () => {
  it('a Viatura fica FORA do bloqueio', () => {
    renderSecoes(true);
    expect(fieldsetTravadoDe('sec-viatura')).toBeNull();
  });

  it('permite editar notas internas mantendo observações públicas bloqueadas', () => {
    renderSecoes(true);
    expect(screen.getByLabelText(/Observações Internas/)).toBeEnabled();
    expect(screen.getByLabelText(/Observações Públicas/)).toBeDisabled();
  });

  it('tudo o resto fica dentro do bloqueio, antes e depois da Viatura', () => {
    renderSecoes(true);
    for (const sec of [
      'sec-regime',
      'sec-emissora',
      'sec-cliente',
      'sec-entrega',
      'sec-troca',
      'sec-ald',
      'sec-condutores',
    ]) {
      expect(fieldsetTravadoDe(sec)).not.toBeNull();
    }
  });

  // pointer-events-none nos controlos é o que trava mesmo o Select da Radix,
  // que decide se abre pelo seu próprio estado em JS e não pelo `disabled`
  // nativo. Sem isto os campos ficavam cinzentos mas continuavam a abrir.
  it('o bloqueio também corta o clique nos controlos, não só o disabled nativo', () => {
    renderSecoes(true);
    const bloco = fieldsetTravadoDe('sec-cliente');
    expect(bloco).toHaveClass('[&_button]:pointer-events-none');
    expect(bloco).toHaveClass('[&_[role=combobox]]:pointer-events-none');
    expect(bloco).toHaveClass('[&_input]:pointer-events-none');
  });

  // O bloco todo sem cliques (e com select-none) impedia copiar o nome, o NIF
  // e o telemóvel dos condutores de um contrato aberto.
  it('o texto do bloqueio continua selecionável para copiar', () => {
    renderSecoes(true);
    const bloco = fieldsetTravadoDe('sec-condutores');
    expect(bloco).not.toHaveClass('pointer-events-none');
    expect(bloco).not.toHaveClass('select-none');
  });

  it('sem contrato aberto não há bloqueio nenhum', () => {
    renderSecoes(false);
    for (const sec of ['sec-regime', 'sec-cliente', 'sec-viatura']) {
      expect(fieldsetTravadoDe(sec)).toBeNull();
    }
  });
});

// Os pedidos só existem num contrato gravado, que está sempre travado: dentro
// do fieldset os botões nunca se podiam carregar (aconteceu aos de kms e
// franquia, mortos desde que o contrato aberto passou a ficar travado).
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
