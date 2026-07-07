import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { SectionCard } from '@/components/ui/section-card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Settings,
  Check,
  ChevronsUpDown,
  CreditCard,
  Car,
  FileText,
  MessageSquare,
  Fuel,
  PlusCircle,
  Smartphone,
  Zap,
} from 'lucide-react';
import { Motorista } from '@/pages/Motoristas';
import { PhoneInput } from '@/components/ui/phone-input';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { validateDateYear, YEAR_RANGE_MESSAGE } from '@/utils/dateValidators';
import {
  validarNIF,
  validarIBAN,
  validarCodigoPostal,
  validarCartaConducao,
  validarNumeroDocumento,
} from '@/lib/pt-validators';

// Mapeia os labels do select deste form para as chaves de regra do pt-validators.
const DOC_TYPE_KEY: Record<string, string> = {
  'Cartão de Cidadão': 'cc',
  'Bilhete de Identidade': 'bi',
  Passaporte: 'passaporte',
  'Título de Residência': 'tr',
};

const CARTA_CATEGORIAS = ['AM', 'A1', 'A2', 'A', 'B1', 'B', 'BE', 'C1', 'C', 'CE', 'D1', 'D', 'DE'];

const formSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  nif: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarNIF(v).valid,
      (v) => ({ message: (v ? validarNIF(v).message : '') || 'NIF inválido' })
    ),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  morada: z.string().optional(),
  codigo_postal: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarCodigoPostal(v).valid,
      (v) => ({ message: (v ? validarCodigoPostal(v).message : '') || 'Código postal inválido' })
    ),
  cidade: z.string().optional(),
  documento_tipo: z.string().optional(),
  documento_numero: z.string().optional(),
  documento_validade: z.string().optional().refine(validateDateYear, {
    message: YEAR_RANGE_MESSAGE,
  }),
  carta_conducao: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarCartaConducao(v).valid,
      (v) => ({ message: (v ? validarCartaConducao(v).message : '') || 'Carta inválida' })
    ),
  carta_categorias: z.array(z.string()).optional(),
  carta_validade: z.string().optional().refine(validateDateYear, {
    message: YEAR_RANGE_MESSAGE,
  }),
  licenca_tvde_numero: z.string().optional(),
  licenca_tvde_validade: z.string().optional().refine(validateDateYear, {
    message: YEAR_RANGE_MESSAGE,
  }),
  cartao_frota: z.string().optional(),
  cartao_bp: z.string().optional(),
  cartao_repsol: z.string().optional(),
  cartao_edp: z.string().optional(),
  data_contratacao: z.string().optional().refine(validateDateYear, {
    message: YEAR_RANGE_MESSAGE,
  }),
  recibo_verde: z.boolean().default(true),
  is_slot: z.boolean().default(false),
  slot_valor_semanal: z.number().optional().nullable(),
  seguro_valor_semanal: z.number().optional().nullable(),
  status_ativo: z.boolean().default(true),
  observacoes: z.string().optional(),
  iban: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarIBAN(v).valid,
      (v) => ({ message: (v ? validarIBAN(v).message : '') || 'IBAN inválido' })
    ),
  gestor_responsavel: z.string().optional().nullable(),
  bolt_id: z.string().optional().nullable(),
  uber_uuid: z.string().optional().nullable(),
  documento_ficheiro_url: z.string().optional().nullable(),
  documento_identificacao_verso_url: z.string().optional().nullable(),
  carta_ficheiro_url: z.string().optional().nullable(),
  carta_conducao_verso_url: z.string().optional().nullable(),
  licenca_tvde_ficheiro_url: z.string().optional().nullable(),
  registo_criminal_url: z.string().optional().nullable(),
  comprovativo_morada_url: z.string().optional().nullable(),
  comprovativo_iban_url: z.string().optional().nullable(),
});

const formSchemaValidado = formSchema.superRefine((data, ctx) => {
  // Nº do documento validado conforme o tipo seleccionado (CC, BI, passaporte, TR).
  if (data.documento_tipo && data.documento_numero) {
    const res = validarNumeroDocumento(
      DOC_TYPE_KEY[data.documento_tipo] ?? data.documento_tipo,
      data.documento_numero
    );
    if (!res.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento_numero'],
        message: res.message || 'Número de documento inválido',
      });
    }
  }
});

