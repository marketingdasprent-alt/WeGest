import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import {
  Car,
  CarTaxiFront,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Coins,
  Euro,
  EyeOff,
  FileText,
  Layers,
  MapPin,
  Plus,
  User,
} from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { ALDFields } from '@/components/renting/shared/ALDFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import { useModules } from '@/hooks/useModules';

import type { ReservaFormValues } from '../reservaDialog.schema';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import { SectionHeader } from '../SectionHeader';
import { RegimeCards } from '../RegimeCards';
import { SlotMotoristaViatura } from '../SlotMotoristaViatura';
import { ViaturaDialog } from '@/components/viaturas/ViaturaDialog';

const SENTINEL_NONE = '__none__';

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

interface ReservaTabGeralProps {
  form: UseFormReturn<ReservaFormValues>;
  viaturas: ViaturaBasic[];
  estacoes: Estacao[];
  clientes: ClienteComDocumentos[];
  /** Slot: motoristas para o seletor + callback de criar motorista. */
  motoristas?: Motorista[];
  onCriarMotorista?: () => void;
}

function diferencaDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const di = new Date(inicio).getTime();
  const df = new Date(fim).getTime();
  if (Number.isNaN(di) || Number.isNaN(df) || df <= di) return null;
  return Math.max(1, Math.ceil((df - di) / (1000 * 60 * 60 * 24)));
}

