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
vi.mock('./SectionInfoAdicional', () => ({ SectionInfoAdicional: marcador('sec-info') }));
vi.mock('./TrocaViaturaInfo', () => ({ TrocaViaturaInfo: marcador('sec-troca') }));
vi.mock('@/components/renting/shared/ALDFields', () => ({ ALDFields: marcador('sec-ald') }));

import { ContratoFormSecoes } from './ContratoFormSecoes';

// Form a sério: o bloco "Tarifa & Faturação" é inline neste componente e usa
// FormField com o `control` verdadeiro — um duplo fino não chega.
function Harness({ travado }: { travado: boolean }) {
  const form = useForm({ defaultValues: { regime: 'tvde', viatura_id: null, tarifa_id: null } });
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
      'sec-info',
    ]) {
      expect(fieldsetTravadoDe(sec)).not.toBeNull();
    }
  });

  // pointer-events-none é o que trava mesmo o Select da Radix, que decide se
  // abre pelo seu próprio estado em JS e não pelo `disabled` nativo. Sem isto
  // os campos ficavam cinzentos mas continuavam a abrir.
  it('o bloqueio também corta o clique, não só o disabled nativo', () => {
    renderSecoes(true);
    expect(fieldsetTravadoDe('sec-cliente')).toHaveClass('pointer-events-none');
  });

  it('sem contrato aberto não há bloqueio nenhum', () => {
    renderSecoes(false);
    for (const sec of ['sec-regime', 'sec-cliente', 'sec-viatura', 'sec-info']) {
      expect(fieldsetTravadoDe(sec)).toBeNull();
    }
  });
});
