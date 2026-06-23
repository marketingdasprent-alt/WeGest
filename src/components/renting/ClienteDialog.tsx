import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, useFormContext, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';
import { CountrySelect } from '@/components/ui/country-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Check, AlertCircle, Paperclip, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatarCodigoPostal } from '@/lib/pt-validators';
import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes';
import { ClienteAnexosTab } from '@/components/renting/ClienteAnexosTab';
import {
  ValidatedTextField,
  RequiredMark,
  useFieldStatus,
} from '@/components/renting/ValidatedTextField';
import {
  clienteFormSchema,
  emptyDefaults,
  TIPOS_DOC_IDENTIFICACAO,
  type ClienteFormData,
} from '@/components/renting/clienteDialog.schema';
import {
  buildClientePayload,
  buildDocumentoPayload,
  buildCartaPayload,
} from '@/components/renting/clienteDialog.payloads';
import type { ClienteComDocumentos, TipoCliente } from '@/types/cliente';

// ── Helpers UI ────────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <div className="flex items-center gap-2 pb-2 border-b">
    <div className="h-8 w-1 bg-primary rounded-full" />
    <h3 className="text-lg font-semibold">{title}</h3>
  </div>
);

// ── Sub-componentes que isolam useWatch (reduzem re-renders) ──

/** Telemóvel com feedback visual — vive em sub-componente para isolar o useWatch. */
const TelemovelField = ({ control }: { control: Control<ClienteFormData> }) => {
  const status = useFieldStatus<ClienteFormData>('telefone');
  const { trigger } = useFormContext<ClienteFormData>();

  return (
    <FormField
      control={control}
      name="telefone"
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            Telemóvel
            <RequiredMark />
          </FormLabel>
          <div className="relative">
            <FormControl>
              <PhoneInput
                value={field.value || ''}
                onChange={(v) => {
                  field.onChange(v);
                  trigger('telefone');
                }}
                defaultCountry="PT"
                error={status === 'invalid'}
                className={cn(
                  'h-11',
                  status === 'valid' && '[&_input]:border-emerald-500',
                  status === 'valid' && '[&_button]:border-emerald-500'
                )}
              />
            </FormControl>
            {status !== 'neutro' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {status === 'valid' ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

/** Secção "Dados Pessoais / Dados da Empresa". Recebe is_empresa por props para evitar watch no parent.
 *  isCondutor torna os campos de pagador (NIF, email, IBAN, data, género, naturalidade) opcionais. */
export const SeccaoDadosPrincipais = ({
  control,
  isEmpresa,
  isCondutor = false,
  disabledTipo,
}: {
  control: Control<ClienteFormData>;
  isEmpresa: boolean;
  isCondutor?: boolean;
  disabledTipo: boolean;
}) => {
  return (
    <section className="space-y-5">
      <SectionHeader
        title={isEmpresa ? 'Dados da Empresa' : isCondutor ? 'Dados do Condutor' : 'Dados Pessoais'}
      />

      <FormField
        control={control}
        name="tipo_cliente"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Tipo de Cliente
              <RequiredMark />
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value} disabled={disabledTipo}>
              <FormControl>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="particular">Particular (pessoa)</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="condutor">Condutor</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {isEmpresa ? 'Denominação Social' : 'Nome Completo'}
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <Input
                placeholder={isEmpresa ? 'Ex: Acme Lda.' : 'Ex: João Silva'}
                {...field}
                className="h-11"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {isEmpresa && (
        <ValidatedTextField<ClienteFormData>
          name="nome_comercial"
          label="Nome Comercial"
          required
          placeholder="Ex: Acme (marca)"
          hideIcon
        />
      )}

      {/* NIF + Email lado a lado, Telefone numa linha própria — dá espaço ao indicativo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ValidatedTextField<ClienteFormData>
          name="nif"
          label="NIF"
          required={!isCondutor}
          placeholder="123456789"
          inputMode="numeric"
          maxLength={9}
        />
        <ValidatedTextField<ClienteFormData>
          name="email"
          label="Email"
          required={!isCondutor}
          type="email"
          placeholder="email@exemplo.com"
        />
      </div>

      <TelemovelField control={control} />

      <div
        className={isEmpresa ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 md:grid-cols-3 gap-5'}
      >
        <FormField
          control={control}
          name="data_nascimento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isEmpresa ? 'Data de Criação' : 'Data de Nascimento'}
                {!isCondutor && <RequiredMark />}
              </FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  className="h-11 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!isEmpresa && !isCondutor && (
          <>
            <FormField
              control={control}
              name="genero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Género
                    <RequiredMark />
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ValidatedTextField<ClienteFormData>
              name="naturalidade"
              label="Naturalidade"
              required
              placeholder="Ex: Lisboa"
              hideIcon
            />
          </>
        )}
      </div>

      <ValidatedTextField<ClienteFormData>
        name="iban"
        label="IBAN"
        placeholder="PT50 0000 0000 0000 0000 0000 0"
      />

      <FormField
        control={control}
        name="observacoes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Observações</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Notas internas sobre o cliente..."
                className="min-h-[80px] resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  );
};

/** Secção Morada — sem dependência de is_empresa. */
export const SeccaoMorada = ({ control }: { control: Control<ClienteFormData> }) => (
  <section className="space-y-5">
    <SectionHeader title="Morada" />

    <ValidatedTextField<ClienteFormData>
      name="morada"
      label="Morada (rua, nº, andar)"
      required
      placeholder="Ex: Rua das Flores, 123, 2º Esq."
      hideIcon
    />

    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <ValidatedTextField<ClienteFormData>
        name="codigo_postal"
        label="Código Postal"
        required
        placeholder="0000-000"
        maxLength={8}
        inputMode="numeric"
        format={formatarCodigoPostal}
      />
      <ValidatedTextField<ClienteFormData>
        name="localidade"
        label="Localidade"
        required
        placeholder="Ex: Amadora"
        hideIcon
      />
      <ValidatedTextField<ClienteFormData>
        name="cidade"
        label="Cidade"
        required
        placeholder="Ex: Lisboa"
        hideIcon
      />
    </div>

    <FormField
      control={control}
      name="pais"
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            País
            <RequiredMark />
          </FormLabel>
          <FormControl>
            <CountrySelect value={field.value || ''} onChange={field.onChange} className="h-11" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </section>
);

/** Secção Documento de Identificação. */
export const SeccaoDocumento = ({ control }: { control: Control<ClienteFormData> }) => (
  <section className="space-y-5">
    <SectionHeader title="Documento de Identificação" />

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <FormField
        control={control}
        name="doc_tipo"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Tipo
              <RequiredMark />
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {TIPOS_DOC_IDENTIFICACAO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <ValidatedTextField<ClienteFormData>
        name="doc_numero"
        label="Número"
        required
        placeholder="Número"
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <FormField
        control={control}
        name="doc_pais_emissao"
        render={({ field }) => (
          <FormItem>
            <FormLabel>País de Emissão</FormLabel>
            <FormControl>
              <CountrySelect value={field.value || ''} onChange={field.onChange} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="doc_data_emissao"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Data de Emissão</FormLabel>
            <FormControl>
              <Input type="date" {...field} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="doc_validade"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Validade
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <Input type="date" {...field} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  </section>
);

/** Secção Carta de Condução — só para pessoa. */
export const SeccaoCarta = ({ control }: { control: Control<ClienteFormData> }) => (
  <section className="space-y-5">
    <SectionHeader title="Carta de Condução" />

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ValidatedTextField<ClienteFormData>
        name="carta_numero"
        label="Número"
        required
        placeholder="Número"
      />
      <FormField
        control={control}
        name="carta_pais"
        render={({ field }) => (
          <FormItem>
            <FormLabel>País</FormLabel>
            <FormControl>
              <CountrySelect value={field.value || ''} onChange={field.onChange} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <FormField
        control={control}
        name="carta_validade"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Validade
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <Input type="date" {...field} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  </section>
);

/**
 * Observador isolado: só re-renderiza quando `doc_tipo` muda.
 * Limpa erros stale de `doc_numero` e revalida com o novo tipo.
 * Evita ter um useWatch + useEffect no componente principal.
 */
export const DocTipoChangeWatcher = ({ control }: { control: Control<ClienteFormData> }) => {
  const docTipo = useWatch({ control, name: 'doc_tipo' });
  const { getValues, trigger, clearErrors } = useFormContext<ClienteFormData>();

  useEffect(() => {
    clearErrors('doc_numero');
    if (getValues('doc_numero')) {
      trigger('doc_numero');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTipo]);

  return null;
};

// ── Props ─────────────────────────────────────────────────────
interface ClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: ClienteComDocumentos | null;
  /**
   * Callback chamado após criar um cliente novo com sucesso. Recebe o `id`
   * do cliente criado. Útil para fluxos inline (ex.: adicionar como condutor
   * imediatamente após criar).
   */
  onCreated?: (clienteId: string) => void;
  /** Tipo pré-seleccionado ao criar um cliente novo (ex.: 'condutor'
   *  quando aberto a partir da tab de condutores). Default 'particular'. */
  defaultTipoCliente?: TipoCliente;
}

// ── Componente principal ──────────────────────────────────────
export function ClienteDialog({
  open,
  onOpenChange,
  cliente,
  onCreated,
  defaultTipoCliente = 'particular',
}: ClienteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Lock SÍNCRONO contra duplo-submit. O state isSubmitting só desativa o
  // botão no próximo render — entre o 1º clique e esse render há uma janela
  // onde um 2º clique (duplo-clique/Enter) passava a guarda e criava em
  // duplicado. O ref atualiza já, fechando essa janela.
  const submittingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'anexos'>('dados');
  const createMutation = useCreateCliente();
  const updateMutation = useUpdateCliente();

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteFormSchema),
    defaultValues: emptyDefaults,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const { control, handleSubmit, reset, setValue } = form;

  // tipo_cliente é a fonte de verdade; is_empresa é derivado dele.
  const tipoCliente = useWatch({ control, name: 'tipo_cliente' });
  const isEmpresa = tipoCliente === 'empresa';
  const isCondutor = tipoCliente === 'condutor';

  // Mantém o campo is_empresa (usado na validação/payload) em sincronia.
  useEffect(() => {
    setValue('is_empresa', tipoCliente === 'empresa');
  }, [tipoCliente, setValue]);

  // Reset tab activa ao abrir o dialog (evita ficar em "Anexos" entre aberturas)
  useEffect(() => {
    if (open) setActiveTab('dados');
  }, [open]);

  // Preenche/limpa o form quando o cliente muda
  useEffect(() => {
    if (cliente) {
      reset({
        tipo_cliente: cliente.tipo_cliente ?? (cliente.is_empresa ? 'empresa' : 'particular'),
        is_empresa: cliente.is_empresa,
        is_edicao: true,
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
    } else {
      reset({ ...emptyDefaults, tipo_cliente: defaultTipoCliente });
    }
  }, [cliente, reset, defaultTipoCliente]);

  const onSubmit = useCallback(
    async (values: ClienteFormData) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
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
          const novoCliente = await createMutation.mutateAsync({
            cliente: clientePayload,
            documentoIdentificacao: documentoPayload,
            cartaConducao: cartaPayload,
          });
          onCreated?.(novoCliente.id);
        }
        onOpenChange(false);
      } catch {
        // erro tratado pelos mutations via toast
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [cliente, createMutation, updateMutation, onOpenChange, onCreated]
  );

  const loading = isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-0 bg-card shrink-0">
          <DialogTitle className="text-2xl font-bold">
            {cliente ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            {cliente ? 'Atualize os dados do cliente.' : 'Preencha os dados do novo cliente.'}
            <span className="text-muted-foreground/80">
              Campos com <RequiredMark /> são obrigatórios.
            </span>
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'dados' | 'anexos')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-4 border-b bg-card shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-4">
              <TabsTrigger
                value="dados"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-2 font-medium gap-2"
              >
                <User className="h-4 w-4" />
                Dados
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
          </div>

          <TabsContent
            value="dados"
            className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden"
          >
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8">
                {/* Observador silencioso: revalida doc_numero quando doc_tipo muda */}
                <DocTipoChangeWatcher control={control} />

                <SeccaoDadosPrincipais
                  control={control}
                  isEmpresa={isEmpresa}
                  isCondutor={isCondutor}
                  disabledTipo={!!cliente}
                />
                {/* Condutor não é pagador — sem morada nem documento de identificação. */}
                {!isCondutor && <SeccaoMorada control={control} />}
                {/* Documento de identificação (CC/Passaporte) é de pessoa singular —
                    empresa identifica-se pelo NIF, condutor não é pagador. */}
                {!isCondutor && !isEmpresa && <SeccaoDocumento control={control} />}
                {!isEmpresa && <SeccaoCarta control={control} />}
              </form>
            </Form>
          </TabsContent>

          <TabsContent
            value="anexos"
            className="flex-1 overflow-y-auto m-0 p-6 data-[state=inactive]:hidden"
          >
            <ClienteAnexosTab clienteId={cliente?.id ?? null} />
          </TabsContent>
        </Tabs>

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-11 px-8"
          >
            {activeTab === 'anexos' ? 'Fechar' : 'Cancelar'}
          </Button>
          {activeTab === 'dados' && (
            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="h-11 px-10 font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
                </>
              ) : cliente ? (
                'Guardar Alterações'
              ) : (
                'Criar Cliente'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
