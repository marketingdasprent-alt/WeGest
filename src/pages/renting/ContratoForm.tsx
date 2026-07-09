import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
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
  useDeleteContratoRenting,
  useMarcarRealizacaoDireta,
  useUpdateContratoRenting,
} from '@/hooks/useContratosRenting';
import { useEstacoes } from '@/hooks/useEstacoes';
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

import { ClienteDialog } from '@/components/renting/ClienteDialog';
import { MotoristaDialog } from '@/components/motoristas/MotoristaDialog';

import { ContratoDocumentosDialog } from '@/components/renting/contratos/ContratoDocumentosDialog';
import { ContratoDeleteConfirm } from '@/components/renting/contratos/ContratoDeleteConfirm';
import { ContratoEstadoActions } from '@/components/renting/contratos/ContratoEstadoActions';
import { ContratoFormSecoes } from '@/components/renting/contratos/ContratoFormSecoes';
import {
  ContratoNovaVersaoDialog,
  type AlteracaoMaterial,
} from '@/components/renting/contratos/ContratoNovaVersaoDialog';
import { ContratoTabHistorico } from '@/components/renting/contratos/ContratoTabHistorico';
import { RealizarEntregaDialog } from '@/components/renting/contratos/RealizarEntregaDialog';
import { ContratoTabAnexos } from '@/components/renting/contratos/ContratoTabAnexos';
import { ContratoTabDanos } from '@/components/renting/contratos/ContratoTabDanos';
import { ContratoTabCobertura } from '@/components/renting/contratos/ContratoTabCobertura';
import { ContratoTabExtras } from '@/components/renting/contratos/ContratoTabExtras';
import { ContratoTabTaxas } from '@/components/renting/contratos/ContratoTabTaxas';
import { ContratoTabsPlaceholder } from '@/components/renting/contratos/ContratoTabsPlaceholder';
import { ContratoTabFaturar } from '@/components/renting/contratos/ContratoTabFaturar';
import { ResumoContrato } from '@/components/renting/contratos/ResumoContrato';
import { HistoricoEdicoesContrato } from '@/components/renting/contratos/HistoricoEdicoesContrato';
import {
  DEFAULT_CONTRATO_VALUES,
  contratoFormSchema,
  isoToLocalInput,
  localInputToIso,
  type ContratoFormValues,
} from '@/components/renting/contratos/contratoForm.schema';

import type {
  CoberturaFormItem,
  ContratoRentingInsert,
  ExtraFormItem,
  TaxaFormItem,
} from '@/types/contratoRenting';
import type { CondutorFormItem } from '@/types/reserva';

