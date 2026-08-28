import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';
import { useClientes } from '@/hooks/useClientes';
import { useContratoCoberturas, useSyncContratoCoberturas } from '@/hooks/useContratoCoberturas';
import {
  useContratoExtras,
  useSyncContratoExtras,
  calcExtraTotal,
} from '@/hooks/useContratoExtras';
import { useContratoTaxas, useSyncContratoTaxas } from '@/hooks/useContratoTaxas';
import { useContratoCondutores, useSyncContratoCondutores } from '@/hooks/useContratoCondutores';
import {
  useContratoConflito,
  useContratoRenting,
  useContratoVizinhos,
  useCreateContratoRenting,
  useCriarVersaoContrato,
  useCancelarContratoRenting,
  useDeleteContratoRenting,
  useUpdateContratoRenting,
} from '@/hooks/useContratosRenting';
import { useEstacoes } from '@/hooks/useEstacoes';
import { tipoRealizacaoPendenteEsperada } from './realizacaoPendente';
import { useOrgDefinicoes, ivaParaModalidade } from '@/hooks/useOrgDefinicoes';
import { useRentingCoberturas } from '@/hooks/useRentingCoberturas';
import { useRentingExtras } from '@/hooks/useRentingExtras';
import { useRentingTaxas } from '@/hooks/useRentingTaxas';
import {
  useRentingGruposMin,
  useRentingTarifasMin,
  useRentingTarifaPrecosModelo,
  calcularBaseAluguerRenting,
  calcularFaturacaoRenting,
} from '@/hooks/useRentingGruposTarifas';
import { useModelosElegiveisTvde } from '@/hooks/useModelosElegiveisTvde';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useMotoristas } from '@/hooks/useMotoristas';
import { useReserva } from '@/hooks/useReservas';
import { useReservaCondutores } from '@/hooks/useReservaCondutores';
import { useViaturas } from '@/hooks/useViaturas';
import { useViaturasOcupadasPeriodo } from '@/hooks/useViaturasOcupadasPeriodo';

import { fillEmptyFormFields } from '@/lib/fillEmptyFormFields';

import type {
  CoberturaFormItem,
  ContratoRentingInsert,
  ExtraFormItem,
  TaxaFormItem,
} from '@/types/contratoRenting';
import type { CondutorFormItem } from '@/types/reserva';
import type { AlteracaoMaterial } from '@/components/renting/contratos/FecharContratoDialog';
import {
  DEFAULT_CONTRATO_VALUES,
  contratoFormSchema,
  isoToLocalInput,
  localInputToIso,
  type ContratoFormValues,
} from '@/components/renting/contratos/contratoForm.schema';

// Mapeia o 1º campo do schema com erro para o separador onde ele vive —
// os restantes campos ficam todos no separador "Geral" (ContratoFormSecoes).
//
// `valor_total_manual`, `desconto_percentagem` e `voucher_codigo` caem neste
// grupo. Desde que o SectionGeral foi apagado (tinha os únicos <FormMessage />
// destes três campos), um erro de validação neles deixa de ter superfície
// ACIONÁVEL: o `onInvalid` (mais abaixo) continua a abrir o separador "Geral" e
// a mostrar o toast, mas lá não há nenhum destes campos para corrigir — e o
// cartão lateral (ResumoContrato) não lê form.formState.errors.
// Decisão deliberada, não um esquecimento: os três só entram no formulário
// por hidratação de um contrato/reserva já gravado, e só se grava um
// contrato passando por este mesmo schema (ou pela função SQL
// renovar_contrato_renting, que copia uma linha já validada) — não há forma
// de os tornar inválidos pela aplicação. `valor_total_manual` tem ainda o
// CHECK chk_contratos_valor_total_manual_valido (>= 0) na BD como garantia
// extra.
const FIELD_TAB_MAP: Partial<Record<keyof ContratoFormValues, string>> = {
  coberturas: 'coberturas',
  extras: 'extras',
  taxas: 'taxas',
};

const TAB_LABELS: Record<string, string> = {
  geral: 'Geral',
  coberturas: 'Coberturas',
  extras: 'Extras',
  taxas: 'Taxas',
};

export interface UseContratoFormReturn {
  // Routing
  isEdit: boolean;
  id?: string;

  // Server data
  clientes: ReturnType<typeof useClientes>['data'];
  motoristas: ReturnType<typeof useMotoristas>['data'];
  empresas: ReturnType<typeof useClientesEmpresas>['empresas'];
  viaturas: ReturnType<typeof useViaturas>['data'];
  estacoes: ReturnType<typeof useEstacoes>['data'];
  coberturas: ReturnType<typeof useRentingCoberturas>['data'];
  extrasCatalogo: ReturnType<typeof useRentingExtras>['data'];
  taxasCatalogo: ReturnType<typeof useRentingTaxas>['data'];
  grupos: ReturnType<typeof useRentingGruposMin>['data'];
  tarifas: ReturnType<typeof useRentingTarifasMin>['data'];
  precosModeloTvde: ReturnType<typeof useRentingTarifaPrecosModelo>['data'];
  modelosElegiveisTvde: ReturnType<typeof useModelosElegiveisTvde>['data'];
  orgDefinicoes: ReturnType<typeof useOrgDefinicoes>['data'];

  // Contrato
  contrato: ReturnType<typeof useContratoRenting>['data'];
  loadingContrato: boolean;
  vizinhos: ReturnType<typeof useContratoVizinhos>['data'];

  // Reserva associada
  reservaAssociada: ReturnType<typeof useReserva>['data'];
  viaturaLocked: boolean;

  // Database relations
  condutoresDb: ReturnType<typeof useContratoCondutores>['data'];
  coberturasDb: ReturnType<typeof useContratoCoberturas>['data'];
  extrasDb: ReturnType<typeof useContratoExtras>['data'];
  taxasDb: ReturnType<typeof useContratoTaxas>['data'];

  // Form
  form: ReturnType<typeof useForm<ContratoFormValues>>;
  isPending: boolean;

