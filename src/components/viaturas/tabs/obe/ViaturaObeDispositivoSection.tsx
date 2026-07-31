import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Radio, Link2Off } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SearchableSelect, type SearchableSelectItem } from '@/components/ui/searchable-select';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface DispositivoObe {
  id: string;
  nr_equipamento: string;
  contrato: string | null;
  ativo: boolean;
  notas: string | null;
}

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
  const [loading, setLoading] = useState(true);
  const [atual, setAtual] = useState<DispositivoObe | null>(null);
  const [disponiveis, setDisponiveis] = useState<DispositivoObe[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const [{ data: assoc, error: e1 }, { data: livres, error: e2 }] = await Promise.all([
        supabase
          .from('dispositivos_obe')
          .select('id, nr_equipamento, contrato, ativo, notas')
          .eq('viatura_id', viaturaId)
          .maybeSingle(),
        supabase
          .from('dispositivos_obe')
          .select('id, nr_equipamento, contrato, ativo, notas')
          .is('viatura_id', null)
          .order('nr_equipamento'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setAtual(assoc || null);
      setDisponiveis(livres || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dispositivo OBE');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viaturaId]);

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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dispositivos_obe')
        .update({ viatura_id: viaturaId })
        .eq('id', selecionado);
      if (error) throw error;
      toast.success('Dispositivo OBE associado com sucesso!');
      setSelecionado(null);
      carregar();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao associar dispositivo');
    } finally {
      setSaving(false);
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dispositivos_obe')
        .update({ viatura_id: null })
        .eq('id', atual.id);
      if (error) throw error;
      toast.success('Associação removida.');
      carregar();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover associação');
    } finally {
      setSaving(false);
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
