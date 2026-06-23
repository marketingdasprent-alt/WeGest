import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { ViaturaDisponibilidadeSelect } from '@/components/viaturas/ViaturaDisponibilidadeSelect';
import { localInputToIso } from '../movimentosUtils';

import type { MovimentoFormValues } from '../movimentoForm.schema';
import { MovimentoTipoSelector } from '../MovimentoTipoSelector';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { Colaborador } from '@/types/movimento';
import { MOVIMENTO_ESTADO_LABELS, MOVIMENTO_ESTADOS } from '@/types/movimento';

const SENTINEL_NONE = '__none__';

interface MovimentoTabGeralProps {
  form: UseFormReturn<MovimentoFormValues>;
  viaturas: ViaturaBasic[];
  colaboradores: Colaborador[];
  /**
   * ID do movimento em edição (para excluir-se da verificação de
   * conflitos — não queremos que ele apareça como conflito de si
   * próprio). Omitir em criação.
   */
  movimentoId?: string | null;
}

export const MovimentoTabGeral: React.FC<MovimentoTabGeralProps> = ({
  form,
  viaturas,
  colaboradores,
  movimentoId = null,
}) => {
  const dataPartida = form.watch('data_partida');
  const dataChegada = form.watch('data_chegada');

  return (
    <div className="space-y-8">
      {/* === Tipo de Movimento === */}
      <div>
        <div className="flex items-center gap-2 pb-2 border-b mb-4">
          <h3 className="text-base font-semibold">Tipo de Movimento</h3>
        </div>
        <MovimentoTipoSelector />
      </div>

      {/* === Viatura + Estado === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 className="text-base font-semibold">Viatura</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="viatura_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Viatura <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <ViaturaDisponibilidadeSelect
                    viaturas={viaturas}
                    value={field.value ?? null}
                    onChange={(v) => {
                      field.onChange(v?.id ?? null);
                      if (v) {
                        form.setValue('matricula', v.matricula);
                        // Pré-preenche o KM inicial com o KM atual da viatura.
                        if (v.km_atual != null && form.getValues('km_inicial') == null) {
                          form.setValue('km_inicial', v.km_atual);
                        }
                      }
                    }}
                    dataInicio={localInputToIso(dataPartida)}
                    dataFim={localInputToIso(dataChegada)}
                    excluir={{ movimentoId }}
                    permitirOcupadas={!!movimentoId}
                    placeholder="Pesquisa por matrícula..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estado"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado do Movimento</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MOVIMENTO_ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {MOVIMENTO_ESTADO_LABELS[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* === Datas & Responsável === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 className="text-base font-semibold">Datas & Responsável</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="data_partida"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Data Partida <span className="text-destructive">*</span>
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
          <FormField
            control={form.control}
            name="data_chegada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Chegada / Conclusão</FormLabel>
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
          <FormField
            control={form.control}
            name="colaborador_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Colaborador Responsável</FormLabel>
                <Select
                  value={field.value ?? SENTINEL_NONE}
                  onValueChange={(v) => {
                    const newId = v === SENTINEL_NONE ? null : v;
                    field.onChange(newId);
                    const col = colaboradores.find((c) => c.id === newId);
                    form.setValue('colaborador_nome', col?.nome ?? '');
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Escolher colaborador..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SENTINEL_NONE}>— Sem responsável —</SelectItem>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="info"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Info Resumida</FormLabel>
              <FormControl>
                <Input
                  className="bg-background"
                  placeholder="ex.: aguarda peças, perca total - sinistro, IPO anual..."
                  maxLength={255}
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
  );
};
