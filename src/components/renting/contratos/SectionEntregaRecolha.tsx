import { useEffect } from 'react';
import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import type { Estacao } from '@/hooks/useEstacoes';
import { calcularDataFimLongaDuracao } from '@/lib/renovacaoContrato';
import type { ContratoFormValues } from './contratoForm.schema';
import { isoToLocalInput } from './contratoForm.schema';
import { EstacaoSelectField } from './EstacaoSelectField';
import { SectionTitle } from './SectionTitle';

interface SectionEntregaRecolhaProps {
  form: UseFormReturn<ContratoFormValues>;
  estacoes: Estacao[];
}

export const SectionEntregaRecolha: React.FC<SectionEntregaRecolhaProps> = ({ form, estacoes }) => {
  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';
  const isLongaDuracao = form.watch('is_longa_duracao');
  const dataInicio = form.watch('data_inicio');
  const renovacaoOpcao = form.watch('renovacao_opcao');
  const renovacaoIntervaloDias = form.watch('renovacao_intervalo_dias');

  // Em TVDE não sabemos onde a viatura será recolhida (contratos de 2-3
  // anos) — limpa o valor automaticamente se o user mudou de rent_a_car →
  // tvde mid-form. `data_fim` é tratado nos dois efeitos abaixo, separado
  // desta regra (agora depende de is_longa_duracao, não só do regime).
  useEffect(() => {
    if (!isTvde) return;
    if (form.getValues('estacao_recolha_id')) {
      form.setValue('estacao_recolha_id', null, { shouldDirty: true });
    }
  }, [isTvde, form]);

  // TVDE sem longa duração continua sem data de fim (contrato aberto).
  useEffect(() => {
    if (!(isTvde && !isLongaDuracao)) return;
    if (form.getValues('data_fim')) {
      form.setValue('data_fim', null, { shouldDirty: true });
    }
  }, [isTvde, isLongaDuracao, form]);

  // Longa duração (qualquer regime): data_fim passa a ser a "próxima
  // renovação", calculada a partir da Data Início + intervalo escolhido —
  // nunca digitada à mão. Sincroniza para o campo do formulário para que a
  // validação Zod e o submit continuem a usar `data_fim` como única fonte.
  useEffect(() => {
    if (!isLongaDuracao || !dataInicio) return;
    const calculada = calcularDataFimLongaDuracao(
      dataInicio,
      isLongaDuracao,
      renovacaoOpcao,
      renovacaoIntervaloDias
    );
    if (!calculada) return;
    const local = isoToLocalInput(calculada.toISOString());
    if (form.getValues('data_fim') !== local) {
      form.setValue('data_fim', local, { shouldDirty: true, shouldValidate: true });
    }
  }, [isLongaDuracao, dataInicio, renovacaoOpcao, renovacaoIntervaloDias, form]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <SectionTitle>Entrega</SectionTitle>
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="estacao_entrega_id"
            render={({ field }) => (
              <EstacaoSelectField
                value={field.value}
                onChange={field.onChange}
                estacoes={estacoes}
                label="Estação Início"
              />
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
      </div>

      <div>
        <SectionTitle>Recolha</SectionTitle>
        <div className="space-y-3">
          {isTvde ? (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
              Contratos TVDE não definem estação de recolha fixa — a viatura pode ser recolhida em
              qualquer estação no fim do contrato (anos depois).
            </div>
          ) : (
            <FormField
              control={form.control}
              name="estacao_recolha_id"
              render={({ field }) => (
                <EstacaoSelectField
                  value={field.value}
                  onChange={field.onChange}
                  estacoes={estacoes}
                  label="Estação Fim"
                />
              )}
            />
          )}
          {isTvde && !isLongaDuracao ? (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
              Contratos TVDE não têm data de fim — são abertos, com renovação automática (ver
              Duração/Renovação abaixo).
            </div>
          ) : (
            <FormField
              control={form.control}
              name="data_fim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isLongaDuracao ? (
                      'Próxima renovação'
                    ) : (
                      <>
                        Data Fim <span className="text-red-500">*</span>
                      </>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="bg-background"
                      {...field}
                      value={field.value ?? ''}
                      disabled={!!isLongaDuracao}
                    />
                  </FormControl>
                  {isLongaDuracao && (
                    <p className="text-xs text-muted-foreground">
                      Calculado automaticamente a partir da Data Início e do intervalo de renovação.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
};
