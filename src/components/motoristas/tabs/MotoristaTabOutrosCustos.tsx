import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Table as TableIcon,
  X,
  Edit2,
  Check,
  Info,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Motorista } from '@/pages/Motoristas';

interface CustoAdicional {
  id: string;
  motorista_id: string;
  tipo: string;
  valor: number;
  semana_referencia: string;
  status: string;
  descricao: string | null;
  created_at: string;
}

interface MotoristaTabOutrosCustosProps {
  motorista: Motorista;
}

export function MotoristaTabOutrosCustos({ motorista }: MotoristaTabOutrosCustosProps) {
  const [custos, setCustos] = useState<CustoAdicional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCusto, setEditCusto] = useState<Partial<CustoAdicional>>({});
  const [deleteTarget, setDeleteTarget] = useState<CustoAdicional | null>(null);
  const [sortField, setSortField] = useState<string>('semana_referencia');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  useEffect(() => {
    loadCustos();
  }, [motorista.id]);

  async function loadCustos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motorista_custos_adicionais')
        .select('*')
        .eq('motorista_id', motorista.id)
        .order('semana_referencia', { ascending: true });

      if (error) throw error;
      setCustos(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar custos:', error);
      // Don't toast error if table doesn't exist yet, we'll handle it nicely
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from('motorista_custos_adicionais').delete().eq('id', id);

      if (error) throw error;
      toast.success('Lançamento removido.');
      setCustos(custos.filter((c) => c.id !== id));
    } catch (error: any) {
      toast.error('Erro ao remover: ' + error.message);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('motorista_custos_adicionais')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setCustos(custos.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
      toast.success('Status atualizado.');
    } catch (error: any) {
      toast.error('Erro ao atualizar status.');
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !editCusto.valor || editCusto.valor <= 0) {
      toast.error('Insira um valor válido.');
      return;
    }

    try {
      const { error } = await supabase
        .from('motorista_custos_adicionais')
        .update({
          tipo: editCusto.tipo,
          valor: editCusto.valor,
          semana_referencia: editCusto.semana_referencia,
        })
        .eq('id', editingId);

      if (error) throw error;

      setEditingId(null);
      await loadCustos();
      toast.success('Custo atualizado com sucesso.');
    } catch (error: any) {
      toast.error('Erro ao salvar alterações.');
    }
  }

  function startEditing(custo: CustoAdicional) {
    setEditingId(custo.id);
    setEditCusto({
      tipo: custo.tipo,
      valor: custo.valor,
      semana_referencia: custo.semana_referencia,
    });
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const custosOrdenados = useMemo(() => {
    const list = [...custos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'semana_referencia') {
        va = a.semana_referencia;
        vb = b.semana_referencia;
      } else if (sortField === 'tipo') {
        va = a.tipo;
        vb = b.tipo;
      } else if (sortField === 'valor') {
        va = a.valor;
        vb = b.valor;
      } else if (sortField === 'status') {
        va = a.status;
        vb = b.status;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [custos, sortField, sortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Outros Custos (histórico)</h3>
        <p className="text-sm text-muted-foreground">
          Lançamentos agendados por esta via antiga. Ainda podes editar/remover os existentes.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          Para agendar novas cauções, seguros ou outros custos recorrentes, usa o separador{' '}
          <strong>Financeiro</strong> → "Novo Movimento" → "Repetição". Passou a suportar
          recorrência semanal e mensal automática, sem limite de duração.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableTableHead
                field="semana_referencia"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Semana / Data
              </SortableTableHead>
              <SortableTableHead
                field="tipo"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Tipo
              </SortableTableHead>
              <SortableTableHead
                field="valor"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Valor
              </SortableTableHead>
              <SortableTableHead
                field="status"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Estado
              </SortableTableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {custos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <TableIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Nenhum custo adicional agendado para este motorista.
                </TableCell>
              </TableRow>
            ) : (
              custosOrdenados.map((custo) => {
                const isEditing = editingId === custo.id;
                return (
                  <TableRow key={custo.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="date"
                          className="h-8 py-0"
                          value={editCusto.semana_referencia}
                          onChange={(e) =>
                            setEditCusto({ ...editCusto, semana_referencia: e.target.value })
                          }
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-sm">
                            {format(parseISO(custo.semana_referencia), 'dd/MM/yyyy')}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Select
                          value={editCusto.tipo}
                          onValueChange={(v) => setEditCusto({ ...editCusto, tipo: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Caução">Caução</SelectItem>
                            <SelectItem value="Seguros">Seguros</SelectItem>
                            <SelectItem value="Outros Custos">Outros Custos</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          {custo.tipo}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn('font-semibold text-destructive', isEditing && 'py-1')}
                    >
                      {isEditing ? (
                        <Input
                          type="number"
                          className="h-8 py-0"
                          value={editCusto.valor}
                          onChange={(e) =>
                            setEditCusto({ ...editCusto, valor: parseFloat(e.target.value) })
                          }
                        />
                      ) : (
                        formatCurrency(custo.valor)
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() =>
                          handleUpdateStatus(
                            custo.id,
                            custo.status === 'pendente' ? 'cobrado' : 'pendente'
                          )
                        }
                        className="focus:outline-none"
                      >
                        {custo.status === 'cobrado' ? (
                          <Badge className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Pago
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Pendente
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:bg-green-50"
                              onClick={handleSaveEdit}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:bg-muted"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:bg-muted"
                              onClick={() => startEditing(custo)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(custo)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar custo adicional?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lançamento será removido permanentemente do
              histórico deste motorista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
