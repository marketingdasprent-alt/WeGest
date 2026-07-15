import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id && id !== 'nova';
  // Pré-preenchimento por URL (atalhos a partir de viatura/cliente).
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
  // Segundo condutor da reserva (regime slot, 2 motoristas a partilhar a
  // viatura) — alimenta o seletor de condutor no dialog "Gerar Documentos".
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
  const syncCondutoresMutation = useSyncReservaCondutores();
  const syncCoberturasMutation = useSyncReservaCoberturas();
  const syncExtrasMutation = useSyncReservaExtras();
  const syncTaxasMutation = useSyncReservaTaxas();

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

  // Instância-pai de useFieldArray para os handlers "criar cliente/motorista"
  // (append) e o fluxo slot (replace). A HIDRATAÇÃO das listas é feita com
  // `form.reset` (mais abaixo) — um `replace()`/`setValue` de instância-pai NÃO
  // chega ao useFieldArray-filho que desenha a tabela de condutores.
  const { append: appendCondutor, replace: replaceCondutores } = useFieldArray({
    control: form.control,
    name: 'condutores',
  });

  // Pré-preenchimento via URL (criar reserva a partir de viatura/cliente).
  // Só corre uma vez — mas só marca como feito depois de resolver o grupo (se
  // a viatura tiver um), senão a lista de grupos podia chegar depois da de
  // viaturas e o campo `grupo` ficava `null` para sempre (bloqueia "Criar
  // Contrato" mais tarde, mesmo a viatura já tendo grupo atribuído).
  const prefilledFromUrlRef = useRef(false);
  useEffect(() => {
    if (isEdit || prefilledFromUrlRef.current) return;
    if (!viaturaIdFromUrl && !clienteIdFromUrl) return;

    const viatura = viaturaIdFromUrl ? viaturas.find((v) => v.id === viaturaIdFromUrl) : null;
    const cliente = clienteIdFromUrl ? clientes.find((c) => c.id === clienteIdFromUrl) : null;

    // Ainda a carregar a lista de onde vem o dado pedido pela URL — tenta de novo
    // no próximo render em vez de desistir.
    if ((viaturaIdFromUrl && !viatura) || (clienteIdFromUrl && !cliente)) return;

    if (viatura) {
      form.setValue('viatura_id', viatura.id, { shouldDirty: false });
      form.setValue('matricula', viatura.matricula ?? '', { shouldDirty: false });
      // Resolve o grupo da viatura (necessário para criar contrato depois).
      // Se a viatura tem grupo_id mas a lista de grupos ainda não chegou,
      // não marca como concluído — tenta de novo quando `grupos` carregar.
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

  /** Adiciona um cliente recém-criado à lista de condutores (rent-a-car). */
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

  /** Adiciona um motorista recém-criado à lista de condutores (TVDE/slot). */
  const handleMotoristaCriado = (motoristaId: string) => {
    // No regime slot: marca o motorista como slot, define-o como único
    // condutor e actualiza a lista para aparecer no seletor de slot.
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

  // Hidrata o formulário quando a reserva carrega (modo edição). Só corre UMA
  // vez — senão um refetch (ex.: invalidação disparada pelo próprio guardar,
  // ou por outra aba/acção que invalide a query da reserva) volta a fazer
  // reset e apaga edições em curso (ver hidratou em useContratoForm.ts, mesmo
  // padrão). As relações (condutores/coberturas/extras/taxas) são hidratadas
  // à parte, logo a seguir, para poderem re-sincronizar em segurança sempre
  // que a sua própria query refetch — sem arrastar o resto do formulário.
  const hidratouRef = useRef(false);
  useEffect(() => {
    if (!isEdit || !reserva || hidratouRef.current) return;
    hidratouRef.current = true;
    form.reset({
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
      coberturas: [],
      extras: [],
      taxas: [],
      condutores: [],
    });
  }, [isEdit, reserva, form]);

  // Hidratação das relações m:n — em efeitos próprios (não no reset principal)
  // para poderem re-sincronizar sempre que a respectiva query refetch (ex.:
  // logo após guardar), sem apagar o resto do formulário entretanto editado.
  //
  // TEM de ser `form.reset(...)` (com keepDirtyValues), NÃO um `replace()` de
  // uma instância-pai de useFieldArray nem um `setValue`: os componentes que
  // desenham estas listas (CondutoresFields / ReservaTab{Cobertura,Extras,
  // Taxas}) têm o SEU PRÓPRIO useFieldArray com o mesmo nome. Duas instâncias
  // de useFieldArray no mesmo campo NÃO sincronizam entre si — um replace()
  // no pai atualiza o valor do form mas a cópia interna do filho (o que é
  // desenhado) fica vazia; o item existia mas ficava invisível, e só reaparecia
  // (a par do novo) ao adicionar um manualmente. Só `form.reset` re-inicializa
  // TODAS as instâncias de useFieldArray de uma vez. keepDirtyValues preserva
  // os campos que o utilizador já alterou, incluindo a própria lista.
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

  // Reservas com `grupo` vazio mas cuja viatura já tem grupo_id atribuído (ex.:
  // criadas antes do grupo ficar preenchido, ou a viatura só recebeu grupo
  // depois) ficavam bloqueadas em "Criar Contrato" para sempre: "Criar
  // Contrato" lê a reserva PERSISTIDA (não o form), e só a troca ACTIVA de
  // viatura preenche `grupo` (aplicarDadosViatura) — a hidratação de uma
  // reserva já existente nunca o fazia, e um "Guardar" sem tocar em mais nada
  // não bastava para desbloquear. Reconcilia a BD silenciosamente ao abrir.
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

  // Pré-check de conflito de datas (UX-only — o gate real é o EXCLUDE na BD).
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

  // "Criar Contrato" está sempre presente em edição, mas só fica activo quando a
  // reserva GUARDADA tem os campos obrigatórios e não há alterações por gravar —
  // o contrato é gerado a partir da reserva persistida (reserva_id), não do form.
  // Completude por regime. O condutor pode ser cliente (rent-a-car) ou
  // motorista (TVDE), por isso aceitamos qualquer condutor guardado — exigir
  // `cliente_id` bloqueava o TVDE. As estações só são obrigatórias no aluguer
  // (rent-a-car); o TVDE não as usa. (Slot não chega aqui — gera prestação.)
  const temCondutor = !!reserva?.cliente_id || condutoresAtuais.length > 0;
  const temEstacoes = !!(reserva?.estacao_entrega_id && reserva?.estacao_recolha_id);
  // grupo é obrigatório: sem grupo não há tarifa e o contrato fica inválido.
  const temGrupo = !!reserva?.grupo;
  const reservaCompleta = !!(
    reserva &&
    reserva.viatura_id &&
    temGrupo &&
    temCondutor &&
    (reserva.regime === 'rent_a_car' ? temEstacoes : true)
  );
  const podeCriarContrato = reservaCompleta && !form.formState.isDirty;
  // A reserva é só a porta de entrada: depois de gerar contrato, a fonte de
  // verdade passa a ser o contrato. A reserva fica read-only — para mudar
  // viatura/dados, edita-se o contrato (que versiona). Slot não gera
  // contrato_renting, por isso nunca é bloqueada por aqui.
  const bloqueadaPorContrato = isEdit && !!contratoExistente;
  const motivoContratoBloqueado = !reservaCompleta
    ? reserva?.viatura_id && !temGrupo
      ? 'A viatura selecionada não tem grupo — atribui um grupo na ficha da viatura e volta a selecionar.'
      : reserva?.regime === 'rent_a_car'
        ? 'Preenche condutor, viatura e estações (entrega e recolha) e guarda a reserva.'
        : 'Preenche condutor e viatura e guarda a reserva.'
    : form.formState.isDirty
      ? 'Guarda as alterações antes de criar o contrato.'
      : undefined;

  // Os condutores PERSISTEM ao trocar de regime — não se apaga a lista (senão o
  // condutor "desaparece"). A tabela de condutores mostra clientes (rent-a-car) ou
  // motoristas (TVDE/slot) conforme o tipo gravado em cada linha; o utilizador
  // remove manualmente os que não interessam ao novo regime.
  const regimeWatched = form.watch('regime');

  // Auto‑activa longa duração + intervalo 30d para TVDE/slot; desmarca ao
  // voltar a rent-a-car. SÓ quando o UTILIZADOR troca de regime de facto — o
  // ref-guard salta a primeira corrida (mount) e a hidratação, senão a
  // primeira montagem forçava is_longa_duracao=false e apagava o valor
  // guardado de um rent-a-car de longa duração (a "caixa que saía sozinha").
  const regimeAnteriorRef = useRef<string | null>(null);
  useEffect(() => {
    const anterior = regimeAnteriorRef.current;
    regimeAnteriorRef.current = regimeWatched;
    // Mount/hidratação (anterior === null) ou sem mudança real: não mexer.
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

  // Viaturas ocupadas (reserva/contrato sobreposto) no período escolhido — para
  // não as oferecer a outro cliente nas mesmas datas. Em edição, ignora a própria
  // reserva (e o contrato que dela derive) para não se auto-excluir.
  const { data: viaturasOcupadas } = useViaturasOcupadasPeriodo({
    dataInicio,
    dataFim,
    excluirReservaId: isEdit ? id : null,
    excluirContratoId: contratoExistente?.id ?? null,
  });

  // Qualquer viatura pode ser alugada em rent-a-car ou TVDE.
  // O campo habilitada_tvde é apenas informativo/administrativo, não restringe.
  // Excluímos as ocupadas no período, MAS mantemos sempre a já selecionada
  // (senão desaparecia da lista ao abrir a reserva existente).
  const viaturasParaSelecao = !viaturasOcupadas
    ? viaturas
    : viaturas.filter((v) => v.id === viaturaId || !viaturasOcupadas.has(v.id));

  // Faturação da reserva: só em edição, com reserva guardada e fora do regime slot
  // (slot fatura via Contrato de Prestação).
  const mostrarFaturacao = isEdit && !!reserva && reserva.regime !== 'slot';

  const onSubmit = async (values: ReservaFormValues) => {
    try {
      const viaturaSelecionada = viaturas.find((v) => v.id === values.viatura_id);
      const matriculaFinal = values.matricula || viaturaSelecionada?.matricula || null;

      // Bloqueia guardar se o modelo da viatura não tem preço na tarifa
      // escolhida (o preço é definido por modelo na tarifa, tanto TVDE como
      // Rent-a-Car). TVDE valida preco_semana; Rent-a-Car valida preco_dia.
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

      // Condutor principal — derivado da lista para snapshot legado em reservas.
      // Pode ser cliente (rent-a-car) ou motorista (TVDE).
      const condutorPrincipal = values.condutores.find((c) => c.is_principal) ?? null;
      const condutorPrincipalCliente = condutorPrincipal?.cliente_id
        ? (clientes.find((c) => c.id === condutorPrincipal.cliente_id) ?? null)
        : null;
      const condutorPrincipalMotorista = condutorPrincipal?.motorista_id
        ? (motoristas.find((m) => m.id === condutorPrincipal.motorista_id) ?? null)
        : null;
      const condutorPrincipalNome =
        condutorPrincipalCliente?.nome ?? condutorPrincipalMotorista?.nome ?? null;

      // Linha de preço por modelo da tarifa escolhida (TVDE ou Rent-a-Car).
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
        valorTotalManual: values.valor_total,
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
        // Slot e TVDE são abertos (sem data fim); só rent-a-car exige data_fim.
        data_fim: values.data_fim ? localInputToIso(values.data_fim) : null,
        cliente_id: values.cliente_id || null,
        cliente_nome: values.cliente_nome || null,
        // Snapshot legado de condutor (compat) — preenchido a partir da lista
        // bifurcada. Em TVDE/slot usa o motorista, em rent-a-car fica null.
        condutor_id: condutorPrincipalMotorista?.id ?? null,
        condutor_nome: condutorPrincipalNome,
        emissor_id: values.emissor_id ?? null,
        estado: values.estado,
        regime: values.regime,
        tarifa_id: values.tarifa_id ?? null,
        // Valor semanal só no regime slot (cobrado por carro).
        slot_valor_semanal: values.regime === 'slot' ? (values.slot_valor_semanal ?? null) : null,
        slot_valor_mensal: values.regime === 'slot' ? (values.slot_valor_mensal ?? null) : null,
        valor_total: baseAluguer ?? values.valor_total,
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

      // Persiste os condutores (m:n com clientes) após gravar/atualizar a reserva.
      // Espelha o padrão do ContratoForm — sem isto, o array `values.condutores`
      // fica só no form e nunca chega à BD (motorista "desaparece" após guardar).
      // O array já passou pela validação Zod do handleSubmit — cast seguro.
      const condutoresFinal = values.condutores as CondutorFormItem[];
      const syncCondutores = (reservaId: string) => {
        syncCondutoresMutation.mutate({
          reservaId,
          desejados: condutoresFinal,
        });
      };

      // Persiste coberturas/extras/taxas (m:n com os catálogos) — mesmo padrão
      // do ContratoForm. Nº de dias para os extras periódicos/coberturas: TVDE
      // ou slot (sem data fim) usa o intervalo de renovação, tal como no contrato.
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
      const syncRelacoesExtra = (reservaId: string) => {
        syncCoberturasMutation.mutate({ reservaId, desejadas: coberturasFinal });
        syncExtrasMutation.mutate({ reservaId, desejados: extrasFinal, dias: diasRelacoes });
        syncTaxasMutation.mutate({ reservaId, desejadas: taxasFinal, subtotal: subtotalTaxas });
      };

      if (isEdit && reserva) {
        // Editar: ficar na própria página (utilizador vê toast e continua a trabalhar).
        // gestor_id (reatribuição por superior) vai só no update — na criação o
        // dono é definido pela BD (= quem cria). Para não-superiores é o valor
        // hidratado (sem efeito).
        updateMutation.mutate(
          { id: reserva.id, ...payload, gestor_id: values.gestor_id ?? null },
          {
            onSuccess: () => {
              syncCondutores(reserva.id);
              syncRelacoesExtra(reserva.id);
            },
          }
        );
      } else {
        // Criar: navegar para modo edição da nova reserva.
        // Permite clicar logo "Criar Contrato" sem voltar à lista.
        createMutation.mutate(payload, {
          onSuccess: async (created) => {
            syncCondutores(created.id);
            syncRelacoesExtra(created.id);
            // Upload em batch dos anexos pendentes — best-effort.
            if (anexosPendentes.length > 0) {
              for (const p of anexosPendentes) {
                try {
                  await uploadReservaAnexoSync(created.id, p.file, p.nome);
                } catch (err) {
                  // Log + continua para os próximos. O utilizador pode re-anexar
                  // em edição se algum falhar.
                  console.error(`Falha a anexar ${p.nome}:`, err);
                }
              }
              setAnexosPendentes([]);
            }
            navigate(`/renting/reservas/${created.id}`);
          },
        });
      }
    } catch {
      // Erros são reportados via toast pelas mutations
    }
  };

  // Validação falhou — mostrar o motivo (senão "Guardar" parece não fazer nada)
  // e saltar para a tab onde está o campo com erro.
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

  const handleDelete = () => {
    if (!reserva) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!reserva) return;
    deleteMutation.mutate(reserva.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/renting/reservas');
      },
    });
  };

  // Estados de carregamento em edição
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
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/renting/reservas')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {isEdit && !bloqueadaPorContrato && (
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
            // Slot não gera contrato_renting — gera os documentos do motorista
            // (checklist de templates, incl. contrato de prestação).
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
                onClick={() => navigate(`/renting/contratos/novo?reserva_id=${reserva.id}`)}
                disabled={!podeCriarContrato}
                title={motivoContratoBloqueado}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
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
