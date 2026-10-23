// Ticket #29 (Lucas, 2026-10-20): numa troca para um modelo sem preço na tarifa
// gravada, o form limpa a tarifa (obrigatória) e o seletor ficava travado, por
// isso a troca não se gravava. O seletor solta-se nesse caso, e só nesse.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider, type UseFormReturn } from 'react-hook-form';

const dados = vi.hoisted(() => ({
  precos: [] as { tarifa_id: string; modelo_id: string; preco_semana: number | null }[],
}));

const TARIFAS = [
  { id: 'tarifa-base', nome: 'TVDE - Base', tipo: 'tvde', preco_dia: null, preco_semana: null },
  { id: 'tarifa-acores', nome: 'Açores', tipo: 'tvde', preco_dia: null, preco_semana: null },
];

vi.mock('@/hooks/useRentingGruposTarifas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRentingGruposTarifas')>()),
  useRentingTarifasMin: () => ({ data: TARIFAS }),
  useRentingTarifaPrecosModelo: () => ({ data: dados.precos, isSuccess: true }),
}));
vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  usePedidoTrocaKmsPendente: () => ({ data: null }),
}));

// Select nativo: o da Radix não abre em jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select aria-label="Tarifa" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

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

const VIATURA_NOVA = { id: 'v-nova', marca: 'Toyota', modelo: 'Corolla', modelo_id: 'mod-novo' };

interface Valores {
  regime: string;
  viatura_id: string;
  tarifa_id: string | null;
  valor_total_manual: number | null;
}

let formRef: UseFormReturn<Valores> | null = null;

function Harness({
  tarifaNoForm,
  precoSemanaAcordado = null,
}: {
  tarifaNoForm: string | null;
  precoSemanaAcordado?: number | null;
}) {
  const form = useForm<Valores>({
    defaultValues: {
      regime: 'tvde',
      viatura_id: VIATURA_NOVA.id,
      tarifa_id: tarifaNoForm,
      valor_total_manual: 180,
    },
  });
  formRef = form;
  return (
    <FormProvider {...form}>
      <ContratoFormSecoes
        form={form as never}
        clientes={[]}
        motoristas={[]}
        viaturas={[VIATURA_NOVA] as never}
        grupos={[]}
        estacoes={[]}
        travado
        tarifaGravada="tarifa-base"
        contratoId="c-1"
        precoSemanaAcordado={precoSemanaAcordado}
      />
    </FormProvider>
  );
}

const seletor = () => screen.getByRole('combobox', { name: 'Tarifa' });

beforeEach(() => {
  formRef = null;
  dados.precos = [{ tarifa_id: 'tarifa-acores', modelo_id: 'mod-novo', preco_semana: 250 }];
});

describe('ContratoFormSecoes: troca para modelo sem preço na tarifa gravada', () => {
  it('o seletor solta-se, diz porquê e só oferece tarifas com preço para o modelo', () => {
    render(<Harness tarifaNoForm={null} />);
    expect(seletor().closest('fieldset[disabled]')).toBeNull();
    expect(
      screen.getByText(/A tarifa TVDE - Base não tem preço para Toyota Corolla/)
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Açores' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'TVDE - Base' })).toBeNull();
  });

  it('escolhida a tarifa nova, continua livre e o preço segue a tabela dela', () => {
    render(<Harness tarifaNoForm={null} />);
    fireEvent.change(seletor(), { target: { value: 'tarifa-acores' } });
    expect(formRef?.getValues('tarifa_id')).toBe('tarifa-acores');
    expect(formRef?.getValues('valor_total_manual')).toBe(250);
    expect(seletor().closest('fieldset[disabled]')).toBeNull();
  });

  it('preço negociado fica com o contrato ao escolher a tarifa nova', () => {
    render(<Harness tarifaNoForm={null} precoSemanaAcordado={180} />);
    fireEvent.change(seletor(), { target: { value: 'tarifa-acores' } });
    expect(formRef?.getValues('tarifa_id')).toBe('tarifa-acores');
    expect(formRef?.getValues('valor_total_manual')).toBe(180);
  });

  it('se a tarifa gravada tem preço para o modelo novo, continua travada', () => {
    dados.precos.push({ tarifa_id: 'tarifa-base', modelo_id: 'mod-novo', preco_semana: 200 });
    render(<Harness tarifaNoForm="tarifa-base" />);
    expect(seletor().closest('fieldset[disabled]')).not.toBeNull();
    expect(screen.queryByText(/não tem preço para Toyota Corolla/)).toBeNull();
  });
});
