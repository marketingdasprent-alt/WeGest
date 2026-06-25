import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Pencil, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validarNIF } from '@/lib/pt-validators';

interface Organizacao {
  id: string;
  nome: string;
  codigo: string;
  nif: string | null;
  morada: string | null;
  telefone: string | null;
  logo_url: string | null;
  ativa: boolean;
  created_at: string;
  _user_count?: number;
}

interface FormData {
  nome: string;
  codigo: string;
  nif: string;
  morada: string;
  telefone: string;
  ativa: boolean;
}

const emptyForm = (): FormData => ({
  nome: '',
  codigo: '',
  nif: '',
  morada: '',
  telefone: '',
  ativa: true,
});

export const OrganizacoesTab: React.FC = () => {
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organizacao | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizacoes')
      .select('id, nome, codigo, nif, morada, telefone, logo_url, ativa, created_at')
      .order('nome');

    if (error) {
      console.error('Erro ao carregar organizações:', error);
      toast.error('Erro ao carregar organizações');
    } else {
      // Contagem de utilizadores por org numa única query (evita N+1: antes
      // era um count por organização).
      const ids = (data || []).map((o: any) => o.id);
      const countByOrg = new Map<string, number>();
      if (ids.length > 0) {
        const { data: vinculos } = await supabase
          .from('user_organizacoes')
          .select('org_id')
          .in('org_id', ids);
        for (const v of vinculos ?? []) {
          countByOrg.set(v.org_id, (countByOrg.get(v.org_id) ?? 0) + 1);
        }
      }
      const orgsWithCount = (data || []).map((org: any) => ({
        ...org,
        _user_count: countByOrg.get(org.id) ?? 0,
      }));
      setOrgs(orgsWithCount);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const openEditDialog = (org: Organizacao) => {
    setEditingOrg(org);
    setFormData({
      nome: org.nome,
      codigo: org.codigo,
      nif: org.nif ?? '',
      morada: org.morada ?? '',
      telefone: org.telefone ?? '',
      ativa: org.ativa,
    });
    setDialogOpen(true);
  };

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((p) => ({ ...p, [field]: e.target.value }));

  const handleSave = async () => {
    if (!editingOrg) return;
    if (!formData.nome.trim() || !formData.codigo.trim()) {
      toast.error('Nome e código são obrigatórios');
      return;
    }
    // NIF da org aparece em documentos/faturação — valida checksum antes de gravar.
    if (formData.nif.trim()) {
      const res = validarNIF(formData.nif.trim());
      if (!res.valid) {
        toast.error(res.message || 'NIF inválido');
        return;
      }
    }

    setSaving(true);

    const { error } = await supabase
      .from('organizacoes')
      .update({
        nome: formData.nome.trim(),
        codigo: formData.codigo.toLowerCase().trim(),
        nif: formData.nif.trim() || null,
        morada: formData.morada.trim() || null,
        telefone: formData.telefone.trim() || null,
        ativa: formData.ativa,
      })
      .eq('id', editingOrg.id);

    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Código já existe' : 'Erro ao atualizar');
    } else {
      toast.success('Organização atualizada');
      setDialogOpen(false);
      fetchOrgs();
    }

    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organizações
        </CardTitle>
        <CardDescription>
          Gerir as organizações do sistema multi-tenant. Para criar uma nova organização, usar a
          página de registo (/registar-org) — só assim a org nasce com conta, cargo e permissões.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>NIF</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>
                  <Users className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="font-medium">{org.nome}</div>
                    {org.morada && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {org.morada}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{org.codigo}</code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{org.nif ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.telefone ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{org._user_count}</TableCell>
                  <TableCell>
                    <Badge variant={org.ativa ? 'default' : 'secondary'}>
                      {org.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(org)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma organização encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Organização</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-nome">Nome *</Label>
                <Input
                  id="org-nome"
                  value={formData.nome}
                  onChange={set('nome')}
                  placeholder="Nome da organização"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-codigo">Código de Login *</Label>
                <Input
                  id="org-codigo"
                  value={formData.codigo}
                  onChange={set('codigo')}
                  placeholder="Ex: decada"
                />
                <p className="text-xs text-muted-foreground">
                  Código que os utilizadores usam no login para identificar a empresa.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="org-nif">NIF</Label>
                <Input
                  id="org-nif"
                  value={formData.nif}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      nif: e.target.value.replace(/\D/g, '').slice(0, 9),
                    }))
                  }
                  placeholder="123456789"
                  inputMode="numeric"
                  maxLength={9}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-morada">Morada</Label>
                <Input
                  id="org-morada"
                  value={formData.morada}
                  onChange={set('morada')}
                  placeholder="Rua, número, código postal, cidade"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-telefone">Telefone</Label>
                <Input
                  id="org-telefone"
                  value={formData.telefone}
                  onChange={set('telefone')}
                  placeholder="+351 000 000 000"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label htmlFor="org-ativa">Ativa</Label>
                <Switch
                  id="org-ativa"
                  checked={formData.ativa}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, ativa: checked }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
