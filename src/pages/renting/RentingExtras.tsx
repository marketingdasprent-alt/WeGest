import { useState } from 'react';
import { PackagePlus, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { matchesSearch } from '@/lib/utils';

interface RentingExtra {
  id: string;
  nome: string;
  descricao: string | null;
  preco_unidade: number;
  tipo_calculo: 'dia' | 'fixo';
  quantidade_maxima: number | null;
  ativo: boolean;
}

const EMPTY_FORM = {
  nome: '',
  descricao: '',
  preco_unidade: '',
  tipo_calculo: 'dia' as 'dia' | 'fixo',
  quantidade_maxima: '',
  ativo: true,
};

const RentingExtras = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RentingExtra | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentingExtra | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: extras = [], isLoading } = useQuery({
    queryKey: ['renting_extras', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('renting_extras').select('*').order('nome');
      if (error) throw error;
      return data as RentingExtra[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renting_extras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renting_extras'] });
      toast({ title: 'Extra eliminado' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = extras.filter((e) => !search || matchesSearch(e.nome, search));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (e: RentingExtra) => {
    setEditing(e);
    setForm({
      nome: e.nome,
      descricao: e.descricao ?? '',
      preco_unidade: e.preco_unidade.toString(),
      tipo_calculo: e.tipo_calculo,
      quantidade_maxima: e.quantidade_maxima?.toString() ?? '',
      ativo: e.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.preco_unidade.trim()) {
      toast({ title: 'Nome e Preço são obrigatórios', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        preco_unidade: parseFloat(form.preco_unidade),
        tipo_calculo: form.tipo_calculo,
        quantidade_maxima: form.quantidade_maxima.trim() ? parseInt(form.quantidade_maxima) : null,
        ativo: form.ativo,
      };
      if (editing) {
        const { error } = await supabase
          .from('renting_extras')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Extra actualizado' });
      } else {
        const { error } = await supabase
          .from('renting_extras')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Extra criado' });
      }
      qc.invalidateQueries({ queryKey: ['renting_extras'] });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Extras"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} extra${filtered.length !== 1 ? 's' : ''}`
        }
        icon={PackagePlus}
      >
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Extra
        </Button>
      </StickyPageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <PackagePlus className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhum extra encontrado' : 'Ainda não há extras criados'}
          </p>
          {!search && (
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro extra
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Nome</TableHead>
                <TableHead className="min-w-[200px]">Descrição</TableHead>
                <TableHead className="w-28 text-right">Preço</TableHead>
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-28">Qtd. máx.</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{e.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {e.descricao || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.preco_unidade.toFixed(2)} €
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {e.tipo_calculo === 'dia' ? 'Por dia' : 'Fixo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {e.quantidade_maxima ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.ativo ? 'default' : 'secondary'} className="text-xs">
                      {e.ativo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(e)}
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Extra' : 'Novo Extra'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: GPS, Cadeirinha, Condutor adicional"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                rows={2}
                placeholder="Descrição opcional..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Preço (€) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.preco_unidade}
                  onChange={(e) => setForm((p) => ({ ...p, preco_unidade: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de cálculo</Label>
                <Select
                  value={form.tipo_calculo}
                  onValueChange={(v: 'dia' | 'fixo') => setForm((p) => ({ ...p, tipo_calculo: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Por dia</SelectItem>
                    <SelectItem value="fixo">Valor fixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade máxima</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantidade_maxima}
                  onChange={(e) => setForm((p) => ({ ...p, quantidade_maxima: e.target.value }))}
                  placeholder="Deixar vazio = sem limite"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'A guardar...' : editing ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar extra?</AlertDialogTitle>
            <AlertDialogDescription>
              O extra <strong>{deleteTarget?.nome}</strong> será eliminado permanentemente.
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

export default RentingExtras;
