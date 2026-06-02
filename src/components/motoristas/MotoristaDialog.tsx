import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Motorista } from '@/pages/Motoristas';
import { PhoneInput } from '@/components/ui/phone-input';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import { Loader2, X, Check, ChevronsUpDown, CreditCard } from 'lucide-react';
import { validateDateYear } from '@/utils/dateValidators';

const formSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  nif: z.string().min(9, 'NIF é obrigatório (mínimo 9 caracteres)'),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  documento_tipo: z.string().min(1, 'Tipo de documento é obrigatório'),
  documento_numero: z.string().min(1, 'Número do documento é obrigatório'),
  documento_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  carta_conducao: z.string().min(1, 'Número da carta de condução é obrigatório'),
  carta_categorias: z.array(z.string()).optional(),
  carta_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  licenca_tvde_numero: z.string().optional(),
  licenca_tvde_validade: z.string().optional().refine(validateDateYear, {
    message: 'Ano inválido (use entre 1900 e 2100)',
  }),
  morada: z.string().optional(),
  codigo_postal: z.string().optional(),
  data_contratacao: z
    .string()
    .min(1, 'Data de contratação é obrigatória')
    .refine(validateDateYear, {
      message: 'Ano inválido (use entre 1900 e 2100)',
    }),
  cidade: z.string().optional(),
  status_ativo: z.boolean().optional(),
  observacoes: z.string().optional(),
  iban: z.string().optional(),
  gestor_responsavel: z.string().optional().nullable(),
  bolt_id: z.string().optional().nullable(),
  uber_uuid: z.string().optional().nullable(),
  documento_ficheiro_url: z.string().optional(),
  documento_identificacao_verso_url: z.string().optional(),
  carta_ficheiro_url: z.string().optional(),
  carta_conducao_verso_url: z.string().optional(),
  licenca_tvde_ficheiro_url: z.string().optional(),
  registo_criminal_url: z.string().optional(),
  comprovativo_morada_url: z.string().optional(),
  comprovativo_iban_url: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CATEGORIAS_CARTA = ['A', 'A1', 'A2', 'B', 'B1', 'C', 'C1', 'D', 'D1', 'E'];

interface MotoristaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista: Motorista | null;
  onMotoristaCreated?: (motorista: Motorista) => void;
  /** Pré-preenche campos quando se cria uma ficha nova (modo criação). */
  prefill?: { nome?: string; bolt_id?: string; uber_uuid?: string };
}

