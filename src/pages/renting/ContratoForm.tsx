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
  FileText,
  Loader2,
  Printer,
  Trash2,
} from 'lucide-react';

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
  useCreateContratoRenting,
  useCriarVersaoContrato,
  useDeleteContratoRenting,
  useUpdateContratoRenting,
} from '@/hooks/useContratosRenting';
import { useEstacoes } from '@/hooks/useEstacoes';
import { useOrgDefinicoes, ivaParaModalidade } from '@/hooks/useOrgDefinicoes';
import { useRentingCoberturas } from '@/hooks/useRentingCoberturas';
import { useRentingExtras } from '@/hooks/useRentingExtras';
import { useRentingTaxas } from '@/hooks/useRentingTaxas';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useMotoristas } from '@/hooks/useMotoristas';
import { useReserva } from '@/hooks/useReservas';
import { useReservaCondutores } from '@/hooks/useReservaCondutores';
import { useViaturas } from '@/hooks/useViaturas';

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
import { ContratoTabCobertura } from '@/components/renting/contratos/ContratoTabCobertura';
import { ContratoTabExtras } from '@/components/renting/contratos/ContratoTabExtras';
import { ContratoTabTaxas } from '@/components/renting/contratos/ContratoTabTaxas';
import { ContratoTabsPlaceholder } from '@/components/renting/contratos/ContratoTabsPlaceholder';
import { ContratoTabFaturar } from '@/components/renting/contratos/ContratoTabFaturar';
import { ResumoContrato } from '@/components/renting/contratos/ResumoContrato';
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
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
  const [searchParams] = useSearchParams();
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
  const { data: orgDefinicoes } = useOrgDefinicoes();
  const { data: contrato, isLoading: loadingContrato } = useContratoRenting(id ?? null);

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
        viatura_id: reservaFromQuery.viatura_id ?? '',
        matricula: reservaFromQuery.matricula ?? '',
        grupo: reservaFromQuery.grupo ?? '',
        estacao_entrega_id: reservaFromQuery.estacao_entrega_id,
        estacao_recolha_id: reservaFromQuery.estacao_recolha_id,
        data_inicio: isoToLocalInput(reservaFromQuery.data_inicio),
        data_fim: isoToLocalInput(reservaFromQuery.data_fim),
        origem: 'sistema',
        regime: reservaFromQuery.regime,
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
  // TVDE e Slot já têm IVA incluído no preço — o resumo não aplica IVA adicional
  const rawTaxaIva = form.watch('taxa_iva');
  const taxaIva = regime === 'tvde' || regime === 'slot' ? 0 : rawTaxaIva;
  const coberturasForm = form.watch('coberturas');
  const extrasForm = form.watch('extras') as ExtraFormItem[];
  const taxasForm = form.watch('taxas') as TaxaFormItem[];

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

  // Os condutores PERSISTEM ao trocar de regime — não se apaga a lista (senão
  // "desapareciam" condutores já adicionados ou hidratados da reserva). A tabela
  // mostra clientes (rent-a-car) ou motoristas (TVDE) conforme o tipo de cada linha.

  // Regra de elegibilidade: qualquer viatura pode ser alugada em rent-a-car.
  // No regime tvde só aparecem viaturas com "Elegível para TVDE? = Sim"
  // (habilitada_tvde), opção que só existe em tipos com elegibilidade TVDE.
  // A viatura já seleccionada mantém-se sempre visível (ex.: edição).
  const viaturaIdSelecionada = form.watch('viatura_id');
  const viaturasParaSelecao = useMemo(() => {
    if (regime !== 'tvde') return viaturas;
    return viaturas.filter((v) => v.habilitada_tvde || v.id === viaturaIdSelecionada);
  }, [viaturas, regime, viaturaIdSelecionada]);

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

  // A realização (entrega/recolha) NÃO abre modal automaticamente — seria uma
  // modal bloqueante a cada abertura do contrato (um contrato fica em_curso
  // dias/semanas à espera da devolução). Mostramos um banner não-bloqueante
  // (ver abaixo) com um botão que abre o dialog só quando o user quer.
  const realizacaoPendente =
    !fetchingEventoPendente && !!eventoPendente && !contrato?.substituido_em
      ? eventoPendente
      : null;

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

  const onSubmit = (values: ContratoFormValues) => {
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
      viatura_id: values.viatura_id,
      matricula: matriculaFinal,
      grupo: values.grupo || null,
      estacao_entrega_id: values.estacao_entrega_id || null,
      data_inicio: localInputToIso(values.data_inicio),
      estacao_recolha_id: values.estacao_recolha_id || null,
      data_fim: localInputToIso(values.data_fim),
      estacao_origem_viatura_id: values.estacao_origem_viatura_id || null,
      estado_operacional: values.estado_operacional,
      estado_financeiro: values.estado_financeiro,
      origem: values.origem,
      regime: values.regime,
      tarifa_diaria: values.tarifa_diaria,
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
    const msDia = 86400000;
    const diasContrato = Math.max(
      1,
      Math.ceil(
        (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) / msDia
      )
    );

    // Subtotal do contrato — base de cálculo das taxas percentuais.
    // Espelha o cálculo do ResumoContrato: aluguer + coberturas + extras, com desconto.
    const baseAluguer =
      values.valor_total_manual != null && values.valor_total_manual > 0
        ? values.valor_total_manual
        : (values.tarifa_diaria ?? 0) * diasContrato;
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
        { id: contrato.id, ...payload },
        { onSuccess: () => void syncRelacoes(contrato.id) }
      );
    } else {
      // Criar: sincronizar relações e só depois navegar para o novo contrato.
      createMutation.mutate(payload, {
        onSuccess: async (created) => {
          await syncRelacoes(created.id);
          navigate(`/renting/contratos/${created.id}`);
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
          const dias = Math.max(
            1,
            Math.ceil(
              (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) / msDia
            )
          );
          const baseAluguer =
            values.valor_total_manual != null && values.valor_total_manual > 0
              ? values.valor_total_manual
              : (values.tarifa_diaria ?? 0) * dias;
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
              viatura_id: values.viatura_id,
              matricula: matriculaFinal,
              grupo: values.grupo || null,
              estacao_entrega_id: values.estacao_entrega_id || null,
              data_inicio: localInputToIso(values.data_inicio),
              estacao_recolha_id: values.estacao_recolha_id || null,
              data_fim: localInputToIso(values.data_fim),
              estacao_origem_viatura_id: values.estacao_origem_viatura_id || null,
              estado_operacional: values.estado_operacional,
              estado_financeiro: values.estado_financeiro,
              origem: values.origem,
              regime: values.regime,
              tarifa_diaria: values.tarifa_diaria,
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
        title={isEdit ? `Contrato #${contrato?.codigo}` : 'Novo Contrato'}
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
        {isEdit && contrato && <ContratoEstadoActions contrato={contrato} />}
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
          onClick={form.handleSubmit(onSubmit)}
          disabled={isPending || contrato?.substituido_em != null}
          className="gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'Guardar' : 'Abrir Contrato'}
        </Button>
      </StickyPageHeader>

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
          <Button
            type="button"
            size="sm"
            onClick={() =>
              setRealizarDialog({
                eventoId: realizacaoPendente.id,
                tipo: realizacaoPendente.tipo,
              })
            }
            className="shrink-0 gap-2"
          >
            <FileText className="h-4 w-4" />
            Realizar {realizacaoPendente.tipo === 'entrega' ? 'entrega' : 'recolha'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 sm:p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <ContratoTabsPlaceholder
                  regime={regime}
                  geralContent={
                    <ContratoFormSecoes
                      form={form}
                      clientes={clientes}
                      viaturas={viaturasParaSelecao}
                      estacoes={estacoes}
                      viaturaLocked={viaturaLocked}
                      reservaCodigo={reservaAssociada?.codigo ?? null}
                    />
                  }
                  condutoresContent={
                    <CondutoresFields
                      regime={regime}
                      clientes={clientes}
                      motoristas={motoristas}
                      clientePrincipalLabel="Cliente do contrato também conduz"
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
            coberturasPrecoDia={coberturasPrecoDia}
            extras={extrasForm}
            taxas={taxasForm}
            isFacturado={isFacturado}
            totalSnapshot={contrato?.total_final}
            subtotalSnapshot={contrato?.total_subtotal}
            ivaSnapshot={contrato?.total_iva}
          />
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
