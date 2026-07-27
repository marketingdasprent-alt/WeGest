import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import { ClipboardList, Coins } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { usePermissions } from '@/hooks/usePermissions';
import { useModules } from '@/hooks/useModules';
import {
  useRentingGruposMin,
  useRentingTarifasMin,
  useRentingTarifaPrecosModelo,
  calcularFaturacaoRenting,
} from '@/hooks/useRentingGruposTarifas';
import { useModelosElegiveisTvde } from '@/hooks/useModelosElegiveisTvde';

import { SLOT_ESTADOS_PERMITIDOS, SLOT_ESTADO_LABELS } from '@/types/reserva';
import type { ReservaFormValues } from '../reservaDialog.schema';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';

import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import { SlotMotoristaViatura } from '../SlotMotoristaViatura';
import { SectionHeader } from '../SectionHeader';

import { ReservaTabGeralSectionDadosGerais } from './geral/sections/ReservaTabGeralSectionDadosGerais';
import { ReservaTabGeralSectionPeriodos } from './geral/sections/ReservaTabGeralSectionPeriodos';
import { ReservaTabGeralSectionViatura } from './geral/sections/ReservaTabGeralSectionViatura';
import { ReservaTabGeralSectionTarifa } from './geral/sections/ReservaTabGeralSectionTarifa';
import { ReservaTabGeralSectionObservacoes } from './geral/sections/ReservaTabGeralSectionObservacoes';

