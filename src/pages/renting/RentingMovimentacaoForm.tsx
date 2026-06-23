import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRightLeft, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

import { useViaturas } from '@/hooks/useViaturas';
import { useEstacoes } from '@/hooks/useEstacoes';
import { useColaboradores } from '@/hooks/useColaboradores';
import {
  useMovimento,
  useCreateMovimento,
  useUpdateMovimento,
  useDeleteMovimento,
} from '@/hooks/useMovimentos';
import { uploadMovimentoAnexoSync } from '@/hooks/useMovimentoAnexos';

import {
  movimentoFormSchema,
  type MovimentoFormValues,
} from '@/components/renting/movimentacoes/movimentoForm.schema';
import {
  isoToLocalInput,
  localInputToIso,
} from '@/components/renting/movimentacoes/movimentosUtils';
import { MovimentoDeleteConfirm } from '@/components/renting/movimentacoes/MovimentoDeleteConfirm';
import { MovimentoResumoSidebar } from '@/components/renting/movimentacoes/MovimentoResumoSidebar';
import { MovimentoTabGeral } from '@/components/renting/movimentacoes/tabs/MovimentoTabGeral';
import { MovimentoTabDetalhes } from '@/components/renting/movimentacoes/tabs/MovimentoTabDetalhes';
import { MovimentoTabObservacoes } from '@/components/renting/movimentacoes/tabs/MovimentoTabObservacoes';
import {
  MovimentoTabAnexos,
  type AnexoPendente,
} from '@/components/renting/movimentacoes/tabs/MovimentoTabAnexos';

import type { MovimentoInsert } from '@/types/movimento';

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_VALUES: MovimentoFormValues = {
  tipo: 'transferencia',
  estado: 'a_decorrer',
  viatura_id: null,
  matricula: '',
  estacao_origem_id: null,
  estacao_destino_id: null,
  data_partida: nowLocalInput(),
  data_chegada: '',
  colaborador_id: null,
  colaborador_nome: '',
  km_inicial: null,
  km_final: null,
  combustivel_inicial: null,
  combustivel_final: null,
  motivo: '',
  prestador: '',
  custo_estimado: null,
  custo_final: null,
  info: '',
  observacoes: '',
  observacoes_internas: '',
};

const RentingMovimentacaoForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id && id !== 'novo';
  const viaturaIdFromUrl = !isEdit ? searchParams.get('viatura_id') : null;

  const { data: movimento, isLoading: loadingMovimento } = useMovimento(isEdit ? id : null);
  // Carregamos TODAS as viaturas (não vendidas). O ViaturaDisponibilidadeSelect
  // dentro do tab Geral mostra-as todas, marcando as ocupadas no intervalo
  // [data_partida, data_chegada] como desabilitadas com tooltip explicativo.
  const { data: viaturas = [] } = useViaturas({ excluirVendidas: true });
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: colaboradores = [] } = useColaboradores();

  const createMutation = useCreateMovimento();
  const updateMutation = useUpdateMovimento();
  const deleteMutation = useDeleteMovimento();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [anexosPendentes, setAnexosPendentes] = useState<AnexoPendente[]>([]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<MovimentoFormValues>({
    resolver: zodResolver(movimentoFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Hidrata o formulário em modo edição.
  useEffect(() => {
    if (!isEdit || !movimento) return;
    form.reset({
      tipo: movimento.tipo,
      estado: movimento.estado,
      viatura_id: movimento.viatura_id,
      matricula: movimento.matricula ?? '',
      estacao_origem_id: movimento.estacao_origem_id,
      estacao_destino_id: movimento.estacao_destino_id,
      data_partida: isoToLocalInput(movimento.data_partida),
      data_chegada: isoToLocalInput(movimento.data_chegada),
      colaborador_id: movimento.colaborador_id,
      colaborador_nome: movimento.colaborador_nome ?? '',
      km_inicial: movimento.km_inicial,
      km_final: movimento.km_final,
      combustivel_inicial: movimento.combustivel_inicial,
      combustivel_final: movimento.combustivel_final,
      motivo: movimento.motivo ?? '',
      prestador: movimento.prestador ?? '',
      custo_estimado: movimento.custo_estimado,
      custo_final: movimento.custo_final,
      info: movimento.info ?? '',
      observacoes: movimento.observacoes ?? '',
      observacoes_internas: movimento.observacoes_internas ?? '',
    });
  }, [isEdit, movimento, form]);

  // Pré-preenche a viatura quando vem por query param (?viatura_id=...),
  // ex.: botão "Nova movimentação" no perfil da viatura.
  useEffect(() => {
    if (isEdit || !viaturaIdFromUrl || viaturas.length === 0) return;
    if (form.getValues('viatura_id')) return;
    const v = viaturas.find((x) => x.id === viaturaIdFromUrl);
    if (!v) return;
    form.setValue('viatura_id', v.id, { shouldDirty: false });
    form.setValue('matricula', v.matricula ?? '', { shouldDirty: false });
  }, [isEdit, viaturaIdFromUrl, viaturas, form]);

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

  const renomearAnexoPendente = (anexoId: string, nome: string) => {
    setAnexosPendentes((prev) => prev.map((p) => (p.id === anexoId ? { ...p, nome } : p)));
  };

  const removerAnexoPendente = (anexoId: string) => {
    setAnexosPendentes((prev) => prev.filter((p) => p.id !== anexoId));
  };

  const onSubmit = async (values: MovimentoFormValues) => {
    const viaturaSelecionada = viaturas.find((v) => v.id === values.viatura_id);

    const payload: MovimentoInsert = {
      tipo: 'transferencia',
      estado: values.estado,
      viatura_id: values.viatura_id,
      matricula: values.matricula || viaturaSelecionada?.matricula || null,
      estacao_origem_id: values.estacao_origem_id ?? null,
      estacao_destino_id: values.estacao_destino_id ?? null,
      data_partida: localInputToIso(values.data_partida),
      data_chegada: localInputToIso(values.data_chegada),
      colaborador_id: values.colaborador_id ?? null,
      colaborador_nome: values.colaborador_nome || null,
      km_inicial: values.km_inicial,
      km_final: values.km_final,
      combustivel_inicial: values.combustivel_inicial,
      combustivel_final: values.combustivel_final,
      motivo: null,
      prestador: null,
      custo_estimado: null,
      custo_final: null,
      info: values.info || null,
      observacoes: values.observacoes || null,
      observacoes_internas: values.observacoes_internas || null,
    };

    try {
      let movimentoId: string;
      if (isEdit && movimento) {
        const updated = await updateMutation.mutateAsync({ id: movimento.id, ...payload });
        movimentoId = updated.id;
      } else {
        const created = await createMutation.mutateAsync(payload);
        movimentoId = created.id;
      }

      if (!isEdit && anexosPendentes.length > 0) {
        for (const p of anexosPendentes) {
          try {
            await uploadMovimentoAnexoSync(movimentoId, p.file, p.nome);
          } catch (err) {
            console.error(`Falha a anexar ${p.nome}:`, err);
          }
        }
        setAnexosPendentes([]);
      }

      navigate('/renting/movimentacoes');
    } catch {
      // Erros reportados via toast pelas mutations.
    }
  };

  const confirmDelete = () => {
    if (!movimento) return;
    deleteMutation.mutate(movimento.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/renting/movimentacoes');
      },
    });
  };

  if (isEdit && loadingMovimento) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEdit && !loadingMovimento && !movimento) {
    return (
      <div className="w-full">
        <StickyPageHeader title="Movimento não encontrado" icon={ArrowRightLeft}>
          <Button
            variant="outline"
            onClick={() => navigate('/renting/movimentacoes')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </StickyPageHeader>
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            O movimento pedido não existe ou foi eliminado.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <StickyPageHeader
          title={isEdit ? `Movimento #${movimento?.codigo}` : 'Novo Movimento'}
          description={
            isEdit
              ? 'Editar dados do movimento operacional'
              : 'Regista um novo movimento de viatura'
          }
          icon={ArrowRightLeft}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/renting/movimentacoes')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
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
            disabled={isPending}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Guardar' : 'Criar'}
          </Button>
        </StickyPageHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4 items-start">
              <Card className="bg-card border-border">
                <CardContent className="p-4 sm:p-6">
                  <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="grid grid-cols-4 w-full sm:w-auto sm:inline-flex">
                      <TabsTrigger value="geral">Geral</TabsTrigger>
                      <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                      <TabsTrigger value="anexos">Fotos & Anexos</TabsTrigger>
                      <TabsTrigger value="observacoes">Observações</TabsTrigger>
                    </TabsList>

                    <TabsContent value="geral" className="pt-4">
                      <MovimentoTabGeral
                        form={form}
                        viaturas={viaturas}
                        colaboradores={colaboradores}
                        movimentoId={isEdit ? (id ?? null) : null}
                      />
                    </TabsContent>

                    <TabsContent value="detalhes" className="pt-4">
                      <MovimentoTabDetalhes form={form} estacoes={estacoes} />
                    </TabsContent>

                    <TabsContent value="anexos" className="pt-4">
                      <MovimentoTabAnexos
                        movimentoId={isEdit ? (id ?? null) : null}
                        pendentes={anexosPendentes}
                        onAdicionarPendentes={adicionarAnexosPendentes}
                        onRenomearPendente={renomearAnexoPendente}
                        onRemoverPendente={removerAnexoPendente}
                      />
                    </TabsContent>

                    <TabsContent value="observacoes" className="pt-4">
                      <MovimentoTabObservacoes form={form} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <div className="xl:sticky xl:top-24">
                <MovimentoResumoSidebar form={form} estacoes={estacoes} viaturas={viaturas} />
              </div>
            </div>
          </form>
        </Form>
      </div>

      <MovimentoDeleteConfirm
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        movimento={movimento ?? null}
        isPending={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
};

export default RentingMovimentacaoForm;