  // UI state
  activeTab: string;
  setActiveTab: (tab: string) => void;
  confirmDeleteOpen: boolean;
  setConfirmDeleteOpen: (open: boolean) => void;
  confirmCancelOpen: boolean;
  setConfirmCancelOpen: (open: boolean) => void;
  /** Cancelar está disponível em qualquer estado; só não se cancela uma
   *  versão já substituída (essa é história). Ver useCancelarContratoRenting. */
  podeCancelar: boolean;
  clienteDialogOpen: boolean;
  setClienteDialogOpen: (open: boolean) => void;
  motoristaDialogOpen: boolean;
  setMotoristaDialogOpen: (open: boolean) => void;
  novaVersaoCtx: { alteracoes: AlteracaoMaterial[]; valores: ContratoFormValues } | null;
  setNovaVersaoCtx: (
    ctx: { alteracoes: AlteracaoMaterial[]; valores: ContratoFormValues } | null
  ) => void;
  realizarDialog: { eventoId: string; tipo: 'entrega' | 'recolha' } | null;
  setRealizarDialog: (dialog: { eventoId: string; tipo: 'entrega' | 'recolha' } | null) => void;
  docsDialogOpen: boolean;
  setDocsDialogOpen: (open: boolean) => void;

  // Computed
  viaturasParaSelecao: ReturnType<typeof useViaturas>['data'];
  realizacaoPendente: { id: string; tipo: 'entrega' | 'recolha' } | null;
  condutoresRascunho: {
    motorista_id?: string | null;
    cliente_id?: string | null;
    is_principal?: boolean;
  }[];
  temConflito: boolean;
  dataInicio: string;
  dataFim: string;
  tarifaDiaria: number | null;
  valorTotalManual: number | null;
  descontoPercentagem: number | null;
  regime: string;
  tarifaIdWatch: string | null;
  isLongaDuracao: boolean;
  taxaIva: number;
  coberturasPrecoDia: number;
  extrasForm: ExtraFormItem[];
  taxasForm: TaxaFormItem[];
  grupoIdAtual: string | undefined | null;

  // Handlers
  aplicarDadosViatura: (viaturaId: string) => void;
  handleSubmit: () => void;
  handleDelete: () => void;
  confirmDelete: () => void;
  handleCancelar: () => void;
  confirmCancelar: () => void;
  confirmarNovaVersao: (motivo: string, dataTrocaIso?: string) => void;
  handleClienteCriado: (clienteId: string) => void;
  handleMotoristaCriado: (motoristaId: string) => void;
}