type FormData = z.infer<typeof formSchema>;

interface MotoristaTabDadosProps {
  motorista: Motorista;
  onSave: () => void;
  draft?: Record<string, unknown> | null;
  onDraftChange?: (draft: Record<string, unknown> | null) => void;
  /**
   * Modo criação: quando `true`, o submit faz INSERT (em vez de UPDATE) e
   * chama `onCreated` com o motorista recém-criado. Determinado pela ausência
   * de `motorista.id` (ficha-rascunho passada pelo modal em modo "Adicionar").
   */
  isCreating?: boolean;
  /** Notifica o pai com o motorista recém-criado (só em modo criação). */
  onCreated?: (motorista: Motorista) => void;
}

// SectionCard imported from @/components/ui/section-card

export function MotoristaTabDados({
  motorista,
  onSave,
  draft,
  onDraftChange,
  isCreating = false,
  onCreated,
}: MotoristaTabDadosProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gestores, setGestores] = useState<{ nome: string }[]>([]);
  const [gestorPopoverOpen, setGestorPopoverOpen] = useState(false);

  useEffect(() => {
    const fetchGestores = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('nome, cargo')
          .not('nome', 'is', null)
          .ilike('cargo', '%Gestor%TVDE%')
          .order('nome');

        if (error) throw error;

        // Remover duplicados por nome
        const uniqueGestores = (data || []).reduce((acc: { nome: string }[], current) => {
          if (!acc.find((item) => item.nome === current.nome)) {
            acc.push({ nome: current.nome });
          }
          return acc;
        }, []);

        setGestores(uniqueGestores);
      } catch (error) {
        console.error('Erro ao buscar gestores:', error);
      }
    };
    fetchGestores();
  }, []);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchemaValidado),
    defaultValues: {
      nome: '',
      nif: '',
      email: '',
      telefone: '',
      morada: '',
      codigo_postal: '',
      cidade: '',
      documento_tipo: '',
      documento_numero: '',
      documento_validade: '',
      carta_conducao: '',
      carta_categorias: [],
      carta_validade: '',
      licenca_tvde_numero: '',
      licenca_tvde_validade: '',
      cartao_frota: '',
      cartao_bp: '',
      cartao_repsol: '',
      cartao_edp: '',
      data_contratacao: '',
      recibo_verde: true,
      is_slot: false,
      slot_valor_semanal: null,
      seguro_valor_semanal: null,
      status_ativo: true,
      observacoes: '',
      iban: '',
      gestor_responsavel: '',
      bolt_id: '',
      uber_uuid: '',
      documento_ficheiro_url: '',
      documento_identificacao_verso_url: '',
      carta_ficheiro_url: '',
      carta_conducao_verso_url: '',
      licenca_tvde_ficheiro_url: '',
      registo_criminal_url: '',
      comprovativo_morada_url: '',
      comprovativo_iban_url: '',
    },
  });

  useEffect(() => {
    if (!motorista) return;

    if (draft) {
      form.reset(draft as FormData);
      return;
    }

    form.reset({
      nome: motorista.nome || '',
      nif: motorista.nif || '',
      email: motorista.email || '',
      telefone: motorista.telefone || '',
      morada: motorista.morada || '',
      codigo_postal: motorista.codigo_postal || '',
      cidade: motorista.cidade || '',
      documento_tipo: motorista.documento_tipo || '',
      documento_numero: motorista.documento_numero || '',
      documento_validade: motorista.documento_validade
        ? format(new Date(motorista.documento_validade), 'yyyy-MM-dd')
        : '',
      carta_conducao: motorista.carta_conducao || '',
      carta_categorias: motorista.carta_categorias || [],
      carta_validade: motorista.carta_validade
        ? format(new Date(motorista.carta_validade), 'yyyy-MM-dd')
        : '',
      licenca_tvde_numero: motorista.licenca_tvde_numero || '',
      licenca_tvde_validade: motorista.licenca_tvde_validade
        ? format(new Date(motorista.licenca_tvde_validade), 'yyyy-MM-dd')
        : '',
      cartao_frota: motorista.cartao_frota || '',
      cartao_bp: motorista.cartao_bp || '',
      cartao_repsol: motorista.cartao_repsol || '',
      cartao_edp: motorista.cartao_edp || '',
      data_contratacao: motorista.data_contratacao
        ? format(new Date(motorista.data_contratacao), 'yyyy-MM-dd')
        : '',
      recibo_verde: motorista.recibo_verde ?? true,
      is_slot: motorista.is_slot ?? false,
      slot_valor_semanal: motorista.slot_valor_semanal ?? null,
      seguro_valor_semanal: motorista.seguro_valor_semanal ?? null,
      status_ativo: motorista.status_ativo ?? true,
      observacoes: motorista.observacoes || '',
      iban: motorista.iban || '',
      gestor_responsavel: motorista.gestor_responsavel || '',
      uber_uuid: motorista.uber_uuid || '',
      bolt_id: motorista.bolt_id || '',
      documento_ficheiro_url: motorista.documento_ficheiro_url || '',
      documento_identificacao_verso_url: motorista.documento_identificacao_verso_url || '',
      carta_ficheiro_url: motorista.carta_ficheiro_url || '',
      carta_conducao_verso_url: motorista.carta_conducao_verso_url || '',
      licenca_tvde_ficheiro_url: motorista.licenca_tvde_ficheiro_url || '',
      registo_criminal_url: motorista.registo_criminal_url || '',
      comprovativo_morada_url: motorista.comprovativo_morada_url || '',
      comprovativo_iban_url: motorista.comprovativo_iban_url || '',
    });
    // Intencionalmente sem `draft` nas deps — o draft só hidrata na montagem;
    // edições posteriores são propagadas via watch (não devem re-resetar o form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorista, form]);

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = form.watch((values, { name }) => {
      // `name` definido = mudança real do utilizador (input ou form.setValue,
      // ex.: Gestor e cartões de combustível). O `form.reset` de hidratação
      // emite `name: undefined` — ignorado para não re-gravar o draft.
      // Substitui o gate antigo por `isDirty`, que ficava `false` em campos
      // alterados via setValue e fazia perder esses valores ao trocar de aba.
      if (name) {
        onDraftChange(values as Record<string, unknown>);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onDraftChange]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // Normalização: NIF sem espaços (reutilizado no check de duplicado e no save).
      const nifNormalizado = data.nif ? data.nif.replace(/\s/g, '') : null;

      // Em modo criação, impedir duplicados por NIF (mesma regra do MotoristaDialog).
      if (isCreating && nifNormalizado) {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id, nome, codigo')
          .eq('nif', nifNormalizado)
          .maybeSingle();

        if (existing) {
          toast.error(
            `Já existe um motorista com este NIF: ${existing.nome} (Cód. ${existing.codigo})`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const updateData = {
        nome: data.nome,
        nif: nifNormalizado,
        email: data.email || null,
        telefone: data.telefone || null,
        morada: data.morada || null,
        codigo_postal: data.codigo_postal || null,
        cidade: data.cidade || null,
        documento_tipo: data.documento_tipo || null,
        documento_numero: data.documento_numero || null,
        documento_validade: data.documento_validade || null,
        carta_conducao: data.carta_conducao || null,
        carta_categorias: data.carta_categorias || null,
        carta_validade: data.carta_validade || null,
        licenca_tvde_numero: data.licenca_tvde_numero || null,
        licenca_tvde_validade: data.licenca_tvde_validade || null,
        cartao_frota: data.cartao_frota || null,
        cartao_bp: data.cartao_bp || null,
        cartao_repsol: data.cartao_repsol || null,
        cartao_edp: data.cartao_edp || null,
        data_contratacao: data.data_contratacao || null,
        recibo_verde: data.recibo_verde,
        is_slot: data.is_slot,
        slot_valor_semanal: data.is_slot ? data.slot_valor_semanal : null,
        seguro_valor_semanal: data.seguro_valor_semanal ?? null,
        status_ativo: data.status_ativo,
        observacoes: data.observacoes || null,
        iban: data.iban ? data.iban.replace(/\s/g, '').toUpperCase() : null,
        gestor_responsavel:
          data.gestor_responsavel === 'none' ? null : data.gestor_responsavel || null,
        uber_uuid: data.uber_uuid || null,
        bolt_id: data.bolt_id || null,
        documento_ficheiro_url: data.documento_ficheiro_url || null,
        documento_identificacao_verso_url: data.documento_identificacao_verso_url || null,
        carta_ficheiro_url: data.carta_ficheiro_url || null,
        carta_conducao_verso_url: data.carta_conducao_verso_url || null,
        licenca_tvde_ficheiro_url: data.licenca_tvde_ficheiro_url || null,
        registo_criminal_url: data.registo_criminal_url || null,
        comprovativo_morada_url: data.comprovativo_morada_url || null,
        comprovativo_iban_url: data.comprovativo_iban_url || null,
      };

      if (isCreating) {
        // Criação: INSERT (codigo e org_id são preenchidos por DEFAULT na BD).
        // .select().single() devolve a linha completa já com id/codigo reais.
        const { data: novo, error } = await supabase
          .from('motoristas_ativos')
          .insert(updateData)
          .select()
          .single();

        if (error) throw error;

        toast.success('Motorista criado com sucesso!');
        onCreated?.(novo as Motorista);
      } else {
        // Edição: UPDATE da ficha existente.
        const { error } = await supabase
          .from('motoristas_ativos')
          .update(updateData)
          .eq('id', motorista.id);

        if (error) throw error;

        toast.success('Motorista atualizado com sucesso!');
        onSave();
      }
    } catch (error) {
      console.error('Erro ao guardar motorista:', error);
      toast.error(isCreating ? 'Erro ao criar motorista' : 'Erro ao atualizar motorista');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Dados Pessoais */}
          <SectionCard
            icon={<User className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
            title="Dados Pessoais"
            headerClassName="bg-blue-50 dark:bg-blue-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="gestor_responsavel"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      Gestor Responsável
                    </FormLabel>
                    <Popover
                      open={gestorPopoverOpen}
                      onOpenChange={setGestorPopoverOpen}
                      modal={true}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'w-full justify-between bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value && field.value !== 'none'
                              ? gestores.find((gestor) => gestor.nome === field.value)?.nome ||
                                field.value
                              : 'Selecione um gestor...'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[200]"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder="Pesquisar gestor..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>Nenhum gestor encontrado.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => {
                                  form.setValue('gestor_responsavel', 'none');
                                  setGestorPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === 'none' ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                Nenhum
                              </CommandItem>
                              {gestores.map((gestor) => (
                                <CommandItem
                                  key={gestor.nome}
                                  value={gestor.nome}
                                  onSelect={() => {
                                    form.setValue('gestor_responsavel', gestor.nome);
                                    setGestorPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === gestor.nome ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {gestor.nome}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Nome Completo <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nif"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIF</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="iban"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>IBAN</FormLabel>
                    <FormControl>
                      <Input placeholder="PT50..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value || ''}
                        onChange={field.onChange}
                        defaultCountry="PT"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          {/* Morada */}
          <SectionCard
            icon={<MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            title="Morada"
            headerClassName="bg-emerald-50 dark:bg-emerald-950/30 border-b"
          >
            <div className="grid grid-cols-1 gap-3">
              <FormField
                control={form.control}
                name="morada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="codigo_postal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código Postal</FormLabel>
                    <FormControl>
                      <Input placeholder="0000-000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade (Residência)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          {/* Documento de Identificação */}
          <SectionCard
            icon={<CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
            title="Documento de Identificação"
            headerClassName="bg-violet-50 dark:bg-violet-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="documento_tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Documento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Cartão de Cidadão">Cartão de Cidadão</SelectItem>
                        <SelectItem value="Bilhete de Identidade">Bilhete de Identidade</SelectItem>
                        <SelectItem value="Passaporte">Passaporte</SelectItem>
                        <SelectItem value="Título de Residência">Título de Residência</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="documento_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número do Documento</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="documento_validade"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4 pt-2 sm:col-span-2">
                <FormField
                  control={form.control}
                  name="documento_ficheiro_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Frente do Documento</FormLabel>
                      <FormControl>
                        <DocumentUploader
                          folder="documentos"
                          motoristaId={motorista.id}
                          currentUrl={field.value}
                          onUpload={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="documento_identificacao_verso_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Verso do Documento</FormLabel>
                      <FormControl>
                        <DocumentUploader
                          folder="documentos"
                          motoristaId={motorista.id}
                          currentUrl={field.value}
                          onUpload={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </SectionCard>

          {/* Carta de Condução */}
          <SectionCard
            icon={<Car className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
            title="Carta de Condução"
            headerClassName="bg-sky-50 dark:bg-sky-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="carta_conducao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da Carta</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="carta_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4 pt-2 sm:col-span-2">
                <FormField
                  control={form.control}
                  name="carta_ficheiro_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Frente da Carta</FormLabel>
                      <FormControl>
                        <DocumentUploader
                          folder="cartas"
                          motoristaId={motorista.id}
                          currentUrl={field.value}
                          onUpload={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carta_conducao_verso_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Verso da Carta</FormLabel>
                      <FormControl>
                        <DocumentUploader
                          folder="cartas"
                          motoristaId={motorista.id}
                          currentUrl={field.value}
                          onUpload={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="carta_categorias"
                render={() => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Categorias</FormLabel>
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background">
                      {CARTA_CATEGORIAS.map((cat) => (
                        <FormField
                          key={cat}
                          control={form.control}
                          name="carta_categorias"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-1 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(cat)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, cat]);
                                    } else {
                                      field.onChange(current.filter((c) => c !== cat));
                                    }
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-xs font-normal cursor-pointer">
                                {cat}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          {/* Licença TVDE */}
          <SectionCard
            icon={<FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
            title="Licença TVDE"
            headerClassName="bg-amber-50 dark:bg-amber-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="licenca_tvde_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da Licença</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="licenca_tvde_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="pt-2 sm:col-span-2">
                <FormField
                  control={form.control}
                  name="licenca_tvde_ficheiro_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Ficheiro da Licença TVDE</FormLabel>
                      <FormControl>
                        <DocumentUploader
                          folder="tvde"
                          motoristaId={motorista.id}
                          currentUrl={field.value}
                          onUpload={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </SectionCard>

          {/* Documentação Adicional */}
          <SectionCard
            icon={<FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
            title="Documentação Adicional"
            headerClassName="bg-rose-50 dark:bg-rose-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="registo_criminal_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Registo Criminal</FormLabel>
                    <FormControl>
                      <DocumentUploader
                        folder="documentos"
                        motoristaId={motorista.id}
                        currentUrl={field.value}
                        onUpload={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comprovativo_morada_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Comprovativo Morada</FormLabel>
                    <FormControl>
                      <DocumentUploader
                        folder="documentos"
                        motoristaId={motorista.id}
                        currentUrl={field.value}
                        onUpload={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comprovativo_iban_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Comprovativo IBAN</FormLabel>
                    <FormControl>
                      <DocumentUploader
                        folder="documentos"
                        motoristaId={motorista.id}
                        currentUrl={field.value}
                        onUpload={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>

          {/* Combustível */}
          <SectionCard
            icon={<Fuel className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
            title="Combustível"
            headerClassName="bg-orange-50 dark:bg-orange-950/30 border-b"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 mb-4 p-3 bg-muted/20 rounded-lg border border-dashed">
                <p className="text-xs text-muted-foreground w-full mb-1">Adicionar novo cartão:</p>
                {!form.watch('cartao_bp') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-green-600/30 text-green-700 hover:bg-green-600 hover:text-white"
                    onClick={() => form.setValue('cartao_bp', ' ')}
                  >
                    + BP
                  </Button>
                )}
                {!form.watch('cartao_repsol') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-orange-600/30 text-orange-700 hover:bg-orange-600 hover:text-white"
                    onClick={() => form.setValue('cartao_repsol', ' ')}
                  >
                    + REPSOL
                  </Button>
                )}
                {!form.watch('cartao_edp') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-red-600/30 text-red-700 hover:bg-red-600 hover:text-white"
                    onClick={() => form.setValue('cartao_edp', ' ')}
                  >
                    + EDP
                  </Button>
                )}
              </div>

              {form.watch('cartao_bp') !== null && form.watch('cartao_bp') !== '' && (
                <FormField
                  control={form.control}
                  name="cartao_bp"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Cartão BP
                        </FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-600"
                          onClick={() => form.setValue('cartao_bp', '')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="Número do cartão BP"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* REPSOL */}
              {form.watch('cartao_repsol') !== null && form.watch('cartao_repsol') !== '' && (
                <FormField
                  control={form.control}
                  name="cartao_repsol"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          Cartão REPSOL
                        </FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-600"
                          onClick={() => form.setValue('cartao_repsol', '')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="Número do cartão REPSOL"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* EDP */}
              {form.watch('cartao_edp') !== null && form.watch('cartao_edp') !== '' && (
                <FormField
                  control={form.control}
                  name="cartao_edp"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-600" />
                          Cartão EDP
                        </FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-600"
                          onClick={() => form.setValue('cartao_edp', '')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="Número do cartão EDP"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </SectionCard>

          {/* Estado & Configuração */}
          <SectionCard
            icon={<Settings className="h-4 w-4 text-slate-600 dark:text-slate-400" />}
            title="Estado & Configuração"
            headerClassName="bg-slate-50 dark:bg-slate-950/30 border-b"
          >
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="recibo_verde"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm flex items-center gap-2">
                      <span
                        className={cn('text-lg', field.value ? 'text-green-600' : 'text-red-600')}
                      >
                        ●
                      </span>
                      Motorista Verde
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_slot"
                render={({ field }) => (
                  <FormItem className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-row items-center justify-between">
                      <FormLabel className="text-sm">Motorista SLOT</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    {field.value && (
                      <FormField
                        control={form.control}
                        name="slot_valor_semanal"
                        render={({ field: valorField }) => (
                          <FormItem>
                            <FormLabel>Valor Mensal (€)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Ex: 400.00"
                                value={valorField.value ?? ''}
                                onChange={(e) =>
                                  valorField.onChange(
                                    e.target.value ? parseFloat(e.target.value) : null
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="seguro_valor_semanal"
                render={({ field }) => (
                  <FormItem className="rounded-lg border p-3 space-y-1">
                    <FormLabel className="text-sm">Seguro semanal (€)</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Débito lançado automaticamente todas as semanas no financeiro do motorista.
                      Deixa vazio para não cobrar seguro.
                    </p>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ex: 15.00"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status_ativo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Motorista Ativo</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Define se o motorista está ativo no sistema
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-4">
          {/* IDs de Plataformas */}
          <SectionCard
            icon={<Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
            title="IDs de Integração (Uber / Bolt)"
            headerClassName="bg-purple-50 dark:bg-purple-950/30 border-b"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="uber_uuid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uber UUID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. e912..." {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bolt_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-yellow-500" /> Bolt ID
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 12345/6789" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-[10px] text-muted-foreground sm:col-span-2 mt-1">
                Estes IDs são usados para unificar automaticamente os ganhos das plataformas no
                Dashboard financeiro.
              </p>
            </div>
          </SectionCard>

          {/* Observações */}
          <SectionCard
            icon={<MessageSquare className="h-4 w-4 text-pink-600 dark:text-pink-400" />}
            title="Observações Internas"
            headerClassName="bg-pink-50 dark:bg-pink-950/30 border-b"
          >
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Notas adicionais sobre o motorista..."
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SectionCard>
        </div>

        {/* Botão de salvar */}
        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'A guardar...' : isCreating ? 'Criar Motorista' : 'Guardar Alterações'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
