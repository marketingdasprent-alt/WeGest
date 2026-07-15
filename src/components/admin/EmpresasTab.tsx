import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Building2, Plus, Pencil, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { validarNIF } from '@/lib/pt-validators';
import { EmpresaImagemUpload } from './EmpresaImagemUpload';

// Empresa EMISSORA = cliente de tipo='empresa' com is_emissora=true (as empresas
// do grupo que emitem reservas/contratos/documentos). O sistema usa clientes.id
// (UUID) como eixo \u00fanico; esta aba \u00e9 a vista filtrada por is_emissora=true e os
// clientes que por acaso s\u00e3o empresas ficam s\u00f3 na lista de Clientes.
interface Empresa {
  id: string;
  nome: string;
  nome_comercial: string | null;
  nif: string | null;
  sede: string | null;
  licenca_tvde: string | null;
  licenca_validade: string | null;
  representante: string | null;
  cargo_representante: string | null;
  papel_timbrado: string | null;
  logo_url: string | null;
}

const EMPTY: Empresa = {
  id: '',
  nome: '',
  nome_comercial: '',
  nif: '',
  sede: '',
  licenca_tvde: '',
  licenca_validade: '',
  representante: '',
  cargo_representante: '',
  papel_timbrado: '',
  logo_url: '',
};

export const EmpresasTab: React.FC = () => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = new
  const [form, setForm] = useState<Empresa>(EMPTY);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select(
        'id, nome, nome_comercial, nif, sede, licenca_tvde, licenca_validade, representante, cargo_representante, papel_timbrado, logo_url'
      )
      .eq('is_emissora', true)
      .is('deleted_at', null)
      .order('nome');
    if (error) {
      toast.error('Erro ao carregar empresas');
    } else setEmpresas((data ?? []) as Empresa[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (e: Empresa) => {
    setEditingId(e.id);
    setForm({ ...e });
    setDialogOpen(true);
  };

  const handleNomeChange = (nome: string) => {
    setForm((prev) => ({ ...prev, nome }));
  };

  const handleSave = async () => {
    if (!form.nome) {
      toast.error('Nome é obrigatório');
      return;
    }
    // NIF da empresa sai impresso nos contratos — valida checksum antes de gravar.
    const nifNormalizado = form.nif ? form.nif.replace(/\s/g, '') : '';
    if (nifNormalizado) {
      const res = validarNIF(nifNormalizado);
      if (!res.valid) {
        toast.error(res.message || 'NIF inválido');
        return;
      }
    }
    setSaving(true);
    try {
      // Campos comuns a create/update. licenca_validade é DATE em clientes:
      // o input é type="date" (yyyy-mm-dd) ou vazio → NULL.
      const dados = {
        nome: form.nome,
        nome_comercial: form.nome_comercial || form.nome,
        nif: nifNormalizado || null,
        sede: form.sede || null,
        licenca_tvde: form.licenca_tvde || null,
        licenca_validade: form.licenca_validade || null,
        representante: form.representante || null,
        cargo_representante: form.cargo_representante || null,
        papel_timbrado: form.papel_timbrado || null,
        logo_url: form.logo_url || null,
      };

      if (editingId) {
        const { error } = await supabase.from('clientes').update(dados).eq('id', editingId);
        if (error) throw error;
        toast.success('Empresa atualizada');
      } else {
        // org_id é NOT NULL em clientes e exigido pelo RLS — obter via RPC.
        const { data: orgId, error: orgErr } = await (supabase as any).rpc('get_current_org_id');
        if (orgErr || !orgId) {
          throw new Error('Não foi possível determinar a organização atual');
        }
        const { error } = await supabase.from('clientes').insert({
          ...dados,
          tipo_cliente: 'empresa',
          is_empresa: true,
          is_emissora: true,
          org_id: orgId,
        });
        if (error) throw error;
        toast.success('Empresa criada');
      }

      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao guardar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Soft-delete: clientes usa deleted_at (preserva FKs de emissor/templates).
    const { error } = await supabase
      .from('clientes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteId);
    if (error) toast.error(error.message);
    else {
      toast.success('Empresa removida');
      load();
    }
    setDeleteId(null);
  };

  const field = (
    label: string,
    key: keyof Empresa,
    opts?: { placeholder?: string; disabled?: boolean }
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        disabled={opts?.disabled}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Empresas emissoras do grupo — as que emitem contratos e documentos. Os clientes que são
          empresas ficam na lista de Clientes.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Empresa
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : empresas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhuma empresa emissora registada.</p>
            <Button className="mt-4" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Primeira Empresa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {empresas.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 p-2 rounded-lg bg-primary/10 shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{e.nome_comercial || e.nome}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        {e.nif && <span>NIF: {e.nif}</span>}
                        {e.representante && <span>Rep.: {e.representante}</span>}
                        {e.licenca_tvde && <span>Lic. TVDE: {e.licenca_tvde}</span>}
                        {e.licenca_validade && <span>Válida até: {e.licenca_validade}</span>}
                        {e.sede && (
                          <span className="col-span-2 truncate" title={e.sede}>
                            Sede: {e.sede}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!saving) setDialogOpen(o);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic info */}
            <div className="space-y-1.5">
              <Label>
                Nome Curto <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => handleNomeChange(e.target.value)}
                placeholder="Ex: WeGest"
              />
            </div>

            {field('Nome Completo (para contratos)', 'nome_comercial', {
              placeholder: 'Ex: WeGest, Lda.',
            })}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('NIF', 'nif', { placeholder: '515127850' })}
              {field('Representante Legal', 'representante', { placeholder: 'Ex: João Silva' })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Cargo do Representante', 'cargo_representante', {
                placeholder: 'gerente com poderes para o ato',
              })}
              {field('Licença TVDE', 'licenca_tvde', { placeholder: '87314/2021' })}
            </div>

            <div className="space-y-1.5">
              <Label>Validade da Licença</Label>
              <Input
                type="date"
                value={form.licenca_validade ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, licenca_validade: e.target.value }))}
              />
            </div>

            {field('Sede (morada completa)', 'sede', {
              placeholder: 'Rua Exemplo, Nº1, 1000-001 Lisboa',
            })}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
              <EmpresaImagemUpload
                label="Papel Timbrado"
                description="Fundo A4 usado nos PDFs gerados para esta empresa."
                value={form.papel_timbrado ?? ''}
                onChange={(url) => setForm((prev) => ({ ...prev, papel_timbrado: url }))}
                prefix="empresa-timbrado"
                variant="wide"
              />
              <EmpresaImagemUpload
                label="Logótipo"
                description="Imagem pequena da marca da empresa."
                value={form.logo_url ?? ''}
                onChange={(url) => setForm((prev) => ({ ...prev, logo_url: url }))}
                prefix="empresa-logo"
                variant="square"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Guardar Alterações' : 'Criar Empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. Contratos existentes que referenciem esta empresa
              podem ficar sem dados de empresa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
