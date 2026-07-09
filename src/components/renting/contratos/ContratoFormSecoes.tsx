import type React from 'react';
import { useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Gauge, Coins, CircleDollarSign } from 'lucide-react';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
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
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import { PedirAlteracaoContratoDialog } from './PedirAlteracaoContratoDialog';
import { usePedidoTrocaKmsPendente, type TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionCliente } from './SectionCliente';
import { SectionEmpresaEmissora } from './SectionEmpresaEmissora';
import { SectionEntregaRecolha } from './SectionEntregaRecolha';
import { SectionInfoAdicional } from './SectionInfoAdicional';
import { SectionGeral } from './SectionGeral';
import { SectionRegime } from './SectionRegime';
import { SectionViatura } from './SectionViatura';
import { SectionTitle } from './SectionTitle';

/** Link "Pedir alteração de X" sob o campo travado — trava enquanto já há um pedido pendente desse tipo. */
const BotaoPedirAlteracao: React.FC<{
  contratoId: string;
  tipo: TipoPedidoAlteracao;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}> = ({ contratoId, tipo, label, icon: Icon, onClick }) => {
  const { data: pedidoPendente } = usePedidoTrocaKmsPendente(contratoId, tipo);
  return (
    <button
      type="button"
      disabled={!!pedidoPendente}
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
    >
      <Icon className="h-3.5 w-3.5" />
      {pedidoPendente ? 'Pedido pendente' : label}
    </button>
  );
};

interface ContratoFormSecoesProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
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
  onCriarNovoCliente?: () => void;
  onCriarNovoMotorista?: () => void;
  /** Contrato já existente (edição) — activa o botão "Pedir alteração de kms". */
  contratoId?: string | null;
}

/**
 * Orquestrador de seções do formulário de contrato.
 * Compõe sub-componentes de formulário específicas. Ordem-padrão (igual à
 * reserva): Regime → Empresa Emissora → Cliente → Entrega/Recolha → Viatura →
 * Tarifa → Condutor/Motorista → OBS.
 */
export const ContratoFormSecoes: React.FC<ContratoFormSecoesProps> = ({
  form,
  clientes,
  motoristas,
  viaturas,
  grupos,
  grupoIdAtual,
  estacoes,
  viaturaLocked,
  reservaCodigo,
  onViaturaChange,
  onCriarNovoCliente,
  onCriarNovoMotorista,
  contratoId,
}) => {
  const viaturaId = form.watch('viatura_id');
  const { data: tarifas = [] } = useRentingTarifasMin();

  const viaturaSelected = useMemo(
    () => viaturas.find((v) => v.id === viaturaId) ?? null,
    [viaturaId, viaturas]
  );

  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';
  const tarifasTvde = useMemo(() => tarifas.filter((t) => t.tipo === 'tvde'), [tarifas]);
  const [dialogAberto, setDialogAberto] = useState<TipoPedidoAlteracao | null>(null);
  const kmsIncluidos = form.watch('kms_incluidos');
  const kmAdicionalValor = form.watch('km_adicional_valor');
  const franquiaValor = form.watch('franquia_valor');
  const tarifaDiaria = form.watch('tarifa_diaria');

  const valorAtualPorTipo: Record<TipoPedidoAlteracao, number> = {
    kms: kmsIncluidos ?? 0,
    franquia: franquiaValor ?? 0,
    tarifa: tarifaDiaria ?? 0,
  };

  return (
    <div className="space-y-6">
      <SectionRegime form={form} />
      <SectionEmpresaEmissora form={form} />
      <SectionCliente form={form} clientes={clientes} />
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

      {/* Seleção de Tarifa — TVDE: qualquer tarifa tipo='tvde' (preço por modelo).
          Rent-a-car: apenas tarifas do grupo da viatura com tipo!='tvde'. */}
      {isTvde ? (
        <div className="space-y-4">
          <SectionTitle>Tarifa</SectionTitle>
          <FormField
            control={form.control}
            name="tarifa_id"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Tarifa TVDE</FormLabel>
                {tarifasTvde.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2 border rounded">
                    Nenhuma tarifa TVDE. Cria uma em Renting → Tarifas.
                  </div>
                ) : (
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
                      {tarifasTvde.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : (
        viaturaSelected &&
        viaturaSelected.grupo_id && (
          <div className="space-y-4">
            <SectionTitle>Tarifa</SectionTitle>
            <FormField
              control={form.control}
              name="tarifa_id"
              render={({ field }) => {
                const tarifasDoGrupo = tarifas.filter(
                  (t) => t.grupo_id === viaturaSelected.grupo_id && t.tipo !== 'tvde'
                );
                const grupoNome =
                  grupos.find((g) => g.id === viaturaSelected.grupo_id)?.nome || 'o grupo';

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
                      <Select
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma tarifa..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tarifasDoGrupo.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.nome} ({t.preco_dia ?? 0}€/dia)
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
        )
      )}

      <SectionGeral
        form={form}
        tarifaReadOnly
        tarifaAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="tarifa"
              label="Pedir alteração de tarifa"
              icon={CircleDollarSign}
              onClick={() => setDialogAberto('tarifa')}
            />
          ) : null
        }
      />
      <FranquiaKmsFields
        franquiaReadOnly
        kmsReadOnly
        franquiaAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="franquia"
              label="Pedir alteração de franquia"
              icon={Coins}
              onClick={() => setDialogAberto('franquia')}
            />
          ) : null
        }
        kmsAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="kms"
              label="Pedir alteração de kms"
              icon={Gauge}
              onClick={() => setDialogAberto('kms')}
            />
          ) : null
        }
      />
      <CondutoresFields
        regime={regime}
        clientes={clientes}
        motoristas={motoristas}
        clientePrincipalLabel="Cliente do contrato também conduz"
        onCriarNovoCliente={onCriarNovoCliente}
        onCriarNovoMotorista={onCriarNovoMotorista}
      />
      <SectionInfoAdicional form={form} />

      {contratoId && dialogAberto && (
        <PedirAlteracaoContratoDialog
          open={!!dialogAberto}
          onOpenChange={(open) => setDialogAberto(open ? dialogAberto : null)}
          contratoId={contratoId}
          tipo={dialogAberto}
          valorAtual={valorAtualPorTipo[dialogAberto]}
          kmAdicionalValorAtual={dialogAberto === 'kms' ? (kmAdicionalValor ?? null) : undefined}
        />
      )}
    </div>
  );
};
