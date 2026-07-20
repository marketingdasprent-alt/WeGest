import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validarNIF } from '@/lib/pt-validators';
import { EmpresaImagemUpload } from './EmpresaImagemUpload';

interface FormData {
  nome: string;
  codigo: string;
  nif: string;
  morada: string;
  telefone: string;
  logo_url: string;
}

const emptyForm = (): FormData => ({
  nome: '',
  codigo: '',
  nif: '',
  morada: '',
  telefone: '',
  logo_url: '',
});

export const MinhaOrganizacaoTab: React.FC = () => {
  const { orgId } = useTenant();
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.ADMIN_MINHA_ORGANIZACAO);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());

  const fetchOrg = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('organizacoes')
      .select('nome, codigo, nif, morada, telefone, logo_url')
      .eq('id', orgId)
      .single();

    if (error) {
      console.error('Erro ao carregar organização:', error);
      toast.error('Erro ao carregar dados da organização');
    } else if (data) {
      setForm({
        nome: data.nome ?? '',
        codigo: data.codigo ?? '',
        nif: data.nif ?? '',
        morada: data.morada ?? '',
        telefone: data.telefone ?? '',
        logo_url: data.logo_url ?? '',
      });
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSave = async () => {
    if (!orgId) return;
    if (!form.nome.trim() || !form.codigo.trim()) {
      toast.error('Nome e código são obrigatórios');
      return;
    }
    if (form.nif.trim()) {
      const res = validarNIF(form.nif.trim());
      if (!res.valid) {
        toast.error(res.message || 'NIF inválido');
        return;
      }
    }

    setSaving(true);

    const { error } = await supabase
      .from('organizacoes')
      .update({
        nome: form.nome.trim(),
        codigo: form.codigo.toLowerCase().trim(),
        nif: form.nif.trim() || null,
        morada: form.morada.trim() || null,
        telefone: form.telefone.trim() || null,
        logo_url: form.logo_url.trim() || null,
      })
      .eq('id', orgId);

    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Código já existe' : 'Erro ao atualizar');
    } else {
      toast.success('Organização atualizada');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Minha Organização
        </CardTitle>
        <CardDescription>
          {podeEditar
            ? 'Dados da sua organização. Alterações aqui afetam todos os utilizadores.'
            : 'Dados da sua organização.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="minha-org-nome">Nome</Label>
          {podeEditar ? (
            <Input
              id="minha-org-nome"
              value={form.nome}
              onChange={set('nome')}
              placeholder="Nome da organização"
            />
          ) : (
            <p className="text-sm">{form.nome || '—'}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="minha-org-codigo">Código de Login</Label>
          {podeEditar ? (
            <>
              <Input
                id="minha-org-codigo"
                value={form.codigo}
                onChange={set('codigo')}
                placeholder="Ex: decada"
              />
              <p className="text-xs text-muted-foreground">
                Código que os utilizadores usam no login para identificar a empresa.
              </p>
            </>
          ) : (
            <p className="text-sm">
              <code className="text-xs bg-muted px-2 py-1 rounded">{form.codigo || '—'}</code>
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="minha-org-nif">NIF</Label>
          {podeEditar ? (
            <Input
              id="minha-org-nif"
              value={form.nif}
              onChange={(e) =>
                setForm((p) => ({ ...p, nif: e.target.value.replace(/\D/g, '').slice(0, 9) }))
              }
              placeholder="123456789"
              inputMode="numeric"
              maxLength={9}
            />
          ) : (
            <p className="text-sm">{form.nif || '—'}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="minha-org-morada">Morada</Label>
          {podeEditar ? (
            <Input
              id="minha-org-morada"
              value={form.morada}
              onChange={set('morada')}
              placeholder="Rua, número, código postal, cidade"
            />
          ) : (
            <p className="text-sm">{form.morada || '—'}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="minha-org-telefone">Telefone</Label>
          {podeEditar ? (
            <Input
              id="minha-org-telefone"
              value={form.telefone}
              onChange={set('telefone')}
              placeholder="+351 000 000 000"
            />
          ) : (
            <p className="text-sm">{form.telefone || '—'}</p>
          )}
        </div>

        <Separator />

        {podeEditar ? (
          <EmpresaImagemUpload
            label="Logótipo"
            description="Imagem da organização mostrada no login e outros ecrãs."
            value={form.logo_url}
            onChange={(url) => setForm((p) => ({ ...p, logo_url: url }))}
            prefix="org-logo"
            variant="square"
          />
        ) : (
          <div className="space-y-1.5">
            <Label>Logótipo</Label>
            {form.logo_url ? (
              <div className="h-16 w-16 border border-border rounded bg-card overflow-hidden flex items-center justify-center">
                <img src={form.logo_url} alt="Logótipo" className="h-full w-full object-contain" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        )}

        {podeEditar && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
