import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ArrowLeft, CalendarCheck, FileText, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
import { useContratoIdByReserva } from '@/hooks/useContratosRenting';
import { uploadReservaAnexoSync } from '@/hooks/useReservaAnexos';
import { useViaturas } from '@/hooks/useViaturas';

import { ClienteDialog } from '@/components/renting/ClienteDialog';
import { MotoristaDialog } from '@/components/motoristas/MotoristaDialog';
import { ReservaDeleteConfirm } from '@/components/renting/reservas/ReservaDeleteConfirm';
import { ContratoPrestacaoDialog } from '@/components/renting/reservas/ContratoPrestacaoDialog';
import { ReservaResumoSidebar } from '@/components/renting/reservas/ReservaResumoSidebar';
import {
  ReservaTabAnexos,
  type AnexoPendente,
} from '@/components/renting/reservas/tabs/ReservaTabAnexos';
import { ReservaTabCondutores } from '@/components/renting/reservas/tabs/ReservaTabCondutores';
import { ReservaTabGeral } from '@/components/renting/reservas/tabs/ReservaTabGeral';
import {
  isoToLocalInput,
  localInputToIso,
  reservaDialogSchema,
  type ReservaFormValues,
} from '@/components/renting/reservas/reservaDialog.schema';

import type { CondutorFormItem, ReservaInsert } from '@/types/reserva';

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
  estado: 'pendente',
  regime: 'rent_a_car',
  valor_total: null,
  franquia_valor: null,
  caucao_valor: null,
  kms_incluidos: null,
  km_adicional_valor: null,
  slot_valor_semanal: null,
  is_longa_duracao: false,
  renovacao_opcao: null,
  renovacao_intervalo_dias: null,
  observacoes: '',
  observacoes_internas: '',
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
  const { data: contratoExistente } = useContratoIdByReserva(isEdit ? id : null);

  const { data: clientes = [] } = useClientes();
  const { data: motoristas = [] } = useMotoristas({ apenasAtivos: true });
  const { data: viaturas = [] } = useViaturas({ apenasDisponiveis: !isEdit });
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });

  const createMutation = useCreateReserva();
  const updateMutation = useUpdateReserva();
  const deleteMutation = useDeleteReserva();
  const syncCondutoresMutation = useSyncReservaCondutores();

  const [activeTab, setActiveTab] = useState('geral');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [anexosPendentes, setAnexosPendentes] = useState<AnexoPendente[]>([]);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [motoristaDialogOpen, setMotoristaDialogOpen] = useState(false);
  const [prestacaoDialogOpen, setPrestacaoDialogOpen] = useState(false);
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
    createMutation.isPending || updateMutation.isPending || syncCondutoresMutation.isPending;

  const form = useForm<ReservaFormValues>({
    resolver: zodResolver(reservaDialogSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Pré-preenchimento via URL (criar reserva a partir de viatura/cliente).
  // Só corre uma vez quando os dados das listas (viaturas/clientes) chegam.
  useEffect(() => {
    if (isEdit) return;
    if (!viaturaIdFromUrl && !clienteIdFromUrl) return;

    const viatura = viaturaIdFromUrl ? viaturas.find((v) => v.id === viaturaIdFromUrl) : null;
    const cliente = clienteIdFromUrl ? clientes.find((c) => c.id === clienteIdFromUrl) : null;

    if (viatura) {
      form.setValue('viatura_id', viatura.id, { shouldDirty: false });
      form.setValue('matricula', viatura.matricula ?? '', { shouldDirty: false });
    }
    if (cliente) {
      form.setValue('cliente_id', cliente.id, { shouldDirty: false });
      form.setValue('cliente_nome', cliente.nome ?? '', { shouldDirty: false });
    }
    // Ambos: só faz sentido validar uma vez quando as listas existem
  }, [isEdit, viaturaIdFromUrl, clienteIdFromUrl, viaturas, clientes, form]);

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
      form.setValue(
        'condutores',
        [{ cliente_id: null, motorista_id: motoristaId, is_principal: true }],
        { shouldDirty: true, shouldValidate: true }
      );
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
    form.setValue(
      'condutores',
      [
        ...existentes,
        { cliente_id: null, motorista_id: motoristaId, is_principal: existentes.length === 0 },
      ],
      { shouldDirty: true, shouldValidate: true }
    );
  };

  // Hidrata o formulário quando a reserva carrega (modo edição).
  useEffect(() => {
    if (!isEdit) return;
    if (!reserva) return;
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
      estado: reserva.estado,
      regime: reserva.regime,
      slot_valor_semanal: reserva.slot_valor_semanal,
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
      condutores: condutoresAtuais.map((c) => ({
        cliente_id: c.cliente_id,
        motorista_id: c.motorista_id,
        is_principal: c.is_principal,
      })),
    });
  }, [isEdit, reserva, condutoresAtuais, form]);

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
  const reservaCompleta = !!(
    reserva &&
    reserva.cliente_id &&
    reserva.viatura_id &&
    reserva.estacao_entrega_id &&
    // Recolha só é exigida em rent-a-car (TVDE não devolve a viatura).
    (reserva.regime !== 'rent_a_car' || reserva.estacao_recolha_id)
  );
  const podeCriarContrato = reservaCompleta && !form.formState.isDirty;
  const motivoContratoBloqueado = !reservaCompleta
    ? 'Preenche cliente, viatura e estação de entrega (e recolha, em rent-a-car) e guarda a reserva.'
    : form.formState.isDirty
      ? 'Guarda as alterações antes de criar o contrato.'
      : undefined;

  // Os condutores PERSISTEM ao trocar de regime — não se apaga a lista (senão o
  // condutor "desaparece"). A tabela de condutores mostra clientes (rent-a-car) ou
  // motoristas (TVDE/slot) conforme o tipo gravado em cada linha; o utilizador
  // remove manualmente os que não interessam ao novo regime.
  const regimeWatched = form.watch('regime');

  // Qualquer viatura pode ser alugada em rent-a-car ou TVDE.
  // O campo habilitada_tvde é apenas informativo/administrativo, não restringe.
  const viaturasParaSelecao = viaturas;

  const onSubmit = async (values: ReservaFormValues) => {
    try {
      const viaturaSelecionada = viaturas.find((v) => v.id === values.viatura_id);
      const matriculaFinal = values.matricula || viaturaSelecionada?.matricula || null;

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

      const payload: ReservaInsert = {
        viatura_id: values.viatura_id || null,
        matricula: matriculaFinal,
        grupo: values.grupo || null,
        estacao_entrega_id: values.estacao_entrega_id || null,
        estacao_recolha_id: values.estacao_recolha_id || null,
        data_inicio: localInputToIso(values.data_inicio),
        // Slot é aberto (sem data fim); restantes regimes exigem data_fim.
        data_fim: values.data_fim ? localInputToIso(values.data_fim) : null,
        cliente_id: values.cliente_id || null,
        cliente_nome: values.cliente_nome || null,
        // Snapshot legado de condutor (compat) — preenchido a partir da lista
        // bifurcada. Em TVDE/slot usa o motorista, em rent-a-car fica null.
        condutor_id: condutorPrincipalMotorista?.id ?? null,
        condutor_nome: condutorPrincipalNome,
        estado: values.estado,
        regime: values.regime,
        // Valor semanal só no regime slot (cobrado por carro).
        slot_valor_semanal: values.regime === 'slot' ? (values.slot_valor_semanal ?? null) : null,
        valor_total: values.valor_total,
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

      if (isEdit && reserva) {
        // Editar: ficar na própria página (utilizador vê toast e continua a trabalhar).
        updateMutation.mutate(
          { id: reserva.id, ...payload },
          { onSuccess: () => syncCondutores(reserva.id) }
        );
      } else {
        // Criar: navegar para modo edição da nova reserva.
        // Permite clicar logo "Criar Contrato" sem voltar à lista.
        createMutation.mutate(payload, {
          onSuccess: async (created) => {
            syncCondutores(created.id);
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

    // Campo de condutores vive na tab "Condutores" (exceto em slot, que é no Geral).
    if (errors.condutores && regimeWatched !== 'slot') setActiveTab('condutores');
    else setActiveTab('geral');

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
            isEdit ? 'Editar dados da reserva existente' : 'Cria uma nova reserva de renting'
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
          {isEdit && (
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
            // Slot não gera contrato_renting — gera contrato de prestação de serviços.
            (reserva.regime === 'slot' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPrestacaoDialogOpen(true)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Gerar Contrato de Prestação
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
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit, onInvalid)}
            disabled={isPending}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Guardar' : 'Criar'}
          </Button>
        </StickyPageHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            {temConflito && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">
                  Conflito de datas — esta viatura já tem outra reserva activa que se sobrepõe a
                  este período. Guardar irá falhar.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-4 items-start">
              <Card className="bg-card border-border">
                <CardContent className="p-4 sm:p-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    {/* Em slot o motorista escolhe-se no Geral — sem tab Condutores. */}
                    <TabsList
                      className={cn(
                        'grid w-full sm:w-auto sm:inline-flex',
                        regimeWatched === 'slot' ? 'grid-cols-2' : 'grid-cols-3'
                      )}
                    >
                      <TabsTrigger value="geral">Geral</TabsTrigger>
                      {regimeWatched !== 'slot' && (
                        <TabsTrigger value="condutores">Condutores</TabsTrigger>
                      )}
                      <TabsTrigger value="anexos">Anexos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="geral" className="pt-4">
                      <ReservaTabGeral
                        form={form}
                        viaturas={viaturasParaSelecao}
                        estacoes={estacoes}
                        clientes={clientes}
                        motoristas={motoristas}
                        onCriarMotorista={() => setMotoristaDialogOpen(true)}
                      />
                    </TabsContent>

                    {regimeWatched !== 'slot' && (
                      <TabsContent value="condutores" className="pt-4">
                        <ReservaTabCondutores
                          form={form}
                          regime={regimeWatched}
                          clientes={clientes}
                          motoristas={motoristas}
                          onCriarNovoCliente={() => setClienteDialogOpen(true)}
                          onCriarNovoMotorista={() => setMotoristaDialogOpen(true)}
                        />
                      </TabsContent>
                    )}

                    <TabsContent value="anexos" className="pt-4">
                      <ReservaTabAnexos
                        reservaId={isEdit ? (id ?? null) : null}
                        pendentes={anexosPendentes}
                        onAdicionarPendentes={adicionarAnexosPendentes}
                        onRenomearPendente={renomearAnexoPendente}
                        onRemoverPendente={removerAnexoPendente}
                      />
                    </TabsContent>
                  </Tabs>
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

      {reserva && (
        <ContratoPrestacaoDialog
          open={prestacaoDialogOpen}
          onOpenChange={setPrestacaoDialogOpen}
          reserva={reserva}
          motoristas={motoristas}
          viaturas={viaturas}
        />
      )}
    </>
  );
};

export default RentingReservaForm;
