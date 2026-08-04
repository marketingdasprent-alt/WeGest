import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReservaTabGeral } from './ReservaTabGeral';
import type { ReservaFormValues } from '../reservaDialog.schema';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingTarifaMin, RentingTarifaPrecoModelo } from '@/hooks/useRentingGruposTarifas';

// --- Mocks dos hooks de dados (ver topo de ReservaTabGeral.tsx) ---------
// `usePermissions` / `useModules`: nenhum dos dois testes depende de
// permissões ou módulos — valores fixos que deixam tudo visível.
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ podeVerTodosRenting: true }),
}));

vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ has: () => true }),
}));

vi.mock('@/hooks/useModelosElegiveisTvde', () => ({
  useModelosElegiveisTvde: () => ({ data: new Set<string>() }),
}));

// `useRentingGruposMin` / `useRentingTarifasMin` / `useRentingTarifaPrecosModelo`
// são as três queries que, no bug real, resolvem DEPOIS da hidratação do
// formulário — é exactamente essa corrida que os testes abaixo reproduzem
// (montam com as três a devolver `[]`, e só depois "chegam" os dados).
// `calcularFaturacaoRenting` fica real (importOriginal): é a função que a
// correção não deve alterar — só a guarda à volta do `form.setValue` muda.
const { useRentingTarifasMinMock, useRentingTarifaPrecosModeloMock, useRentingGruposMinMock } =
  vi.hoisted(() => ({
    useRentingTarifasMinMock: vi.fn(),
    useRentingTarifaPrecosModeloMock: vi.fn(),
    useRentingGruposMinMock: vi.fn(),
  }));

vi.mock('@/hooks/useRentingGruposTarifas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useRentingGruposTarifas')>();
  return {
    ...actual,
    useRentingGruposMin: useRentingGruposMinMock,
    useRentingTarifasMin: useRentingTarifasMinMock,
    useRentingTarifaPrecosModelo: useRentingTarifaPrecosModeloMock,
  };
});

// As secções de UI (Empresa Emissora, Período, Viatura, Tarifa, Observações)
// e a tabela de Condutores têm as suas próprias queries (EmissorSelect,
// GestorSelect, ...) que nada têm a ver com este bug — mockadas para isolar
// exactamente a lógica que vive em ReservaTabGeral (o useMemo `faturacao` e o
// useEffect que grava `valor_total`), que é onde o bug e a correção vivem.
// Sem isto o teste teria de montar toda a árvore de comboboxes/popovers só
// para chegar a dois `useEffect`.
vi.mock('./geral/sections/ReservaTabGeralSectionDadosGerais', () => ({
  ReservaTabGeralSectionDadosGerais: () => null,
}));
vi.mock('./geral/sections/ReservaTabGeralSectionPeriodos', () => ({
  ReservaTabGeralSectionPeriodos: () => null,
}));
vi.mock('./geral/sections/ReservaTabGeralSectionViatura', () => ({
  ReservaTabGeralSectionViatura: () => null,
}));
vi.mock('./geral/sections/ReservaTabGeralSectionTarifa', () => ({
  ReservaTabGeralSectionTarifa: () => null,
}));
vi.mock('./geral/sections/ReservaTabGeralSectionObservacoes', () => ({
  ReservaTabGeralSectionObservacoes: () => null,
}));
vi.mock('@/components/renting/shared/CondutoresFields', () => ({
  CondutoresFields: () => null,
}));

const VIATURA_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const MODELO_ID = 'modelo-1';
const TARIFA_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

const viaturaMock: ViaturaBasic = {
  id: VIATURA_ID,
  matricula: '00-AA-00',
  data_matricula: null,
  marca: 'Marca',
  modelo: 'Modelo',
  status: 'disponivel',
  categoria: null,
  km_atual: null,
  combustivel: null,
  combustivel_id: null,
  is_vendida: false,
  is_slot: false,
  grupo_id: null,
  modelo_id: MODELO_ID,
  tipo_id: null,
  habilitada_tvde: false,
  emissor_id: null,
};

// Tarifa sem preço de grupo (preco_dia null) — o preço só existe no preço por
// modelo (precoModeloMock, abaixo). Assim, se a correção alguma vez deixar de
// derivar o preço do modelo, o teste fica sem faturação (null) em vez de
// coincidir por acaso com o preço do grupo.
const tarifaMock: RentingTarifaMin = {
  id: TARIFA_ID,
  grupo_id: 'grupo-1',
  nome: 'Tarifa Normal',
  tipo: 'renting',
  kms_incluidos: null,
  km_adicional_valor: null,
  preco_dia: null,
  preco_semana: null,
  preco_mes: null,
};

