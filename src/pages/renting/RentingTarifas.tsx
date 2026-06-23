import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { matchesSearch } from '@/lib/utils';

interface RentingTarifa {
  id: string;
  grupo_id: string;
  nome: string;
  preco_dia: number;
  preco_fim_semana: number | null;
  preco_semana: number | null;
  preco_mes: number | null;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
  valido_de: string | null;
  valido_ate: string | null;
  ativa: boolean;
  grupo?: { id: string; nome: string; codigo: string };
}

const fmt = (v: number | null) => (v != null ? `${v.toFixed(2)} €` : '—');

const RentingTarifas = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RentingTarifa | null>(null);

  const { data: tarifas = [], isLoading } = useQuery({
    queryKey: ['renting_tarifas', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select('*, grupo:renting_grupos(id, nome, codigo)')
        .order('nome');
      if (error) throw error;
      return data as RentingTarifa[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renting_tarifas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
      toast({ title: 'Tarifa eliminada' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = tarifas.filter((t) => {
    return !search || matchesSearch(t.nome, search) || matchesSearch(t.grupo?.nome, search);
  });

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Tarifas"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} tarifa${filtered.length !== 1 ? 's' : ''}`
        }
        icon={Tag}
      >
        <Button onClick={() => navigate('/renting/tarifas/nova')} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Tarifa
        </Button>
      </StickyPageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome ou grupo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <Tag className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhuma tarifa encontrada' : 'Ainda não há tarifas criadas'}
          </p>
          {!search && (
            <Button onClick={() => navigate('/renting/tarifas/nova')} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira tarifa
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Grupo</TableHead>
                <TableHead className="min-w-[180px]">Nome</TableHead>
                <TableHead className="w-24 text-right">€/dia</TableHead>
                <TableHead className="w-24 text-right">€/sem.</TableHead>
                <TableHead className="w-24 text-right">€/mês</TableHead>
                <TableHead className="w-28">Kms incl.</TableHead>
                <TableHead className="w-28">Validade</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {t.grupo?.codigo ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(t.preco_dia)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmt(t.preco_semana)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmt(t.preco_mes)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.kms_incluidos != null
                      ? `${t.kms_incluidos.toLocaleString('pt-PT')} km`
                      : 'Ilimitado'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.valido_de && t.valido_ate
                      ? `${t.valido_de} → ${t.valido_ate}`
                      : t.valido_de
                        ? `Desde ${t.valido_de}`
                        : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.ativa ? 'default' : 'secondary'} className="text-xs">
                      {t.ativa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/renting/tarifas/${t.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarifa <strong>{deleteTarget?.nome}</strong> será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RentingTarifas;
