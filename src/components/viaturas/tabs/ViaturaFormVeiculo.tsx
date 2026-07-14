import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CATEGORIAS,
  type ViaturaFormData,
  type ViaturaMarca,
  type ViaturaModelo,
  type ViaturaCombustivel,
  type ViaturasTipo,
  type RentingGrupo,
  type Estacao,
} from './viaturaTabDados.types';

interface ViaturaFormVeiculoProps {
  form: UseFormReturn<ViaturaFormData>;
  watchedMarcaId: string;
  marcas: ViaturaMarca[];
  modelos: ViaturaModelo[];
  combustiveis: ViaturaCombustivel[];
  viaturasTipos: ViaturasTipo[];
  grupos: RentingGrupo[];
  allTarifas: Array<{
    grupo_id: string | null;
    nome: string;
    preco_dia: number | null;
    preco_semana: number | null;
    preco_mes: number | null;
    kms_incluidos: number | null;
  }>;
  tarifasTvdeModelo: Array<{
    modelo_id: string;
    tarifa_nome: string;
    preco_semana: number;
  }>;
  estacoes: Estacao[];
}

export function ViaturaFormVeiculo({
  form,
  watchedMarcaId,
  marcas,
  modelos,
  combustiveis,
  viaturasTipos,
  grupos,
  allTarifas,
  tarifasTvdeModelo,
  estacoes,
}: ViaturaFormVeiculoProps) {
  // is_slot deriva do TIPO: ao escolher o tipo "SLOT", is_slot é ligado
  // automaticamente. Antes o toggle estava escondido atrás de `elegivel_tvde`,
  // por isso quem marcava o tipo SLOT nem via o switch — daí ficarem
  // dessincronizados. Unidirecional: NÃO desliga is_slot noutros tipos, para
  // não afetar viaturas slot antigas sem tipo atribuído.
  const tipoIdWatch = form.watch('tipo_id');
  const isTipoSlot =
    (viaturasTipos.find((t) => t.id === tipoIdWatch)?.nome ?? '').trim().toUpperCase() === 'SLOT';
  useEffect(() => {
    if (isTipoSlot && !form.getValues('is_slot')) {
      form.setValue('is_slot', true, { shouldDirty: true });
    }
  }, [isTipoSlot, form]);

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Veículo</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="marca_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Marca <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                // Re-monta quando a opção guardada fica disponível, para o valor
                // aparecer mesmo que o catálogo carregue depois do valor ser definido.
                key={`marca-${marcas.some((m) => m.id === field.value)}`}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Limpar modelo quando muda a marca
                  form.setValue('modelo_id', '', { shouldDirty: true });
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar marca" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {marcas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
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
          name="modelo_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo</FormLabel>
              <Select
                key={`modelo-${modelos.some((m) => m.id === field.value)}`}
                onValueChange={field.onChange}
                value={field.value}
                disabled={!watchedMarcaId}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        watchedMarcaId ? 'Selecionar modelo' : 'Selecione a marca primeiro'
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
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
          name="ano"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ano</FormLabel>
              <FormControl>
                <Input type="number" placeholder="2024" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cor</FormLabel>
              <FormControl>
                <Input placeholder="Branco" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="combustivel_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Combustível</FormLabel>
              <Select
                key={`comb-${combustiveis.some((c) => c.id === field.value)}`}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {combustiveis.map((comb) => (
                    <SelectItem key={comb.id} value={comb.id}>
                      {comb.nome}
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
          name="tipo_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select
                key={`tipo-${viaturasTipos.some((t) => t.id === field.value)}`}
                value={field.value || ''}
                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">— Sem tipo —</SelectItem>
                  {viaturasTipos.map((t) => (
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
        {(() => {
          const tipoId = form.watch('tipo_id');
          const tipo = viaturasTipos.find((t) => t.id === tipoId);
          if (!tipo?.elegivel_tvde) return null;
          return (
            <FormField
              control={form.control}
              name="categoria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIAS.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        })()}
        <FormField
          control={form.control}
          name="grupo_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Grupo</FormLabel>
              <Select
                key={`grupo-${grupos.some((g) => g.id === field.value)}`}
                value={field.value || ''}
                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar grupo..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">— Sem grupo —</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Tarifas do grupo — leitura apenas */}
        {(() => {
          const grupoId = form.watch('grupo_id');
          if (!grupoId) return null;
          const tarifas = allTarifas.filter((t) => t.grupo_id === grupoId);

          // TVDE não tem preço por grupo — o preço é por MODELO (renting_tarifa_
          // precos_modelo). Uma viatura TVDE com tarifa ativa configurada para o
          // seu modelo NÃO deve mostrar o aviso de "sem tarifa" só porque o grupo
          // em si não tem preço direto.
          const tipoId = form.watch('tipo_id');
          const modeloId = form.watch('modelo_id');
          const isTvde = viaturasTipos.find((t) => t.id === tipoId)?.elegivel_tvde ?? false;
          const tarifaTvdeModelo = isTvde
            ? tarifasTvdeModelo.find((t) => t.modelo_id === modeloId)
            : undefined;

          if (tarifas.length === 0 && tarifaTvdeModelo) {
            const fmtTvde = new Intl.NumberFormat('pt-PT', {
              style: 'currency',
              currency: 'EUR',
            }).format(tarifaTvdeModelo.preco_semana);
            return (
              <div className="md:col-span-3 rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Tarifa TVDE (por modelo)
                </p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{tarifaTvdeModelo.tarifa_nome}</p>
                  <p className="text-sm font-semibold text-primary">
                    {fmtTvde} <span className="text-xs text-muted-foreground">/semana</span>
                  </p>
                </div>
              </div>
            );
          }

          // Grupo sem tarifa ativa (allTarifas já vem filtrado por ativa=true) e
          // sem tarifa TVDE por modelo: avisa que o aluguer não será cobrado no
          // resumo do motorista.
          if (tarifas.length === 0) {
            return (
              <div className="md:col-span-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  ⚠ Este grupo não tem tarifa ativa configurada
                </p>
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                  O aluguer aparecerá a 0€ no resumo do motorista. Configure uma tarifa em Renting →
                  Tarifas para este grupo{isTvde ? ' (ou uma tarifa TVDE para este modelo)' : ''}.
                </p>
              </div>
            );
          }
          const fmt = (v: number | null) =>
            v != null
              ? new Intl.NumberFormat('pt-PT', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(v)
              : '—';
          return (
            <div className="md:col-span-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Tarifas do Grupo
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {tarifas.map((t) => (
                  <div key={t.nome} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{t.nome}</p>
                    {t.preco_dia != null && (
                      <p className="text-sm font-medium">
                        {fmt(t.preco_dia)}{' '}
                        <span className="text-xs text-muted-foreground">/dia</span>
                      </p>
                    )}
                    {t.preco_semana != null && (
                      <p className="text-sm font-semibold text-primary">
                        {fmt(t.preco_semana)}{' '}
                        <span className="text-xs text-muted-foreground">/semana</span>
                      </p>
                    )}
                    {t.preco_mes != null && (
                      <p className="text-sm font-medium">
                        {fmt(t.preco_mes)}{' '}
                        <span className="text-xs text-muted-foreground">/mês</span>
                      </p>
                    )}
                    {t.kms_incluidos != null && (
                      <p className="text-xs text-muted-foreground">{t.kms_incluidos} km incl.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        <FormField
          control={form.control}
          name="estacao_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estação</FormLabel>
              <Select
                key={`estacao-${estacoes.some((e) => e.id === field.value)}`}
                value={field.value || ''}
                onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar estação..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">— Sem estação —</SelectItem>
                  {estacoes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                      {e.cidade ? ` (${e.cidade})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Estado SLOT — derivado do tipo. Ao escolher o tipo "SLOT", is_slot liga
          automaticamente e o campo fica só de leitura (fonte de verdade = o tipo).
          Nos outros tipos mantém-se editável, para casos legados de viaturas slot
          sem tipo atribuído.
          NOTA: "Elegível para TVDE?" (habilitada_tvde) foi removido daqui — não
          tinha efeito. A elegibilidade real vem de viatura_tipos.elegivel_tvde
          (ver useModelosElegiveisTvde). O campo mantém-se na BD. */}
      <div className="md:col-span-3 mt-2">
        <div className="flex max-w-md items-center justify-between rounded-lg border bg-muted/30 p-4">
          <div>
            <p className="font-medium">Viatura SLOT</p>
            <Badge variant={form.watch('is_slot') ? 'default' : 'secondary'}>
              {form.watch('is_slot') ? 'Ativo' : 'Inativo'}
            </Badge>
            {isTipoSlot && (
              <p className="mt-1 text-xs text-muted-foreground">Definido pelo tipo SLOT</p>
            )}
          </div>
          <Switch
            checked={form.watch('is_slot')}
            disabled={isTipoSlot}
            onCheckedChange={(checked) => form.setValue('is_slot', checked, { shouldDirty: true })}
          />
        </div>
      </div>
    </div>
  );
}