import {
  diferencaDias,
  addDaysToLocalInput,
  addOneMonthSameDayToLocalInput,
  firstDayNextMonthToLocalInput,
} from '@/utils/reserva-formatters';
import { fillEmptyFormFields } from '@/lib/fillEmptyFormFields';

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
  const queryClient = useQueryClient();
  const { has } = useModules();
  const { podeVerTodosRenting } = usePermissions();

  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const dias = useMemo(() => diferencaDias(dataInicio ?? '', dataFim ?? ''), [dataInicio, dataFim]);

  const { data: grupos = [] } = useRentingGruposMin();
  const { data: tarifas = [] } = useRentingTarifasMin();
  const { data: precosModelo = [] } = useRentingTarifaPrecosModelo();
  const { data: modelosElegiveisTvde } = useModelosElegiveisTvde();

  const regime = form.watch('regime');
  const isSlot = regime === 'slot';
  const isTvde = regime === 'tvde';
  const tarifaIdSel = form.watch('tarifa_id');
  const isLongaDuracao = form.watch('is_longa_duracao');
  const renovacaoOpcao = form.watch('renovacao_opcao');
  const renovacaoIntervalo = form.watch('renovacao_intervalo_dias');
  const modoMensal = !isSlot && !isTvde && isLongaDuracao;

  const viaturaIdSel = form.watch('viatura_id');
  const viaturaSelected = useMemo(
    () => viaturas.find((x) => x.id === viaturaIdSel) ?? null,
    [viaturaIdSel, viaturas]
  );

  const modeloIdSel = viaturaSelected?.modelo_id ?? null;

  const tarifasDoRegime = useMemo(() => {
    const doTipo = tarifas.filter((t) => (isTvde ? t.tipo === 'tvde' : t.tipo !== 'tvde'));
    if (!modeloIdSel) return doTipo;
    return doTipo.filter((t) =>
      precosModelo.some(
        (p) =>
          p.tarifa_id === t.id &&
          p.modelo_id === modeloIdSel &&
          // Rent-a-Car: o modelo tem preço nesta tarifa se tiver diário OU
          // mensal (ex.: viaturas só vocacionadas para longa duração, como
          // carrinhas de carga, costumam só ter preco_mes). modeloSemPreco,
          // mais abaixo, é quem valida o campo certo consoante o modo actual.
          (isTvde ? p.preco_semana != null : p.preco_dia != null || p.preco_mes != null)
      )
    );
  }, [tarifas, isTvde, modeloIdSel, precosModelo]);

  const tarifaAtual = useMemo(
    () => tarifas.find((t) => t.id === tarifaIdSel) ?? null,
    [tarifaIdSel, tarifas]
  );

  const precoModeloSel = useMemo(() => {
    if (!tarifaIdSel || !modeloIdSel) return null;
    return (
      precosModelo.find((p) => p.tarifa_id === tarifaIdSel && p.modelo_id === modeloIdSel) ?? null
    );
  }, [tarifaIdSel, modeloIdSel, precosModelo]);

  const precoModeloSemanaTvde = isTvde ? (precoModeloSel?.preco_semana ?? null) : null;
  const precoModeloDiaRac = !isTvde ? (precoModeloSel?.preco_dia ?? null) : null;
  const precoModeloMesRac = !isTvde ? (precoModeloSel?.preco_mes ?? null) : null;

  // TVDE: km/franquia vêm do modelo da viatura na tarifa escolhida — puxa-os
  // automaticamente sempre que a tarifa ou a viatura mudam (mesma fonte do
  // preço/semana). Não sobrepõe rent-a-car/slot, que têm as suas próprias regras.
  useEffect(() => {
    if (!isTvde || !tarifaIdSel || !viaturaSelected?.modelo_id) return;
    const preco = precosModelo.find(
      (p) => p.tarifa_id === tarifaIdSel && p.modelo_id === viaturaSelected.modelo_id
    );
    if (!preco) return;
    form.setValue('kms_incluidos', preco.km_mensal, { shouldDirty: true });
    form.setValue('km_adicional_valor', preco.km_adicional_valor, { shouldDirty: true });
    form.setValue('franquia_valor', preco.franquia_valor, { shouldDirty: true });
  }, [isTvde, tarifaIdSel, viaturaSelected, precosModelo, form]);

  // Auto-selecciona a tarifa TVDE quando só há uma (o normal) — o preço real
  // vem sempre do modelo da viatura, não da escolha da tarifa, por isso não
  // faz sentido obrigar a seleção manual.
  useEffect(() => {
    if (isTvde && tarifasDoRegime.length > 0 && !tarifaIdSel) {
      form.setValue('tarifa_id', tarifasDoRegime[0].id, { shouldDirty: true });
    }
  }, [isTvde, tarifasDoRegime, tarifaIdSel, form]);

  // Faturação automática: regime + ALD + duração + tarifa → valor_total.
  // Viatura escolhida mas modelo sem preço na tarifa → bloquear/avisar (ambos os regimes).
  // Em Rent-a-Car um modelo pode só ter preço diário OU só mensal (ex.: viaturas
  // vocacionadas para longa duração) — o campo relevante depende do modo actual.
  const modeloSemPreco =
    !isSlot &&
    !!tarifaIdSel &&
    !!modeloIdSel &&
    (isTvde
      ? precoModeloSemanaTvde == null
      : isLongaDuracao
        ? precoModeloMesRac == null
        : precoModeloDiaRac == null);
  const faturacao = useMemo(
    () =>
      calcularFaturacaoRenting(
        regime,
        isLongaDuracao,
        dias,
        tarifaAtual,
        precoModeloSemanaTvde,
        precoModeloDiaRac,
        precoModeloMesRac
      ),
    [
      regime,
      isLongaDuracao,
      dias,
      tarifaAtual,
      precoModeloSemanaTvde,
      precoModeloDiaRac,
      precoModeloMesRac,
    ]
  );

  // Slot não tem faturação de aluguer (carro é do motorista) — só valor semanal.
  useEffect(() => {
    if (faturacao && !isSlot) {
      form.setValue('valor_total', faturacao.valor, { shouldDirty: true });
    }
  }, [faturacao, isSlot, form]);

  // Ao escolher tarifa+viatura, copia km / km extra / franquia do modelo na
  // tarifa — só para campos ainda VAZIOS, nunca sobrescrevendo um valor já
  // gravado/editado. Sem esta guarda, este efeito também dispara quando
  // `precosModelo` (lista assíncrona) chega DEPOIS da hidratação inicial,
  // apagando franquia/caução/kms negociados à parte da reserva.
  useEffect(() => {
    if (isSlot || !precoModeloSel) return;
    fillEmptyFormFields(form, {
      kms_incluidos: isTvde ? precoModeloSel.km_mensal : precoModeloSel.km_mensal_iva,
      km_adicional_valor: isTvde
        ? precoModeloSel.km_adicional_valor
        : precoModeloSel.km_adicional_valor_iva,
      franquia_valor: isTvde ? precoModeloSel.franquia_valor : precoModeloSel.franquia_valor_iva,
      caucao_valor: isTvde ? precoModeloSel.caucao_valor : precoModeloSel.caucao_valor_iva,
    });
  }, [precoModeloSel, isTvde, isSlot, form]);

  // Lista de viaturas filtrada por regime.
  const viaturasDoRegime = useMemo(
    () =>
      viaturas.filter((v) => {
        if (isSlot) return v.is_slot === true;
        if (v.is_slot === true) return false;
        if (isTvde) return !!v.modelo_id && !!modelosElegiveisTvde?.has(v.modelo_id);
        return true;
      }),
    [viaturas, isSlot, isTvde, modelosElegiveisTvde]
  );

  // Modo mensal: data_fim calculada conforme opção de renovação.
  useEffect(() => {
    if (!modoMensal || !dataInicio) return;
    let fim: string | null = null;
    if (renovacaoOpcao === 'mesmo_dia_cada_mes') {
      fim = addOneMonthSameDayToLocalInput(dataInicio);
    } else if (renovacaoOpcao === 'primeiro_dia_mes') {
      fim = firstDayNextMonthToLocalInput(dataInicio);
    } else {
      fim = addDaysToLocalInput(dataInicio, renovacaoIntervalo ?? 30);
    }
    if (fim && fim !== dataFim) {
      form.setValue('data_fim', fim, { shouldValidate: true });
    }
  }, [modoMensal, dataInicio, dataFim, renovacaoOpcao, renovacaoIntervalo, form]);

  return (
    <div className="space-y-8">
      <ReservaTabGeralSectionDadosGerais
        form={form}
        clientes={clientes}
        isSlot={isSlot}
        isTvde={isTvde}
        podeVerTodosRenting={podeVerTodosRenting}
        allowSlot={has('slot')}
      />

      <ReservaTabGeralSectionPeriodos
        form={form}
        estacoes={estacoes}
        isSlot={isSlot}
        isTvde={isTvde}
        modoMensal={modoMensal}
        renovacaoOpcao={renovacaoOpcao}
        renovacaoIntervalo={renovacaoIntervalo}
      />

      {/* === Slot: motorista → viatura (carro próprio do motorista) === */}
      {isSlot && (
        <SlotMotoristaViatura
          form={form}
          motoristas={motoristas}
          onCriarMotorista={() => onCriarMotorista?.()}
        />
      )}

      <ReservaTabGeralSectionViatura
        form={form}
        viaturas={viaturas}
        viaturasDoRegime={viaturasDoRegime}
        grupos={grupos}
        isSlot={isSlot}
        isTvde={isTvde}
        precosModelo={precosModelo}
        onInvalidateViaturas={() => queryClient.invalidateQueries({ queryKey: ['viaturas'] })}
      />

      <ReservaTabGeralSectionTarifa
        form={form}
        isSlot={isSlot}
        isTvde={isTvde}
        tarifasDoRegime={tarifasDoRegime}
        tarifaAtual={tarifaAtual}
        modeloIdSel={modeloIdSel}
        viaturaSelected={viaturaSelected}
        modeloSemPreco={modeloSemPreco}
        faturacao={faturacao}
        precoModeloSemanaTvde={precoModeloSemanaTvde}
        precoModeloDiaRac={precoModeloDiaRac}
        precoModeloMesRac={precoModeloMesRac}
      />

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
                  Valor mensal (€) <span className="text-destructive">*</span>
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
      <ReservaTabGeralSectionObservacoes form={form} />
    </div>
  );
};
