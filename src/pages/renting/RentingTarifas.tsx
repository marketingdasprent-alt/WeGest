import { useMemo, useState } from 'react';
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
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
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
  nome: string;
  tipo: string;
  valido_de: string | null;
  valido_ate: string | null;
  ativa: boolean;
}

const RentingTarifas = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RentingTarifa | null>(null);
  const [sortField, setSortField] = useState<string>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const { data: tarifas = [], isLoading } = useQuery({
    queryKey: ['renting_tarifas', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select('id, nome, tipo, valido_de, valido_ate, ativa')
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

  const filtered = useMemo(() => {
    const list = tarifas.filter((t) => !search || matchesSearch(t.nome, search));
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortField) {
        case 'nome':
          va = a.nome || '';
          vb = b.nome || '';
          break;
        case 'tipo':
          va = a.tipo || '';
          vb = b.tipo || '';
          break;
        case 'validade':
          va = a.valido_de || '';
          vb = b.valido_de || '';
          break;
        case 'estado':
          va = a.ativa ? 1 : 0;
          vb = b.ativa ? 1 : 0;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [tarifas, search, sortField, sortDir]);

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
          placeholder="Pesquisar por nome..."
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
                <SortableTableHead
                  field="nome"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="min-w-[180px]"
                >
                  Nome
                </SortableTableHead>
                <SortableTableHead
                  field="tipo"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="w-28"
                >
                  Tipo
                </SortableTableHead>
                <SortableTableHead
                  field="validade"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="w-44 whitespace-nowrap"
                >
                  Validade
                </SortableTableHead>
                <SortableTableHead
                  field="estado"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="w-20"
                >
                  Estado
                </SortableTableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {t.tipo === 'tvde' ? 'TVDE' : 'Rent-a-Car'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
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
