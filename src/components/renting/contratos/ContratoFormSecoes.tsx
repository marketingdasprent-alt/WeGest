import type React from 'react';
import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import { useRentingTarifasMin } from '@/hooks/useRentingGruposTarifas';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ALDFields } from '@/components/renting/shared/ALDFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionEntregaRecolha } from './SectionEntregaRecolha';
import { SectionInfoAdicional } from './SectionInfoAdicional';
import { SectionGeral } from './SectionGeral';
import { SectionRegime } from './SectionRegime';
import { SectionViatura } from './SectionViatura';
import { SectionTitle } from './SectionTitle';

interface ContratoFormSecoesProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
  viaturas: ViaturaBasic[];
  grupos: RentingGrupoMin[];
  /** Grupo tarifário da viatura actual do contrato (edição) — orienta o agrupamento do selector. */
  grupoIdAtual?: string | null;
  estacoes: Estacao[];
  /** Trava o campo viatura — usado quando o contrato vem de reserva. */
  viaturaLocked?: boolean;
  reservaCodigo?: number | null;
  /** Recalcula grupo/tarifa/preço ao trocar de viatura (edição do contrato). */
  onViaturaChange?: (viaturaId: string) => void;
}

/**
 * Orquestrador de seções do formulário de contrato.
 * Compõe sub-componentes de formulário específicas.
 */
export const ContratoFormSecoes: React.FC<ContratoFormSecoesProps> = ({
  form,
  clientes,
  viaturas,
  grupos,
  grupoIdAtual,
  estacoes,
  viaturaLocked,
  reservaCodigo,
  onViaturaChange,
}) => {
  const viaturaId = form.watch('viatura_id');
  const { data: tarifas = [] } = useRentingTarifasMin();
  
  const viaturaSelected = useMemo(
    () => viaturas.find((v) => v.id === viaturaId) ?? null,
    [viaturaId, viaturas]
  );

  return (
    <div className="space-y-6">
      <SectionRegime form={form} />
      <SectionEntregaRecolha form={form} estacoes={estacoes} />
      <ALDFields idPrefix="contrato" />
      <SectionViatura
        form={form}
        viaturas={viaturas}
        grupos={grupos}
        grupoIdAtual={grupoIdAtual ?? null}
        viaturaLocked={viaturaLocked}
        reservaCodigo={reservaCodigo}
        onViaturaChange={onViaturaChange}
      />

      {/* Seleção de Tarifa */}
      {viaturaSelected && viaturaSelected.grupo_id && (
        <div className="space-y-4">
          <SectionTitle>Tarifa</SectionTitle>
          <FormField
            control={form.control}
            name="tarifa_id"
            render={({ field }) => {
              const tarifasDoGrupo = tarifas.filter((t) => t.grupo_id === viaturaSelected.grupo_id);
              const grupoNome = grupos.find(g => g.id === viaturaSelected.grupo_id)?.nome || 'o grupo';
              
              // Auto-select primeira tarifa se houver e nada selecionado
              if (tarifasDoGrupo.length > 0 && !field.value) {
                setTimeout(() => field.onChange(tarifasDoGrupo[0].id), 0);
              }
              
              return (
                <FormItem className="max-w-xs">
                  <FormLabel>Tarifa para {grupoNome}</FormLabel>
                  {tarifasDoGrupo.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2 border rounded">
                      Nenhuma tarifa disponível para {grupoNome}. Cria uma em Renting → Tarifas.
                    </div>
                  ) : (
                    <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma tarifa..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tarifasDoGrupo.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}
                            {t.tipo === 'tvde' && ' (TVDE)'}
                            {t.tipo !== 'tvde' && ` (${t.preco_dia ?? 0}€/dia)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      )}

      <SectionGeral form={form} clientes={clientes} />
      <FranquiaKmsFields />
      <SectionInfoAdicional form={form} />
    </div>
  );
};