const ContratoForm = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = !!id;

  // Server state
  const { data: clientes = [] } = useClientes();
  const { data: motoristas = [] } = useMotoristas({ apenasAtivos: true });
  const { empresas } = useClientesEmpresas();
  const { data: viaturas = [] } = useViaturas();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: coberturas = [] } = useRentingCoberturas({ apenasAtivas: true });
  const { data: extrasCatalogo = [] } = useRentingExtras({ apenasAtivos: true });
  const { data: taxasCatalogo = [] } = useRentingTaxas({ apenasAtivas: true });
  // Grupos/tarifas — para recalcular grupo + preço ao trocar de viatura no contrato.
  const { data: grupos = [] } = useRentingGruposMin();
  const { data: tarifas = [] } = useRentingTarifasMin();
  const { data: precosModeloTvde = [] } = useRentingTarifaPrecosModelo();
  const { data: modelosElegiveisTvde } = useModelosElegiveisTvde();
  const { data: orgDefinicoes } = useOrgDefinicoes();
  const { data: contrato, isLoading: loadingContrato } = useContratoRenting(id ?? null);
  const { data: vizinhos } = useContratoVizinhos(contrato?.codigo ?? null);

  // Garante que a hidratação reserva→contrato (form.reset) só corre UMA vez —
  // senão um refetch da reserva volta a fazer reset e apaga edições/condutores.
  const hidratadoDaReserva = useRef(false);

  // Carrega reserva — em criação vem do query string, em edição vem do contrato.
  // Em ambos os casos é a fonte do `viatura_id` (campo bloqueado no formulário).
  const reservaIdFromQuery = searchParams.get('reserva_id');
  const reservaIdActiva = isEdit ? (contrato?.reserva_id ?? null) : reservaIdFromQuery;
  const { data: reservaFromQuery } = useReserva(!isEdit ? reservaIdFromQuery : null);
  const { data: reservaDoContrato } = useReserva(isEdit ? (contrato?.reserva_id ?? null) : null);
  const reservaAssociada = reservaFromQuery ?? reservaDoContrato;
  // Condutores da reserva — só precisamos quando estamos a criar contrato a
  // partir dela (a hidratação do contrato em modo edit usa condutoresDb).
  const { data: condutoresDaReserva } = useReservaCondutores(!isEdit ? reservaIdFromQuery : null);
  // Em criação: viatura vem da reserva (fixa o snapshot inicial).
  // Em edição: liberta-se — alterar viatura no contrato cria uma
  // nova versão (ver fluxo de versionamento).
  const viaturaLocked = !isEdit && !!reservaIdActiva;

  const createMutation = useCreateContratoRenting();
  const updateMutation = useUpdateContratoRenting();
  const deleteMutation = useDeleteContratoRenting();
  const criarVersaoMutation = useCriarVersaoContrato();
  const marcarRealizacaoDireta = useMarcarRealizacaoDireta();
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

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [motoristaDialogOpen, setMotoristaDialogOpen] = useState(false);
  /** Quando preenchido, dispara o dialog de confirmação de nova versão. */
  const [novaVersaoCtx, setNovaVersaoCtx] = useState<{
    alteracoes: AlteracaoMaterial[];
    valores: ContratoFormValues;
  } | null>(null);
  /** Dialog de realização (entrega/recolha). Aberto pelo botão do banner de
   *  "realização pendente" — nunca automaticamente (não bloquear a página). */
  const [realizarDialog, setRealizarDialog] = useState<{
    eventoId: string;
    tipo: 'entrega' | 'recolha';
  } | null>(null);
  /** Confirmação do atalho "marcar como já realizada" (sem fotos/km) —
   *  para contratos antigos/legado sem informação de check-in. */
  const [confirmarRealizacaoDireta, setConfirmarRealizacaoDireta] = useState(false);
  /** Dialog "Gerar Documentos" (checklist de templates → 1 PDF combinado). */
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);

  /** Adiciona um cliente recém-criado à lista de condutores (rent-a-car). */
  const handleClienteCriado = (clienteId: string) => {
    const existentes = (form.getValues('condutores') ?? []) as Array<{
      cliente_id: string | null;
      motorista_id: string | null;
      is_principal: boolean;
    }>;
    if (existentes.some((c) => c.cliente_id === clienteId)) return;
    form.setValue(
      'condutores',
      [
        ...existentes,
        { cliente_id: clienteId, motorista_id: null, is_principal: existentes.length === 0 },
      ],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  /** Adiciona um motorista recém-criado à lista de condutores (TVDE). */
  const handleMotoristaCriado = (motoristaId: string) => {
    const existentes = (form.getValues('condutores') ?? []) as Array<{
      cliente_id: string | null;
      motorista_id: string | null;
      is_principal: boolean;
    }>;
    if (existentes.some((c) => c.motorista_id === motoristaId)) return;
    form.setValue(
      'condutores',
      [
        ...existentes,
        { cliente_id: null, motorista_id: motoristaId, is_principal: existentes.length === 0 },
      ],
      { shouldDirty: true, shouldValidate: true }
    );
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

  // Guard: criar contrato sem reserva_id na URL → redireccionar para lista
  // (a lista abre o selector). Reserva é obrigatória.
  useEffect(() => {
    if (!isEdit && !reservaIdFromQuery) {
      navigate('/renting/contratos', { replace: true });
    }
  }, [isEdit, reservaIdFromQuery, navigate]);

  const form = useForm<ContratoFormValues>({
    resolver: zodResolver(contratoFormSchema),
    defaultValues: DEFAULT_CONTRATO_VALUES,
  });

  // Hidratação: contrato existente OU pré-preenchimento via reserva_id
  useEffect(() => {
    if (isEdit && contrato) {
      form.reset({
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
        // ALD
        is_longa_duracao: contrato.is_longa_duracao,
        renovacao_opcao: contrato.renovacao_opcao,
        renovacao_intervalo_dias: contrato.renovacao_intervalo_dias,
        // Financeiro extra
        franquia_valor: contrato.franquia_valor,
        caucao_valor: contrato.caucao_valor,
        kms_incluidos: contrato.kms_incluidos,
        km_adicional_valor: contrato.km_adicional_valor,
        voucher_codigo: contrato.voucher_codigo ?? '',
        observacoes: contrato.observacoes ?? '',
        observacoes_internas: contrato.observacoes_internas ?? '',
      });
      return;
    }
    if (!isEdit && reservaFromQuery) {
      // Slot não gera contrato_renting — fica só como reserva (o contrato é
      // o de prestação de serviços). Bloqueia a conversão e volta à reserva.
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
      // Reserva sem viatura — não pode gerar contrato. Redireciona com aviso.
      if (!reservaFromQuery.viatura_id) {
        toast({
          title: 'Reserva sem viatura selecionada',
          description: 'Seleciona uma viatura na reserva e guarda antes de criar o contrato.',
          variant: 'destructive',
        });
        navigate(`/renting/reservas/${reservaFromQuery.id}`);
        return;
      }
      // Espera pelos condutores da reserva (request separado) para os incluir no
      // mesmo reset — senão o reset apagava-os. `undefined` = ainda a carregar.
      if (condutoresDaReserva === undefined) return;
      // Só hidrata uma vez (um refetch da reserva não deve apagar edições).
      if (hidratadoDaReserva.current) return;
      hidratadoDaReserva.current = true;
      // Conversão reserva → contrato: copia TUDO o que faz sentido.
      // O orçamento da reserva (valor_total) torna-se valor_total_manual no contrato.
      form.reset({
        ...DEFAULT_CONTRATO_VALUES,
        reserva_id: reservaFromQuery.id,
        cliente_id: reservaFromQuery.cliente_id ?? '',
        // Emissor escolhido na reserva flui para o contrato.
        emissor_id: reservaFromQuery.emissor_id ?? '',
        // Herda o gestor da reserva; a BD usa auth.uid() como fallback se null.
        gestor_id: reservaFromQuery.gestor_id ?? null,
        viatura_id: reservaFromQuery.viatura_id ?? '',
        matricula: reservaFromQuery.matricula ?? '',
        grupo: reservaFromQuery.grupo ?? '',
        estacao_entrega_id: reservaFromQuery.estacao_entrega_id,
        estacao_recolha_id: reservaFromQuery.estacao_recolha_id,
        data_inicio: isoToLocalInput(reservaFromQuery.data_inicio),
        // TVDE não tem data de fim no contrato (aberto, renovação automática) —
        // mesmo que a reserva tenha uma data de fim inicial, o contrato não a herda.
        data_fim:
          reservaFromQuery.regime === 'tvde' ? '' : isoToLocalInput(reservaFromQuery.data_fim),
        origem: 'sistema',
        regime: reservaFromQuery.regime,
        // Tarifa escolhida na reserva flui para o contrato (essencial em TVDE).
        tarifa_id: (reservaFromQuery as any).tarifa_id ?? null,
        // Orçamento da reserva → override do total no contrato
        valor_total_manual: reservaFromQuery.valor_total,
        // ALD da reserva
        is_longa_duracao: reservaFromQuery.is_longa_duracao ?? false,
        renovacao_opcao: reservaFromQuery.renovacao_opcao ?? null,
        renovacao_intervalo_dias: reservaFromQuery.renovacao_intervalo_dias,
        // Financeiro extra da reserva
        franquia_valor: reservaFromQuery.franquia_valor,
        caucao_valor: reservaFromQuery.caucao_valor,
        kms_incluidos: reservaFromQuery.kms_incluidos,
        km_adicional_valor: reservaFromQuery.km_adicional_valor,
        observacoes: reservaFromQuery.observacoes ?? '',
        observacoes_internas: reservaFromQuery.observacoes_internas ?? '',
        // Condutores da reserva → passam para o contrato (persistidos no submit).
        condutores: condutoresDaReserva
          .filter((c) => c.cliente_id || c.motorista_id)
          .map((c) => ({
            cliente_id: c.cliente_id,
            motorista_id: c.motorista_id,
            is_principal: c.is_principal,
          })),
      });
    }
  }, [isEdit, contrato, reservaFromQuery, condutoresDaReserva, navigate, toast, form]);

  // Hidratação dos condutores em modo EDIT (vêm em request separado).
  useEffect(() => {
    if (!isEdit || !contrato || !condutoresDb) return;
    form.setValue(
      'condutores',
      condutoresDb.map((c) => ({
        cliente_id: c.cliente_id,
        motorista_id: c.motorista_id,
        is_principal: c.is_principal,
      })),
      { shouldDirty: false }
    );
  }, [isEdit, contrato, condutoresDb, form]);

  // (Os condutores da reserva são hidratados no reset acima, em conjunto com os
  //  restantes campos — evita corridas entre dois resets/setValue.)

  // Hidratação das coberturas (request separado — só em modo edit)
  useEffect(() => {
    if (!isEdit || !contrato || !coberturasDb) return;
    form.setValue(
      'coberturas',
      coberturasDb.map((c) => ({
        cobertura_id: c.cobertura_id,
        cobertura_nome: c.cobertura_nome,
        preco_dia: c.preco_dia,
        franquia_valor: c.franquia_valor,
      })),
      { shouldDirty: false }
    );
  }, [isEdit, contrato, coberturasDb, form]);

  // Hidratação dos extras (request separado — só em modo edit)
  useEffect(() => {
    if (!isEdit || !contrato || !extrasDb) return;
    form.setValue(
      'extras',
      extrasDb.map((e) => ({
        extra_id: e.extra_id,
        extra_nome: e.extra_nome,
        preco_unidade: e.preco_unidade,
        tipo_calculo: e.tipo_calculo,
        quantidade: e.quantidade,
      })),
      { shouldDirty: false }
    );
  }, [isEdit, contrato, extrasDb, form]);

  // Hidratação das taxas (request separado — só em modo edit)
  useEffect(() => {
    if (!isEdit || !contrato || !taxasDb) return;
    form.setValue(
      'taxas',
      taxasDb.map((t) => ({
        taxa_id: t.taxa_id,
        taxa_nome: t.taxa_nome,
        percentagem: t.percentagem,
        valor_fixo: t.valor_fixo,
      })),
      { shouldDirty: false }
    );
  }, [isEdit, contrato, taxasDb, form]);

  // Valores reactivos (conflito + resumo de preço)
  const viaturaId = form.watch('viatura_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const tarifaDiaria = form.watch('tarifa_diaria');
  const valorTotalManual = form.watch('valor_total_manual');
  const descontoPercentagem = form.watch('desconto_percentagem');
  const regime = form.watch('regime');
  const tarifaIdWatch = form.watch('tarifa_id');
  const isLongaDuracao = form.watch('is_longa_duracao');
  // TVDE e Slot já têm IVA incluído no preço — o resumo não aplica IVA adicional
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

  // O IVA não é editável no contrato — é derivado do regime
  // (rent-a-car / TVDE) e das taxas configuradas na organização.
  // 'slot' nunca gera contrato_renting; mapeamos para modalidade rent_a_car
  // por segurança de tipos (a função de IVA só conhece rent_a_car/tvde).
  useEffect(() => {
    const modalidade = regime === 'tvde' ? 'tvde' : 'rent_a_car';
    form.setValue('taxa_iva', ivaParaModalidade(orgDefinicoes, modalidade), {
      shouldDirty: false,
    });
  }, [regime, orgDefinicoes, form]);

  // Ao escolher tarifa+viatura, copia km incluídos / km extra / franquia da
  // linha do modelo na tarifa para os campos do contrato (editáveis pelo
  // gestor). TVDE usa as colunas base; Rent-a-Car usa as c/IVA.
  useEffect(() => {
    if (regime === 'slot' || !tarifaIdWatch || !viaturaId) return;
    const via = viaturas.find((v) => v.id === viaturaId);
    if (!via?.modelo_id) return;
    const linha = precosModeloTvde.find(
      (p) => p.tarifa_id === tarifaIdWatch && p.modelo_id === via.modelo_id
    );
    if (!linha) return;
    const isTvdeReg = regime === 'tvde';
    const kmIncl = linha.km_mensal;
    const kmExtra = isTvdeReg ? linha.km_adicional_valor : linha.km_adicional_valor_iva;
    const franquia = isTvdeReg ? linha.franquia_valor : linha.franquia_valor_iva;
    if (kmIncl != null) form.setValue('kms_incluidos', kmIncl, { shouldDirty: true });
    if (kmExtra != null) form.setValue('km_adicional_valor', kmExtra, { shouldDirty: true });
    if (franquia != null) form.setValue('franquia_valor', franquia, { shouldDirty: true });
  }, [tarifaIdWatch, viaturaId, regime, viaturas, precosModeloTvde, form]);

  // Os condutores PERSISTEM ao trocar de regime — não se apaga a lista (senão
  // "desapareciam" condutores já adicionados ou hidratados da reserva). A tabela
  // mostra clientes (rent-a-car) ou motoristas (TVDE) conforme o tipo de cada linha.

  // Viaturas ocupadas (reserva/contrato sobreposto) no período escolhido — para
  // não as oferecer a outro cliente nas mesmas datas. Ignora o próprio contrato e
  // a reserva que lhe deu origem (não conflitar consigo próprio).
  const { data: viaturasOcupadas } = useViaturasOcupadasPeriodo({
    dataInicio,
    dataFim,
    excluirContratoId: isEdit ? id : null,
    excluirReservaId: reservaIdActiva,
  });

  // Em TVDE, só viaturas cujo modelo é elegível (tipo de frota marcado como
  // elegível TVDE), tal como na frota; em Rent-a-Car, todas. Excluímos as
  // ocupadas no período, mantendo sempre a já selecionada.
  const viaturasParaSelecao = viaturas.filter((v) => {
    if (v.id === viaturaId) return true;
    if (viaturasOcupadas?.has(v.id)) return false;
    if (regime === 'tvde') return !!v.modelo_id && !!modelosElegiveisTvde?.has(v.modelo_id);
    return true;
  });

  // Ao trocar de viatura no contrato: recalcula o snapshot `grupo` e o preço a
  // partir do grupo da viatura nova. Isto é o que destrava a classificação
  // troca-vs-upgrade na cascata SQL (compara OLD.grupo com NEW.grupo) e mantém o
  // valor alinhado com o grupo. Valor negociado entra pelo campo desconto.
  // Espelha o aplicarDadosViatura da reserva (ReservaTabGeral). A matrícula é
  // tratada pelo próprio SectionViatura.
  const aplicarDadosViatura = (viaturaIdNova: string) => {
    const via = viaturas.find((x) => x.id === viaturaIdNova);
    if (!via) return;

    const grupo = via.grupo_id ? grupos.find((g) => g.id === via.grupo_id) : null;
    form.setValue('grupo', grupo?.nome ?? '', { shouldDirty: true });

    // Sugestão de empresa emissora a partir da viatura — só quando o campo
    // ainda estiver vazio, nunca sobrescreve uma escolha manual do gestor.
    if (via.emissor_id && !form.getValues('emissor_id')) {
      form.setValue('emissor_id', via.emissor_id, { shouldDirty: true });
    }

    const ms = new Date(dataFim).getTime() - new Date(dataInicio).getTime();
    const dias = Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 86400000)) : null;

    // A tarifa vem do form (tarifa_id) e o preço é por modelo da viatura, tanto
    // em TVDE (semanal) como em Rent-a-Car (diário/mensal). Se a tarifa atual
    // não cobrir o modelo desta viatura, limpa-a para forçar nova escolha.
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

  // Soma do preço/dia das coberturas seleccionadas (× dias no ResumoContrato)
  const coberturasPrecoDia = useMemo(
    () => (coberturasForm ?? []).reduce((soma, c) => soma + (c.preco_dia ?? 0), 0),
    [coberturasForm]
  );

  const isFacturado = contrato?.estado_financeiro === 'facturado';

  // Procura o evento pendente (entrega ou recolha) do contrato actual
  // para abrir automaticamente o dialog de realização ao entrar na página.
  const tipoEventoEsperado: 'entrega' | 'recolha' | null = !contrato
    ? null
    : contrato.estado_operacional === 'agendado'
      ? 'entrega'
      : contrato.estado_operacional === 'em_curso'
        ? 'recolha'
        : null;

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
    enabled: isEdit && !!contrato && !!tipoEventoEsperado && !isFacturado,
    // Sempre fresco ao montar: depois de realizar a entrega/recolha, ao voltar
    // ao contrato não queremos reabrir a modal com base no evento em cache.
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // A realização (entrega/recolha) NÃO abre modal automaticamente em toda
  // abertura do contrato — seria bloqueante enquanto o contrato fica
  // em_curso dias/semanas à espera da devolução. Mostramos um banner
  // não-bloqueante (ver abaixo) com um botão que abre o dialog quando o
  // user quer. EXCEÇÃO: mesmo assim que o contrato é criado (?criado=1 na
  // URL), abrimos o dialog uma única vez — é o momento natural de já
  // entregar a viatura, sem ter de voltar a abrir o contrato ou ir ao
  // Calendário para isso.
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

  /** Detecta alterações materiais entre o form e o contrato actual da BD.
   *  Campos gatilho (definidos com o user): viatura, tarifa, total, desconto, IVA.
   *  Estas alterações criam uma nova versão em vez de UPDATE in-place. */
  const detectarAlteracoesMateriais = (values: ContratoFormValues): AlteracaoMaterial[] => {
    if (!contrato) return [];
    const result: AlteracaoMaterial[] = [];

    if (values.viatura_id !== contrato.viatura_id) {
      const antes = viaturas.find((v) => v.id === contrato.viatura_id)?.matricula ?? '—';
      const depois = viaturas.find((v) => v.id === values.viatura_id)?.matricula ?? '—';
      result.push({ label: 'Viatura', valorAntes: antes, valorDepois: depois });

      // Mudança de grupo = upgrade/downgrade; mesmo grupo = troca simples.
      // Mostrar a linha torna o tipo de operação explícito no dialog de versão.
      const grupoAntes = contrato.grupo ?? '—';
      const grupoDepois = values.grupo ?? '—';
      if (grupoAntes !== grupoDepois) {
        // Determinar direção via preco_dia da tarifa de cada grupo.
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
    const numPair = (label: string, antes: number | null, depois: number | null, sufixo = '') => {
      if (antes === depois) return;
      result.push({
        label,
        valorAntes: antes != null ? `${antes}${sufixo}` : '—',
        valorDepois: depois != null ? `${depois}${sufixo}` : '—',
      });
    };
    numPair('Tarifa diária', contrato.tarifa_diaria, values.tarifa_diaria, ' €');
    numPair('Valor total', contrato.valor_total_manual, values.valor_total_manual, ' €');
    numPair('Desconto', contrato.desconto_percentagem, values.desconto_percentagem, '%');
    numPair('IVA', contrato.taxa_iva, values.taxa_iva, '%');

    return result;
  };

  // Sem isto, uma falha de validação Zod (ex.: campo obrigatório ainda vazio
  // porque os dados da reserva não acabaram de carregar) não dava nenhum
  // aviso — parecia que o botão "Guardar" não fazia nada na 1ª tentativa.
  const onInvalid = () => {
    toast({
      title: 'Verifica os campos obrigatórios',
      description: 'Há campos por preencher ou inválidos — pode estar noutra aba do formulário.',
      variant: 'destructive',
    });
  };

  const onSubmit = (values: ContratoFormValues) => {
    // Bloqueia se o modelo da viatura não tem preço na tarifa escolhida (o
    // preço é por modelo, tanto TVDE — preco_semana — como Rent-a-Car — preco_dia).
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

    // Em criação, a viatura do contrato tem de coincidir com a da reserva
    // (preserva o snapshot inicial e o EXCLUDE anti-overbooking).
    // Em edição, a divergência é permitida — vai disparar uma nova versão.
    if (!isEdit && reservaAssociada && values.viatura_id !== reservaAssociada.viatura_id) {
      toast({
        title: 'Viatura divergente da reserva',
        description:
          'A viatura inicial do contrato tem de ser a mesma da reserva. Edita primeiro a reserva.',
        variant: 'destructive',
      });
      return;
    }

    // Em modo edit, verificar se as alterações justificam uma nova versão.
    // Se sim, abrir o dialog de confirmação em vez de gravar in-place.
    if (isEdit && contrato && contrato.substituido_em === null) {
      const alteracoes = detectarAlteracoesMateriais(values);
      if (alteracoes.length > 0) {
        setNovaVersaoCtx({ alteracoes, valores: values });
        return;
      }
    }

    // Snapshot matrícula a partir da viatura se não veio do form
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
      data_fim: values.regime === 'tvde' ? null : localInputToIso(values.data_fim ?? ''),
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
      // ALD
      is_longa_duracao: values.is_longa_duracao,
      renovacao_opcao: values.renovacao_opcao ?? null,
      renovacao_intervalo_dias: values.renovacao_intervalo_dias,
      // Financeiro extra
      franquia_valor: values.franquia_valor,
      caucao_valor: values.caucao_valor,
      kms_incluidos: values.kms_incluidos,
      km_adicional_valor: values.km_adicional_valor,
      voucher_codigo: values.voucher_codigo || null,
      observacoes: values.observacoes || null,
      observacoes_internas: values.observacoes_internas || null,
    };

    // Nº de dias do contrato — necessário para o total dos extras 'dia'.
    // TVDE não tem data_fim (contrato aberto) — usa o intervalo de renovação
    // (normalmente 30 dias) como base de cálculo dos extras periódicos.
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

    // Subtotal do contrato — base de cálculo das taxas percentuais.
    // Espelha o cálculo do ResumoContrato: aluguer + coberturas + extras, com desconto.
    // Preço por modelo da tarifa escolhida (TVDE: semanal; Rent-a-Car: dia/mês).
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
    // Os arrays do form já passaram a validação Zod do handleSubmit — os
    // elementos estão completos, daí o cast para os tipos *FormItem.
    const condutores = values.condutores as CondutorFormItem[];
    const coberturas = values.coberturas as CoberturaFormItem[];
    const extras = values.extras as ExtraFormItem[];
    const taxas = values.taxas as TaxaFormItem[];

    const custoExtras = extras.reduce((soma, e) => soma + calcExtraTotal(e, diasContrato), 0);
    const subtotalBruto = baseAluguer + custoCoberturas + custoExtras;
    const subtotalTaxas = subtotalBruto * (1 - (values.desconto_percentagem ?? 0) / 100);

    // Sincroniza condutores + coberturas + extras + taxas (junções) após o contrato
    // existir. Corre as 4 em paralelo mas espera por todas — se alguma falhar, o
    // utilizador é avisado (senão o contrato ficava com relações parciais em silêncio).
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
      // Editar: ficar na própria página (utilizador vê toast e continua a trabalhar).
      updateMutation.mutate(
        // gestor_id (reatribuição por superior) não é alteração material — vai
        // no update in-place. Para não-superiores é o valor hidratado (sem efeito).
        { id: contrato.id, ...payload, gestor_id: values.gestor_id ?? null },
        { onSuccess: () => void syncRelacoes(contrato.id) }
      );
    } else {
      // Criar: sincronizar relações e só depois navegar para o novo contrato.
      createMutation.mutate(payload, {
        onSuccess: async (created) => {
          await syncRelacoes(created.id);
          // ?criado=1 dispara a proposta automática de "Realizar entrega"
          // (ver useEffect abriuEntregaAoCriarRef) — só nesta primeira
          // navegação, não em reaberturas normais do contrato.
          navigate(`/renting/contratos/${created.id}?criado=1`);
        },
      });
    }
  };

  /** Confirma a criação de uma nova versão: clona via RPC, aplica os novos
   *  valores na linha nova e sincroniza condutores/coberturas/extras/taxas. */
  const confirmarNovaVersao = (motivo: string) => {
    if (!contrato || !novaVersaoCtx) return;
    const motivoFinal =
      motivo ||
      novaVersaoCtx.alteracoes
        .map((a) => `${a.label}: ${a.valorAntes} → ${a.valorDepois}`)
        .join('; ');
    criarVersaoMutation.mutate(
      { contratoId: contrato.id, motivo: motivoFinal },
      {
        onSuccess: (novaId) => {
          // Re-executa onSubmit no contexto da nova versão: precisamos de
          // navegar primeiro (para fechar o dialog e refrescar contrato),
          // e depois reaplicar o payload. Para evitar timing complexo,
          // chamamos updateMutation directamente com a nova id + payload.
          const values = novaVersaoCtx.valores;
          const viatura = viaturas.find((v) => v.id === values.viatura_id);
          const matriculaFinal = values.matricula || viatura?.matricula || null;
          const msDia = 86400000;
          const dias =
            values.regime === 'tvde' || !values.data_fim
              ? Math.max(1, values.renovacao_intervalo_dias ?? 30)
              : Math.max(
                  1,
                  Math.ceil(
                    (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) /
                      msDia
                  )
                );
          const isTvdeVer = values.regime === 'tvde';
          const linhaModeloVer =
            values.tarifa_id && viatura?.modelo_id
              ? (precosModeloTvde.find(
                  (p) => p.tarifa_id === values.tarifa_id && p.modelo_id === viatura.modelo_id
                ) ?? null)
              : null;
          const baseAluguer = calcularBaseAluguerRenting({
            regime: values.regime,
            isLongaDuracao: values.is_longa_duracao,
            dias,
            tarifa: values.tarifa_id
              ? (tarifas.find((t) => t.id === values.tarifa_id) ?? null)
              : (tarifas.find((t) => t.grupo_id === values.grupo) ?? null),
            valorTotalManual: values.valor_total_manual,
            precoModeloSemana: isTvdeVer ? (linhaModeloVer?.preco_semana ?? null) : null,
            precoModeloDia: !isTvdeVer ? (linhaModeloVer?.preco_dia ?? null) : null,
            precoModeloMes: !isTvdeVer ? (linhaModeloVer?.preco_mes ?? null) : null,
          });
          const custoCoberturas =
            values.coberturas.reduce((s, c) => s + (c.preco_dia ?? 0), 0) * dias;
          const condutores = values.condutores as CondutorFormItem[];
          const coberturas = values.coberturas as CoberturaFormItem[];
          const extras = values.extras as ExtraFormItem[];
          const taxas = values.taxas as TaxaFormItem[];
          const custoExtras = extras.reduce((s, e) => s + calcExtraTotal(e, dias), 0);
          const subtotalTaxas =
            (baseAluguer + custoCoberturas + custoExtras) *
            (1 - (values.desconto_percentagem ?? 0) / 100);

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
              data_inicio: localInputToIso(values.data_inicio),
              estacao_recolha_id: values.estacao_recolha_id || null,
              data_fim: values.regime === 'tvde' ? null : localInputToIso(values.data_fim ?? ''),
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
            },
            {
              onSuccess: () => {
                syncCondutoresMutation.mutate({ contratoId: novaId, desejados: condutores });
                syncCoberturasMutation.mutate({ contratoId: novaId, desejadas: coberturas });
                syncExtrasMutation.mutate({ contratoId: novaId, desejados: extras, dias });
                syncTaxasMutation.mutate({
                  contratoId: novaId,
                  desejadas: taxas,
                  subtotal: subtotalTaxas,
                });
                setNovaVersaoCtx(null);
                navigate(`/renting/contratos/${novaId}`);
              },
            }
          );
        },
      }
    );
  };

  if (isEdit && loadingContrato) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEdit && !contrato) {
    return (
      <div className="w-full">
        <StickyPageHeader title="Contrato não encontrado" icon={FileText} />
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Este contrato não existe ou já foi removido.</p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={() => navigate('/renting/contratos')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar à lista
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <StickyPageHeader
        title={
          isEdit ? (
            <span className="flex items-center gap-1">
              {/* Setas em lugar fixo junto ao título — nunca deslocam com a
                  fila de ações (que muda de tamanho consoante o estado do
                  contrato, ex.: "Fechar contrato" só aparece se ainda aberto). */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1"
                disabled={!vizinhos?.anterior}
                title={
                  vizinhos?.anterior
                    ? `Contrato anterior — #${vizinhos.anterior.codigo}`
                    : undefined
                }
                onClick={() =>
                  vizinhos?.anterior && navigate(`/renting/contratos/${vizinhos.anterior.id}`)
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {`Contrato #${contrato?.codigo}`}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!vizinhos?.seguinte}
                title={
                  vizinhos?.seguinte
                    ? `Contrato seguinte — #${vizinhos.seguinte.codigo}`
                    : undefined
                }
                onClick={() =>
                  vizinhos?.seguinte && navigate(`/renting/contratos/${vizinhos.seguinte.id}`)
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          ) : (
            'Novo Contrato'
          )
        }
        description={isEdit ? 'Editar dados do contrato existente' : 'Novo contrato de renting'}
        icon={FileText}
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/renting/contratos')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        {isEdit && contrato && (
          <ContratoEstadoActions
            contrato={contrato}
            motoristaId={
              condutoresDb?.find((c) => c.is_principal && c.motorista_id)?.motorista_id ?? null
            }
          />
        )}
        {isEdit && contrato && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDocsDialogOpen(true)}
            className="gap-2"
            title="Gerar documentos (contrato, prestação, declarações...)"
          >
            <Printer className="h-4 w-4" />
            Documentos
          </Button>
        )}
        {isEdit && contrato && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="gap-2"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Eliminar
          </Button>
        )}
        <Button
          type="button"
          onClick={form.handleSubmit(onSubmit, onInvalid)}
          disabled={
            isPending ||
            contrato?.substituido_em != null ||
            condutoresRascunho.length > 0 ||
            // Criação a partir de reserva: espera a reserva (e os condutores
            // dela) terminarem de carregar antes de liberar o submit — sem
            // isto, um clique prematuro falhava a validação Zod em silêncio
            // (campos ainda vazios) e parecia que "não fazia nada".
            (!isEdit &&
              !!reservaIdFromQuery &&
              (!reservaFromQuery || condutoresDaReserva === undefined))
          }
          className="gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'Guardar' : 'Abrir Contrato'}
        </Button>
      </StickyPageHeader>

      {condutoresRascunho.length > 0 && (
        <Alert className="mb-3 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            <strong>Contrato bloqueado.</strong> O seguinte condutor tem perfil incompleto (sem NIF
            / carta de condução):{' '}
            {condutoresRascunho
              .map((c) => motoristas.find((m) => m.id === c.motorista_id)?.nome ?? c.motorista_id)
              .join(', ')}
            . Abre a ficha do motorista, preenche todos os dados obrigatórios e guarda — o contrato
            ficará disponível de seguida.
          </AlertDescription>
        </Alert>
      )}

      {isEdit && contrato?.substituido_em && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            Esta versão foi <strong>substituída</strong>. É apenas leitura — para alterações, abre a
            versão actual a partir do histórico.
          </p>
        </div>
      )}

      {realizacaoPendente && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              <strong>
                {realizacaoPendente.tipo === 'entrega' ? 'Entrega' : 'Recolha'} pendente
              </strong>{' '}
              — regista a {realizacaoPendente.tipo === 'entrega' ? 'entrega' : 'recolha'} da viatura
              (fotos, km e confirmação) quando estiver pronta.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setRealizarDialog({
                  eventoId: realizacaoPendente.id,
                  tipo: realizacaoPendente.tipo,
                })
              }
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Realizar {realizacaoPendente.tipo === 'entrega' ? 'entrega' : 'recolha'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmarRealizacaoDireta(true)}
              disabled={marcarRealizacaoDireta.isPending}
              title="Marca como realizada sem passar pelo check (fotos/km) — para contratos já existentes no Any Rent."
            >
              {marcarRealizacaoDireta.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Any Rent'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Confirmação do atalho "marcar como já realizada" (sem check) */}
      <AlertDialog open={confirmarRealizacaoDireta} onOpenChange={setConfirmarRealizacaoDireta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Marcar {realizacaoPendente?.tipo === 'entrega' ? 'entrega' : 'recolha'} como já
              realizada?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O contrato passa para o estado seguinte sem registar fotos, km ou confirmação no
              terreno. Usa isto só para contratos já existentes no <strong>Any Rent</strong> — essa
              informação nunca existiu porque foram migrados de outro sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!contrato || !realizacaoPendente) return;
                marcarRealizacaoDireta.mutate({
                  contratoId: contrato.id,
                  tipo: realizacaoPendente.tipo,
                });
                setConfirmarRealizacaoDireta(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 sm:p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                <ContratoTabsPlaceholder
                  geralContent={
                    <ContratoFormSecoes
                      form={form}
                      clientes={clientes}
                      motoristas={motoristas}
                      viaturas={viaturasParaSelecao}
                      grupos={grupos}
                      grupoIdAtual={
                        contrato
                          ? (viaturas.find((v) => v.id === contrato.viatura_id)?.grupo_id ?? null)
                          : null
                      }
                      estacoes={estacoes}
                      viaturaLocked={viaturaLocked}
                      reservaCodigo={reservaAssociada?.codigo ?? null}
                      onViaturaChange={aplicarDadosViatura}
                      contratoId={contrato?.id ?? null}
                      onCriarNovoCliente={() => setClienteDialogOpen(true)}
                      onCriarNovoMotorista={() => setMotoristaDialogOpen(true)}
                    />
                  }
                  coberturasContent={<ContratoTabCobertura form={form} coberturas={coberturas} />}
                  extrasContent={<ContratoTabExtras form={form} extras={extrasCatalogo} />}
                  taxasContent={<ContratoTabTaxas form={form} taxas={taxasCatalogo} />}
                  faturarContent={
                    isEdit && contrato ? <ContratoTabFaturar contrato={contrato} /> : undefined
                  }
                  historicoContent={
                    isEdit && contrato ? (
                      <ContratoTabHistorico
                        contratoId={contrato.id}
                        onAbrirVersao={(versaoId) => navigate(`/renting/contratos/${versaoId}`)}
                      />
                    ) : undefined
                  }
                  danosContent={<ContratoTabDanos contratoId={contrato?.id ?? null} />}
                  anexosContent={<ContratoTabAnexos contratoId={contrato?.id ?? null} />}
                />

                {temConflito && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-sm">
                      Conflito de disponibilidade — esta viatura já tem contrato ou reserva activa
                      sobreposta a este período. Guardar irá falhar.
                    </p>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <aside>
          <ResumoContrato
            dataInicio={dataInicio}
            dataFim={dataFim}
            tarifaDiaria={tarifaDiaria}
            valorTotalManual={valorTotalManual}
            descontoPercentagem={descontoPercentagem}
            taxaIva={taxaIva}
            regime={regime}
            coberturasPrecoDia={coberturasPrecoDia}
            extras={extrasForm}
            taxas={taxasForm}
            isFacturado={isFacturado}
            totalSnapshot={contrato?.total_final}
            subtotalSnapshot={contrato?.total_subtotal}
            ivaSnapshot={contrato?.total_iva}
          />
          {isEdit && contrato && <HistoricoEdicoesContrato contratoId={contrato.id} />}
        </aside>
      </div>

      <ContratoDeleteConfirm
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        contrato={contrato ?? null}
        isPending={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />

      <ClienteDialog
        open={clienteDialogOpen}
        onOpenChange={setClienteDialogOpen}
        cliente={null}
        defaultTipoCliente="condutor"
        onCreated={handleClienteCriado}
      />

      <MotoristaDialog
        open={motoristaDialogOpen}
        onOpenChange={setMotoristaDialogOpen}
        motorista={null}
        onMotoristaCreated={(m) => handleMotoristaCriado(m.id)}
      />

      <ContratoNovaVersaoDialog
        open={novaVersaoCtx !== null}
        onOpenChange={(o) => {
          if (!o) setNovaVersaoCtx(null);
        }}
        alteracoes={novaVersaoCtx?.alteracoes ?? []}
        isPending={criarVersaoMutation.isPending || updateMutation.isPending}
        onConfirmar={confirmarNovaVersao}
      />

      <RealizarEntregaDialog
        open={!!realizarDialog}
        onOpenChange={(o) => {
          if (!o) setRealizarDialog(null);
        }}
        eventoId={realizarDialog?.eventoId ?? null}
        tipo={realizarDialog?.tipo ?? 'entrega'}
        resumo={contrato ? `Contrato #${contrato.codigo} · ${contrato.matricula ?? ''}` : undefined}
      />

      {isEdit && contrato && (
        <ContratoDocumentosDialog
          open={docsDialogOpen}
          onOpenChange={setDocsDialogOpen}
          contrato={contrato}
          condutorPrincipal={(condutoresDb ?? []).find((c) => c.is_principal) ?? null}
          clientes={clientes}
          motoristas={motoristas}
          viatura={viaturas.find((v) => v.id === contrato.viatura_id) ?? null}
          empresas={empresas}
        />
      )}
    </div>
  );
};

export default ContratoForm;
