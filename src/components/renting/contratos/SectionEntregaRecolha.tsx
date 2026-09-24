import { useEffect } from 'react';
import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { Estacao } from '@/hooks/useEstacoes';
import { calcularDataFimLongaDuracao, proximaDataRenovacao } from '@/lib/renovacaoContrato';
import type { ContratoFormValues } from './contratoForm.schema';
import { isoToLocalInput } from './contratoForm.schema';
import { EstacaoSelectField } from './EstacaoSelectField';
import { SectionTitle } from './SectionTitle';

interface CampoTvdeProps {
  id: string;
  label: string;
  value: string;
  title: string;
  type?: 'text' | 'datetime-local';
}

/** Campo só de leitura com o aspecto dos campos editáveis ao lado. */
const CampoTvde: React.FC<CampoTvdeProps> = ({ id, label, value, title, type = 'text' }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type={type}
      className="bg-background"
      value={value}
      title={title}
      disabled
      readOnly
    />
  </div>
);

interface SectionEntregaRecolhaProps {
  form: UseFormReturn<ContratoFormValues>;
  estacoes: Estacao[];
  /** proxima_renovacao_em gravada (edição). Num contrato novo calcula-se do início + ciclo. */
  proximaRenovacaoEm?: string | null;
}

export const SectionEntregaRecolha: React.FC<SectionEntregaRecolhaProps> = ({
  form,
  estacoes,
  proximaRenovacaoEm,
}) => {
  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';
  const isLongaDuracao = form.watch('is_longa_duracao');
  const dataInicio = form.watch('data_inicio');
  const renovacaoOpcao = form.watch('renovacao_opcao');
  const renovacaoIntervaloDias = form.watch('renovacao_intervalo_dias');

  const proximaTvde = proximaRenovacaoEm
    ? new Date(proximaRenovacaoEm)
    : dataInicio
      ? proximaDataRenovacao(dataInicio, renovacaoOpcao, renovacaoIntervaloDias)
      : null;

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

  // NENHUM contrato TVDE tem data de fim — nem os de longa duração. O contrato
  // fica aberto enquanto o motorista lá estiver e cobra-se à semana; a
  // renovação é um acto que se regista, não um prazo que expira.
  //
  // Enquanto a data da renovação era gravada aqui, passados 30 dias sem
  // renovar o sistema lia "este contrato acabou": parava o aluguer no resumo
  // semanal e a viatura ficava livre para outro contrato por cima. O servidor
  // já força esta regra em qualquer caminho de criação (20260908092000); aqui
  // é para o gestor não ver um campo que não vai a lado nenhum.
  useEffect(() => {
    if (!isTvde) return;
    if (form.getValues('data_fim')) {
      form.setValue('data_fim', null, { shouldDirty: true });
    }
  }, [isTvde, form]);

  // Longa duração (qualquer regime): data_fim passa a ser a "próxima
  // renovação", calculada a partir da Data Início + intervalo escolhido —
  // nunca digitada à mão. Sincroniza para o campo do formulário para que a
  // validação Zod e o submit continuem a usar `data_fim` como única fonte.
  useEffect(() => {
    if (isTvde || !isLongaDuracao || !dataInicio) return;
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
                  Data Início <span className="text-destructive">*</span>
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
            // Mesmo formato dos campos da Entrega: TVDE não fixa estação de recolha.
            <CampoTvde
              id="tvde-estacao-fim"
              label="Estação Fim"
              value="— Qualquer estação —"
              title="Contratos TVDE não definem estação de recolha: a viatura pode ser recolhida em qualquer estação quando o contrato fechar."
            />
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
          {isTvde ? (
            isLongaDuracao && proximaTvde ? (
              <CampoTvde
                id="tvde-proxima-renovacao"
                label="Próxima renovação"
                type="datetime-local"
                value={isoToLocalInput(proximaTvde.toISOString())}
                title={
                  proximaRenovacaoEm
                    ? 'Avança quando se renova o contrato. O TVDE não tem data de fim.'
                    : 'Calculada a partir da Data Início e do ciclo de renovação. O TVDE não tem data de fim.'
                }
              />
            ) : (
              <CampoTvde
                id="tvde-proxima-renovacao"
                label="Próxima renovação"
                value="— Sem renovação —"
                title="TVDE sem longa duração: não tem data de fim nem renovação, cobra-se à semana até fechar."
              />
            )
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
                        Data Fim <span className="text-destructive">*</span>
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
