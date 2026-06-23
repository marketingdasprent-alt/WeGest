import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, Pencil, Trash2, Search } from 'lucide-react';
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

interface RentingGrupo {
  id: string;
  nome: string;
  codigo: string;
  descricao: string | null;
  imagem_url: string | null;
  ativo: boolean;
  created_at: string;
}

const RentingGrupos = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RentingGrupo | null>(null);

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['renting_grupos', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('renting_grupos').select('*').order('codigo');
      if (error) throw error;
      return data as RentingGrupo[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renting_grupos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renting_grupos'] });
      toast({ title: 'Grupo eliminado' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = grupos.filter((g) => {
    return !search || matchesSearch(g.nome, search) || matchesSearch(g.codigo, search);
  });

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Grupos de Viaturas"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} grupo${filtered.length !== 1 ? 's' : ''}`
        }
        icon={Layers}
      >
        <Button onClick={() => navigate('/viaturas/grupos/novo')} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Grupo
        </Button>
      </StickyPageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <Layers className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhum grupo encontrado' : 'Ainda não há grupos criados'}
          </p>
          {!search && (
            <Button onClick={() => navigate('/viaturas/grupos/novo')} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro grupo
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Código</TableHead>
                <TableHead className="min-w-[160px]">Nome</TableHead>
                <TableHead className="min-w-[240px]">Descrição</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => (
                <TableRow
                  key={g.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/viaturas/grupos/${g.id}`)}
                >
                  <TableCell className="font-mono font-semibold">{g.codigo}</TableCell>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {g.descricao || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.ativo ? 'default' : 'secondary'} className="text-xs">
                      {g.ativo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/viaturas/grupos/${g.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(g)}
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
            <AlertDialogTitle>Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo <strong>{deleteTarget?.nome}</strong> será eliminado permanentemente. As
              viaturas e reservas associadas perderão a ligação a este grupo.
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

export default RentingGrupos;
