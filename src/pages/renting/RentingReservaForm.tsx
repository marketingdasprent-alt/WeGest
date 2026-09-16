import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';
import { useForm, useFieldArray, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ArrowLeft, CalendarCheck, FileText, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

import { useClientes } from '@/hooks/useClientes';
import { useMotoristas } from '@/hooks/useMotoristas';
import { useToast } from '@/hooks/use-toast';
import { useEstacoes } from '@/hooks/useEstacoes';
import {
  useCreateReserva,
  useDeleteReserva,
  useReserva,
  useReservaConflito,
  useUpdateReserva,
} from '@/hooks/useReservas';
import { useReservaCondutores, useSyncReservaCondutores } from '@/hooks/useReservaCondutores';
import { useReservaCoberturas, useSyncReservaCoberturas } from '@/hooks/useReservaCoberturas';
import { useReservaExtras, useSyncReservaExtras, calcExtraTotal } from '@/hooks/useReservaExtras';
import { useReservaTaxas, useSyncReservaTaxas } from '@/hooks/useReservaTaxas';
import { useContratoIdByReserva } from '@/hooks/useContratosRenting';
import { uploadReservaAnexoSync } from '@/hooks/useReservaAnexos';
import { useRentingCoberturas } from '@/hooks/useRentingCoberturas';
import { useRentingExtras } from '@/hooks/useRentingExtras';
import { useRentingTaxas } from '@/hooks/useRentingTaxas';
import { useViaturas } from '@/hooks/useViaturas';
import { useViaturasOcupadasPeriodo } from '@/hooks/useViaturasOcupadasPeriodo';
import {
  calcularBaseAluguerRenting,
  useRentingGruposMin,
  useRentingTarifaPrecosModelo,
} from '@/hooks/useRentingGruposTarifas';

import { usePermissions } from '@/hooks/usePermissions';
import { ClienteDialog } from '@/components/renting/ClienteDialog';
import { MotoristaDialog } from '@/components/motoristas/MotoristaDialog';
import { CondutorProvisiorioDialog } from '@/components/motoristas/CondutorProvisiorioDialog';
import { ReservaDeleteConfirm } from '@/components/renting/reservas/ReservaDeleteConfirm';
import { GenerateDocumentsDialog } from '@/components/motoristas/GenerateDocumentsDialog';
import { ReservaResumoSidebar } from '@/components/renting/reservas/ReservaResumoSidebar';
import { ReservaTabsPlaceholder } from '@/components/renting/reservas/ReservaTabsPlaceholder';
import {
  ReservaTabAnexos,
  type AnexoPendente,
} from '@/components/renting/reservas/tabs/ReservaTabAnexos';
import { ReservaTabCobertura } from '@/components/renting/reservas/tabs/ReservaTabCobertura';
import { ReservaTabExtras } from '@/components/renting/reservas/tabs/ReservaTabExtras';
import { ReservaTabTaxas } from '@/components/renting/reservas/tabs/ReservaTabTaxas';
import { ReservaTabDanos } from '@/components/renting/reservas/tabs/ReservaTabDanos';
import { ReservaTabHistorico } from '@/components/renting/reservas/tabs/ReservaTabHistorico';
import { ReservaTabFaturar } from '@/components/renting/reservas/tabs/ReservaTabFaturar';
import { ReservaTabGeral } from '@/components/renting/reservas/tabs/ReservaTabGeral';
import {
  isoToLocalInput,
  localInputToIso,
  reservaDialogSchema,
  type ReservaFormValues,
} from '@/components/renting/reservas/reservaDialog.schema';

import type { CondutorFormItem, ReservaInsert } from '@/types/reserva';
import type { CoberturaFormItem, ExtraFormItem, TaxaFormItem } from '@/types/contratoRenting';

const DEFAULT_VALUES: ReservaFormValues = {
  viatura_id: null,
  matricula: '',
  grupo: '',
  estacao_entrega_id: null,
  estacao_recolha_id: null,
  data_inicio: '',
  data_fim: '',
  cliente_id: null,
  cliente_nome: '',
  condutor_id: null,
  condutor_nome: '',
  emissor_id: null,
  gestor_id: null,
  estado: 'pendente',
  regime: 'rent_a_car',
  tarifa_id: null,
  valor_total: null,
  franquia_valor: null,
  caucao_valor: null,
  kms_incluidos: null,
  km_adicional_valor: null,
  slot_valor_semanal: null,
  slot_valor_mensal: null,
  is_longa_duracao: false,
  renovacao_opcao: null,
  renovacao_intervalo_dias: null,
  observacoes: '',
  observacoes_internas: '',
  coberturas: [],
  extras: [],
  taxas: [],
  condutores: [],
};

const RentingReservaForm = () => {
  const navigate = useNavigate();
  const goBack = useGoBack('/renting/reservas');
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id && id !== 'nova';
  const viaturaIdFromUrl = !isEdit ? searchParams.get('viatura_id') : null;
  const clienteIdFromUrl = !isEdit ? searchParams.get('cliente_id') : null;

  const { data: reserva, isLoading: loadingReserva } = useReserva(isEdit ? id : null);
  const { data: condutoresAtuais = [] } = useReservaCondutores(isEdit ? id : null);
  const { data: coberturasAtuais = [] } = useReservaCoberturas(isEdit ? id : null);
  const { data: extrasAtuais = [] } = useReservaExtras(isEdit ? id : null);
  const { data: taxasAtuais = [] } = useReservaTaxas(isEdit ? id : null);
  const { data: contratoExistente } = useContratoIdByReserva(isEdit ? id : null);

  const { data: coberturasCatalogo = [] } = useRentingCoberturas({ apenasAtivas: true });
  const { data: extrasCatalogo = [] } = useRentingExtras({ apenasAtivos: true });
  const { data: taxasCatalogo = [] } = useRentingTaxas({ apenasAtivas: true });

  const { data: clientes = [] } = useClientes();
  const { data: motoristas = [] } = useMotoristas({ apenasAtivos: true });
  const condutorSecundarioId =
    condutoresAtuais.find((c) => !c.is_principal && c.motorista_id)?.motorista_id ?? null;
  const motoristaSecundario = condutorSecundarioId
    ? (motoristas.find((m) => m.id === condutorSecundarioId) ?? null)
    : null;
  const { data: viaturas = [] } = useViaturas({ apenasDisponiveis: !isEdit });
  const { data: grupos = [] } = useRentingGruposMin();
  const { data: precosModeloTvde = [] } = useRentingTarifaPrecosModelo();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });

  const createMutation = useCreateReserva();
  const updateMutation = useUpdateReserva();
  const deleteMutation = useDeleteReserva();
  const { canEdit } = usePermissions();
  const podeEliminar = canEdit('renting_reservas');
  const syncCondutoresMutation = useSyncReservaCondutores();
  const syncCoberturasMutation = useSyncReservaCoberturas();
  const syncExtrasMutation = useSyncReservaExtras();
  const syncTaxasMutation = useSyncReservaTaxas();

  const criarContratoAposGuardarRef = useRef(false);

  const [activeTab, setActiveTab] = useState('geral');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [anexosPendentes, setAnexosPendentes] = useState<AnexoPendente[]>([]);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [motoristaDialogOpen, setMotoristaDialogOpen] = useState(false);
  const [condutorProvisorioOpen, setCondutorProvisorioOpen] = useState(false);
  const [documentosDialogOpen, setDocumentosDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const adicionarAnexosPendentes = (files: File[]) => {
    setAnexosPendentes((prev) => [
      ...prev,
      ...files.map((file) => ({
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        file,
        nome: file.name,
      })),
    ]);
  };

  const renomearAnexoPendente = (id: string, nome: string) => {
    setAnexosPendentes((prev) => prev.map((p) => (p.id === id ? { ...p, nome } : p)));
  };

  const removerAnexoPendente = (id: string) => {
    setAnexosPendentes((prev) => prev.filter((p) => p.id !== id));
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    syncCondutoresMutation.isPending ||
    syncCoberturasMutation.isPending ||
    syncExtrasMutation.isPending ||
    syncTaxasMutation.isPending;

  const form = useForm<ReservaFormValues>({
    resolver: zodResolver(reservaDialogSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { append: appendCondutor, replace: replaceCondutores } = useFieldArray({
    control: form.control,
    name: 'condutores',
  });

  const prefilledFromUrlRef = useRef(false);
  useEffect(() => {
    if (isEdit || prefilledFromUrlRef.current) return;
    if (!viaturaIdFromUrl && !clienteIdFromUrl) return;

    const viatura = viaturaIdFromUrl ? viaturas.find((v) => v.id === viaturaIdFromUrl) : null;
    const cliente = clienteIdFromUrl ? clientes.find((c) => c.id === clienteIdFromUrl) : null;

    if ((viaturaIdFromUrl && !viatura) || (clienteIdFromUrl && !cliente)) return;

    if (viatura) {
      form.setValue('viatura_id', viatura.id, { shouldDirty: false });
      form.setValue('matricula', viatura.matricula ?? '', { shouldDirty: false });
      if (viatura.grupo_id) {
        const grupo = grupos.find((g) => g.id === viatura.grupo_id);
        if (!grupo) return;
        form.setValue('grupo', grupo.nome, { shouldDirty: false });
      }
    }
    if (cliente) {
      form.setValue('cliente_id', cliente.id, { shouldDirty: false });
      form.setValue('cliente_nome', cliente.nome ?? '', { shouldDirty: false });
    }
    prefilledFromUrlRef.current = true;
  }, [isEdit, viaturaIdFromUrl, clienteIdFromUrl, viaturas, clientes, grupos, form]);

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
    if (form.getValues('regime') === 'slot') {
      void supabase
        .from('motoristas_ativos')
        .update({ is_slot: true })
        .eq('id', motoristaId)
        .then(() => queryClient.invalidateQueries({ queryKey: ['motoristas'] }));
      const m = motoristas.find((x) => x.id === motoristaId);
      replaceCondutores([{ cliente_id: null, motorista_id: motoristaId, is_principal: true }]);
      form.setValue('condutor_id', motoristaId, { shouldDirty: true });
      if (m?.nome) form.setValue('condutor_nome', m.nome, { shouldDirty: true });
      return;
    }
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

  const hidratouRef = useRef(false);
  useEffect(() => {
    if (!isEdit || !reserva) return;
    const primeiraHidratacao = !hidratouRef.current;
    hidratouRef.current = true;
    form.reset(
      {
        viatura_id: reserva.viatura_id,
        matricula: reserva.matricula ?? '',
        grupo: reserva.grupo ?? '',
        estacao_entrega_id: reserva.estacao_entrega_id,
        estacao_recolha_id: reserva.estacao_recolha_id,
        data_inicio: isoToLocalInput(reserva.data_inicio),
        data_fim: isoToLocalInput(reserva.data_fim),
        cliente_id: reserva.cliente_id,
        cliente_nome: reserva.cliente_nome ?? '',
        condutor_id: reserva.condutor_id,
        condutor_nome: reserva.condutor_nome ?? '',
        emissor_id: reserva.emissor_id,
        gestor_id: reserva.gestor_id ?? null,
        estado: reserva.estado,
        regime: reserva.regime,
        tarifa_id: reserva.tarifa_id ?? null,
        slot_valor_semanal: reserva.slot_valor_semanal,
        slot_valor_mensal: reserva.slot_valor_mensal,
        valor_total: reserva.valor_total,
        franquia_valor: reserva.franquia_valor,
        caucao_valor: reserva.caucao_valor,
        kms_incluidos: reserva.kms_incluidos,
        km_adicional_valor: reserva.km_adicional_valor,
        is_longa_duracao: reserva.is_longa_duracao,
        renovacao_opcao: reserva.renovacao_opcao,
        renovacao_intervalo_dias: reserva.renovacao_intervalo_dias,
        observacoes: reserva.observacoes ?? '',
        observacoes_internas: reserva.observacoes_internas ?? '',
        coberturas: form.getValues('coberturas'),
        extras: form.getValues('extras'),
        taxas: form.getValues('taxas'),
        condutores: form.getValues('condutores'),
      },
      primeiraHidratacao ? undefined : { keepDirtyValues: true }
    );
  }, [isEdit, reserva, form]);

  useEffect(() => {
    if (!isEdit || !reserva) return;
    form.reset(
      {
        ...form.getValues(),
        coberturas: coberturasAtuais.map((c) => ({
          cobertura_id: c.cobertura_id,
          cobertura_nome: c.cobertura_nome,
          preco_dia: c.preco_dia,
          franquia_valor: c.franquia_valor,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, reserva, coberturasAtuais, form]);

  useEffect(() => {
    if (!isEdit || !reserva) return;
    form.reset(
      {
        ...form.getValues(),
        extras: extrasAtuais.map((e) => ({
          extra_id: e.extra_id,
          extra_nome: e.extra_nome,
          preco_unidade: e.preco_unidade,
          tipo_calculo: e.tipo_calculo,
          quantidade: e.quantidade,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, reserva, extrasAtuais, form]);

  useEffect(() => {
    if (!isEdit || !reserva) return;
    form.reset(
      {
        ...form.getValues(),
        taxas: taxasAtuais.map((t) => ({
          taxa_id: t.taxa_id,
          taxa_nome: t.taxa_nome,
          percentagem: t.percentagem,
          valor_fixo: t.valor_fixo,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, reserva, taxasAtuais, form]);

  useEffect(() => {
    if (!isEdit || !reserva) return;
    form.reset(
      {
        ...form.getValues(),
        condutores: condutoresAtuais.map((c) => ({
          cliente_id: c.cliente_id,
          motorista_id: c.motorista_id,
          is_principal: c.is_principal,
        })),
      },
      { keepDirtyValues: true }
    );
  }, [isEdit, reserva, condutoresAtuais, form]);

  const grupoBackfillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEdit || !reserva || reserva.grupo) return;
    if (grupoBackfillRef.current === reserva.id) return;
    const viatura = viaturas.find((v) => v.id === reserva.viatura_id);
    if (!viatura?.grupo_id) return;
    const grupo = grupos.find((g) => g.id === viatura.grupo_id);
    if (!grupo) return;
    grupoBackfillRef.current = reserva.id;
    form.setValue('grupo', grupo.nome, { shouldDirty: false });
    supabase
      .from('reservas')
      .update({ grupo: grupo.nome })
      .eq('id', reserva.id)
      .then(({ error }) => {
        if (error) {
          console.error('[RentingReservaForm] Falha a reconciliar grupo:', error);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['renting', 'reservas'] });
      });
  }, [isEdit, reserva, viaturas, grupos, form, queryClient]);

  const viaturaId = form.watch('viatura_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');

  const conflitoArgs = useMemo(() => {
    const di = dataInicio ? new Date(dataInicio) : null;
    const df = dataFim ? new Date(dataFim) : null;
    return {
      viaturaId: viaturaId ?? null,
      dataInicio: di && !Number.isNaN(di.getTime()) ? di : null,
      dataFim: df && !Number.isNaN(df.getTime()) ? df : null,
      excluirId: reserva?.id ?? null,
    };
  }, [viaturaId, dataInicio, dataFim, reserva?.id]);

  const { data: temConflito } = useReservaConflito(conflitoArgs);

  const regimeWatched = form.watch('regime');
  const grupoWatched = form.watch('grupo');
  const clienteIdWatched = form.watch('cliente_id');
  const condutoresWatched = form.watch('condutores');
  const estacaoEntregaWatched = form.watch('estacao_entrega_id');
  const estacaoRecolhaWatched = form.watch('estacao_recolha_id');

  const temCondutor = !!clienteIdWatched || (condutoresWatched?.length ?? 0) > 0;
  const temEstacoes = !!(estacaoEntregaWatched && estacaoRecolhaWatched);
  const temGrupo = !!grupoWatched;
  const reservaCompleta = !!(
    reserva &&
    viaturaId &&
    temGrupo &&
    temCondutor &&
    (regimeWatched === 'rent_a_car' ? temEstacoes : true)
  );
  const podeCriarContrato = reservaCompleta;
  const bloqueadaPorContrato = isEdit && !!contratoExistente;
  const motivoContratoBloqueado = !reservaCompleta
    ? viaturaId && !temGrupo
      ? 'A viatura selecionada não tem grupo — atribui um grupo na ficha da viatura e volta a selecionar.'
      : regimeWatched === 'rent_a_car'
        ? 'Preenche condutor, viatura e estações (entrega e recolha).'
        : 'Preenche condutor e viatura.'
    : undefined;
  const tituloCriarContrato =
    motivoContratoBloqueado ??
    (form.formState.isDirty
      ? 'As alterações por gravar são guardadas automaticamente antes de criar o contrato.'
      : undefined);

  const regimeAnteriorRef = useRef<string | null>(null);
  useEffect(() => {
    const anterior = regimeAnteriorRef.current;
    regimeAnteriorRef.current = regimeWatched;
    if (anterior === null || anterior === regimeWatched) return;

    if (regimeWatched === 'tvde' || regimeWatched === 'slot') {
      if (!form.getValues('is_longa_duracao')) {
        form.setValue('is_longa_duracao', true, { shouldDirty: true });
        form.setValue('renovacao_opcao', 'intervalo_dias', { shouldDirty: true });
        form.setValue('renovacao_intervalo_dias', 30, { shouldDirty: true });
      }
    } else if (regimeWatched === 'rent_a_car') {
      form.setValue('is_longa_duracao', false, { shouldDirty: true });
      form.setValue('renovacao_opcao', null, { shouldDirty: true });
      form.setValue('renovacao_intervalo_dias', null, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regimeWatched]);

  const { data: viaturasOcupadas } = useViaturasOcupadasPeriodo({
    dataInicio,
    dataFim,
    excluirReservaId: isEdit ? id : null,
    excluirContratoId: contratoExistente?.id ?? null,
  });

  const viaturasParaSelecao = !viaturasOcupadas
    ? viaturas
    : viaturas.filter((v) => v.id === viaturaId || !viaturasOcupadas.has(v.id));

  const mostrarFaturacao = isEdit && !!reserva && reserva.regime !== 'slot';

  const onSubmit = async (values: ReservaFormValues) => {
    try {
      const viaturaSelecionada = viaturas.find((v) => v.id === values.viatura_id);
      const matriculaFinal = values.matricula || viaturaSelecionada?.matricula || null;

      const isTvdeSubmit = values.regime === 'tvde';
      if (values.regime !== 'slot' && values.tarifa_id && viaturaSelecionada?.modelo_id) {
        const linha = precosModeloTvde.find(
          (p) => p.tarifa_id === values.tarifa_id && p.modelo_id === viaturaSelecionada.modelo_id
        );
        const temPreco = isTvdeSubmit
          ? linha?.preco_semana != null
          : linha?.preco_dia != null || linha?.preco_mes != null;
        if (!temPreco) {
          toast({
            title: isTvdeSubmit
              ? 'Modelo sem preço na tarifa TVDE'
              : 'Modelo sem preço na tarifa Rent-a-Car',
            description:
              'A viatura escolhida não tem preço definido na tarifa selecionada. Define o preço do modelo na tarifa ou escolhe outra viatura/tarifa.',
            variant: 'destructive',
          });
          return;
        }
      }

      const condutorPrincipal = values.condutores.find((c) => c.is_principal) ?? null;
      const condutorPrincipalCliente = condutorPrincipal?.cliente_id
        ? (clientes.find((c) => c.id === condutorPrincipal.cliente_id) ?? null)
        : null;
      const condutorPrincipalMotorista = condutorPrincipal?.motorista_id
        ? (motoristas.find((m) => m.id === condutorPrincipal.motorista_id) ?? null)
        : null;
      const condutorPrincipalNome =
        condutorPrincipalCliente?.nome ?? condutorPrincipalMotorista?.nome ?? null;

      const precoModeloLinha =
        values.tarifa_id && viaturaSelecionada?.modelo_id
          ? (precosModeloTvde.find(
              (p) =>
                p.tarifa_id === values.tarifa_id && p.modelo_id === viaturaSelecionada.modelo_id
            ) ?? null)
          : null;

      const baseAluguer = calcularBaseAluguerRenting({
        regime: values.regime,
        isLongaDuracao: values.is_longa_duracao,
        dias:
          values.data_fim && values.data_inicio
            ? Math.max(
                1,
                Math.ceil(
                  (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) /
                    86400000
                )
              )
            : null,
        tarifa: null,
        valorTotalManual: values.valor_total_manual ?? null,
        precoModeloSemana:
          isTvdeSubmit && values.tarifa_id && viaturaSelecionada?.modelo_id
            ? (precoModeloLinha?.preco_semana ?? null)
            : null,
        precoModeloDia:
          !isTvdeSubmit && values.tarifa_id && viaturaSelecionada?.modelo_id
            ? (precoModeloLinha?.preco_dia ?? null)
            : null,
        precoModeloMes:
          !isTvdeSubmit && values.tarifa_id && viaturaSelecionada?.modelo_id
            ? (precoModeloLinha?.preco_mes ?? null)
            : null,
      });

      const payload: ReservaInsert = {
        viatura_id: values.viatura_id || null,
        matricula: matriculaFinal,
        grupo: values.grupo || null,
        estacao_entrega_id: values.estacao_entrega_id || null,
        estacao_recolha_id: values.estacao_recolha_id || null,
        data_inicio: localInputToIso(values.data_inicio),
        data_fim: values.data_fim ? localInputToIso(values.data_fim) : null,
        cliente_id: values.cliente_id || null,
        cliente_nome: values.cliente_nome || null,
        condutor_id: condutorPrincipalMotorista?.id ?? null,
        condutor_nome: condutorPrincipalNome,
        emissor_id: values.emissor_id ?? null,
        estado: values.estado,
        regime: values.regime,
        tarifa_id: values.tarifa_id ?? null,
        slot_valor_semanal: values.regime === 'slot' ? (values.slot_valor_semanal ?? null) : null,
        slot_valor_mensal: values.regime === 'slot' ? (values.slot_valor_mensal ?? null) : null,
        valor_total: baseAluguer ?? values.valor_total,
        valor_total_manual: values.valor_total_manual ?? null,
        franquia_valor: values.franquia_valor,
        caucao_valor: values.caucao_valor,
        kms_incluidos: values.kms_incluidos,
        km_adicional_valor: values.km_adicional_valor,
        is_longa_duracao: values.is_longa_duracao,
        renovacao_opcao: values.is_longa_duracao ? (values.renovacao_opcao ?? null) : null,
        renovacao_intervalo_dias:
          values.is_longa_duracao && values.renovacao_opcao === 'intervalo_dias'
            ? values.renovacao_intervalo_dias
            : null,
        observacoes: values.observacoes || null,
        observacoes_internas: values.observacoes_internas || null,
      };

      const condutoresFinal = values.condutores as CondutorFormItem[];
      const syncCondutores = (reservaId: string) =>
        syncCondutoresMutation
          .mutateAsync({ reservaId, desejados: condutoresFinal })
          .then(() => undefined)
          .catch(() => undefined);

      const coberturasFinal = values.coberturas as CoberturaFormItem[];
      const extrasFinal = values.extras as ExtraFormItem[];
      const taxasFinal = values.taxas as TaxaFormItem[];
      const diasRelacoes =
        values.regime === 'tvde' || !values.data_fim
          ? Math.max(1, values.renovacao_intervalo_dias ?? 30)
          : Math.max(
              1,
              Math.ceil(
                (new Date(values.data_fim).getTime() - new Date(values.data_inicio).getTime()) /
                  86400000
              )
            );
      const custoCoberturas =
        coberturasFinal.reduce((s, c) => s + (c.preco_dia ?? 0), 0) * diasRelacoes;
      const custoExtras = extrasFinal.reduce((s, e) => s + calcExtraTotal(e, diasRelacoes), 0);
      const subtotalTaxas =
        (baseAluguer ?? values.valor_total ?? 0) + custoCoberturas + custoExtras;
      const syncRelacoesExtra = (reservaId: string) =>
        Promise.all([
          syncCoberturasMutation
            .mutateAsync({ reservaId, desejadas: coberturasFinal })
            .catch(() => undefined),
          syncExtrasMutation
            .mutateAsync({ reservaId, desejados: extrasFinal, dias: diasRelacoes })
            .catch(() => undefined),
          syncTaxasMutation
            .mutateAsync({ reservaId, desejadas: taxasFinal, subtotal: subtotalTaxas })
            .catch(() => undefined),
        ]).then(() => undefined);

      if (isEdit && reserva) {
        updateMutation.mutate(
          { id: reserva.id, ...payload, gestor_id: values.gestor_id ?? null },
          {
            onSuccess: async () => {
              const irParaContrato = criarContratoAposGuardarRef.current;
              criarContratoAposGuardarRef.current = false;
              form.reset(form.getValues());

              if (!irParaContrato) {
                void syncCondutores(reserva.id);
                void syncRelacoesExtra(reserva.id);
                return;
              }
              await Promise.all([syncCondutores(reserva.id), syncRelacoesExtra(reserva.id)]);
              navigate(`/renting/contratos/novo?reserva_id=${reserva.id}`);
            },
            onError: () => {
              criarContratoAposGuardarRef.current = false;
            },
          }
        );
      } else {
        createMutation.mutate(payload, {
          onSuccess: async (created) => {
            void syncCondutores(created.id);
            void syncRelacoesExtra(created.id);
            if (anexosPendentes.length > 0) {
              for (const p of anexosPendentes) {
                try {
                  await uploadReservaAnexoSync(created.id, p.file, p.nome);
                } catch (err) {
                  console.error(`Falha a anexar ${p.nome}:`, err);
                }
              }
              setAnexosPendentes([]);
            }
            navigate(`/renting/reservas/${created.id}`);
          },
        });
      }
    } catch {}
  };

  const onInvalid = (errors: FieldErrors<ReservaFormValues>) => {
    const messages: string[] = [];
    const collect = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
      } else if (typeof node === 'object') {
        const maybe = node as { message?: unknown };
        if (typeof maybe.message === 'string') messages.push(maybe.message);
        else Object.values(node).forEach(collect);
      }
    };
    collect(errors);

    setActiveTab('geral');

    const unicas = Array.from(new Set(messages)).slice(0, 4);
    toast({
      title: 'Não foi possível guardar',
      description: unicas.length
        ? unicas.join(' • ')
        : 'Verifica os campos obrigatórios assinalados.',
      variant: 'destructive',
    });
  };

  const handleCriarContrato = () => {
    if (!reserva) return;
    if (!form.formState.isDirty) {
      navigate(`/renting/contratos/novo?reserva_id=${reserva.id}`);
      return;
    }
    criarContratoAposGuardarRef.current = true;
    void form.handleSubmit(onSubmit, (errors) => {
      criarContratoAposGuardarRef.current = false;
      onInvalid(errors);
    })();
  };

  const handleDelete = () => {
    if (!reserva || !podeEliminar) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!reserva || !podeEliminar) return;
    deleteMutation.mutate(reserva.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/renting/reservas');
      },
    });
  };

  if (isEdit && loadingReserva) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEdit && !loadingReserva && !reserva) {
    return (
      <div className="w-full">
        <StickyPageHeader title="Reserva não encontrada" icon={CalendarCheck}>
          <Button variant="outline" onClick={() => navigate('/renting/reservas')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </StickyPageHeader>
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            A reserva pedida não existe ou foi eliminada.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <StickyPageHeader
          title={isEdit ? `Reserva #${reserva?.codigo}` : 'Nova Reserva'}
          description={
            bloqueadaPorContrato
              ? 'Reserva já convertida em contrato — só leitura'
              : isEdit
                ? 'Editar dados da reserva existente'
                : 'Cria uma nova reserva de renting'
          }
          icon={CalendarCheck}
        >
          <Button type="button" variant="outline" onClick={goBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {isEdit && !bloqueadaPorContrato && podeEliminar && (
            <Button
              type="button"
              variant="destructive"
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
          {isEdit &&
            reserva &&
            (reserva.regime === 'slot' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDocumentosDialogOpen(true)}
                disabled={!reserva.condutor_id}
                title={
                  reserva.condutor_id
                    ? undefined
                    : 'Define o motorista na aba Motoristas antes de gerar documentos.'
                }
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Gerar Documentos
              </Button>
            ) : contratoExistente ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/renting/contratos/${contratoExistente.id}`)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Ver Contrato{contratoExistente.codigo ? ` #${contratoExistente.codigo}` : ''}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={handleCriarContrato}
                disabled={!podeCriarContrato || isPending}
                title={tituloCriarContrato}
                className="gap-2"
              >
                {isPending && criarContratoAposGuardarRef.current ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Criar Contrato
              </Button>
            ))}
          {!bloqueadaPorContrato && (
            <Button
              type="button"
              onClick={form.handleSubmit(onSubmit, onInvalid)}
              disabled={isPending}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar' : 'Criar'}
            </Button>
          )}
        </StickyPageHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            {bloqueadaPorContrato && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">
                  Esta reserva já gerou o contrato
                  {contratoExistente?.codigo ? ` #${contratoExistente.codigo}` : ''}. É só leitura —
                  para alterar a viatura, datas ou outros dados, edita o contrato (que cria uma nova
                  versão).
                </p>
              </div>
            )}

            {!bloqueadaPorContrato && temConflito && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">
                  Conflito de datas — esta viatura já tem outra reserva activa que se sobrepõe a
                  este período. Guardar irá falhar.
                </p>
              </div>
            )}

            <fieldset
              disabled={bloqueadaPorContrato}
              className="m-0 min-w-0 border-0 p-0 disabled:opacity-95"
            >
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-4 items-start">
                <Card className="bg-card border-border">
                  <CardContent className="p-4 sm:p-6">
                    <ReservaTabsPlaceholder
                      value={activeTab}
                      onValueChange={setActiveTab}
                      geralContent={
                        <ReservaTabGeral
                          form={form}
                          viaturas={viaturasParaSelecao}
                          estacoes={estacoes}
                          clientes={clientes}
                          motoristas={motoristas}
                          onCriarMotorista={() => setMotoristaDialogOpen(true)}
                          onCriarNovoCliente={() => setClienteDialogOpen(true)}
                          onCriarCondutorProvisorio={() => setCondutorProvisorioOpen(true)}
                        />
                      }
                      coberturasContent={
                        <ReservaTabCobertura form={form} coberturas={coberturasCatalogo} />
                      }
                      extrasContent={<ReservaTabExtras form={form} extras={extrasCatalogo} />}
                      taxasContent={<ReservaTabTaxas form={form} taxas={taxasCatalogo} />}
                      faturarContent={
                        mostrarFaturacao && reserva ? (
                          <ReservaTabFaturar reserva={reserva} />
                        ) : undefined
                      }
                      historicoContent={
                        isEdit && reserva ? (
                          <ReservaTabHistorico
                            reserva={reserva}
                            contratoExistente={contratoExistente}
                            onAbrirContrato={
                              contratoExistente
                                ? () => navigate(`/renting/contratos/${contratoExistente.id}`)
                                : undefined
                            }
                          />
                        ) : undefined
                      }
                      danosContent={<ReservaTabDanos contratoId={contratoExistente?.id ?? null} />}
                      anexosContent={
                        <ReservaTabAnexos
                          reservaId={isEdit ? (id ?? null) : null}
                          pendentes={anexosPendentes}
                          onAdicionarPendentes={adicionarAnexosPendentes}
                          onRenomearPendente={renomearAnexoPendente}
                          onRemoverPendente={removerAnexoPendente}
                        />
                      }
                    />
                  </CardContent>
                </Card>

                <div className="xl:sticky xl:top-24">
                  <ReservaResumoSidebar
                    form={form}
                    estacoes={estacoes}
                    viaturas={viaturas}
                    isEdit={isEdit}
                  />
                </div>
              </div>
            </fieldset>
          </form>
        </Form>
      </div>

      <ReservaDeleteConfirm
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        reserva={reserva ?? null}
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

      <CondutorProvisiorioDialog
        open={condutorProvisorioOpen}
        onOpenChange={setCondutorProvisorioOpen}
        onCreated={(m) => {
          handleMotoristaCriado(m.id);
          queryClient.invalidateQueries({ queryKey: ['motoristas'] });
        }}
      />

      {reserva && (
        <GenerateDocumentsDialog
          open={documentosDialogOpen}
          onOpenChange={setDocumentosDialogOpen}
          motorista={motoristas.find((m) => m.id === reserva.condutor_id) ?? null}
          motoristaSecundario={motoristaSecundario}
          viaturaId={reserva.viatura_id}
        />
      )}
    </>
  );
};

export default RentingReservaForm;
