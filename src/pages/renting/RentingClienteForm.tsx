import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Loader2,
  Paperclip,
  Trash2,
  User,
} from 'lucide-react';

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import {
  useClientes,
  useCreateCliente,
  useUpdateCliente,
  useDeleteCliente,
} from '@/hooks/useClientes';

import { ClienteAnexosTab } from '@/components/renting/ClienteAnexosTab';
import { ClienteReservasContratosTab } from '@/components/renting/ClienteReservasContratosTab';
import { RequiredMark } from '@/components/renting/ValidatedTextField';
import {
  DocTipoChangeWatcher,
  SeccaoCarta,
  SeccaoDadosPrincipais,
  SeccaoDocumento,
  SeccaoMorada,
} from '@/components/renting/ClienteDialog';
import {
  buildCartaPayload,
  buildClientePayload,
  buildDocumentoPayload,
} from '@/components/renting/clienteDialog.payloads';
import {
  clienteFormSchema,
  emptyDefaults,
  type ClienteFormData,
} from '@/components/renting/clienteDialog.schema';

const RentingClienteForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { data: clientes = [], isLoading: loadingClientes } = useClientes();
  const cliente = isEdit ? clientes.find((c) => c.id === id) : null;

  const createMutation = useCreateCliente();
  const updateMutation = useUpdateCliente();
  const deleteMutation = useDeleteCliente();

  const [activeTab, setActiveTab] = useState<'dados' | 'reservas_contratos' | 'anexos'>('dados');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteFormSchema),
    defaultValues: emptyDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const { control, handleSubmit, reset, setValue } = form;
  const tipoCliente = useWatch({ control, name: 'tipo_cliente' });
  const isEmpresa = tipoCliente === 'empresa';

  // Mantém is_empresa (validação/payload) em sincronia com tipo_cliente.
  useEffect(() => {
    setValue('is_empresa', tipoCliente === 'empresa');
  }, [tipoCliente, setValue]);

  // Hidratação do form a partir do cliente carregado
  useEffect(() => {
    if (cliente) {
      reset({
        tipo_cliente: cliente.tipo_cliente ?? (cliente.is_empresa ? 'empresa' : 'particular'),
        is_empresa: cliente.is_empresa,
        nome: cliente.nome,
        nome_comercial: cliente.nome_comercial || '',
        nif: cliente.nif || '',
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        data_nascimento: cliente.data_nascimento || '',
        naturalidade: cliente.naturalidade || '',
        genero: cliente.genero || '',
        iban: cliente.iban || '',
        observacoes: cliente.observacoes || '',
        morada: cliente.morada || '',
        codigo_postal: cliente.codigo_postal || '',
        localidade: cliente.localidade || '',
        cidade: cliente.cidade || '',
        pais: cliente.pais || 'Portugal',
        doc_tipo: cliente.documentoIdentificacao?.tipo || '',
        doc_numero: cliente.documentoIdentificacao?.numero || '',
        doc_pais_emissao: cliente.documentoIdentificacao?.pais_emissao || '',
        doc_data_emissao: cliente.documentoIdentificacao?.data_emissao || '',
        doc_validade: cliente.documentoIdentificacao?.validade || '',
        carta_numero: cliente.cartaConducao?.numero || '',
        carta_pais: cliente.cartaConducao?.pais_emissao || '',
        carta_data_emissao: cliente.cartaConducao?.data_emissao || '',
        carta_validade: cliente.cartaConducao?.validade || '',
      });
    } else if (!isEdit) {
      reset(emptyDefaults);
    }
  }, [cliente, isEdit, reset]);

  const onSubmit = async (values: ClienteFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const clientePayload = buildClientePayload(values);
      const documentoPayload = buildDocumentoPayload(values);
      const cartaPayload = buildCartaPayload(values);

      if (cliente) {
        await updateMutation.mutateAsync({
          id: cliente.id,
          documentoIdentificacaoId: cliente.documentoIdentificacao?.id ?? null,
          cartaConducaoId: cliente.cartaConducao?.id ?? null,
          cliente: clientePayload,
          documentoIdentificacao: documentoPayload,
          cartaConducao: cartaPayload,
        });
      } else {
        // Criar: navegar para modo edição do novo cliente
        const created = await createMutation.mutateAsync({
          cliente: clientePayload,
          documentoIdentificacao: documentoPayload,
          cartaConducao: cartaPayload,
        });
        if (created?.id) {
          navigate(`/renting/clientes/${created.id}`);
        }
      }
    } catch {
      // erro tratado pelos mutations via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!cliente) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!cliente) return;
    deleteMutation.mutate(cliente.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/renting/clientes');
      },
    });
  };

  const isPending = isSubmitting || createMutation.isPending || updateMutation.isPending;

  // Loading state ao editar
  if (isEdit && loadingClientes) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Cliente não encontrado
  if (isEdit && !cliente && !loadingClientes) {
    return (
      <div className="w-full">
        <StickyPageHeader title="Cliente não encontrado" icon={User}>
          <Button variant="outline" onClick={() => navigate('/renting/clientes')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </StickyPageHeader>
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Este cliente não existe ou já foi removido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <StickyPageHeader
          title={isEdit ? cliente?.nome || `Cliente #${cliente?.codigo}` : 'Novo Cliente'}
          description={
            isEdit ? 'Editar dados do cliente existente' : 'Cria um novo cliente de renting'
          }
          icon={User}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/renting/clientes')}
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
          {isEdit && cliente && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/renting/reservas/nova?cliente_id=${cliente.id}`)}
              className="gap-2"
            >
              <CalendarCheck className="h-4 w-4" />
              Criar Reserva
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isPending}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Guardar' : 'Criar'}
          </Button>
        </StickyPageHeader>

        <Card className="bg-card border-border">
          <CardContent className="p-4 sm:p-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'dados' | 'reservas_contratos' | 'anexos')}
              className="w-full"
            >
              <TabsList className="bg-transparent p-0 h-auto gap-4 border-b w-full justify-start rounded-none">
                <TabsTrigger
                  value="dados"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-2 font-medium gap-2"
                >
                  <User className="h-4 w-4" />
                  Dados
                </TabsTrigger>
                <TabsTrigger
                  value="reservas_contratos"
                  disabled={!cliente}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-2 font-medium gap-2"
                >
                  <CalendarCheck className="h-4 w-4" />
                  Reserva/Contrato
                  {!cliente && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (após guardar)
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="anexos"
                  disabled={!cliente}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-2 font-medium gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  Anexos
                  {!cliente && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (após guardar)
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="pt-4">
                <Form {...form}>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    <DocTipoChangeWatcher control={control} />
                    <SeccaoDadosPrincipais
                      control={control}
                      isEmpresa={!!isEmpresa}
                      isCondutor={tipoCliente === 'condutor'}
                      disabledTipo={!!cliente}
                    />
                    {tipoCliente !== 'condutor' && <SeccaoMorada control={control} />}
                    {tipoCliente !== 'condutor' && <SeccaoDocumento control={control} />}
                    {!isEmpresa && <SeccaoCarta control={control} />}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <RequiredMark /> Campos obrigatórios.
                    </p>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="reservas_contratos" className="pt-4">
                <ClienteReservasContratosTab clienteId={cliente?.id ?? null} />
              </TabsContent>

              <TabsContent value="anexos" className="pt-4">
                <ClienteAnexosTab clienteId={cliente?.id ?? null} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente <strong>{cliente?.nome}</strong> será removido. Esta acção pode ser
              revertida por um administrador técnico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {deleteMutation.isPending && <AlertTriangle className="h-4 w-4 animate-pulse mr-1" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RentingClienteForm;
