import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Car, User, CalendarDays, Trash2, Clock, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { SearchableDropdown } from './calendarioUtils';
import { matchesSearch } from '@/lib/utils';

interface ListaEsperaDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canManage: boolean; // admin or supervisor
}

interface ListaEsperaEvento {
  id: string;
  titulo: string; // marca + modelo
  motorista_id: string | null;
  criado_por: string;
  created_at: string;
  motoristaNome: string | null;
  gestorNome: string | null;
}

export const ListaEsperaDrawer: React.FC<ListaEsperaDrawerProps> = ({
  open,
  onOpenChange,
  canManage,
}) => {
  const queryClient = useQueryClient();

  // ── Form de criação ───────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [marcaModelo, setMarcaModelo] = useState('');
  const [motoristaId, setMotoristaId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ListaEsperaEvento | null>(null);

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['lista-espera'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('id, titulo, motorista_id, criado_por, created_at')
        .eq('tipo', 'lista_espera')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Fetch motorista names
      const motoristaIds = [
        ...new Set(data.map((e) => e.motorista_id).filter(Boolean)),
      ] as string[];
      const gestorIds = [...new Set(data.map((e) => e.criado_por))];

      const [motoristasRes, gestoresRes] = await Promise.all([
        motoristaIds.length > 0
          ? supabase.from('motoristas_ativos').select('id, nome').in('id', motoristaIds)
          : Promise.resolve({ data: [] }),
        supabase.from('profiles').select('id, nome').in('id', gestorIds),
      ]);

      const motoristasMap = Object.fromEntries(
        (motoristasRes.data || []).map((m) => [m.id, m.nome])
      );
      const gestoresMap = Object.fromEntries((gestoresRes.data || []).map((p) => [p.id, p.nome]));

      return data.map((e) => ({
        ...e,
        motoristaNome: e.motorista_id ? motoristasMap[e.motorista_id] || null : null,
        gestorNome: gestoresMap[e.criado_por] || null,
      })) as ListaEsperaEvento[];
    },
    enabled: open,
  });

  // Pares únicos marca+modelo da frota (mesma fonte do NovoEventoPage).
  const { data: marcaModeloOptions = [] } = useQuery({
    queryKey: ['lista-espera-marcas-modelos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('viaturas').select('marca, modelo');
      if (error) throw error;
      const map = new Map<string, { marca: string; modelo: string }>();
      (data ?? []).forEach((v) => map.set(`${v.marca} ${v.modelo}`, v));
      return Array.from(map.entries()).map(([chave, mm]) => ({ chave, ...mm }));
    },
    enabled: open && showForm,
  });

  // Motoristas ativos (associação opcional de quem aguarda).
  const { data: motoristas = [] } = useQuery({
    queryKey: ['lista-espera-motoristas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && showForm,
  });

  const resetForm = () => {
    setMarcaModelo('');
    setMotoristaId('');
    setObservacoes('');
    setShowForm(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const chave = marcaModelo.trim();
      if (!chave) throw new Error('Selecione uma marca e modelo');
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sessão inválida');
      const mm = marcaModeloOptions.find((o) => o.chave === chave);
      // org_id tem default get_current_org_id() na BD.
      const { error } = await supabase.from('calendario_eventos').insert({
        titulo: chave,
        tipo: 'lista_espera',
        data_inicio: new Date().toISOString(),
        data_fim: null,
        criado_por: userId,
        motorista_id: motoristaId || null,
        descricao: observacoes.trim() || null,
        lista_marca: mm?.marca ?? null,
        lista_modelo: mm?.modelo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-espera'] });
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      toast.success('Adicionado à lista de espera');
      resetForm();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar à lista'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendario_eventos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-espera'] });
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      toast.success('Entrada removida da lista de espera');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover entrada'),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-pink-500" />
            Lista de Espera
          </SheetTitle>
        </SheetHeader>

        {/* Adicionar entrada */}
        <div className="mt-4">
          {!showForm ? (
            <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Adicionar à lista de espera
            </Button>
          ) : (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="space-y-1.5">
                <Label>
                  Marca e modelo <span className="text-destructive">*</span>
                </Label>
                <SearchableDropdown
                  items={marcaModeloOptions.map((o) => ({ id: o.chave, primary: o.chave }))}
                  value={marcaModelo}
                  onChange={setMarcaModelo}
                  placeholder="Selecionar marca e modelo…"
                  icon={<Car className="h-4 w-4 text-muted-foreground" />}
                  matchFn={(item, q) => matchesSearch(item.primary, q)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Motorista que aguarda (opcional)</Label>
                <SearchableDropdown
                  items={motoristas.map((m) => ({ id: m.id, primary: m.nome }))}
                  value={motoristaId}
                  onChange={setMotoristaId}
                  placeholder="Nenhum"
                  icon={<User className="h-4 w-4 text-muted-foreground" />}
                  matchFn={(item, q) => matchesSearch(item.primary, q)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="le-obs">Observações</Label>
                <Textarea
                  id="le-obs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Notas internas (opcional)"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={!marcaModelo.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">A carregar...</p>
          )}
          {!isLoading && lista.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sem entradas na lista de espera.
            </p>
          )}
          {lista.map((entry) => (
            <div
              key={entry.id}
              className="border border-l-4 border-l-pink-500 rounded-lg p-3 bg-card space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-pink-500 shrink-0" />
                    <span className="font-semibold text-sm">{entry.titulo}</span>
                  </div>
                  {entry.motoristaNome && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>{entry.motoristaNome}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />
                    <span>Gestor: {entry.gestorNome || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    <span>
                      {format(new Date(entry.created_at), "d 'de' MMMM 'de' yyyy, HH:mm", {
                        locale: pt,
                      })}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => setDeleteTarget(entry)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover da lista de espera?</AlertDialogTitle>
              <AlertDialogDescription>
                A entrada <strong>{deleteTarget?.titulo}</strong> será removida da lista de espera.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) {
                    deleteMutation.mutate(deleteTarget.id);
                  }
                }}
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};