function addDaysToLocalInput(localInput: string, days: number): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  const novo = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${novo.getFullYear()}-${pad(novo.getMonth() + 1)}-${pad(novo.getDate())}T${pad(novo.getHours())}:${pad(novo.getMinutes())}`;
}

type TarifaPrecos = {
  preco_dia: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
};

type Faturacao = {
  valor: number; // valor faturado ao cliente
  modo: 'Diário' | 'Mensal';
  descricao: string;
  semanalCondutor: number | null; // preço/semana atribuído ao condutor (só TVDE)
};

// Faturação ao cliente:
//   TVDE ou ALD       → mensal (preço/mês, período travado em 30 dias)
//   Rent-a-Car normal → diário (nº dias × preço/dia)
// No TVDE, o preço/semana vai para a conta-corrente do condutor.
function calcularFaturacao(
  regime: string,
  isLongaDuracao: boolean,
  dias: number | null,
  tarifa: TarifaPrecos | null
): Faturacao | null {
  if (!tarifa) return null;

  if (regime === 'tvde' || isLongaDuracao) {
    if (tarifa.preco_mes == null) return null;
    return {
      valor: Number(tarifa.preco_mes.toFixed(2)),
      modo: 'Mensal',
      descricao: '30 dias · renova a cada mês',
      semanalCondutor: regime === 'tvde' ? tarifa.preco_semana : null,
    };
  }

  if (dias == null || dias <= 0 || tarifa.preco_dia == null) return null;
  return {
    valor: Number((dias * tarifa.preco_dia).toFixed(2)),
    modo: 'Diário',
    descricao: `${dias} dia(s) × ${tarifa.preco_dia} €`,
    semanalCondutor: null,
  };
}

export const ReservaTabGeral: React.FC<ReservaTabGeralProps> = ({
  form,
  viaturas,
  estacoes,
  clientes,
  motoristas = [],
  onCriarMotorista,
}) => {
  const [viaturaPopoverOpen, setViaturaPopoverOpen] = useState(false);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [novaViaturaOpen, setNovaViaturaOpen] = useState(false);
  const [viaturaSearchTerm, setViaturaSearchTerm] = useState('');
  const queryClient = useQueryClient();
  const { has } = useModules();

  const clienteId = form.watch('cliente_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');

  const cliente = clienteId ? (clientes.find((c) => c.id === clienteId) ?? null) : null;

  const dias = useMemo(() => diferencaDias(dataInicio, dataFim), [dataInicio, dataFim]);

  // Estado local para o input — permite digitar livremente sem que o valor
  // seja sobreposto pelo derivado `dias` durante a edição.
  const [diasInput, setDiasInput] = useState<string>(dias !== null ? String(dias) : '');

  useEffect(() => {
    setDiasInput(dias !== null ? String(dias) : '');
  }, [dias]);

  // Grupos e tarifas — para preencher automaticamente ao escolher a viatura.
  const { data: grupos = [] } = useQuery({
    queryKey: ['renting_grupos_min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_grupos')
        .select('id, nome')
        .eq('ativo', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: tarifas = [] } = useQuery({
    queryKey: ['renting_tarifas_min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select(
          'grupo_id, nome, kms_incluidos, km_adicional_valor, preco_dia, preco_semana, preco_mes'
        )
        .eq('ativa', true);
      if (error) throw error;
      return data;
    },
  });

  // Tarifa aplicável = a do grupo da viatura escolhida.
  const viaturaIdSel = form.watch('viatura_id');
  const tarifaAtual = useMemo(() => {
    if (!viaturaIdSel) return null;
    const v = viaturas.find((x) => x.id === viaturaIdSel);
    if (!v?.grupo_id) return null;
    return tarifas.find((t) => t.grupo_id === v.grupo_id) ?? null;
  }, [viaturaIdSel, viaturas, tarifas]);

  // Faturação automática: regime + ALD + duração + tarifa → valor_total.
  const regime = form.watch('regime');
  const isSlot = regime === 'slot';
  const isLongaDuracao = form.watch('is_longa_duracao');
  const modoMensal = !isSlot && (regime === 'tvde' || isLongaDuracao);
  const faturacao = useMemo(
    () => calcularFaturacao(regime, isLongaDuracao, dias, tarifaAtual),
    [regime, isLongaDuracao, dias, tarifaAtual]
  );

  // Slot não tem faturação de aluguer (carro é do motorista) — só valor semanal.
  useEffect(() => {
    if (faturacao && !isSlot) {
      form.setValue('valor_total', faturacao.valor, { shouldDirty: true });
    }
  }, [faturacao, isSlot, form]);

  // Lista de viaturas filtrada por regime: slot mostra só carros slot
  // (do motorista); restantes regimes escondem carros slot.
  const viaturasFiltradas = useMemo(
    () => viaturas.filter((v) => (isSlot ? v.is_slot === true : v.is_slot !== true)),
    [viaturas, isSlot]
  );

  // Modo mensal (TVDE ou ALD): trava o período em 30 dias.
  useEffect(() => {
    if (modoMensal && dataInicio) {
      const fim = addDaysToLocalInput(dataInicio, 30);
      if (fim && fim !== dataFim) {
        form.setValue('data_fim', fim, { shouldValidate: true });
      }
    }
  }, [modoMensal, dataInicio, dataFim, form]);

  const handleDiasManualChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    setDiasInput(cleaned);
    if (cleaned === '') return;
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!dataInicio) return;
    const novoFim = addDaysToLocalInput(dataInicio, n);
    if (novoFim) form.setValue('data_fim', novoFim, { shouldValidate: true });
  };

  // Ao escolher a viatura: puxa o grupo e os valores da tarifa desse grupo.
  const aplicarDadosViatura = (v: ViaturaBasic) => {
    if (!v.grupo_id) return;
    const grupo = grupos.find((g) => g.id === v.grupo_id);
    if (grupo) form.setValue('grupo', grupo.nome, { shouldDirty: true });

    const tarifa = tarifas.find((t) => t.grupo_id === v.grupo_id);
    if (!tarifa) return;
    if (tarifa.kms_incluidos != null)
      form.setValue('kms_incluidos', tarifa.kms_incluidos, { shouldDirty: true });
    if (tarifa.km_adicional_valor != null)
      form.setValue('km_adicional_valor', tarifa.km_adicional_valor, { shouldDirty: true });
    // O valor_total é calculado automaticamente pelo useEffect (regime + duração).
  };

  return (
    <div className="space-y-8">
      {/* === Regime (primeira escolha) === */}
      <div>
        <SectionHeader
          icon={Layers}
          title="Regime do Aluguer"
          accent="navy"
          required
          hint="Define como a reserva é faturada"
        />
        <FormField
          control={form.control}
          name="regime"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Regime</FormLabel>
              <FormControl>
                <RegimeCards
                  value={field.value}
                  onChange={field.onChange}
                  allowSlot={has('slot')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* === Cliente da Reserva (não aplicável a slot) === */}
      {!isSlot && (
        <div>
          <SectionHeader
            icon={User}
            title="Cliente da Reserva"
            accent="emerald"
            required
            hint="Quem encomendou a reserva"
          />

          <FormField
            control={form.control}
            name="cliente_id"
            render={({ field }) => {
              const selected = field.value
                ? (clientes.find((c) => c.id === field.value) ?? null)
                : null;
              return (
                <FormItem>
                  <FormLabel className="sr-only">Cliente</FormLabel>
                  <Popover
                    open={clientePopoverOpen}
                    onOpenChange={setClientePopoverOpen}
                    modal={false}
                  >
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={clientePopoverOpen}
                          className="w-full justify-between font-normal bg-background"
                        >
                          {selected
                            ? `${selected.nome}${selected.codigo ? ` (#${selected.codigo})` : ''}`
                            : 'Clique ou escreva para procurar cliente...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command
                        filter={(value, search) => {
                          const v = normalizeForSearch(value);
                          const s = normalizeForSearch(search);
                          return s === '' || v.includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Pesquisar por nome, NIF..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__sem_cliente__"
                              onSelect={() => {
                                field.onChange(null);
                                form.setValue('cliente_nome', '');
                                setClientePopoverOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  !field.value ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              — Sem cliente —
                            </CommandItem>
                            {clientes.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.nome} ${c.nif ?? ''} ${c.codigo ?? ''}`}
                                onSelect={() => {
                                  field.onChange(c.id);
                                  form.setValue('cliente_nome', c.nome);
                                  setClientePopoverOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === c.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {c.nome}
                                {c.codigo && (
                                  <span className="ml-1 text-muted-foreground">(#{c.codigo})</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {cliente && (
            <div className="mt-3 p-3 rounded-md border bg-muted/20 text-sm grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-medium">{cliente.nome}</p>
              </div>
              {cliente.nif && (
                <div>
                  <p className="text-xs text-muted-foreground">NIF</p>
                  <p className="font-mono">{cliente.nif}</p>
                </div>
              )}
              {cliente.telefone && (
                <div>
                  <p className="text-xs text-muted-foreground">Telemóvel</p>
                  <p>{cliente.telefone}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === Slot: data de início === */}
      {isSlot && (
        <div className="space-y-4">
          <SectionHeader
            icon={MapPin}
            title="Início do Slot"
            accent="amber"
            required
            hint="Quando o motorista começa a usar o slot"
          />
          <FormField
            control={form.control}
            name="data_inicio"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>
                  Data Início <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    className="bg-background"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* === Entrega | Recolha (não aplicável a slot) === */}
      {!isSlot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <SectionHeader icon={MapPin} title="Entrega" accent="sky" />
            <FormField
              control={form.control}
              name="estacao_entrega_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Estação Início <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    value={field.value ?? SENTINEL_NONE}
                    onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecciona estação..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                      {estacoes.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
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
              name="data_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Data Início <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="bg-background"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4">
            <SectionHeader
              icon={MapPin}
              title="Recolha"
              accent="violet"
              right={
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Nº Dias</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={diasInput}
                    onChange={(e) => handleDiasManualChange(e.target.value)}
                    disabled={!dataInicio || modoMensal}
                    className="h-9 w-16 text-center bg-background text-base font-semibold disabled:bg-muted"
                    placeholder="—"
                    title={
                      modoMensal
                        ? 'Período fixo de 30 dias (mensal)'
                        : dataInicio
                          ? 'Editar ajusta a Data Fim automaticamente'
                          : 'Define primeiro a Data Início'
                    }
                  />
                </div>
              }
            />
            {regime === 'tvde' ? (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
                Reservas TVDE não definem estação de recolha fixa — a viatura pode ser recolhida em
                qualquer estação no fim do contrato.
              </div>
            ) : (
              <FormField
                control={form.control}
                name="estacao_recolha_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Estação Fim <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? SENTINEL_NONE}
                      onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecciona estação..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                        {estacoes.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="data_fim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Data Fim <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className={modoMensal ? 'bg-muted' : 'bg-background'}
                      disabled={modoMensal}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {/* === Aluguer Longa Duração + Renovação (shared) — não aplicável a slot === */}
      {!isSlot && <ALDFields idPrefix="reserva" />}

      {/* === Slot: motorista → viatura (carro próprio do motorista) === */}
      {isSlot && (
        <SlotMotoristaViatura
          form={form}
          motoristas={motoristas}
          onCriarMotorista={() => onCriarMotorista?.()}
        />
      )}

      {/* === Viatura (não slot) === */}
      {!isSlot && (
        <div className="space-y-4">
          <SectionHeader icon={Car} title="Viatura" accent="navy" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="viatura_id"
              render={({ field }) => {
                const selected = field.value ? viaturas.find((x) => x.id === field.value) : null;
                return (
                  <FormItem>
                    <FormLabel>
                      Viatura <span className="text-red-500">*</span>
                    </FormLabel>
                    <Popover
                      open={viaturaPopoverOpen}
                      onOpenChange={setViaturaPopoverOpen}
                      modal={false}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={viaturaPopoverOpen}
                            className="w-full justify-between font-normal bg-background"
                          >
                            {selected
                              ? `${selected.matricula} — ${selected.marca} ${selected.modelo}`
                              : 'Pesquisa por matrícula...'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <Command
                          filter={(value, search) => {
                            const v = normalizeForSearch(value);
                            const s = normalizeForSearch(search);
                            return s === '' || v.includes(s) ? 1 : 0;
                          }}
                        >
                          <CommandInput
                            placeholder="Pesquisar por matrícula..."
                            className="h-9"
                            onValueChange={setViaturaSearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>Nenhuma viatura encontrada.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__sem_viatura__"
                                onSelect={() => {
                                  field.onChange(null);
                                  form.setValue('matricula', '');
                                  setViaturaPopoverOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    !field.value ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                — Sem viatura —
                              </CommandItem>
                              {viaturasFiltradas.map((v) => (
                                <CommandItem
                                  key={v.id}
                                  value={`${v.matricula} ${v.marca} ${v.modelo} ${v.categoria ?? ''}`}
                                  onSelect={() => {
                                    field.onChange(v.id);
                                    form.setValue('matricula', v.matricula);
                                    aplicarDadosViatura(v);
                                    setViaturaPopoverOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === v.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {v.matricula} — {v.marca} {v.modelo}
                                  {v.categoria && (
                                    <span className="ml-1 text-muted-foreground">
                                      ({v.categoria})
                                    </span>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                          <div className="border-t p-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start gap-2 text-primary"
                              onClick={() => {
                                setViaturaPopoverOpen(false);
                                setNovaViaturaOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                              Nova viatura
                              {viaturaSearchTerm ? ` "${viaturaSearchTerm.toUpperCase()}"` : ''}
                            </Button>
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <ViaturaDialog
              open={novaViaturaOpen}
              onOpenChange={setNovaViaturaOpen}
              onSuccess={() => {}}
              initialMatricula={viaturaSearchTerm.toUpperCase()}
              onCreated={(v) => {
                queryClient.invalidateQueries({ queryKey: ['viaturas'] });
                form.setValue('viatura_id', v.id);
                form.setValue('matricula', v.matricula);
                setNovaViaturaOpen(false);
              }}
            />

            <FormField
              control={form.control}
              name="grupo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grupo Viatura</FormLabel>
                  <FormControl>
                    <Input
                      className="bg-muted"
                      {...field}
                      value={field.value ?? ''}
                      placeholder="Definido pela viatura"
                      readOnly
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {/* === Franquia / Caução / Kms (shared) — não aplicável a slot === */}
      {!isSlot && <FranquiaKmsFields kmsReadOnly />}

      {/* === Tarifa & Faturação (da viatura escolhida) — não aplicável a slot === */}
      {!isSlot && (
        <div>
          <SectionHeader icon={Coins} title="Tarifa & Faturação" accent="emerald" />
          {tarifaAtual ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Tarifa', value: tarifaAtual.nome },
                {
                  label: 'Preço / dia',
                  value: tarifaAtual.preco_dia != null ? `${tarifaAtual.preco_dia} €` : '—',
                },
                {
                  label: 'Preço / semana',
                  value: tarifaAtual.preco_semana != null ? `${tarifaAtual.preco_semana} €` : '—',
                },
                {
                  label: 'Preço / mês',
                  value: tarifaAtual.preco_mes != null ? `${tarifaAtual.preco_mes} €` : '—',
                },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {cell.label}
                  </p>
                  <p className="mt-0.5 font-semibold truncate">{cell.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
              Escolhe uma viatura com grupo definido para ver a tarifa aplicável.
            </div>
          )}

          {faturacao && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-brand-navy/10 p-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    <Euro className="h-3.5 w-3.5" />
                    Faturar ao cliente
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {faturacao.modo} · {faturacao.descricao}
                  </p>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {faturacao.valor.toFixed(2)} €
                </p>
              </div>
              {regime === 'tvde' && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-500/20 pt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CarTaxiFront className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Condutor · conta-corrente semanal
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {faturacao.semanalCondutor != null
                      ? `${faturacao.semanalCondutor.toFixed(2)} €/sem`
                      : '— sem preço/semana'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === Slot: valor semanal (cobrado por carro) === */}
      {isSlot && (
        <div>
          <SectionHeader
            icon={Coins}
            title="Valor do Slot"
            accent="amber"
            required
            hint="Cobrado semanalmente ao motorista, por carro"
          />
          <FormField
            control={form.control}
            name="slot_valor_semanal"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>
                  Valor semanal (€) <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="bg-background"
                    placeholder="0,00"
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
        </div>
      )}

      {/* === Observações === */}
      <div className="space-y-4">
        <SectionHeader icon={ClipboardList} title="Observações" accent="amber" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Observações Públicas
                  <span className="text-xs font-normal text-muted-foreground">
                    (apresentadas no relatório)
                  </span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    className="bg-background min-h-[120px]"
                    placeholder="Visível ao cliente no contrato e relatórios..."
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
            name="observacoes_internas"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <EyeOff className="h-4 w-4 text-amber-600" />
                  Observações Internas
                  <span className="text-xs font-normal text-muted-foreground">
                    (apenas uso interno)
                  </span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    className="bg-background min-h-[120px] border-amber-500/30"
                    placeholder="Notas internas — não aparecem em documentos do cliente..."
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
};