export function MotoristaDialog({
  open,
  onOpenChange,
  motorista,
  onMotoristaCreated,
  prefill,
}: MotoristaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gestores, setGestores] = useState<{ nome: string }[]>([]);
  const [gestorPopoverOpen, setGestorPopoverOpen] = useState(false);
  const { toast } = useToast();

  type CartaoItem = { id: string; numero: string; motorista_id: string | null };
  const [cartoesFrota, setCartoesFrota] = useState<{
    bp: CartaoItem[];
    repsol: CartaoItem[];
    edp: CartaoItem[];
  }>({ bp: [], repsol: [], edp: [] });
  const [selectedCartao, setSelectedCartao] = useState<{ bp: string; repsol: string; edp: string }>(
    { bp: '', repsol: '', edp: '' }
  );

  useEffect(() => {
    if (!open) return;
    const loadCartoes = async () => {
      try {
        const { data } = await (supabase as any)
          .from('cartoes_frota')
          .select('id, numero, tipo, motorista_id')
          .eq('ativo', true)
          .order('numero');
        const all = (data || []) as (CartaoItem & { tipo: string })[];
        const filterTipo = (t: string) =>
          all.filter((c) => c.tipo === t && (!c.motorista_id || c.motorista_id === motorista?.id));
        setCartoesFrota({
          bp: filterTipo('bp'),
          repsol: filterTipo('repsol'),
          edp: filterTipo('edp'),
        });
        // Pre-select cartão actualmente atribuído ao motorista
        const atribuido = (t: string) =>
          all.find((c) => c.tipo === t && c.motorista_id === motorista?.id)?.id || '';
        setSelectedCartao({
          bp: atribuido('bp'),
          repsol: atribuido('repsol'),
          edp: atribuido('edp'),
        });
      } catch {
        /* silencioso */
      }
    };
    loadCartoes();
  }, [open, motorista?.id]);

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      nif: '',
      telefone: '',
      email: '',
      documento_tipo: '',
      documento_numero: '',
      documento_validade: '',
      carta_conducao: '',
      carta_categorias: [],
      carta_validade: '',
      licenca_tvde_numero: '',
      licenca_tvde_validade: '',
      morada: '',
      codigo_postal: '',
      data_contratacao: '',
      cidade: '',
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
    if (motorista) {
      form.reset({
        nome: motorista.nome,
        nif: motorista.nif || '',
        telefone: motorista.telefone || '',
        email: motorista.email || '',
        documento_tipo: motorista.documento_tipo || '',
        documento_numero: motorista.documento_numero || '',
        documento_validade: motorista.documento_validade || '',
        carta_conducao: motorista.carta_conducao || '',
        carta_categorias: motorista.carta_categorias || [],
        carta_validade: motorista.carta_validade || '',
        licenca_tvde_numero: motorista.licenca_tvde_numero || '',
        licenca_tvde_validade: motorista.licenca_tvde_validade || '',
        morada: motorista.morada || '',
        codigo_postal: motorista.codigo_postal || '',
        data_contratacao: motorista.data_contratacao || '',
        cidade: motorista.cidade || '',
        status_ativo: motorista.status_ativo ?? true,
        observacoes: motorista.observacoes || '',
        iban: motorista.iban || '',
        gestor_responsavel: motorista.gestor_responsavel || '',
        bolt_id: motorista.bolt_id || '',
        uber_uuid: motorista.uber_uuid || '',
        documento_ficheiro_url: motorista.documento_ficheiro_url || '',
        documento_identificacao_verso_url: motorista.documento_identificacao_verso_url || '',
        carta_ficheiro_url: motorista.carta_ficheiro_url || '',
        carta_conducao_verso_url: motorista.carta_conducao_verso_url || '',
        licenca_tvde_ficheiro_url: motorista.licenca_tvde_ficheiro_url || '',
        registo_criminal_url: motorista.registo_criminal_url || '',
        comprovativo_morada_url: motorista.comprovativo_morada_url || '',
        comprovativo_iban_url: motorista.comprovativo_iban_url || '',
      });
    } else {
      form.reset({
        nome: prefill?.nome || '',
        nif: '',
        telefone: '',
        email: '',
        documento_tipo: '',
        documento_numero: '',
        documento_validade: '',
        carta_conducao: '',
        carta_categorias: [],
        carta_validade: '',
        licenca_tvde_numero: '',
        licenca_tvde_validade: '',
        morada: '',
        codigo_postal: '',
        data_contratacao: '',
        cidade: '',
        status_ativo: true,
        observacoes: '',
        iban: '',
        gestor_responsavel: '',
        bolt_id: prefill?.bolt_id || '',
        uber_uuid: prefill?.uber_uuid || '',
        documento_ficheiro_url: '',
        documento_identificacao_verso_url: '',
        carta_ficheiro_url: '',
        carta_conducao_verso_url: '',
        licenca_tvde_ficheiro_url: '',
        registo_criminal_url: '',
        comprovativo_morada_url: '',
        comprovativo_iban_url: '',
      });
    }
  }, [motorista, prefill, form]);

  const syncCartoes = async (motoristaId: string) => {
    try {
      for (const tipo of ['bp', 'repsol', 'edp'] as const) {
        const cartaoId = selectedCartao[tipo];
        // Remover associação anterior para este tipo+motorista
        await (supabase as any)
          .from('cartoes_frota')
          .update({ motorista_id: null })
          .eq('tipo', tipo)
          .eq('motorista_id', motoristaId)
          .neq('id', cartaoId || '00000000-0000-0000-0000-000000000000');
        // Atribuir novo cartão
        if (cartaoId) {
          await (supabase as any)
            .from('cartoes_frota')
            .update({ motorista_id: motoristaId })
            .eq('id', cartaoId);
        }
      }
    } catch {
      /* silencioso — não bloqueia o save do motorista */
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Prevenir duplo clique
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      setLoading(true);

      // Verificar duplicado por NIF antes de criar (apenas para novos motoristas)
      if (!motorista && values.nif) {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id, nome, codigo')
          .eq('nif', values.nif)
          .maybeSingle();

        if (existing) {
          toast({
            title: 'Motorista já existe',
            description: `Já existe um motorista com este NIF: ${existing.nome} (Cód. ${existing.codigo})`,
            variant: 'destructive',
          });
          return;
        }
      }

      const dataToSave = {
        nome: values.nome,
        nif: values.nif || null,
        telefone: values.telefone || null,
        email: values.email || null,
        documento_tipo: values.documento_tipo || null,
        documento_numero: values.documento_numero || null,
        documento_validade: values.documento_validade || null,
        carta_conducao: values.carta_conducao || null,
        carta_categorias: values.carta_categorias || null,
        carta_validade: values.carta_validade || null,
        licenca_tvde_numero: values.licenca_tvde_numero || null,
        licenca_tvde_validade: values.licenca_tvde_validade || null,
        morada: values.morada || null,
        codigo_postal: values.codigo_postal || null,
        data_contratacao: values.data_contratacao || null,
        cidade: values.cidade || null,
        status_ativo: values.status_ativo ?? true,
        observacoes: values.observacoes || null,
        iban: values.iban || null,
        gestor_responsavel:
          values.gestor_responsavel === 'none' ? null : values.gestor_responsavel || null,
        bolt_id: values.bolt_id || null,
        uber_uuid: values.uber_uuid || null,
        documento_ficheiro_url: values.documento_ficheiro_url || null,
        documento_identificacao_verso_url: values.documento_identificacao_verso_url || null,
        carta_ficheiro_url: values.carta_ficheiro_url || null,
        carta_conducao_verso_url: values.carta_conducao_verso_url || null,
        licenca_tvde_ficheiro_url: values.licenca_tvde_ficheiro_url || null,
        registo_criminal_url: values.registo_criminal_url || null,
        comprovativo_morada_url: values.comprovativo_morada_url || null,
        comprovativo_iban_url: values.comprovativo_iban_url || null,
      };

      if (motorista) {
        // Update
        const { error } = await supabase
          .from('motoristas_ativos')
          .update(dataToSave)
          .eq('id', motorista.id);

        if (error) throw error;

        // Sync cartões frota
        await syncCartoes(motorista.id);

        toast({
          title: 'Motorista atualizado',
          description: 'Os dados do motorista foram atualizados com sucesso.',
        });

        onOpenChange(false);
      } else {
        // Insert - retornar os dados do novo motorista
        const { data: newMotorista, error } = await supabase
          .from('motoristas_ativos')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;

        // Sync cartões frota
        if (newMotorista) await syncCartoes(newMotorista.id);

        toast({
          title: 'Motorista criado',
          description: 'O motorista foi criado com sucesso.',
        });

        // Fechar diálogo primeiro
        onOpenChange(false);

        // Depois notificar que um novo motorista foi criado
        if (newMotorista) {
          onMotoristaCreated?.(newMotorista as Motorista);
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar motorista:', error);
      toast({
        title: 'Erro ao salvar motorista',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button:last-child]:hidden">
        <DialogHeader className="px-6 py-4 border-b bg-card flex flex-row items-center justify-between shrink-0">
          <div className="space-y-0.5">
            <DialogTitle className="text-2xl font-bold">
              {motorista ? 'Editar Motorista' : 'Adicionar Motorista'}
            </DialogTitle>
            <DialogDescription>
              {motorista
                ? 'Atualize as informações do motorista'
                : 'Preencha os dados do novo motorista'}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-8">
              {/* Dados Pessoais */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <div className="h-8 w-1 bg-primary rounded-full" />
                  <h3 className="text-lg font-semibold">Dados Pessoais</h3>
                </div>

                <FormField
                  control={form.control}
                  name="gestor_responsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">Gestor Responsável</FormLabel>
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
                                'w-full h-11 justify-between bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value && field.value !== 'none'
                                ? gestores.find((gestor) => gestor.nome === field.value)?.nome ||
                                  field.value
                                : 'Selecione o gestor responsável...'}
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
                    <FormItem>
                      <FormLabel>
                        Nome Completo <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: João Silva" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="nif"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          NIF <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="123456789" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value || ''}
                            onChange={field.onChange}
                            defaultCountry="PT"
                            className="h-11"
                          />
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
                          <Input
                            type="email"
                            placeholder="email@exemplo.com"
                            {...field}
                            className="h-11"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="morada"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Morada</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Rua, número, andar..."
                              {...field}
                              className="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="codigo_postal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código Postal</FormLabel>
                        <FormControl>
                          <Input placeholder="0000-000" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="cidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade (Residência)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Lisboa" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="data_contratacao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Data de Contratação <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="iban"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IBAN</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="PT50 0000 0000 0000 0000 0000 0"
                          {...field}
                          className="h-11"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cartões Frota */}
                <div className="bg-orange-50/40 dark:bg-orange-950/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
                    <CreditCard className="h-4 w-4" />
                    Cartões Frota
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(['bp', 'repsol', 'edp'] as const).map((tipo) => (
                      <div key={tipo} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase">
                          {tipo === 'edp' ? 'EDP' : tipo === 'bp' ? 'BP' : 'Repsol'}
                        </label>
                        <Select
                          value={selectedCartao[tipo]}
                          onValueChange={(v) =>
                            setSelectedCartao((s) => ({ ...s, [tipo]: v === '__none__' ? '' : v }))
                          }
                        >
                          <SelectTrigger className="h-9 bg-background text-sm">
                            <SelectValue placeholder="Sem cartão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground italic">Sem cartão</span>
                            </SelectItem>
                            {cartoesFrota[tipo].map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.numero}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-purple-50/30 dark:bg-purple-950/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                  <FormField
                    control={form.control}
                    name="uber_uuid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Uber UUID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ID da Uber"
                            {...field}
                            className="h-11 bg-background"
                          />
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
                        <FormLabel>Bolt ID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ID da Bolt"
                            {...field}
                            className="h-11 bg-background"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Seções de Documentos com Cores */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Identificação - AZUL */}
                <div className="bg-blue-100/40 dark:bg-blue-900/20 p-6 rounded-2xl border-2 border-blue-200 dark:border-blue-800/50 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 pb-2 border-b border-blue-300/50 dark:border-blue-800/50">
                    <h3 className="font-bold text-blue-800 dark:text-blue-300">Identificação</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="documento_tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Tipo <span className="text-red-500">*</span>
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Cartão Cidadão">Cartão Cidadão</SelectItem>
                              <SelectItem value="Passaporte">Passaporte</SelectItem>
                              <SelectItem value="Autorização de Residência">AR</SelectItem>
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
                          <FormLabel>
                            Número <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Número" {...field} className="bg-background" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="documento_validade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Validade</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="bg-background" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="documento_ficheiro_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Frente</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="documentos"
                              motoristaId={motorista?.id}
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
                          <FormLabel className="text-xs">Verso</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="documentos"
                              motoristaId={motorista?.id}
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

                {/* Carta de Condução - VERDE */}
                <div className="bg-emerald-100/40 dark:bg-emerald-900/20 p-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/50 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 pb-2 border-b border-emerald-300/50 dark:border-emerald-800/50">
                    <h3 className="font-bold text-emerald-800 dark:text-emerald-300">
                      Carta de Condução
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="carta_conducao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Número <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Número" {...field} className="bg-background" />
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
                            <Input type="date" {...field} className="bg-background" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="carta_ficheiro_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Frente</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="cartas"
                              motoristaId={motorista?.id}
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
                          <FormLabel className="text-xs">Verso</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="cartas"
                              motoristaId={motorista?.id}
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
                      <FormItem>
                        <FormLabel>Categorias</FormLabel>
                        <div className="grid grid-cols-5 gap-2">
                          {CATEGORIAS_CARTA.map((categoria) => (
                            <FormField
                              key={categoria}
                              control={form.control}
                              name="carta_categorias"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(categoria)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        return checked
                                          ? field.onChange([...current, categoria])
                                          : field.onChange(
                                              current.filter((value) => value !== categoria)
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-xs font-normal cursor-pointer">
                                    {categoria}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                {/* TVDE - ROXO */}
                <div className="bg-indigo-100/40 dark:bg-indigo-900/20 p-6 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/50 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 pb-2 border-b border-indigo-300/50 dark:border-indigo-800/50">
                    <h3 className="font-bold text-indigo-800 dark:text-indigo-300">Licença TVDE</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="licenca_tvde_numero"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número</FormLabel>
                          <FormControl>
                            <Input placeholder="Número" {...field} className="bg-background" />
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
                            <Input type="date" {...field} className="bg-background" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="licenca_tvde_ficheiro_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Ficheiro TVDE</FormLabel>
                        <FormControl>
                          <DocumentUploader
                            folder="tvde"
                            motoristaId={motorista?.id}
                            currentUrl={field.value}
                            onUpload={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Adicional - LARANJA */}
                <div className="bg-amber-100/40 dark:bg-amber-900/20 p-6 rounded-2xl border-2 border-amber-200 dark:border-amber-800/50 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 pb-2 border-b border-amber-300/50 dark:border-amber-800/50">
                    <h3 className="font-bold text-amber-800 dark:text-amber-300">
                      Documentação Extra
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="registo_criminal_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Registo Criminal</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="documentos"
                              motoristaId={motorista?.id}
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
                          <FormLabel className="text-xs">Comprovativo de Morada</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="documentos"
                              motoristaId={motorista?.id}
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
                          <FormLabel className="text-xs">Comprovativo de IBAN</FormLabel>
                          <FormControl>
                            <DocumentUploader
                              folder="documentos"
                              motoristaId={motorista?.id}
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
              </div>

              {/* Observações */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <div className="h-8 w-1 bg-primary rounded-full" />
                  <h3 className="text-lg font-semibold">Notas e Outros</h3>
                </div>

                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações Internas</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Notas sobre o motorista, histórico ou observações relevantes..."
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            </form>
          </Form>
        </div>

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-11 px-8"
          >
            Cancelar
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={loading || isSubmitting}
            className="h-11 px-10 font-bold"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gravando...
              </>
            ) : motorista ? (
              'Guardar Alterações'
            ) : (
              'Criar Motorista'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
