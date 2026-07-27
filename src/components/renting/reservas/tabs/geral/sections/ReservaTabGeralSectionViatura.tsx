import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Car, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

import { SectionHeader } from '../../../SectionHeader';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import { ViaturaDialog } from '@/components/viaturas/ViaturaDialog';

import type { ReservaFormValues } from '../../../reservaDialog.schema';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin, RentingTarifaPrecoModelo } from '@/hooks/useRentingGruposTarifas';

const normalizeForSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]/g, '');

interface ViaturaSectionProps {
  form: UseFormReturn<ReservaFormValues>;
  viaturas: ViaturaBasic[];
  viaturasDoRegime: ViaturaBasic[];
  grupos: RentingGrupoMin[];
  isSlot: boolean;
  isTvde: boolean;
  precosModelo: RentingTarifaPrecoModelo[];
  onInvalidateViaturas: () => void;
}

export function ReservaTabGeralSectionViatura({
  form,
  viaturas,
  viaturasDoRegime,
  grupos,
  isSlot,
  isTvde,
  precosModelo,
  onInvalidateViaturas,
}: ViaturaSectionProps) {
  const [viaturaPopoverOpen, setViaturaPopoverOpen] = useState(false);
  const [viaturaSearchTerm, setViaturaSearchTerm] = useState('');
  const [novaViaturaOpen, setNovaViaturaOpen] = useState(false);

  const viaturaIdSel = form.watch('viatura_id');
  const viaturaSelected = viaturas.find((x) => x.id === viaturaIdSel) ?? null;
  const tarifaIdSel = form.watch('tarifa_id');
  const modeloIdSel = viaturaSelected?.modelo_id ?? null;
  // Viatura escolhida mas NUNCA associada a um modelo de catálogo
  // (viaturas.modelo_id null — normalmente ficha antiga/importada só com os
  // campos de texto marca/modelo). Os preços por modelo (renting_tarifa_
  // precos_modelo) são sempre chave por modelo_id — sem essa ligação o preço
  // nunca casa com NENHUMA tarifa, mesmo que exista e esteja bem configurada.
  const viaturaSemModeloCatalogo = !isSlot && !!tarifaIdSel && !!viaturaSelected && !modeloIdSel;

  const aplicarDadosViatura = (v: ViaturaBasic) => {
    const grupo = v.grupo_id ? grupos.find((g) => g.id === v.grupo_id) : null;
    if (grupo) form.setValue('grupo', grupo.nome, { shouldDirty: true });

    // Sugestão de empresa emissora a partir da viatura — só quando vazio
    if (v.emissor_id && !form.getValues('emissor_id')) {
      form.setValue('emissor_id', v.emissor_id, { shouldDirty: true });
    }

    // Se a tarifa atual não tiver preço para o modelo desta viatura, limpa-a
    const tarifaAtualId = form.getValues('tarifa_id');
    if (tarifaAtualId && v.modelo_id) {
      const cobre = precosModelo.some(
        (p) =>
          p.tarifa_id === tarifaAtualId &&
          p.modelo_id === v.modelo_id &&
          (isTvde ? p.preco_semana != null : p.preco_dia != null || p.preco_mes != null)
      );
      if (!cobre) form.setValue('tarifa_id', null, { shouldDirty: true });
    }
  };

  return (
    <>
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
                      Viatura <span className="text-destructive">*</span>
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
                onInvalidateViaturas();
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

          {viaturaSemModeloCatalogo && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Viatura sem modelo associado</AlertTitle>
              <AlertDescription>
                A viatura escolhida ({viaturaSelected?.marca} {viaturaSelected?.modelo}) não está
                associada a nenhum modelo do catálogo — os preços por modelo não conseguem casar com
                nenhuma tarifa, mesmo que estejam bem configurados. Associa o modelo em Viaturas
                antes de continuar.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* === Franquia / Caução / Kms (shared) — não aplicável a slot === */}
      {!isSlot && <FranquiaKmsFields kmsReadOnly />}
    </>
  );
}
