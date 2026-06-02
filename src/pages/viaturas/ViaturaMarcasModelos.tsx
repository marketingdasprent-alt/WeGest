import { useState } from 'react';
import { CarFront, Plus, Pencil, Trash2, Search, ChevronRight } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface Marca {
  id: string;
  nome: string;
  ativa: boolean;
}
interface Modelo {
  id: string;
  marca_id: string;
  nome: string;
  ativo: boolean;
}
interface Versao {
  id: string;
  modelo_id: string;
  nome: string;
  ativo: boolean;
}

const ViaturaMarcasModelos = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();
  const { hasPermission } = usePermissions();
  // Gere criação/edição/eliminação de marcas, modelos e versões.
  // Quem só tem viaturas_ver consulta o catálogo mas não o altera.
  const podeGerir = hasPermission(RECURSOS.VIATURAS_MARCAS_MODELOS);

  const [search, setSearch] = useState('');
  const [selectedMarca, setSelectedMarca] = useState<Marca | null>(null);
  const [selectedModelo, setSelectedModelo] = useState<Modelo | null>(null);

  // --- Marca dialog ---
  const [marcaDialogOpen, setMarcaDialogOpen] = useState(false);
  const [editingMarca, setEditingMarca] = useState<Marca | null>(null);
  const [marcaForm, setMarcaForm] = useState({ nome: '', ativa: true });
  const [savingMarca, setSavingMarca] = useState(false);
  const [deleteMarcaTarget, setDeleteMarcaTarget] = useState<Marca | null>(null);

  // --- Modelo dialog ---
  const [modeloDialogOpen, setModeloDialogOpen] = useState(false);
  const [editingModelo, setEditingModelo] = useState<Modelo | null>(null);
  const [modeloForm, setModeloForm] = useState({ nome: '', ativo: true });
  const [savingModelo, setSavingModelo] = useState(false);
  const [deleteModeloTarget, setDeleteModeloTarget] = useState<Modelo | null>(null);

  // --- Versão dialog ---
  const [versaoDialogOpen, setVersaoDialogOpen] = useState(false);
  const [editingVersao, setEditingVersao] = useState<Versao | null>(null);
  const [versaoForm, setVersaoForm] = useState({ nome: '', ativo: true });
  const [savingVersao, setSavingVersao] = useState(false);
  const [deleteVersaoTarget, setDeleteVersaoTarget] = useState<Versao | null>(null);

  // --- Queries ---
  const { data: marcas = [], isLoading: loadingMarcas } = useQuery({
    queryKey: ['viatura_marcas', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('viatura_marcas').select('*').order('nome');
      if (error) throw error;
      return data as Marca[];
    },
    enabled: !!orgId,
  });

  const { data: modelos = [], isLoading: loadingModelos } = useQuery({
    queryKey: ['viatura_modelos', orgId, selectedMarca?.id],
    queryFn: async () => {
      if (!selectedMarca) return [];
      const { data, error } = await supabase
        .from('viatura_modelos')
        .select('*')
        .eq('marca_id', selectedMarca.id)
        .order('nome');
      if (error) throw error;
      return data as Modelo[];
    },
    enabled: !!orgId && !!selectedMarca,
  });

  const { data: versoes = [], isLoading: loadingVersoes } = useQuery({
    queryKey: ['viatura_versoes', orgId, selectedModelo?.id],
    queryFn: async () => {
      if (!selectedModelo) return [];
      const { data, error } = await supabase
        .from('viatura_versoes')
        .select('*')
        .eq('modelo_id', selectedModelo.id)
        .order('nome');
      if (error) throw error;
      return data as Versao[];
    },
    enabled: !!orgId && !!selectedModelo,
  });

  // --- Mutations ---
  const deleteMarcaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_marcas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viatura_marcas'] });
      toast({ title: 'Marca eliminada' });
      setDeleteMarcaTarget(null);
      if (selectedMarca?.id === deleteMarcaTarget?.id) {
        setSelectedMarca(null);
        setSelectedModelo(null);
      }
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteModeloMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_modelos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viatura_modelos'] });
      toast({ title: 'Modelo eliminado' });
      setDeleteModeloTarget(null);
      if (selectedModelo?.id === deleteModeloTarget?.id) setSelectedModelo(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteVersaoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_versoes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viatura_versoes'] });
      toast({ title: 'Versão eliminada' });
      setDeleteVersaoTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filteredMarcas = marcas.filter(
    (m) => !search || m.nome.toLowerCase().includes(search.toLowerCase())
  );

  // --- Marca handlers ---
  const openNewMarca = () => {
    setEditingMarca(null);
    setMarcaForm({ nome: '', ativa: true });
    setMarcaDialogOpen(true);
  };
  const openEditMarca = (m: Marca) => {
    setEditingMarca(m);
    setMarcaForm({ nome: m.nome, ativa: m.ativa });
    setMarcaDialogOpen(true);
  };
  const handleSaveMarca = async () => {
    if (!marcaForm.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSavingMarca(true);
      const payload = { nome: marcaForm.nome.trim(), ativa: marcaForm.ativa };
      if (editingMarca) {
        const { error } = await supabase
          .from('viatura_marcas')
          .update(payload)
          .eq('id', editingMarca.id);
        if (error) throw error;
        toast({ title: 'Marca actualizada' });
      } else {
        const { error } = await supabase
          .from('viatura_marcas')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Marca criada' });
      }
      qc.invalidateQueries({ queryKey: ['viatura_marcas'] });
      setMarcaDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingMarca(false);
    }
  };

  // --- Modelo handlers ---
  const openNewModelo = () => {
    setEditingModelo(null);
    setModeloForm({ nome: '', ativo: true });
    setModeloDialogOpen(true);
  };
  const openEditModelo = (m: Modelo) => {
    setEditingModelo(m);
    setModeloForm({ nome: m.nome, ativo: m.ativo });
    setModeloDialogOpen(true);
  };
  const handleSaveModelo = async () => {
    if (!modeloForm.nome.trim() || !selectedMarca) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSavingModelo(true);
      const payload = { nome: modeloForm.nome.trim(), ativo: modeloForm.ativo };
      if (editingModelo) {
        const { error } = await supabase
          .from('viatura_modelos')
          .update(payload)
          .eq('id', editingModelo.id);
        if (error) throw error;
        toast({ title: 'Modelo actualizado' });
      } else {
        const { error } = await supabase
          .from('viatura_modelos')
          .insert({ ...payload, org_id: orgId, marca_id: selectedMarca.id });
        if (error) throw error;
        toast({ title: 'Modelo criado' });
      }
      qc.invalidateQueries({ queryKey: ['viatura_modelos'] });
      setModeloDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingModelo(false);
    }
  };

  // --- Versão handlers ---
  const openNewVersao = () => {
    setEditingVersao(null);
    setVersaoForm({ nome: '', ativo: true });
    setVersaoDialogOpen(true);
  };
  const openEditVersao = (v: Versao) => {
    setEditingVersao(v);
    setVersaoForm({ nome: v.nome, ativo: v.ativo });
    setVersaoDialogOpen(true);
  };
  const handleSaveVersao = async () => {
    if (!versaoForm.nome.trim() || !selectedModelo) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSavingVersao(true);
      const payload = { nome: versaoForm.nome.trim(), ativo: versaoForm.ativo };
      if (editingVersao) {
        const { error } = await supabase
          .from('viatura_versoes')
          .update(payload)
          .eq('id', editingVersao.id);
        if (error) throw error;
        toast({ title: 'Versão actualizada' });
      } else {
        const { error } = await supabase
          .from('viatura_versoes')
          .insert({ ...payload, org_id: orgId, modelo_id: selectedModelo.id });
        if (error) throw error;
        toast({ title: 'Versão criada' });
      }
      qc.invalidateQueries({ queryKey: ['viatura_versoes'] });
      setVersaoDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingVersao(false);
    }
  };

  // --- Helper: list panel ---
  const ListPanel = ({
    title,
    items,
    loading,
    emptyIcon,
    emptyText,
    onNew,
    onSelect,
    selectedId,
    renderItem,
  }: {
    title: React.ReactNode;
    items: any[];
    loading: boolean;
    emptyIcon: React.ReactNode;
    emptyText: string;
    onNew?: () => void;
    onSelect?: (item: any) => void;
    selectedId?: string;
    renderItem: (item: any) => React.ReactNode;
  }) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {onNew && (
          <Button onClick={onNew} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Novo
          </Button>
        )}
      </div>
      {loading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-12 gap-3">
          {emptyIcon}
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          {onNew && (
            <Button onClick={onNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Criar
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between px-4 py-2.5 border-b last:border-b-0 transition-colors ${onSelect ? 'cursor-pointer' : ''} ${selectedId === item.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
              onClick={() => onSelect?.(item)}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Marcas / Modelos / Versões"
        description={
          loadingMarcas
            ? 'A carregar...'
            : `${filteredMarcas.length} marca${filteredMarcas.length !== 1 ? 's' : ''}`
        }
        icon={CarFront}
      >
        {podeGerir && (
          <Button onClick={openNewMarca} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Marca
          </Button>
        )}
      </StickyPageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar marcas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Marcas */}
        <ListPanel
          title="Marcas"
          items={filteredMarcas}
          loading={loadingMarcas}
          emptyIcon={<CarFront className="h-10 w-10 text-muted-foreground" />}
          emptyText={search ? 'Nenhuma marca encontrada' : 'Ainda não há marcas'}
          onNew={podeGerir ? openNewMarca : undefined}
          onSelect={(m) => {
            setSelectedMarca(m);
            setSelectedModelo(null);
          }}
          selectedId={selectedMarca?.id}
          renderItem={(m: Marca) => (
            <>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{m.nome}</span>
                {!m.ativa && (
                  <Badge variant="secondary" className="text-xs">
                    Inactiva
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {podeGerir && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditMarca(m);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteMarcaTarget(m);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <ChevronRight
                  className={`h-4 w-4 ${selectedMarca?.id === m.id ? 'text-primary' : 'text-muted-foreground'}`}
                />
              </div>
            </>
          )}
        />

        {/* Modelos */}
        {selectedMarca ? (
          <ListPanel
            title={
              <>
                Modelos — <span className="text-primary">{selectedMarca.nome}</span>
              </>
            }
            items={modelos}
            loading={loadingModelos}
            emptyIcon={<CarFront className="h-10 w-10 text-muted-foreground" />}
            emptyText="Nenhum modelo para esta marca"
            onNew={podeGerir ? openNewModelo : undefined}
            onSelect={(m) => setSelectedModelo(m)}
            selectedId={selectedModelo?.id}
            renderItem={(m: Modelo) => (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{m.nome}</span>
                  {!m.ativo && (
                    <Badge variant="secondary" className="text-xs">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {podeGerir && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModelo(m);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModeloTarget(m);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <ChevronRight
                    className={`h-4 w-4 ${selectedModelo?.id === m.id ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                </div>
              </>
            )}
          />
        ) : (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Modelos</h3>
            <div className="border rounded-lg flex flex-col items-center justify-center py-12 gap-3">
              <ChevronRight className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Seleccione uma marca</p>
            </div>
          </div>
        )}

        {/* Versões */}
        {selectedModelo ? (
          <ListPanel
            title={
              <>
                Versões — <span className="text-primary">{selectedModelo.nome}</span>
              </>
            }
            items={versoes}
            loading={loadingVersoes}
            emptyIcon={<CarFront className="h-10 w-10 text-muted-foreground" />}
            emptyText="Nenhuma versão para este modelo"
            onNew={podeGerir ? openNewVersao : undefined}
            renderItem={(v: Versao) => (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{v.nome}</span>
                  {!v.ativo && (
                    <Badge variant="secondary" className="text-xs">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {podeGerir && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditVersao(v);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteVersaoTarget(v);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          />
        ) : (
          <div className="hidden xl:block">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Versões</h3>
            <div className="border rounded-lg flex flex-col items-center justify-center py-12 gap-3">
              <ChevronRight className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Seleccione um modelo</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialog Marca */}
      <Dialog
        open={marcaDialogOpen}
        onOpenChange={(o) => {
          if (!o) setMarcaDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingMarca ? 'Editar Marca' : 'Nova Marca'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={marcaForm.nome}
                onChange={(e) => setMarcaForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Tesla, BMW, Renault"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activa</Label>
              <Switch
                checked={marcaForm.ativa}
                onCheckedChange={(v) => setMarcaForm((p) => ({ ...p, ativa: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarcaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMarca} disabled={savingMarca}>
              {savingMarca ? 'A guardar...' : editingMarca ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modelo */}
      <Dialog
        open={modeloDialogOpen}
        onOpenChange={(o) => {
          if (!o) setModeloDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingModelo ? 'Editar Modelo' : `Novo Modelo — ${selectedMarca?.nome}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={modeloForm.nome}
                onChange={(e) => setModeloForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Model 3, Série 3, Clio"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activo</Label>
              <Switch
                checked={modeloForm.ativo}
                onCheckedChange={(v) => setModeloForm((p) => ({ ...p, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeloDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveModelo} disabled={savingModelo}>
              {savingModelo ? 'A guardar...' : editingModelo ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Versão */}
      <Dialog
        open={versaoDialogOpen}
        onOpenChange={(o) => {
          if (!o) setVersaoDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingVersao ? 'Editar Versão' : `Nova Versão — ${selectedModelo?.nome}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={versaoForm.nome}
                onChange={(e) => setVersaoForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Long Range, GTI, Sport"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activo</Label>
              <Switch
                checked={versaoForm.ativo}
                onCheckedChange={(v) => setVersaoForm((p) => ({ ...p, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersaoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveVersao} disabled={savingVersao}>
              {savingVersao ? 'A guardar...' : editingVersao ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Marca */}
      <AlertDialog
        open={!!deleteMarcaTarget}
        onOpenChange={(o) => !o && setDeleteMarcaTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar marca?</AlertDialogTitle>
            <AlertDialogDescription>
              A marca <strong>{deleteMarcaTarget?.nome}</strong> e todos os seus modelos e versões
              serão eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMarcaTarget && deleteMarcaMutation.mutate(deleteMarcaTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Modelo */}
      <AlertDialog
        open={!!deleteModeloTarget}
        onOpenChange={(o) => !o && setDeleteModeloTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo <strong>{deleteModeloTarget?.nome}</strong> e todas as suas versões serão
              eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteModeloTarget && deleteModeloMutation.mutate(deleteModeloTarget.id)
              }
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Versão */}
      <AlertDialog
        open={!!deleteVersaoTarget}
        onOpenChange={(o) => !o && setDeleteVersaoTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar versão?</AlertDialogTitle>
            <AlertDialogDescription>
              A versão <strong>{deleteVersaoTarget?.nome}</strong> será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteVersaoTarget && deleteVersaoMutation.mutate(deleteVersaoTarget.id)
              }
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ViaturaMarcasModelos;