// 50 €/dia × 5 dias (data_inicio..data_fim definidos em criarForm) = 250 €.
// Bem diferente dos 1275 € "gravados" no teste da guarda — se o efeito
// sobrescrever sem guarda, a falha é inequívoca (250 nunca é 1275).
const precoModeloMock: RentingTarifaPrecoModelo = {
  tarifa_id: TARIFA_ID,
  modelo_id: MODELO_ID,
  preco_semana: null,
  preco_dia: 50,
  preco_mes: null,
  km_mensal: null,
  km_adicional_valor: null,
  franquia_valor: null,
  caucao_valor: null,
  km_mensal_iva: null,
  km_adicional_valor_iva: null,
  franquia_valor_iva: null,
  caucao_valor_iva: null,
};

function Harness({ form }: { form: ReturnType<typeof useForm<ReservaFormValues>> }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <FormProvider {...form}>
        <ReservaTabGeral form={form} viaturas={[viaturaMock]} estacoes={[]} clientes={[]} />
      </FormProvider>
    </QueryClientProvider>
  );
}

/** Formulário com `viatura_id`/`tarifa_id` já escolhidos e `dias` = 5 (10→15 de
 * Agosto), como uma reserva hidratada por `form.reset(...)` — só falta a
 * hidratação (aqui, `valorTotalInicial`) e as listas de tarifas/preços, que
 * cada teste faz "chegar" a seguir via os mocks acima. */
function criarForm(valorTotalInicial: number | null) {
  const { result } = renderHook(() =>
    useForm<ReservaFormValues>({
      defaultValues: {
        estado: 'pendente',
        regime: 'rent_a_car',
        is_longa_duracao: false,
        data_inicio: '2026-08-10T10:00',
        data_fim: '2026-08-15T10:00',
        viatura_id: VIATURA_ID,
        tarifa_id: TARIFA_ID,
        valor_total: valorTotalInicial,
        condutores: [],
        coberturas: [],
        extras: [],
        taxas: [],
      } as any,
    })
  );
  return result.current;
}

beforeEach(() => {
  // Estado "hidratação concluída, listas ainda a caminho" — o ponto de
  // partida real do bug: o formulário já tem valores, as queries ainda não.
  useRentingGruposMinMock.mockReturnValue({ data: [] });
  useRentingTarifasMinMock.mockReturnValue({ data: [] });
  useRentingTarifaPrecosModeloMock.mockReturnValue({ data: [] });
});

describe('ReservaTabGeral — valor_total vs. tarifa', () => {
  it('não sobrescreve um valor_total já gravado quando a tarifa/preço do modelo chegam depois da hidratação', () => {
    const VALOR_GRAVADO = 1275;
    const form = criarForm(VALOR_GRAVADO);

    const { rerender } = render(<Harness form={form} />);

    // Hidratação "concluída", listas ainda vazias — faturacao ainda é null
    // (nem tarifa nem preço de modelo resolvidos), o valor gravado não mexeu.
    expect(form.getValues('valor_total')).toBe(VALOR_GRAVADO);

    // As queries resolvem AGORA, depois da hidratação — a mesma corrida do
    // bug reportado (useRentingTarifasMin/useRentingTarifaPrecosModelo async
    // a chegar depois do form.reset da reserva gravada).
    useRentingTarifasMinMock.mockReturnValue({ data: [tarifaMock] });
    useRentingTarifaPrecosModeloMock.mockReturnValue({ data: [precoModeloMock] });
    rerender(<Harness form={form} />);

    // A tarifa dava 250 € (50 €/dia × 5 dias) — continua 1275: o valor
    // manual/gravado manda sobre a tarifa.
    expect(form.getValues('valor_total')).toBe(VALOR_GRAVADO);
  });

  it('preenche valor_total com o preço da tarifa quando o campo está vazio (reserva nova)', () => {
    const form = criarForm(null);

    const { rerender } = render(<Harness form={form} />);

    expect(form.getValues('valor_total')).toBeNull();

    useRentingTarifasMinMock.mockReturnValue({ data: [tarifaMock] });
    useRentingTarifaPrecosModeloMock.mockReturnValue({ data: [precoModeloMock] });
    rerender(<Harness form={form} />);

    // Campo vazio → a tarifa PODE (e deve) preenchê-lo.
    expect(form.getValues('valor_total')).toBe(250);
  });
});
