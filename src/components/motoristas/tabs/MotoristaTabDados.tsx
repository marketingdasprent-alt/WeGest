import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { Fuel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { Form, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Motorista } from '@/pages/Motoristas';
import { MotoristaCartoesFrota } from '../MotoristaCartoesFrota';
import { validateDateYear, YEAR_RANGE_MESSAGE } from '@/utils/dateValidators';
import { validarNIF, validarIBAN, validarCodigoPostal, validarCartaConducao, validarNumeroDocumento } from '@/lib/pt-validators';
import {
  DadosPessoaisSection,
  ContactosSection,
  DocumentoIdentificacaoSection,
  CartaConducaoSection,
  LicencaTvdeSection,
  DocumentacaoAdicionalSection,
  IntegracoesSection,
  EstadoConfiguracaoSection,
  ObservacoesSection,
} from './dados';

// Mapeia os labels do select deste form para as chaves de regra do pt-validators.
const DOC_TYPE_KEY: Record<string, string> = {
  'Cartão de Cidadão': 'cc',
  'Bilhete de Identidade': 'bi',
  Passaporte: 'passaporte',
  'Título de Residência': 'tr',
};

const formSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  nif: z
    .string()
    .min(1, 'NIF é obrigatório')
    .refine(
      (v) => validarNIF(v).valid,
      (v) => ({ message: validarNIF(v).message || 'NIF inválido' })
    ),
  email: z.string().min(1, 'Email é obrigatório').email('Email inválido'),
  telefone: z.string().min(1, 'Telefone é obrigatório'),
  morada: z.string().optional(),
  codigo_postal: z
    .string()
    .optional()
    .refine(
      (v) => !v || validarCodigoPostal(v).valid,
      (v) => ({ message: (v ? validarCodigoPostal(v).message : '') || 'Código postal inválido' })
    ),
  cidade: z.string().optional(),
  documento_tipo: z.string().min(1, 'Tipo de documento é obrigatório'),
  documento_numero: z.string().min(1, 'Número do documento é obrigatório'),
  documento_validade: z
    .string()
    .min(1, 'Validade é obrigatória')
    .refine(validateDateYear, { message: YEAR_RANGE_MESSAGE }),
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
    .min(1, 'IBAN é obrigatório')
    .refine(
      (v) => validarIBAN(v).valid,
      (v) => ({ message: validarIBAN(v).message || 'IBAN inválido' })
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
  isCreating?: boolean;
  onCreated?: (motorista: Motorista) => void;
}

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
  const [hasChanges, setHasChanges] = useState(!!draft);
  const suppressHasChangesRef = useRef(false);

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
      nome: '', nif: '', email: '', telefone: '', morada: '', codigo_postal: '', cidade: '',
      documento_tipo: '', documento_numero: '', documento_validade: '',
      carta_conducao: '', carta_categorias: [], carta_validade: '',
      licenca_tvde_numero: '', licenca_tvde_validade: '',
      cartao_frota: '', cartao_bp: '', cartao_repsol: '', cartao_edp: '',
      data_contratacao: '', recibo_verde: true, is_slot: false,
      slot_valor_semanal: null, seguro_valor_semanal: null, status_ativo: true,
      observacoes: '', iban: '', gestor_responsavel: '',
      bolt_id: '', uber_uuid: '',
      documento_ficheiro_url: '', documento_identificacao_verso_url: '',
      carta_ficheiro_url: '', carta_conducao_verso_url: '',
      licenca_tvde_ficheiro_url: '', registo_criminal_url: '',
      comprovativo_morada_url: '', comprovativo_iban_url: '',
    },
  });

  useEffect(() => {
    if (!motorista) return;
    if (draft) {
      form.reset(draft as FormData);
      return;
    }
    form.reset({
      nome: motorista.nome || '', nif: motorista.nif || '', email: motorista.email || '',
      telefone: motorista.telefone || '', morada: motorista.morada || '',
      codigo_postal: motorista.codigo_postal || '', cidade: motorista.cidade || '',
      documento_tipo: motorista.documento_tipo || '',
      documento_numero: motorista.documento_numero || '',
      documento_validade: motorista.documento_validade || '',
      carta_conducao: motorista.carta_conducao || '', carta_categorias: motorista.carta_categorias || [],
      carta_validade: motorista.carta_validade || '',
      licenca_tvde_numero: motorista.licenca_tvde_numero || '',
      licenca_tvde_validade: motorista.licenca_tvde_validade || '',
      cartao_frota: motorista.cartao_frota || '', cartao_bp: motorista.cartao_bp || '',
      cartao_repsol: motorista.cartao_repsol || '', cartao_edp: motorista.cartao_edp || '',
      data_contratacao: motorista.data_contratacao || '',
      recibo_verde: motorista.recibo_verde ?? true, is_slot: motorista.is_slot ?? false,
      slot_valor_semanal: motorista.slot_valor_semanal ?? null,
      seguro_valor_semanal: motorista.seguro_valor_semanal ?? null,
      status_ativo: motorista.status_ativo ?? true,
      observacoes: motorista.observacoes || '', iban: motorista.iban || '',
      gestor_responsavel: motorista.gestor_responsavel || '',
      uber_uuid: motorista.uber_uuid || '', bolt_id: motorista.bolt_id || '',
      documento_ficheiro_url: motorista.documento_ficheiro_url || '',
      documento_identificacao_verso_url: motorista.documento_identificacao_verso_url || '',
      carta_ficheiro_url: motorista.carta_ficheiro_url || '',
      carta_conducao_verso_url: motorista.carta_conducao_verso_url || '',
      licenca_tvde_ficheiro_url: motorista.licenca_tvde_ficheiro_url || '',
      registo_criminal_url: motorista.registo_criminal_url || '',
      comprovativo_morada_url: motorista.comprovativo_morada_url || '',
      comprovativo_iban_url: motorista.comprovativo_iban_url || '',
    });
    setHasChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorista, form]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name) {
        if (!suppressHasChangesRef.current) setHasChanges(true);
        onDraftChange?.(values as Record<string, unknown>);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onDraftChange]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const nifNormalizado = data.nif ? data.nif.replace(/\s/g, '') : null;
      if (isCreating && nifNormalizado) {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id, nome, codigo')
          .eq('nif', nifNormalizado)
          .maybeSingle();
        if (existing) {
          toast.error(`Já existe um motorista com este NIF: ${existing.nome} (Cód. ${existing.codigo})`);
          setIsSubmitting(false);
          return;
        }
      }
      const updateData = {
        nome: data.nome, nif: nifNormalizado, email: data.email || null,
        telefone: data.telefone || null, morada: data.morada || null,
        codigo_postal: data.codigo_postal || null, cidade: data.cidade || null,
        documento_tipo: data.documento_tipo || null,
        documento_numero: data.documento_numero || null,
        documento_validade: data.documento_validade || null,
        carta_conducao: data.carta_conducao || null,
        carta_categorias: data.carta_categorias || null,
        carta_validade: data.carta_validade || null,
        licenca_tvde_numero: data.licenca_tvde_numero || null,
        licenca_tvde_validade: data.licenca_tvde_validade || null,
        cartao_frota: data.cartao_frota || null, cartao_bp: data.cartao_bp || null,
        cartao_repsol: data.cartao_repsol || null, cartao_edp: data.cartao_edp || null,
        data_contratacao: data.data_contratacao || null,
        recibo_verde: data.recibo_verde, is_slot: data.is_slot,
        slot_valor_semanal: data.is_slot ? data.slot_valor_semanal : null,
        seguro_valor_semanal: data.seguro_valor_semanal ?? null,
        status_ativo: data.status_ativo, observacoes: data.observacoes || null,
        iban: data.iban ? data.iban.replace(/\s/g, '').toUpperCase() : null,
        gestor_responsavel: data.gestor_responsavel === 'none' ? null : data.gestor_responsavel || null,
        uber_uuid: data.uber_uuid || null, bolt_id: data.bolt_id || null,
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
        const { data: novo, error } = await supabase
          .from('motoristas_ativos').insert(updateData).select().single();
        if (error) throw error;
        toast.success('Motorista criado com sucesso!');
        setHasChanges(false);
        onDraftChange?.(null);
        onCreated?.(novo as Motorista);
      } else {
        const { error } = await supabase
          .from('motoristas_ativos').update(updateData).eq('id', motorista.id);
        if (error) throw error;
        toast.success('Motorista atualizado com sucesso!');
        setHasChanges(false);
        onDraftChange?.(null);
        onSave();
      }
    } catch (error) {
      console.error('Erro ao guardar motorista:', error);
      toast.error(isCreating ? 'Erro ao criar motorista' : 'Erro ao atualizar motorista');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCartoesChanged = async () => {
    onSave();
    if (!motorista?.id) return;
    const { data } = await supabase
      .from('motoristas_ativos')
      .select('cartao_bp, cartao_repsol, cartao_edp')
      .eq('id', motorista.id)
      .maybeSingle();
    if (data) {
      suppressHasChangesRef.current = true;
      form.setValue('cartao_bp', data.cartao_bp || '');
      form.setValue('cartao_repsol', data.cartao_repsol || '');
      form.setValue('cartao_edp', data.cartao_edp || '');
      suppressHasChangesRef.current = false;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Linha 1: Dados Pessoais + Morada */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DadosPessoaisSection control={form.control} gestores={gestores} />
          <ContactosSection control={form.control} />
        </div>

        {/* Linha 2: Documentos + Carta + Licença TVDE (fluxo natural) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DocumentoIdentificacaoSection control={form.control} motorista={motorista} />
          <CartaConducaoSection control={form.control} motorista={motorista} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LicencaTvdeSection control={form.control} motorista={motorista} />
          <DocumentacaoAdicionalSection control={form.control} motorista={motorista} />
        </div>

        {/* Combustível */}
        <SectionCard
          icon={<Fuel className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
          title="Combustível"
          headerClassName="bg-orange-50 dark:bg-orange-950/30 border-b"
        >
          {isCreating || !motorista?.id ? (
            <p className="text-sm text-muted-foreground italic text-center py-2">
              Grave o motorista primeiro para poder associar cartões de frota.
            </p>
          ) : (
            <MotoristaCartoesFrota motorista={motorista} onChanged={handleCartoesChanged} />
          )}
        </SectionCard>

        {/* Linha 3: Estado & Configuração */}
        <EstadoConfiguracaoSection control={form.control} />

        {/* Linha 4: Integrações + Observações */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-4">
          <IntegracoesSection control={form.control} />
          <ObservacoesSection control={form.control} />
        </div>

        {/* Botão de salvar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          {hasChanges && !isSubmitting && (
            <span className="text-xs text-muted-foreground">Alterações por gravar</span>
          )}
          <Button type="submit" disabled={isSubmitting || !hasChanges}>
            {isSubmitting ? 'A guardar...' : isCreating ? 'Criar Motorista' : 'Guardar Alterações'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