export function useContratoForm(): UseContratoFormReturn {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = !!id;

  // ── Server state ──────────────────────────────────────────────
  const { data: clientes = [] } = useClientes();
  // Não filtra por activo: um contrato existente pode ter condutores que
  // entretanto ficaram inactivos (ex. ao fechar o contrato) — filtrar aqui
  // fazia-os desaparecer da lista e o CondutoresFields mostrava-os como
  // "Motorista removido" mesmo continuando corretamente associados. A
  // dropdown de "Adicionar Motorista" filtra por activo internamente.
  const { data: motoristas = [] } = useMotoristas();
  const { empresas } = useClientesEmpresas();
  const { data: viaturas = [] } = useViaturas();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: coberturas = [] } = useRentingCoberturas({ apenasAtivas: true });
  const { data: extrasCatalogo = [] } = useRentingExtras({ apenasAtivos: true });
  const { data: taxasCatalogo = [] } = useRentingTaxas({ apenasAtivas: true });
  const { data: grupos = [] } = useRentingGruposMin();
  const { data: tarifas = [] } = useRentingTarifasMin();
  const { data: precosModeloTvde = [] } = useRentingTarifaPrecosModelo();
  const { data: modelosElegiveisTvde } = useModelosElegiveisTvde();
  const { data: orgDefinicoes } = useOrgDefinicoes();
  const { data: contrato, isLoading: loadingContrato } = useContratoRenting(id ?? null);
  const { data: vizinhos } = useContratoVizinhos(contrato?.codigo ?? null);

  // ── Reserva associada ──────────────────────────────────────────
  const reservaIdFromQuery = searchParams.get('reserva_id');
  const reservaIdActiva = isEdit ? (contrato?.reserva_id ?? null) : reservaIdFromQuery;
  const { data: reservaFromQuery } = useReserva(!isEdit ? reservaIdFromQuery : null);
  const { data: reservaDoContrato } = useReserva(isEdit ? (contrato?.reserva_id ?? null) : null);
  const reservaAssociada = reservaFromQuery ?? reservaDoContrato;
  const { data: condutoresDaReserva } = useReservaCondutores(!isEdit ? reservaIdFromQuery : null);
  const viaturaLocked = !isEdit && !!reservaIdActiva;

  // ── Mutations ──────────────────────────────────────────────────
  const createMutation = useCreateContratoRenting();
  const updateMutation = useUpdateContratoRenting();
  const deleteMutation = useDeleteContratoRenting();
  const cancelarMutation = useCancelarContratoRenting();
  const criarVersaoMutation = useCriarVersaoContrato();
  const syncCondutoresMutation = useSyncContratoCondutores();
  const syncCoberturasMutation = useSyncContratoCoberturas();
  const syncExtrasMutation = useSyncContratoExtras();
  const syncTaxasMutation = useSyncContratoTaxas();
  const { data: condutoresDb } = useContratoCondutores(contrato?.id ?? null);
  const { data: coberturasDb } = useContratoCoberturas(contrato?.id ?? null);
  const { data: extrasDb } = useContratoExtras(contrato?.id ?? null);
  const { data: taxasDb } = useContratoTaxas(contrato?.id ?? null);

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    syncCondutoresMutation.isPending ||
    syncCoberturasMutation.isPending ||
    syncExtrasMutation.isPending ||
    syncTaxasMutation.isPending;

  // ── UI state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('geral');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [motoristaDialogOpen, setMotoristaDialogOpen] = useState(false);
  const [novaVersaoCtx, setNovaVersaoCtx] = useState<{
    alteracoes: AlteracaoMaterial[];
    valores: ContratoFormValues;
  } | null>(null);
  const [realizarDialog, setRealizarDialog] = useState<{
    eventoId: string;
    tipo: 'entrega' | 'recolha';
  } | null>(null);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────
  const handleClienteCriado = (clienteId: string) => {
    const existentes = (form.getValues('condutores') ?? []) as Array<{
      cliente_id: string | null;
      motorista_id: string | null;
      is_principal: boolean;
    }>;
    if (existentes.some((c) => c.cliente_id === clienteId)) return;
    appendCondutor({
      cliente_id: clienteId,
      motorista_id: null,
      is_principal: existentes.length === 0,
    });
  };

  const handleMotoristaCriado = (motoristaId: string) => {
    const existentes = (form.getValues('condutores') ?? []) as Array<{
      cliente_id: string | null;
      motorista_id: string | null;
      is_principal: boolean;
    }>;
    if (existentes.some((c) => c.motorista_id === motoristaId)) return;
    appendCondutor({
      cliente_id: null,
      motorista_id: motoristaId,
      is_principal: existentes.length === 0,
    });
  };

  const handleDelete = () => {
    if (!contrato) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!contrato) return;
    deleteMutation.mutate(contrato.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/renting/contratos');
      },
    });
  };

  const handleCancelar = () => {
    if (!contrato) return;
    setConfirmCancelOpen(true);
  };

  // Ao contrário do eliminar, cancelar NÃO navega para fora: o contrato
  // continua a existir e o gestor deve ficar a vê-lo já como "Cancelado".
  const confirmCancelar = () => {
    if (!contrato) return;
    cancelarMutation.mutate(contrato.id, {
      onSuccess: () => setConfirmCancelOpen(false),
    });
  };

  // ── Form ──────────────────────────────────────────────────────
  // Instantâneo do servidor a partir do qual o formulário já foi hidratado —
  // guardado por IDENTIDADE de objecto (o react-query, com structural sharing,
  // só devolve uma referência nova quando os dados mudam mesmo). Faz dois
  // trabalhos: re-hidratar quando os dados mudam, e não voltar a fazer reset
  // quando não mudaram (o efeito também corre por causa de listas auxiliares —
  // `viaturas`/`grupos` são `= []` por omissão, ou seja, referência nova a cada
  // render enquanto a query não resolve; sem esta guarda, reset → render →
  // reset, em ciclo). Nulo = ainda não houve hidratação nenhuma.
  const hidratadoDeRef = useRef<{ fonte: unknown; condutores: unknown } | null>(null);

  const form = useForm<ContratoFormValues>({
    resolver: zodResolver(contratoFormSchema),
    defaultValues: DEFAULT_CONTRATO_VALUES,
  });

  // Instância-pai de useFieldArray só para os handlers "criar cliente/motorista"
  // (usam `append`, que sincroniza a cópia interna do useFieldArray-filho que
  // desenha a tabela). A HIDRATAÇÃO das listas é feita com `form.reset` (mais
  // abaixo) — um `replace()`/`setValue` de instância-pai NÃO chega ao filho.
  const { append: appendCondutor } = useFieldArray({ control: form.control, name: 'condutores' });

  // Guard: criar contrato sem reserva_id na URL → redirecionar
  useEffect(() => {
    if (!isEdit && !reservaIdFromQuery) {
      navigate('/renting/contratos', { replace: true });
    }
  }, [isEdit, reservaIdFromQuery, navigate]);

  // Hydration: contrato existente OU pré-preenchimento via reserva_id.
  //
  // Volta a correr sempre que os dados do servidor mudam. Antes corria UMA só
  // vez e era isso que fazia o contrato nascer com o preço/tarifa/emissora
  // ANTERIORES ao último "Guardar" da reserva: `useReserva` tem staleTime de
  // 30 s e a reserva navega para cá logo a seguir a invalidar a query, por isso
  // o react-query serve primeiro a cópia em cache e só depois entrega o
  // refetch — que chegava tarde demais para um formulário já hidratado.
  //
  // `keepDirtyValues: true` é o que substitui a guarda antiga (e faz melhor o
  // trabalho dela): os campos que o utilizador tocou ficam, os outros
  // acompanham o servidor. O primeiro reset é integral, para o arranque não
  // mudar de comportamento.
  useEffect(() => {
    // Instantâneo do servidor desta corrida. Em edição manda o contrato; a
    // criar, a reserva de origem mais os seus condutores (que chegam numa query
    // à parte e entram neste mesmo reset).
    const fonte = isEdit ? contrato : reservaFromQuery;
    const condutoresFonte = isEdit ? null : condutoresDaReserva;
    const jaHidratado = hidratadoDeRef.current;
    if (jaHidratado && jaHidratado.fonte === fonte && jaHidratado.condutores === condutoresFonte) {
      return;
    }
    const opcoesReset = jaHidratado ? { keepDirtyValues: true } : undefined;

    if (isEdit && contrato) {
      hidratadoDeRef.current = { fonte, condutores: condutoresFonte };
      form.reset(
        {
          cliente_id: contrato.cliente_id,
          viatura_id: contrato.viatura_id,
          grupo: contrato.grupo ?? '',
          matricula: contrato.matricula ?? '',
          reserva_id: contrato.reserva_id,
          emissor_id: contrato.emissor_id ?? '',
          gestor_id: contrato.gestor_id ?? null,
          estacao_entrega_id: contrato.estacao_entrega_id,
          data_inicio: isoToLocalInput(contrato.data_inicio),
          estacao_recolha_id: contrato.estacao_recolha_id,
          data_fim: isoToLocalInput(contrato.data_fim),
          estacao_origem_viatura_id: contrato.estacao_origem_viatura_id,
          estado_operacional: contrato.estado_operacional,
          estado_financeiro: contrato.estado_financeiro,
          origem: contrato.origem,
          regime: contrato.regime,
          tarifa_diaria: contrato.tarifa_diaria,
          tarifa_id: (contrato as any).tarifa_id ?? null,
          desconto_percentagem: contrato.desconto_percentagem,
          taxa_iva: contrato.taxa_iva,
          valor_total_manual: contrato.valor_total_manual,
          is_longa_duracao: contrato.is_longa_duracao,
          renovacao_opcao: contrato.renovacao_opcao,
          renovacao_intervalo_dias: contrato.renovacao_intervalo_dias,
          franquia_valor: contrato.franquia_valor,
          caucao_valor: contrato.caucao_valor,
          kms_incluidos: contrato.kms_incluidos,
          km_adicional_valor: contrato.km_adicional_valor,
          voucher_codigo: contrato.voucher_codigo ?? '',
          observacoes: contrato.observacoes ?? '',
          observacoes_internas: contrato.observacoes_internas ?? '',
          // As listas m:n vivem nos efeitos próprios logo abaixo (só voltam a
          // correr quando a SUA query muda): repetem-se aqui as que já estão no
          // formulário para uma re-hidratação não as apagar.
          condutores: form.getValues('condutores'),
          coberturas: form.getValues('coberturas'),
          extras: form.getValues('extras'),
          taxas: form.getValues('taxas'),
        },
        opcoesReset
      );
      return;
    }
    if (!isEdit && reservaFromQuery) {
      if (reservaFromQuery.regime === 'slot') {
        toast({
          title: 'Regime slot não gera contrato de aluguer',
          description:
            'Usa "Gerar Contrato de Prestação" na reserva slot — não há contrato_renting.',
          variant: 'destructive',
        });
        navigate(`/renting/reservas/${reservaFromQuery.id}`);
        return;
      }
      if (!reservaFromQuery.viatura_id) {
        toast({
          title: 'Reserva sem viatura selecionada',
          description: 'Seleciona uma viatura na reserva e guarda antes de criar o contrato.',
          variant: 'destructive',
        });
        navigate(`/renting/reservas/${reservaFromQuery.id}`);
        return;
      }
      if (condutoresDaReserva === undefined) return;
      // Fallback do grupo (reserva antiga/sem `grupo` gravado) — resolve a
      // partir da viatura. Se a viatura já carregou e tem grupo_id mas a
      // lista `grupos` ainda não chegou, NÃO marca como hidratado: tenta de
      // novo no próximo render, senão o grupo ficava vazio para sempre
      // (bloqueia tarifa/preço) por uma corrida de carregamento.
      let grupoResolvido = reservaFromQuery.grupo ?? '';
      const viaturaReserva = viaturas.find((v) => v.id === reservaFromQuery.viatura_id);
      if (!grupoResolvido) {
        if (viaturaReserva?.grupo_id) {
          const g = grupos.find((gr) => gr.id === viaturaReserva.grupo_id);
          if (!g) return; // grupos ainda a carregar — tenta de novo
          grupoResolvido = g.nome;
        }
      }
      // Fallback do emissor (mesma lógica de aplicarDadosViatura): se a
      // reserva não trouxe emissor, usa o da viatura em vez de deixar vazio.
      const emissorResolvido = reservaFromQuery.emissor_id ?? viaturaReserva?.emissor_id ?? '';
      hidratadoDeRef.current = { fonte, condutores: condutoresFonte };
      form.reset(
        {
          ...DEFAULT_CONTRATO_VALUES,
          reserva_id: reservaFromQuery.id,
          cliente_id: reservaFromQuery.cliente_id ?? '',
          emissor_id: emissorResolvido,
          gestor_id: reservaFromQuery.gestor_id ?? null,
          viatura_id: reservaFromQuery.viatura_id ?? '',
          matricula: reservaFromQuery.matricula ?? '',
          grupo: grupoResolvido,
          estacao_entrega_id: reservaFromQuery.estacao_entrega_id,
          estacao_recolha_id: reservaFromQuery.estacao_recolha_id,
          data_inicio: isoToLocalInput(reservaFromQuery.data_inicio),
          data_fim:
            reservaFromQuery.regime === 'tvde' ? '' : isoToLocalInput(reservaFromQuery.data_fim),
          origem: 'sistema',
          regime: reservaFromQuery.regime,
          tarifa_id: (reservaFromQuery as any).tarifa_id ?? null,
          // O override manual manda sobre o valor efectivo. Em teoria são o
          // mesmo número (`valor_total` é definido como "o manual quando
          // existe"), mas as reservas gravadas enquanto o formulário passava o
          // campo errado ao cálculo da base ficaram com um `valor_total`
          // desactualizado e um `valor_total_manual` correcto. Ler primeiro o
          // manual faz essas converterem-se com o preço certo, sem ninguém ter
          // de lhes tocar.
          valor_total_manual: reservaFromQuery.valor_total_manual ?? reservaFromQuery.valor_total,
          is_longa_duracao: reservaFromQuery.is_longa_duracao ?? false,
          renovacao_opcao: reservaFromQuery.renovacao_opcao ?? null,
          renovacao_intervalo_dias: reservaFromQuery.renovacao_intervalo_dias,
          franquia_valor: reservaFromQuery.franquia_valor,
          caucao_valor: reservaFromQuery.caucao_valor,
          kms_incluidos: reservaFromQuery.kms_incluidos,
          km_adicional_valor: reservaFromQuery.km_adicional_valor,
          observacoes: reservaFromQuery.observacoes ?? '',
          observacoes_internas: reservaFromQuery.observacoes_internas ?? '',
          // O IVA nunca vem da reserva: é derivado do regime + definições da
          // organização por um efeito à parte, que só volta a correr quando o
          // regime muda. Repetir o valor actual impede que uma re-hidratação o
          // devolva ao 23 % de DEFAULT_CONTRATO_VALUES sem ninguém o recalcular.
          taxa_iva: form.getValues('taxa_iva'),
          // Coberturas/extras/taxas não têm origem na reserva (nem efeito que
          // as volte a encher aqui): preserva-se o que o utilizador já montou.
          coberturas: form.getValues('coberturas'),
          extras: form.getValues('extras'),
          taxas: form.getValues('taxas'),
          condutores: condutoresDaReserva
            .filter((c) => c.cliente_id || c.motorista_id)
            .map((c) => ({
              cliente_id: c.cliente_id,
              motorista_id: c.motorista_id,
              is_principal: c.is_principal,
            })),
        },
        opcoesReset
      );
    }
  }, [
    isEdit,
    contrato,
    reservaFromQuery,
    condutoresDaReserva,
    viaturas,
    grupos,
    navigate,
    toast,
    form,
  ]);

  // Hydration das relações m:n — TEM de ser `form.reset(...)` (keepDirtyValues),
  // NÃO um `replace()` de instância-pai de useFieldArray nem `setValue`. Os
  // componentes que desenham estas listas (CondutoresFields / ContratoTab
  // {Cobertura,Extras,Taxas}) têm o SEU PRÓPRIO useFieldArray com o mesmo nome;
  // duas instâncias de useFieldArray no mesmo campo NÃO sincronizam entre si —
  // um replace() no pai atualiza o valor do form mas a cópia interna do filho
  // (o que é desenhado) fica vazia (o item existia mas invisível, só reaparecia
  // ao adicionar um manualmente). Só `form.reset` re-inicializa TODAS as
  // instâncias de uma vez. keepDirtyValues preserva o que já foi editado.
  useEffect(() => {
    if (!isEdit || !contrato || !condutoresDb) return;
    form.reset(
      {
        ...form.getValues(),
        condutores: condutoresDb.map((c) => ({
          cliente_id: c.cliente_id,
          motorista_id: c.motorista_id,
          is_principal: c.is_principal,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, contrato, condutoresDb, form]);

  // Hydration: coberturas
  useEffect(() => {
    if (!isEdit || !contrato || !coberturasDb) return;
    form.reset(
      {
        ...form.getValues(),
        coberturas: coberturasDb.map((c) => ({
          cobertura_id: c.cobertura_id,
          cobertura_nome: c.cobertura_nome,
          preco_dia: c.preco_dia,
          franquia_valor: c.franquia_valor,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, contrato, coberturasDb, form]);

  // Hydration: extras
  useEffect(() => {
    if (!isEdit || !contrato || !extrasDb) return;
    form.reset(
      {
        ...form.getValues(),
        extras: extrasDb.map((e) => ({
          extra_id: e.extra_id,
          extra_nome: e.extra_nome,
          preco_unidade: e.preco_unidade,
          tipo_calculo: e.tipo_calculo,
          quantidade: e.quantidade,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, contrato, extrasDb, form]);

  // Hydration: taxas
  useEffect(() => {
    if (!isEdit || !contrato || !taxasDb) return;
    form.reset(
      {
        ...form.getValues(),
        taxas: taxasDb.map((t) => ({
          taxa_id: t.taxa_id,
          taxa_nome: t.taxa_nome,
          percentagem: t.percentagem,
          valor_fixo: t.valor_fixo,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, contrato, taxasDb, form]);

  // ── Reactive values ───────────────────────────────────────────
  const viaturaId = form.watch('viatura_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const tarifaDiaria = form.watch('tarifa_diaria');
  const valorTotalManual = form.watch('valor_total_manual');
  const descontoPercentagem = form.watch('desconto_percentagem');
  const regime = form.watch('regime');
  const tarifaIdWatch = form.watch('tarifa_id');
  const isLongaDuracao = form.watch('is_longa_duracao');
  const rawTaxaIva = form.watch('taxa_iva');
  const taxaIva = regime === 'tvde' || regime === 'slot' ? 0 : rawTaxaIva;
  const coberturasForm = form.watch('coberturas');
  const extrasForm = form.watch('extras') as ExtraFormItem[];
  const taxasForm = form.watch('taxas') as TaxaFormItem[];
  const condutoresWatch = form.watch('condutores');

  const condutoresRascunho = useMemo(() => {
    if (!condutoresWatch?.length) return [];
    return condutoresWatch.filter((c) => {
      if (!c.motorista_id) return false;
      return motoristas.find((m) => m.id === c.motorista_id)?.perfil_rascunho === true;
    });
  }, [condutoresWatch, motoristas]);

  // IVA derivado do regime. Nunca é editável no formulário — sai sempre do
  // regime + taxas da organização —, mas `taxa_iva` continua a ser calculado
  // aqui e gravado normalmente no submit.
  useEffect(() => {
    const modalidade = regime === 'tvde' ? 'tvde' : 'rent_a_car';
    form.setValue('taxa_iva', ivaParaModalidade(orgDefinicoes, modalidade), {
      shouldDirty: false,
    });
  }, [regime, orgDefinicoes, form]);

  // Auto-preenchimento km/franquia/caução ao escolher tarifa+viatura. Só
  // preenche campos ainda VAZIOS — nunca sobrescreve um valor já gravado ou
  // editado manualmente. Sem esta guarda, este efeito também dispara quando
  // `viaturas`/`precosModeloTvde` (listas assíncronas) chegam DEPOIS da
  // hidratação inicial, apagando franquia/caução/kms negociados à parte.
  useEffect(() => {
    if (regime === 'slot' || !tarifaIdWatch || !viaturaId) return;
    const via = viaturas.find((v) => v.id === viaturaId);
    if (!via?.modelo_id) return;
    const linha = precosModeloTvde.find(
      (p) => p.tarifa_id === tarifaIdWatch && p.modelo_id === via.modelo_id
    );
    if (!linha) return;
    const isTvdeReg = regime === 'tvde';
    fillEmptyFormFields(form, {
      kms_incluidos: isTvdeReg ? linha.km_mensal : linha.km_mensal_iva,
      km_adicional_valor: isTvdeReg ? linha.km_adicional_valor : linha.km_adicional_valor_iva,
      franquia_valor: isTvdeReg ? linha.franquia_valor : linha.franquia_valor_iva,
      caucao_valor: isTvdeReg ? linha.caucao_valor : linha.caucao_valor_iva,
    });
  }, [tarifaIdWatch, viaturaId, regime, viaturas, precosModeloTvde, form]);

  // ── Viaturas disponíveis ──────────────────────────────────────
  const { data: viaturasOcupadas } = useViaturasOcupadasPeriodo({
    dataInicio,
    dataFim,
    excluirContratoId: isEdit ? id : null,
    excluirReservaId: reservaIdActiva,
  });

  const viaturasParaSelecao = viaturas.filter((v) => {
    if (v.id === viaturaId) return true;
    if (viaturasOcupadas?.has(v.id)) return false;
    if (regime === 'tvde') return !!v.modelo_id && !!modelosElegiveisTvde?.has(v.modelo_id);
    return true;
  });

  // ── aplicarDadosViatura ───────────────────────────────────────
  const aplicarDadosViatura = (viaturaIdNova: string) => {
    const via = viaturas.find((x) => x.id === viaturaIdNova);
    if (!via) return;

    const grupo = via.grupo_id ? grupos.find((g) => g.id === via.grupo_id) : null;
    form.setValue('grupo', grupo?.nome ?? '', { shouldDirty: true });

    if (via.emissor_id && !form.getValues('emissor_id')) {
      form.setValue('emissor_id', via.emissor_id, { shouldDirty: true });
    }

    const ms = new Date(dataFim).getTime() - new Date(dataInicio).getTime();
    const dias = Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 86400000)) : null;

    const isTvdeReg = regime === 'tvde';
    const tarifaSelId = form.getValues('tarifa_id');
    const linha =
      tarifaSelId && via.modelo_id
        ? (precosModeloTvde.find(
            (p) => p.tarifa_id === tarifaSelId && p.modelo_id === via.modelo_id
          ) ?? null)
        : null;
    const cobre = isTvdeReg ? linha?.preco_semana != null : linha?.preco_dia != null;
    if (tarifaSelId && via.modelo_id && !cobre) {
      form.setValue('tarifa_id', null, { shouldDirty: true });
    }

    const tarifaSel = tarifas.find((t) => t.id === tarifaSelId) ?? null;
    const fat = calcularFaturacaoRenting(
      regime,
      isLongaDuracao,
      dias,
      tarifaSel,
      isTvdeReg ? (linha?.preco_semana ?? null) : null,
      !isTvdeReg ? (linha?.preco_dia ?? null) : null,
      !isTvdeReg ? (linha?.preco_mes ?? null) : null
    );
    if (fat) form.setValue('valor_total_manual', fat.valor, { shouldDirty: true });
  };

  // ── Coberturas preço/dia ──────────────────────────────────────
  const coberturasPrecoDia = useMemo(
    () => (coberturasForm ?? []).reduce((soma, c) => soma + (c.preco_dia ?? 0), 0),
    [coberturasForm]
  );

  // ── Realização pendente ───────────────────────────────────────
  // NOTA: propositadamente NÃO depende do estado financeiro — a fatura
  // congela os valores fiscais (por trigger), não o ciclo operacional.
  // Havia um guard `!isFacturado` aqui que, no fluxo "criar + faturar à
  // cabeça", escondia para sempre a única forma de confirmar a entrega
  // (ex.: #611 BL-60-FQ ficou preso em "Agendado" com o carro na rua).
  // Regra + teste sentinela: realizacaoPendente.ts / realizacaoPendente.test.ts.
  const tipoEventoEsperado = tipoRealizacaoPendenteEsperada(contrato);

  const { data: eventoPendente, isFetching: fetchingEventoPendente } = useQuery({
    queryKey: ['calendario-evento-pendente', contrato?.id ?? null, tipoEventoEsperado],
    queryFn: async () => {
      if (!contrato || !tipoEventoEsperado) return null;
      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('id, tipo')
        .eq('origem_tipo', 'contrato_renting')
        .eq('origem_id', contrato.id)
        .eq('tipo', tipoEventoEsperado)
        .is('realizado_em', null)
        .maybeSingle();
      if (error || !data) return null;
      return { id: data.id as string, tipo: data.tipo as 'entrega' | 'recolha' };
    },
    enabled: isEdit && !!contrato && !!tipoEventoEsperado,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const realizacaoPendente =
    !fetchingEventoPendente && !!eventoPendente && !contrato?.substituido_em
      ? eventoPendente
      : null;

  const abriuEntregaAoCriarRef = useRef(false);
  useEffect(() => {
    if (abriuEntregaAoCriarRef.current) return;
    if (searchParams.get('criado') !== '1') return;
    if (!realizacaoPendente || realizacaoPendente.tipo !== 'entrega') return;
    abriuEntregaAoCriarRef.current = true;
    setRealizarDialog({ eventoId: realizacaoPendente.id, tipo: 'entrega' });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('criado');
        return next;
      },
      { replace: true }
    );
  }, [realizacaoPendente, searchParams, setSearchParams]);

  // ── Conflito ──────────────────────────────────────────────────
  const conflitoArgs = useMemo(() => {
    const di = dataInicio ? new Date(dataInicio) : null;
    const df = dataFim ? new Date(dataFim) : null;
    return {
      viaturaId: viaturaId || null,
      dataInicio: di && !Number.isNaN(di.getTime()) ? di : null,
      dataFim: df && !Number.isNaN(df.getTime()) ? df : null,
      excluirId: contrato?.id ?? null,
      reservaId: form.watch('reserva_id') ?? null,
    };
  }, [viaturaId, dataInicio, dataFim, contrato?.id, form]);

  const { data: temConflito } = useContratoConflito(conflitoArgs);

  // ── Grupo atual para ContratoFormSecoes ────────────────────────
  const grupoIdAtual = contrato
    ? (viaturas.find((v) => v.id === contrato.viatura_id)?.grupo_id ?? null)
    : null;

  // ── detectarAlteracoesMateriais ─────────────────────────────────
  // Só a troca de viatura justifica uma nova versão (fecho formal +
  // contrato novo) — preço/desconto/IVA/valor total são só uma correção
  // do MESMO contrato e devem gravar direto por UPDATE, sem versionar.
  const detectarAlteracoesMateriais = (values: ContratoFormValues): AlteracaoMaterial[] => {
    if (!contrato) return [];
    const result: AlteracaoMaterial[] = [];

    if (values.viatura_id !== contrato.viatura_id) {
      const antes = viaturas.find((v) => v.id === contrato.viatura_id)?.matricula ?? '—';
      const depois = viaturas.find((v) => v.id === values.viatura_id)?.matricula ?? '—';
      result.push({ label: 'Viatura', valorAntes: antes, valorDepois: depois });

      const grupoAntes = contrato.grupo ?? '—';
      const grupoDepois = values.grupo ?? '—';
      if (grupoAntes !== grupoDepois) {
        const gAntes = grupos.find((g) => g.nome === grupoAntes);
        const gDepois = grupos.find((g) => g.nome === grupoDepois);
        const tAntes = gAntes ? tarifas.find((t) => t.grupo_id === gAntes.id) : null;
        const tDepois = gDepois ? tarifas.find((t) => t.grupo_id === gDepois.id) : null;
        let direcao = 'upgrade/downgrade';
        if (tAntes?.preco_dia != null && tDepois?.preco_dia != null) {
          direcao = tDepois.preco_dia > tAntes.preco_dia ? 'upgrade' : 'downgrade';
        }
        result.push({
          label: `Grupo (${direcao})`,
          valorAntes: grupoAntes,
          valorDepois: grupoDepois,
        });
      }
    }

    return result;
  };

  // ── onInvalid ──────────────────────────────────────────────────
  const onInvalid = (errors: FieldErrors<ContratoFormValues>) => {
    const camposComErro = Object.keys(errors) as Array<keyof ContratoFormValues>;
    const tabDoErro = camposComErro.map((campo) => FIELD_TAB_MAP[campo] ?? 'geral')[0] ?? 'geral';
    setActiveTab(tabDoErro);
    toast({
      title: 'Verifica os campos obrigatórios',
      description: `Há campos por preencher ou inválidos no separador "${TAB_LABELS[tabDoErro]}".`,
      variant: 'destructive',
    });
  };

  // ── onSubmit ──────────────────────────────────────────────────
  const onSubmit = (values: ContratoFormValues) => {
    if (values.regime !== 'slot' && values.tarifa_id) {
      const via = viaturas.find((v) => v.id === values.viatura_id);
      if (via?.modelo_id) {
        const isTvdeReg = values.regime === 'tvde';
        const linha = precosModeloTvde.find(
          (p) => p.tarifa_id === values.tarifa_id && p.modelo_id === via.modelo_id
        );
        const temPreco = isTvdeReg ? linha?.preco_semana != null : linha?.preco_dia != null;
        if (!temPreco) {
          toast({
            title: isTvdeReg
              ? 'Modelo sem preço na tarifa TVDE'
              : 'Modelo sem preço na tarifa Rent-a-Car',
            description:
              'A viatura não tem preço definido na tarifa escolhida. Define o preço do modelo na tarifa (Renting → Tarifas) ou ajusta a reserva.',
            variant: 'destructive',
          });
          return;
        }
      }
    }

    if (!isEdit && reservaAssociada && values.viatura_id !== reservaAssociada.viatura_id) {
      toast({
        title: 'Viatura divergente da reserva',
        description:
          'A viatura inicial do contrato tem de ser a mesma da reserva. Edita primeiro a reserva.',
        variant: 'destructive',
      });
      return;
    }

    if (isEdit && contrato && contrato.substituido_em === null) {
      const alteracoes = detectarAlteracoesMateriais(values);
      if (alteracoes.length > 0) {
        setNovaVersaoCtx({ alteracoes, valores: values });
        return;
      }
    }

    const viatura = viaturas.find((v) => v.id === values.viatura_id);
    const matriculaFinal = values.matricula || viatura?.matricula || null;

    const payload: ContratoRentingInsert = {
      reserva_id: values.reserva_id,
      cliente_id: values.cliente_id,
      emissor_id: values.emissor_id,
      gestor_id: values.gestor_id ?? null,
      viatura_id: values.viatura_id,
      matricula: matriculaFinal,
      grupo: values.grupo || null,
      estacao_entrega_id: values.estacao_entrega_id || null,
      data_inicio: localInputToIso(values.data_inicio),
      estacao_recolha_id: values.estacao_recolha_id || null,
      data_fim:
        values.regime === 'tvde' && !values.is_longa_duracao
          ? null
          : localInputToIso(values.data_fim ?? ''),
      estacao_origem_viatura_id: values.estacao_origem_viatura_id || null,
      estado_operacional: values.estado_operacional,
      estado_financeiro: values.estado_financeiro,
      origem: values.origem,
      regime: values.regime,
      tarifa_diaria: values.tarifa_diaria,
      tarifa_id: values.tarifa_id ?? null,
      desconto_percentagem: values.desconto_percentagem,
      taxa_iva: values.taxa_iva,
      valor_total_manual: values.valor_total_manual,
      is_longa_duracao: values.is_longa_duracao,
      renovacao_opcao: values.renovacao_opcao ?? null,
      renovacao_intervalo_dias: values.renovacao_intervalo_dias,
      franquia_valor: values.franquia_valor,
      caucao_valor: values.caucao_valor,
      kms_incluidos: values.kms_incluidos,
      km_adicional_valor: values.km_adicional_valor,
      voucher_codigo: values.voucher_codigo || null,
      observacoes: values.observacoes || null,
      observacoes_internas: values.observacoes_internas || null,
    };

    const msDia = 86400000;
    const diasContrato =
      values.regime === 'tvde' || !values.data_fim
        ? Math.max(1, values.renovacao_intervalo_dias ?? 30)
        : Math.max(
            1,
            Math.ceil(
              (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) / msDia
            )
          );

    const isTvdeSub = values.regime === 'tvde';
    const linhaModeloSub =
      values.tarifa_id && viatura?.modelo_id
        ? (precosModeloTvde.find(
            (p) => p.tarifa_id === values.tarifa_id && p.modelo_id === viatura.modelo_id
          ) ?? null)
        : null;
    const baseAluguer = calcularBaseAluguerRenting({
      regime: values.regime,
      isLongaDuracao: values.is_longa_duracao,
      dias: diasContrato,
      tarifa: values.tarifa_id
        ? (tarifas.find((t) => t.id === values.tarifa_id) ?? null)
        : (tarifas.find((t) => t.grupo_id === values.grupo) ?? null),
      valorTotalManual: values.valor_total_manual,
      precoModeloSemana: isTvdeSub ? (linhaModeloSub?.preco_semana ?? null) : null,
      precoModeloDia: !isTvdeSub ? (linhaModeloSub?.preco_dia ?? null) : null,
      precoModeloMes: !isTvdeSub ? (linhaModeloSub?.preco_mes ?? null) : null,
    });
    const custoCoberturas =
      values.coberturas.reduce((soma, c) => soma + (c.preco_dia ?? 0), 0) * diasContrato;

    const condutores = values.condutores as CondutorFormItem[];
    const coberturas = values.coberturas as CoberturaFormItem[];
    const extras = values.extras as ExtraFormItem[];
    const taxas = values.taxas as TaxaFormItem[];

    const custoExtras = extras.reduce((soma, e) => soma + calcExtraTotal(e, diasContrato), 0);
    const subtotalBruto = baseAluguer + custoCoberturas + custoExtras;
    const subtotalTaxas = subtotalBruto * (1 - (values.desconto_percentagem ?? 0) / 100);

    const syncRelacoes = async (contratoId: string): Promise<boolean> => {
      const resultados = await Promise.allSettled([
        syncCondutoresMutation.mutateAsync({ contratoId, desejados: condutores }),
        syncCoberturasMutation.mutateAsync({ contratoId, desejadas: coberturas }),
        syncExtrasMutation.mutateAsync({ contratoId, desejados: extras, dias: diasContrato }),
        syncTaxasMutation.mutateAsync({ contratoId, desejadas: taxas, subtotal: subtotalTaxas }),
      ]);
      const falhas = resultados.filter((r) => r.status === 'rejected').length;
      if (falhas > 0) {
        toast({
          title: 'Contrato gravado com sincronização parcial',
          description: `${falhas} de 4 listas (condutores/coberturas/extras/taxas) falharam ao gravar. Reabre o contrato e grava de novo para corrigir.`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    };

    if (isEdit && contrato) {
      updateMutation.mutate(
        { id: contrato.id, ...payload, gestor_id: values.gestor_id ?? null },
        { onSuccess: () => void syncRelacoes(contrato.id) }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: async (created) => {
          await syncRelacoes(created.id);
          navigate(`/renting/contratos/${created.id}?criado=1`);
        },
      });
    }
  };

  // ── confirmarNovaVersao ────────────────────────────────────────
  const confirmarNovaVersao = (motivo: string, dataTrocaIso?: string) => {
    if (!contrato || !novaVersaoCtx) return;
    const motivoFinal =
      motivo ||
      novaVersaoCtx.alteracoes
        .map((a) => `${a.label}: ${a.valorAntes} → ${a.valorDepois}`)
        .join('; ');
    criarVersaoMutation.mutate(
      {
        contratoId: contrato.id,
        motivo: motivoFinal,
        dataTroca: dataTrocaIso,
        // A viatura nova vai já na criação da versão. Deixá-la para o update
        // seguinte fazia o sucessor nascer com a viatura ANTIGA em estado
        // 'agendado' — a reocupar a viatura que a troca acabou de libertar, e
        // a colidir com contratos_no_overbooking se entretanto alguém a tinha
        // alugado. Era esse o segundo erro do #577.
        viaturaId: novaVersaoCtx.valores.viatura_id,
      },
      {
        onSuccess: (novaId) => {
          const values = novaVersaoCtx.valores;
          const viatura = viaturas.find((v) => v.id === values.viatura_id);
          const matriculaFinal = values.matricula || viatura?.matricula || null;
          // Nada é recalculado aqui. criar_versao_contrato_renting já copiou
          // condutores, coberturas, extras e taxas do contrato antigo, tal e
          // qual — numa troca as condições transitam, não se refazem.
          //
          // Re-sincronizá-las a seguir, como se fazia, tinha dois defeitos: o
          // `dias` era medido a partir do início ORIGINAL do contrato, e o elo
          // novo passou a começar na data da TROCA — num rent-a-car de 30 dias
          // trocado ao dia 20, extras e coberturas eram cobrados sobre 30 dias
          // em vez de 10. E era trabalho a desfazer o que a base já fizera bem.

          updateMutation.mutate(
            {
              id: novaId,
              reserva_id: values.reserva_id,
              cliente_id: values.cliente_id,
              emissor_id: values.emissor_id,
              gestor_id: values.gestor_id ?? null,
              viatura_id: values.viatura_id,
              matricula: matriculaFinal,
              grupo: values.grupo || null,
              estacao_entrega_id: values.estacao_entrega_id || null,
              // data_inicio, estado_operacional e estado_financeiro NÃO vão aqui
              // de propósito. Quem os define é criar_versao_contrato_renting:
              //   · data_inicio        = data da troca (abre a fronteira temporal);
              //   · estado_operacional = 'agendado' (a entrega da viatura NOVA
              //     está por fazer — é o que faz o contrato pedir a folha de
              //     ENTREGA em vez de uma recolha);
              //   · estado_financeiro  = 'pendente' (a facturação recomeça neste elo).
              // Reenviá-los aqui era sobrepor os três com os valores hidratados
              // do contrato ANTIGO e desfazer a troca acabada de fazer.
              estacao_recolha_id: values.estacao_recolha_id || null,
              data_fim:
                values.regime === 'tvde' && !values.is_longa_duracao
                  ? null
                  : localInputToIso(values.data_fim ?? ''),
              estacao_origem_viatura_id: values.estacao_origem_viatura_id || null,
              origem: values.origem,
              regime: values.regime,
              tarifa_diaria: values.tarifa_diaria,
              tarifa_id: values.tarifa_id ?? null,
              desconto_percentagem: values.desconto_percentagem,
              taxa_iva: values.taxa_iva,
              valor_total_manual: values.valor_total_manual,
              is_longa_duracao: values.is_longa_duracao,
              renovacao_opcao: values.renovacao_opcao ?? null,
              renovacao_intervalo_dias: values.renovacao_intervalo_dias,
              franquia_valor: values.franquia_valor,
              caucao_valor: values.caucao_valor,
              kms_incluidos: values.kms_incluidos,
              km_adicional_valor: values.km_adicional_valor,
              voucher_codigo: values.voucher_codigo || null,
              observacoes: values.observacoes || null,
              observacoes_internas: values.observacoes_internas || null,
            },
            {
              onSuccess: () => {
                setNovaVersaoCtx(null);
                // `criado=1` é a condição que abre o RealizarEntregaDialog no
                // contrato novo (ver o efeito de `abriuEntregaAoCriarRef`).
                // Sem ele, a folha de danos de ENTREGA da viatura nova não era
                // pedida a ninguém: o gestor era largado no contrato novo sem
                // qualquer indicação de que faltava fazer o handover.
                navigate(`/renting/contratos/${novaId}?criado=1`);
              },
            }
          );
        },
      }
    );
  };

  // ── Return ────────────────────────────────────────────────────
  return {
    isEdit,
    id,
    clientes,
    motoristas,
    empresas,
    viaturas,
    estacoes,
    coberturas,
    extrasCatalogo,
    taxasCatalogo,
    grupos,
    tarifas,
    precosModeloTvde,
    modelosElegiveisTvde,
    orgDefinicoes,
    contrato,
    loadingContrato,
    vizinhos,
    reservaAssociada,
    viaturaLocked,
    condutoresDb,
    coberturasDb,
    extrasDb,
    taxasDb,
    form,
    isPending,
    activeTab,
    setActiveTab,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    confirmCancelOpen,
    setConfirmCancelOpen,
    podeCancelar: !!contrato && !contrato.substituido_em,
    clienteDialogOpen,
    setClienteDialogOpen,
    motoristaDialogOpen,
    setMotoristaDialogOpen,
    novaVersaoCtx,
    setNovaVersaoCtx,
    realizarDialog,
    setRealizarDialog,
    docsDialogOpen,
    setDocsDialogOpen,
    viaturasParaSelecao,
    realizacaoPendente,
    condutoresRascunho,
    temConflito: !!temConflito,
    dataInicio,
    dataFim,
    tarifaDiaria,
    valorTotalManual,
    descontoPercentagem,
    regime,
    tarifaIdWatch,
    isLongaDuracao,
    taxaIva,
    coberturasPrecoDia,
    extrasForm,
    taxasForm,
    grupoIdAtual,
    aplicarDadosViatura,
    handleSubmit: form.handleSubmit(onSubmit, onInvalid),
    handleDelete,
    confirmDelete,
    handleCancelar,
    confirmCancelar,
    confirmarNovaVersao,
    handleClienteCriado,
    handleMotoristaCriado,
  };
}
