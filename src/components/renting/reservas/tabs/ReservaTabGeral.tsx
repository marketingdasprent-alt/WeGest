import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import {
  Building2,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

import { ALDFields } from '@/components/renting/shared/ALDFields';
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import { EmissorSelect } from '@/components/renting/EmissorSelect';
import { GestorSelect } from '@/components/renting/GestorSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { useModules } from '@/hooks/useModules';
import {
  useRentingGruposMin,
  useRentingTarifasMin,
  useRentingTarifaPrecosModelo,
  calcularFaturacaoRenting,
} from '@/hooks/useRentingGruposTarifas';
import { AlertTriangle } from 'lucide-react';

import { SLOT_ESTADOS_PERMITIDOS, SLOT_ESTADO_LABELS } from '@/types/reserva';
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
  /** Condutores/Motoristas (secção "Condutor/Motorista", antes das OBS). */
  onCriarNovoCliente?: () => void;
  onCriarCondutorProvisorio?: () => void;
}

function diferencaDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const di = new Date(inicio).getTime();
  const df = new Date(fim).getTime();
  if (Number.isNaN(di) || Number.isNaN(df) || df <= di) return null;
  return Math.max(1, Math.ceil((df - di) / (1000 * 60 * 60 * 24)));
}

const padDate = (n: number) => String(n).padStart(2, '0');

