import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Car,
  Check,
  ChevronsUpDown,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { useViaturas } from '@/hooks/useViaturas';
import { useEstacoes } from '@/hooks/useEstacoes';
import { useColaboradores } from '@/hooks/useColaboradores';
import { useCreateMovimento } from '@/hooks/useMovimentos';

import {
  movimentoFormSchema,
  type MovimentoFormValues,
} from '@/components/renting/movimentacoes/movimentoForm.schema';
import {
  COMBUSTIVEL_OPTIONS,
  localInputToIso,
} from '@/components/renting/movimentacoes/movimentosUtils';

import type { MovimentoInsert } from '@/types/movimento';

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SENTINEL_NONE = '__none__';

/** Lower-case + strip diacritics + strip dashes/spaces — for matricula/name search. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');
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

interface NovaMovimentacaoInternaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NovaMovimentacaoInternaDialog: React.FC<NovaMovimentacaoInternaDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const queryClient = useQueryClient();
  const { data: viaturas = [] } = useViaturas({ apenasDisponiveis: true });
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: colaboradores = [] } = useColaboradores();

  const createMutation = useCreateMovimento();

  const form = useForm<MovimentoFormValues>({
    resolver: zodResolver(movimentoFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const [viaturaPopoverOpen, setViaturaPopoverOpen] = useState(false);
  const [viaturaSearch, setViaturaSearch] = useState('');
  const [colaboradorPopoverOpen, setColaboradorPopoverOpen] = useState(false);
  const [colaboradorSearch, setColaboradorSearch] = useState('');

  const isPending = createMutation.isPending;

  const resetState = () => {
    form.reset(DEFAULT_VALUES);
    setViaturaSearch('');
    setColaboradorSearch('');
  };

  const onSubmit = async (values: MovimentoFormValues) => {
    const viaturaSelecionada = viaturas.find((v) => v.id === values.viatura_id);

    const payload: MovimentoInsert = {
      tipo: 'transferencia',
      estado: 'a_decorrer',
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
      info: null,
      observacoes: values.observacoes || null,
      observacoes_internas: null,
    };

    try {
      await createMutation.mutateAsync(payload);
      queryClient.invalidateQueries({ queryKey: ['movimentos'] });
      resetState();
      onOpenChange(false);
    } catch {
      // Erros reportados pela mutation via toast.
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const viaturasOrdered = useMemo(
    () => [...viaturas].sort((a, b) => a.matricula.localeCompare(b.matricula, 'pt')),
    [viaturas]
  );

  const colaboradoresOrdered = useMemo(
    () => [...colaboradores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [colaboradores]
  );

  const viaturasFiltradas = useMemo(() => {
    const s = normalize(viaturaSearch);
    if (!s) return viaturasOrdered;
    return viaturasOrdered.filter((v) => {
      const hay = normalize(`${v.matricula} ${v.marca} ${v.modelo} ${v.categoria ?? ''}`);
      return hay.includes(s);
    });
  }, [viaturasOrdered, viaturaSearch]);

  const colaboradoresFiltrados = useMemo(() => {
    const s = normalize(colaboradorSearch);
    if (!s) return colaboradoresOrdered;
    return colaboradoresOrdered.filter((c) => normalize(c.nome).includes(s));
  }, [colaboradoresOrdered, colaboradorSearch]);

  const viaturaIdSelected = form.watch('viatura_id');
  const colaboradorIdSelected = form.watch('colaborador_id');
  const selectedViatura = viaturas.find((v) => v.id === viaturaIdSelected) ?? null;
  const selectedColaborador = colaboradores.find((c) => c.id === colaboradorIdSelected) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl w-[95vw] max-h-[92dvh] p-0 overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                Nova Movimentação Interna
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Regista uma transferência de viatura entre estações.
              </DialogDescription>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-semibold tracking-wide uppercase">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />
              A decorrer
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            <div className="flex-1 min-h-0 overflow-hidden px-6 pt-3 pb-3 space-y-2.5">
              {/* ── Viatura ── */}
              <FormField
                control={form.control}
                name="viatura_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5" />
                      Viatura
                    </FormLabel>
                    <Popover
                      open={viaturaPopoverOpen}
                      onOpenChange={(o) => {
                        setViaturaPopoverOpen(o);
                        if (!o) setViaturaSearch('');
                      }}
                      modal={false}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={viaturaPopoverOpen}
                            className="w-full justify-between font-normal bg-background h-9"
                          >
                            {selectedViatura ? (
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="font-mono">{selectedViatura.matricula}</span>
                                <span className="text-muted-foreground truncate">
                                  — {selectedViatura.marca} {selectedViatura.modelo}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground"> </span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[150]"
                        align="start"
                      >
                        <div className="flex items-center border-b px-3">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input
                            type="text"
                            autoFocus
                            value={viaturaSearch}
                            onChange={(e) => setViaturaSearch(e.target.value)}
                            placeholder=""
                            className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="max-h-[260px] overflow-y-auto py-1">
                          {viaturasFiltradas.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              Nenhuma viatura encontrada.
                            </div>
                          ) : (
                            viaturasFiltradas.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  field.onChange(v.id);
                                  form.setValue('matricula', v.matricula);
                                  if (v.km_atual != null && form.getValues('km_inicial') == null) {
                                    form.setValue('km_inicial', v.km_atual);
                                  }
                                  setViaturaPopoverOpen(false);
                                  setViaturaSearch('');
                                }}
                                className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent text-left cursor-pointer rounded-sm"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    field.value === v.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="font-mono">{v.matricula}</span>
                                <span className="ml-2 text-muted-foreground truncate">
                                  {v.marca} {v.modelo}
                                  {v.categoria ? ` · ${v.categoria}` : ''}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Datas ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="data_partida"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Data Partida
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          className="bg-background h-9"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data_chegada"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Data de Chegada Prevista
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          className="bg-background h-9"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Estações ── */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-2">
                <FormField
                  control={form.control}
                  name="estacao_origem_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        Estação Origem
                      </FormLabel>
                      <Select
                        value={field.value ?? SENTINEL_NONE}
                        onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background h-9">
                            <SelectValue placeholder="Selecciona origem..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                          {estacoes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                              {e.cidade ? ` · ${e.cidade}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="hidden md:flex items-center justify-center pb-2.5 text-muted-foreground">
                  <ArrowRight className="h-5 w-5" />
                </div>
                <FormField
                  control={form.control}
                  name="estacao_destino_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Estação Destino
                      </FormLabel>
                      <Select
                        value={field.value ?? SENTINEL_NONE}
                        onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background h-9">
                            <SelectValue placeholder="Selecciona destino..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                          {estacoes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                              {e.cidade ? ` · ${e.cidade}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Colaborador (searchable) ── */}
              <FormField
                control={form.control}
                name="colaborador_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Colaborador Responsável
                    </FormLabel>
                    <Popover
                      open={colaboradorPopoverOpen}
                      onOpenChange={(o) => {
                        setColaboradorPopoverOpen(o);
                        if (!o) setColaboradorSearch('');
                      }}
                      modal={false}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={colaboradorPopoverOpen}
                            className="w-full justify-between font-normal bg-background h-9"
                          >
                            {selectedColaborador ? (
                              <span className="truncate">{selectedColaborador.nome}</span>
                            ) : (
                              <span className="text-muted-foreground">Sem responsável</span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[150]"
                        align="start"
                      >
                        <div className="flex items-center border-b px-3">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input
                            type="text"
                            autoFocus
                            value={colaboradorSearch}
                            onChange={(e) => setColaboradorSearch(e.target.value)}
                            placeholder=""
                            className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="max-h-[260px] overflow-y-auto py-1">
                          <button
                            type="button"
                            onClick={() => {
                              field.onChange(null);
                              form.setValue('colaborador_nome', '');
                              setColaboradorPopoverOpen(false);
                              setColaboradorSearch('');
                            }}
                            className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent text-left cursor-pointer rounded-sm"
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 shrink-0',
                                field.value == null ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="text-muted-foreground italic">Sem responsável</span>
                          </button>
                          {colaboradoresFiltrados.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              Nenhum colaborador encontrado.
                            </div>
                          ) : (
                            colaboradoresFiltrados.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  field.onChange(c.id);
                                  form.setValue('colaborador_nome', c.nome);
                                  setColaboradorPopoverOpen(false);
                                  setColaboradorSearch('');
                                }}
                                className="flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent text-left cursor-pointer rounded-sm"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    field.value === c.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {c.nome}
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── KM & Combustível ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <FormField
                  control={form.control}
                  name="km_inicial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5" />
                        KM Inicial
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="—"
                          className="bg-background h-9"
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="km_final"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5" />
                        KM Final
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="—"
                          className="bg-background h-9"
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="combustivel_inicial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Fuel className="h-3.5 w-3.5" />
                        Comb. Inicial
                      </FormLabel>
                      <Select
                        value={field.value == null ? SENTINEL_NONE : String(field.value)}
                        onValueChange={(v) =>
                          field.onChange(v === SENTINEL_NONE ? null : Number(v))
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background h-9">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SENTINEL_NONE}>— Não registado —</SelectItem>
                          {COMBUSTIVEL_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>
                              {o.label}
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
                  name="combustivel_final"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Fuel className="h-3.5 w-3.5" />
                        Comb. Final
                      </FormLabel>
                      <Select
                        value={field.value == null ? SENTINEL_NONE : String(field.value)}
                        onValueChange={(v) =>
                          field.onChange(v === SENTINEL_NONE ? null : Number(v))
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background h-9">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SENTINEL_NONE}>— Não registado —</SelectItem>
                          {COMBUSTIVEL_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Descrição ── */}
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Descrição
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        className="bg-background resize-none h-[56px]"
                        rows={2}
                        placeholder="Ex.: motivo da transferência, instruções, observações..."
                        maxLength={2000}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="px-6 py-2 border-t border-border bg-muted/30 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2 min-w-[140px]">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar Movimentação
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
