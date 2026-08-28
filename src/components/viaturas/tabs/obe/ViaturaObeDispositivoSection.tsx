import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Radio, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, type SearchableSelectItem } from '@/components/ui/searchable-select';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import {
  useViaturaObeDispositivos,
  useAssociarDispositivoObe,
  useRemoverDispositivoObe,
} from '@/hooks/useViaturaObe';
import { errorMessage } from '@/utils/errorMessage';

interface ViaturaObeDispositivoSectionProps {
  viaturaId: string;
  onChanged?: () => void;
}

export function ViaturaObeDispositivoSection({
  viaturaId,
  onChanged,
}: ViaturaObeDispositivoSectionProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const { data, isLoading: loading, error } = useViaturaObeDispositivos(viaturaId);
  const atual = data?.atual ?? null;
  const disponiveis = useMemo(() => data?.disponiveis ?? [], [data]);

  const associar = useAssociarDispositivoObe();
  const remover = useRemoverDispositivoObe();
  const saving = associar.isPending || remover.isPending;

  const items: SearchableSelectItem[] = useMemo(
    () =>
      disponiveis.map((d) => ({
        id: d.id,
        searchText: `${d.nr_equipamento} ${d.contrato || ''}`,
        label: (
          <>
            {d.nr_equipamento}
            {d.contrato && <span className="text-muted-foreground"> — {d.contrato}</span>}
          </>
        ),
      })),
    [disponiveis]
  );

  const handleAssociar = async () => {
    if (!selecionado) return;
    try {
      await associar.mutateAsync({ dispositivoId: selecionado, viaturaId });
      toast.success('Dispositivo OBE associado com sucesso!');
      setSelecionado(null);
      onChanged?.();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao associar dispositivo'));
    }
  };

  const handleRemover = async () => {
    if (!atual || !podeEditar) return;
    if (
      !window.confirm(
        'Tem a certeza que quer remover a associação deste dispositivo OBE à viatura?'
      )
    )
      return;
    try {
      await remover.mutateAsync({ dispositivoId: atual.id, viaturaId });
      toast.success('Associação removida.');
      onChanged?.();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao remover associação'));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // §10: o erro tem estado próprio. Antes era um toast disparado dentro do
  // `catch` do carregamento — desaparecia em segundos e a secção ficava a
  // dizer "sem dispositivo associado", que é uma afirmação diferente de
  // "não foi possível ler".
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">
          {errorMessage(error, 'Erro ao carregar dispositivo OBE')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Dispositivo OBE
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {atual ? (
          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
            <div>
              <p className="text-sm text-muted-foreground">Dispositivo associado</p>
              <p className="font-mono font-medium">{atual.nr_equipamento}</p>
              {atual.contrato && (
                <p className="text-xs text-muted-foreground">
                  Contrato Via Verde: {atual.contrato}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  atual.ativo
                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                    : 'bg-muted text-muted-foreground border-border'
                }
              >
                {atual.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
              {podeEditar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemover}
                  disabled={saving}
                  className="text-destructive"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2Off className="h-4 w-4 mr-2" />
                  )}
                  Remover associação
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta viatura ainda não tem dispositivo OBE associado.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  items={items}
                  value={selecionado}
                  onChange={setSelecionado}
                  placeholder="Pesquisar por nº de equipamento..."
                  emptyText="Nenhum dispositivo disponível — todos já estão associados."
                />
              </div>
              <Button onClick={handleAssociar} disabled={!selecionado || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Associar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
