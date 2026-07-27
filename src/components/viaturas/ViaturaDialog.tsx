import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const viaturaSchema = z.object({
  matricula: z.string().min(1, 'Matrícula é obrigatória'),
  marca: z.string().min(1, 'Marca é obrigatória'),
  modelo: z.string().min(1, 'Modelo é obrigatório'),
  ano: z.string().optional(),
  cor: z.string().optional(),
  categoria: z.string().optional(),
  combustivel: z.string().optional(),
  status: z.string().optional(),
  km_atual: z.string().optional(),
  seguro_numero: z.string().optional(),
  seguro_validade: z.string().optional(),
  inspecao_validade: z.string().optional(),
  observacoes: z.string().optional(),
  extintor_numero: z.string().optional().nullable(),
  extintor_validade: z.string().optional().nullable(),
});

type ViaturaFormData = z.infer<typeof viaturaSchema>;

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  cor?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  status?: string | null;
  km_atual?: number | null;
  seguro_numero?: string | null;
  seguro_validade?: string | null;
  inspecao_validade?: string | null;
  observacoes?: string | null;
  extintor_numero?: string | null;
  extintor_validade?: string | null;
}

interface ViaturaDialogProps {
  viatura?: Viatura | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Regime slot: cria a viatura como is_slot=true e liga ao motorista
   *  (motorista_viaturas). Quando definido, a viatura é externa do motorista. */
  slotMotoristaId?: string | null;
  /** Devolve a viatura recém-criada (id + dados básicos) ao criador. */
  onCreated?: (viatura: { id: string; matricula: string; marca: string; modelo: string }) => void;
  /** Matrícula a pré-preencher quando o dialog abre para criar (vem do campo de pesquisa). */
  initialMatricula?: string;
}

const CATEGORIAS = [
  { value: 'green', label: 'Green' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'black', label: 'Black' },
  { value: 'x-saver', label: 'X-Saver' },
];

const COMBUSTIVEIS = [
  { value: 'eletrico', label: 'Elétrico' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'gpl', label: 'GPL' },
  { value: 'gasolina_gpl', label: 'Gasolina + GPL' },
  { value: 'diesel_gpl', label: 'Diesel + GPL' },
];

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em Uso' },
  { value: 'manutencao', label: 'Manutenção', restricted: true, hint: '(Apenas via Ticket)' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'vendida', label: 'Vendida', restricted: true, hint: '(Apenas via Financeiro)' },
];

export function ViaturaDialog({
  viatura,
  open,
  onOpenChange,
  onSuccess,
  slotMotoristaId = null,
  onCreated,
  initialMatricula,
}: ViaturaDialogProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!viatura;

  const form = useForm<ViaturaFormData>({
    resolver: zodResolver(viaturaSchema),
    defaultValues: {
      matricula: '',
      marca: '',
      modelo: '',
      ano: '',
      cor: '',
      categoria: '',
      combustivel: '',
      status: 'disponivel',
      km_atual: '',
      seguro_numero: '',
      seguro_validade: '',
      inspecao_validade: '',
      observacoes: '',
      extintor_numero: '',
      extintor_validade: '',
    },
  });

  useEffect(() => {
    if (viatura) {
      form.reset({
        matricula: viatura.matricula || '',
        marca: viatura.marca || '',
        modelo: viatura.modelo || '',
        ano: viatura.ano?.toString() || '',
        cor: viatura.cor || '',
        categoria: viatura.categoria || '',
        combustivel: viatura.combustivel || '',
        status: viatura.status || 'disponivel',
        km_atual: viatura.km_atual?.toString() || '',
        seguro_numero: viatura.seguro_numero || '',
        seguro_validade: viatura.seguro_validade || '',
        inspecao_validade: viatura.inspecao_validade || '',
        observacoes: viatura.observacoes || '',
        extintor_numero: viatura.extintor_numero || '',
        extintor_validade: viatura.extintor_validade || '',
      });
    } else {
      form.reset({
        matricula: initialMatricula ?? '',
        marca: '',
        modelo: '',
        ano: '',
        cor: '',
        categoria: '',
        combustivel: '',
        status: 'disponivel',
        km_atual: '',
        seguro_numero: '',
        seguro_validade: '',
        inspecao_validade: '',
        observacoes: '',
        extintor_numero: '',
        extintor_validade: '',
      });
    }
  }, [viatura, initialMatricula, form]);

  const onSubmit = async (data: ViaturaFormData) => {
    setLoading(true);
    try {
      const payload = {
        matricula: data.matricula.toUpperCase(),
        marca: data.marca,
        modelo: data.modelo,
        ano: data.ano ? parseInt(data.ano) : null,
        cor: data.cor || null,
        categoria: data.categoria || null,
        combustivel: data.combustivel || null,
        status: data.status || 'disponivel',
        km_atual: data.km_atual ? parseInt(data.km_atual) : 0,
        seguro_numero: data.seguro_numero || null,
        seguro_validade: data.seguro_validade || null,
        inspecao_validade: data.inspecao_validade || null,
        observacoes: data.observacoes || null,
        extintor_numero: data.extintor_numero || null,
        extintor_validade: data.extintor_validade || null,
        // Slot: carro externo do motorista, marcado como is_slot.
        ...(slotMotoristaId ? { is_slot: true } : {}),
      };

      if (isEditing && viatura) {
        const { error } = await supabase.from('viaturas').update(payload).eq('id', viatura.id);

        if (error) throw error;
        toast.success('Viatura atualizada com sucesso!');
      } else {
        const { data: nova, error } = await supabase
          .from('viaturas')
          .insert(payload)
          .select('id, matricula, marca, modelo')
          .single();

        if (error) throw error;

        // Slot: liga a viatura ao motorista (motorista_viaturas).
        if (slotMotoristaId && nova) {
          const { error: linkErr } = await supabase.from('motorista_viaturas').insert({
            motorista_id: slotMotoristaId,
            viatura_id: nova.id,
            data_inicio: new Date().toISOString().split('T')[0],
            status: 'ativo',
          });
          if (linkErr) throw linkErr;
        }

        toast.success('Viatura criada com sucesso!');
        if (nova) onCreated?.(nova);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao guardar viatura:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma viatura com esta matrícula.');
      } else {
        toast.error('Erro ao guardar viatura. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Viatura' : 'Nova Viatura'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing
              ? 'Edite os dados da viatura selecionada.'
              : 'Preencha os dados para registar uma nova viatura.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="matricula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Matrícula <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="AA-00-BB" {...field} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.restricted && field.value !== option.value}
                          >
                            {option.label}{' '}
                            {option.restricted && field.value !== option.value && option.hint}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="marca"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Marca <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Tesla" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="modelo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Modelo <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Model 3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ano"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="2024" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor</FormLabel>
                    <FormControl>
                      <Input placeholder="Branco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIAS.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="combustivel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Combustível</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar combustível" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMBUSTIVEIS.map((comb) => (
                          <SelectItem key={comb.value} value={comb.value}>
                            {comb.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="km_atual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Km Atual</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seguro_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº Apólice Seguro</FormLabel>
                    <FormControl>
                      <Input placeholder="Número da apólice" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seguro_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade do Seguro</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inspecao_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade da Inspeção</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="extintor_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº Extintor</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Número do extintor"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="extintor_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade Extintor</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas adicionais sobre a viatura..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar Alterações' : 'Criar Viatura'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