function formatLocalInput(d: Date): string {
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}T${padDate(d.getHours())}:${padDate(d.getMinutes())}`;
}

function addDaysToLocalInput(localInput: string, days: number): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(new Date(d.getTime() + days * 24 * 60 * 60 * 1000));
}

function addOneMonthSameDayToLocalInput(localInput: string): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(
    new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
  );
}

function firstDayNextMonthToLocalInput(localInput: string): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(
    new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes())
  );
}

export const ReservaTabGeral: React.FC<ReservaTabGeralProps> = ({
  form,
  viaturas,
  estacoes,
  clientes,
  motoristas = [],
  onCriarMotorista,
  onCriarNovoCliente,
  onCriarCondutorProvisorio,
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
  const { podeVerTodosRenting } = usePermissions();

  const dias = useMemo(() => diferencaDias(dataInicio, dataFim), [dataInicio, dataFim]);

  // Estado local para o input — permite digitar livremente sem que o valor
  // seja sobreposto pelo derivado `dias` durante a edição.
  const [diasInput, setDiasInput] = useState<string>(dias !== null ? String(dias) : '');

  useEffect(() => {
    setDiasInput(dias !== null ? String(dias) : '');
  }, [dias]);

  // Grupos e tarifas — para preencher automaticamente ao escolher a viatura.
  const { data: grupos = [] } = useRentingGruposMin();
  const { data: tarifas = [] } = useRentingTarifasMin();
  const { data: precosModelo = [] } = useRentingTarifaPrecosModelo();

  const regime = form.watch('regime');
  const isSlot = regime === 'slot';
  const isTvde = regime === 'tvde';
  const tarifaIdSel = form.watch('tarifa_id');

  // Tarifas disponíveis por regime: TVDE só tarifas tipo='tvde'; restantes
  // regimes só as não-TVDE.
  const tarifasTvde = useMemo(() => tarifas.filter((t) => t.tipo === 'tvde'), [tarifas]);

  // Tarifa aplicável:
  //  • TVDE  → a tarifa escolhida manualmente (tarifa_id).
  //  • outros → a do grupo da viatura escolhida.
  const viaturaIdSel = form.watch('viatura_id');
  const viaturaSelected = useMemo(
    () => viaturas.find((x) => x.id === viaturaIdSel) ?? null,
    [viaturaIdSel, viaturas]
  );
  const tarifaAtual = useMemo(() => {
    if (isTvde) return tarifas.find((t) => t.id === tarifaIdSel) ?? null;
    if (!viaturaIdSel) return null;
    const v = viaturas.find((x) => x.id === viaturaIdSel);
    if (!v?.grupo_id) return null;
    return tarifas.find((t) => t.grupo_id === v.grupo_id && t.tipo !== 'tvde') ?? null;
  }, [isTvde, tarifaIdSel, viaturaIdSel, viaturas, tarifas]);

  // TVDE: preço/semana do MODELO da viatura na tarifa TVDE escolhida.
  // null = modelo sem preço nesta tarifa → bloqueia (aviso na UI).
  const precoModeloSemanaTvde = useMemo(() => {
    if (!isTvde || !tarifaIdSel || !viaturaSelected?.modelo_id) return null;
    return (
      precosModelo.find(
        (p) => p.tarifa_id === tarifaIdSel && p.modelo_id === viaturaSelected.modelo_id
      )?.preco_semana ?? null
    );
  }, [isTvde, tarifaIdSel, viaturaSelected, precosModelo]);

  // TVDE com viatura escolhida mas modelo sem preço na tarifa → bloquear/avisar.
  const tvdeModeloSemPreco =
    isTvde && !!tarifaIdSel && !!viaturaSelected?.modelo_id && precoModeloSemanaTvde == null;

  // Faturação automática: regime + ALD + duração + tarifa → valor_total.
  const isLongaDuracao = form.watch('is_longa_duracao');
  const renovacaoOpcao = form.watch('renovacao_opcao');
  const renovacaoIntervalo = form.watch('renovacao_intervalo_dias');
  const modoMensal = !isSlot && !isTvde && isLongaDuracao;
  const faturacao = useMemo(
    () =>
      calcularFaturacaoRenting(regime, isLongaDuracao, dias, tarifaAtual, precoModeloSemanaTvde),
    [regime, isLongaDuracao, dias, tarifaAtual, precoModeloSemanaTvde]
  );

  // Slot não tem faturação de aluguer (carro é do motorista) — só valor semanal.
  useEffect(() => {
    if (faturacao && !isSlot) {
      form.setValue('valor_total', faturacao.valor, { shouldDirty: true });
    }
  }, [faturacao, isSlot, form]);

  // Lista de viaturas filtrada por regime: slot mostra só carros slot
  // (do motorista); restantes regimes escondem carros slot. habilitada_tvde é
  // apenas informativo/administrativo — não restringe o seletor. A pesquisa no
  // seletor é apenas por matrícula (sem filtro por grupo).
  const viaturasDoRegime = useMemo(
    () => viaturas.filter((v) => (isSlot ? v.is_slot === true : v.is_slot !== true)),
    [viaturas, isSlot]
  );

  // Modo mensal (TVDE ou ALD): data_fim calculada conforme a opção de renovação.
  useEffect(() => {
    if (!modoMensal || !dataInicio) return;
    let fim: string | null = null;
    if (renovacaoOpcao === 'mesmo_dia_cada_mes') {
      fim = addOneMonthSameDayToLocalInput(dataInicio);
    } else if (renovacaoOpcao === 'primeiro_dia_mes') {
      fim = firstDayNextMonthToLocalInput(dataInicio);
    } else {
      // 'intervalo_dias' ou sem opção definida → usar intervalo (default 30)
      fim = addDaysToLocalInput(dataInicio, renovacaoIntervalo ?? 30);
    }
    if (fim && fim !== dataFim) {
      form.setValue('data_fim', fim, { shouldValidate: true });
    }
  }, [modoMensal, dataInicio, dataFim, renovacaoOpcao, renovacaoIntervalo, form]);

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

  const handleIntervaloChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned === '') return;
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    form.setValue('renovacao_intervalo_dias', n, { shouldDirty: true });
  };

  // Ao escolher a viatura: puxa o grupo e os valores da tarifa desse grupo.
  const aplicarDadosViatura = (v: ViaturaBasic) => {
    if (!v.grupo_id) {
      // Sem grupo: o Alert amarelo mostra a mensagem; sem toast.
      return;
    }
    const grupo = grupos.find((g) => g.id === v.grupo_id);
    if (grupo) form.setValue('grupo', grupo.nome, { shouldDirty: true });

    // Sugestão de empresa emissora a partir da viatura — só quando o campo
    // ainda estiver vazio, nunca sobrescreve uma escolha manual do gestor.
    if (v.emissor_id && !form.getValues('emissor_id')) {
      form.setValue('emissor_id', v.emissor_id, { shouldDirty: true });
    }

    // Em TVDE a tarifa é escolhida manualmente (tarifa_id), não deriva do grupo —
    // por isso não se sobrepõem aqui os kms/km da tarifa de grupo.
    if (isTvde) return;

    const tarifa = tarifas.find((t) => t.grupo_id === v.grupo_id && t.tipo !== 'tvde');
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

      {/* === Empresa Emissora (todos os regimes — slot incluído) === */}
      <div>
        <SectionHeader
          icon={Building2}
          title="Empresa Emissora"
          accent="sky"
          required
          hint="Os documentos da reserva usam os templates desta empresa"
        />
        <FormField
          control={form.control}
          name="emissor_id"
          render={({ field }) => (
            <FormItem className="max-w-md">
              <FormLabel className="sr-only">Empresa emissora</FormLabel>
              <EmissorSelect value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        {podeVerTodosRenting && (
          <FormField
            control={form.control}
            name="gestor_id"
            render={({ field }) => (
              <FormItem className="max-w-md">
                <FormLabel>Gestor responsável</FormLabel>
                <GestorSelect value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        )}
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
                    onValueChange={(v) => {
                      if (!v) return;
                      field.onChange(v === SENTINEL_NONE ? null : v);
                    }}
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
                  <span className="text-xs font-medium text-muted-foreground">
                    {modoMensal && renovacaoOpcao === 'intervalo_dias'
                      ? 'Intervalo (dias)'
                      : 'Nº Dias'}
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={
                      modoMensal && renovacaoOpcao === 'intervalo_dias'
                        ? (renovacaoIntervalo ?? 30).toString()
                        : diasInput
                    }
                    onChange={(e) =>
                      modoMensal && renovacaoOpcao === 'intervalo_dias'
                        ? handleIntervaloChange(e.target.value)
                        : handleDiasManualChange(e.target.value)
                    }
                    disabled={!dataInicio || (modoMensal && renovacaoOpcao !== 'intervalo_dias')}
                    className="h-9 w-16 text-center bg-background text-base font-semibold disabled:bg-muted"
                    placeholder="—"
                    title={
                      modoMensal && renovacaoOpcao !== 'intervalo_dias'
                        ? 'Calculado automaticamente pela opção de renovação'
                        : modoMensal
                          ? 'Intervalo de renovação — altera a Data Fim automaticamente'
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
                      onValueChange={(v) => {
                        if (!v) return;
                        field.onChange(v === SENTINEL_NONE ? null : v);
                      }}
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

      {/* === Aluguer Longa Duração + Renovação (shared) === */}
      <ALDFields idPrefix="reserva" />

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
                              {viaturasDoRegime.map((v) => (
                                <CommandItem
                                  key={v.id}
                                  value={v.matricula}
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

          {/* Aviso: viatura sem grupo bloqueia cálculo de preços */}
          {viaturaSelected && !viaturaSelected.grupo_id && (
            <Alert variant="destructive" className="border-amber-200 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-100">
                Viatura {viaturaSelected.matricula}: sem grupo atribuído
              </AlertTitle>
              <AlertDescription className="text-amber-800 dark:text-amber-200 mt-1">
                <p className="text-sm mb-2">
                  Sem grupo, não há tarifa automática — os preços não podem ser calculados.
                </p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-amber-700 dark:text-amber-300 underline"
                  onClick={() => {
                    if (viaturaSelected) {
                      window.open(`/viaturas/${viaturaSelected.id}`, '_blank');
                    }
                  }}
                >
                  Definir grupo na ficha da viatura →
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* === Franquia / Caução / Kms (shared) — não aplicável a slot === */}
      {!isSlot && <FranquiaKmsFields kmsReadOnly />}

      {/* === Tarifa & Faturação (da viatura escolhida) — não aplicável a slot === */}
      {!isSlot && (
        <div>
          <SectionHeader icon={Coins} title="Tarifa & Faturação" accent="emerald" />

          {/* TVDE: escolha manual da tarifa (só tarifas tipo='tvde'). O preço é
              semanal, definido por modelo na própria tarifa. */}
          {isTvde && (
            <div className="mb-3">
              <FormField
                control={form.control}
                name="tarifa_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tarifa TVDE <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v || null)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar tarifa TVDE..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tarifasTvde.length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Nenhuma tarifa TVDE. Cria uma em Renting → Tarifas.
                          </div>
                        )}
                        {tarifasTvde.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {tvdeModeloSemPreco && (
                <Alert variant="destructive" className="mt-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Modelo sem preço nesta tarifa</AlertTitle>
                  <AlertDescription>
                    A viatura escolhida ({viaturaSelected?.marca} {viaturaSelected?.modelo}) não tem
                    preço definido na tarifa TVDE selecionada. Define o preço deste modelo na tarifa
                    ou escolhe outra viatura/tarifa — não é possível guardar assim.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {tarifaAtual ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(isTvde
                ? [
                    { label: 'Tarifa', value: tarifaAtual.nome },
                    {
                      label: 'Modelo',
                      value: viaturaSelected
                        ? `${viaturaSelected.marca} ${viaturaSelected.modelo}`
                        : '—',
                    },
                    {
                      label: 'Preço / semana',
                      value:
                        precoModeloSemanaTvde != null ? `${precoModeloSemanaTvde} €` : 'Sem preço',
                    },
                    { label: 'Faturação', value: 'Semanal' },
                  ]
                : [
                    { label: 'Tarifa', value: tarifaAtual.nome },
                    {
                      label: 'Preço / dia',
                      value: tarifaAtual.preco_dia != null ? `${tarifaAtual.preco_dia} €` : '—',
                    },
                    {
                      label: 'Preço / semana',
                      value:
                        tarifaAtual.preco_semana != null ? `${tarifaAtual.preco_semana} €` : '—',
                    },
                    {
                      label: 'Preço / mês',
                      value: tarifaAtual.preco_mes != null ? `${tarifaAtual.preco_mes} €` : '—',
                    },
                  ]
              ).map((cell) => (
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
              {isTvde
                ? 'Seleciona a tarifa TVDE e uma viatura para ver o preço semanal do modelo.'
                : 'Escolhe uma viatura com grupo definido para ver a tarifa aplicável.'}
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

      {/* === Slot: estado (controlo manual do gestor) === */}
      {isSlot && (
        <div>
          <SectionHeader
            icon={ClipboardList}
            title="Estado do Slot"
            accent="navy"
            hint="O gestor controla o estado — o slot não muda sozinho"
          />
          <FormField
            control={form.control}
            name="estado"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Estado</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    if (!v) return;
                    field.onChange(v);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecciona estado..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SLOT_ESTADOS_PERMITIDOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {SLOT_ESTADO_LABELS[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* === Slot: valor mensal (cobrado por carro) === */}
      {isSlot && (
        <div>
          <SectionHeader
            icon={Coins}
            title="Valor do Slot"
            accent="amber"
            required
            hint="Cobrado mensalmente ao motorista, por carro"
          />
          <FormField
            control={form.control}
            name="slot_valor_mensal"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>
                  Valor mensal (€) <span className="text-red-500">*</span>
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
                <p className="text-xs text-muted-foreground">
                  Valor BRUTO (IVA incl.) cobrado todo mês.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* === Condutor/Motorista === */}
      <CondutoresFields
        regime={regime}
        clientes={clientes}
        motoristas={motoristas}
        clientePrincipalLabel="Cliente da Reserva também conduz"
        onCriarNovoCliente={onCriarNovoCliente}
        onCriarNovoMotorista={onCriarMotorista}
        onCriarCondutorProvisorio={onCriarCondutorProvisorio}
      />

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
