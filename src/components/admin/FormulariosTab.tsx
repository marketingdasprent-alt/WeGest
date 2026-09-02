import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FormularioCard } from '@/components/formularios/FormularioCard';
import { CreateFormularioDialog } from '@/components/formularios/CreateFormularioDialog';
import { EditFormularioDialog } from '@/components/formularios/EditFormularioDialog';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

interface Formulario {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  campos: any;
  configuracoes: any;
  created_at: string;
  updated_at: string;
  campanhas?: string[];
}

export const FormulariosTab = () => {
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingFormulario, setEditingFormulario] = useState<Formulario | null>(null);
  const { toast } = useToast();
  // Só admins gerem formulários (a RLS da tabela `formularios` exige-o).
  const { isAdmin } = usePermissions();

  useEffect(() => {
    fetchFormularios();
  }, []);

  const fetchFormularios = async () => {
    try {
      setLoading(true);
      const { data: formularios, error: formError } = await supabase
        .from('formularios')
        .select('*')
        .order('created_at', { ascending: false });

      if (formError) throw formError;

      // Campanhas de todos os formulários numa única query (evita N+1).
      const ids = (formularios || []).map((f) => f.id);
      const campanhasPorForm = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: campanhas } = await supabase
          .from('formulario_campanhas')
          .select('formulario_id, campanha_tag')
          .in('formulario_id', ids);
        for (const c of campanhas ?? []) {
          const arr = campanhasPorForm.get(c.formulario_id) ?? [];
          arr.push(c.campanha_tag);
          campanhasPorForm.set(c.formulario_id, arr);
        }
      }

      const formulariosComCampanhas = (formularios || []).map((form) => ({
        ...form,
        configuracoes: {},
        campanhas: campanhasPorForm.get(form.id) ?? [],
      })) as Formulario[];

      setFormularios(formulariosComCampanhas);
    } catch (error) {
      console.error('Erro ao carregar formulários:', error);
      toast({
        title: 'Erro ao carregar formulários',
        description: 'Não foi possível carregar a lista de formulários.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSave = async (formData: any) => {
    try {
      const { data: formulario, error } = await supabase
        .from('formularios')
        .insert({
          nome: formData.nome,
          descricao: formData.descricao,
          ativo: formData.ativo,
          campos: formData.campos,
        })
        .select()
        .single();

      if (error) throw error;

      if (formData.campanhas?.length > 0) {
        const campanhasInsert = formData.campanhas.map((tag: string) => ({
          formulario_id: formulario.id,
          campanha_tag: tag,
        }));

        await supabase.from('formulario_campanhas').insert(campanhasInsert);
      }

      toast({
        title: 'Formulário criado',
        description: 'O formulário foi criado com sucesso.',
      });

      setIsCreateDialogOpen(false);
      fetchFormularios();
    } catch (error) {
      console.error('Erro ao criar formulário:', error);
      toast({
        title: 'Erro ao criar formulário',
        description: 'Não foi possível criar o formulário.',
        variant: 'destructive',
      });
    }
  };

  const handleEditSave = async (id: string, formData: any) => {
    try {
      const { error } = await supabase
        .from('formularios')
        .update({
          nome: formData.nome,
          descricao: formData.descricao,
          ativo: formData.ativo,
          campos: formData.campos,
        })
        .eq('id', id);

      if (error) throw error;

      await supabase.from('formulario_campanhas').delete().eq('formulario_id', id);

      if (formData.campanhas?.length > 0) {
        const campanhasInsert = formData.campanhas.map((tag: string) => ({
          formulario_id: id,
          campanha_tag: tag,
        }));

        await supabase.from('formulario_campanhas').insert(campanhasInsert);
      }

      toast({
        title: 'Formulário atualizado',
        description: 'O formulário foi atualizado com sucesso.',
      });

      setEditingFormulario(null);
      fetchFormularios();
    } catch (error) {
      console.error('Erro ao atualizar formulário:', error);
      toast({
        title: 'Erro ao atualizar formulário',
        description: 'Não foi possível atualizar o formulário.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('formularios').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Formulário eliminado',
        description: 'O formulário foi eliminado com sucesso.',
      });

      fetchFormularios();
    } catch (error) {
      console.error('Erro ao eliminar formulário:', error);
      toast({
        title: 'Erro ao eliminar formulário',
        description: 'Não foi possível eliminar o formulário.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('formularios')
        .update({ ativo: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: currentStatus ? 'Formulário desativado' : 'Formulário ativado',
        description: `O formulário foi ${currentStatus ? 'desativado' : 'ativado'} com sucesso.`,
      });

      fetchFormularios();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro ao atualizar status',
        description: 'Não foi possível atualizar o status do formulário.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Formulários Personalizados</h2>
          <p className="text-muted-foreground mt-1">
            Criar e gerir formulários para captura de leads
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Formulário
        </Button>
      </div>

      {formularios.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Nenhum formulário criado ainda</p>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Primeiro Formulário
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {formularios.map((formulario) => (
            <FormularioCard
              key={formulario.id}
              formulario={formulario}
              onEdit={() => setEditingFormulario(formulario)}
              onDelete={() => handleDelete(formulario.id)}
              onToggleAtivo={() => handleToggleActive(formulario.id, formulario.ativo)}
              podeGerir={isAdmin}
            />
          ))}
        </div>
      )}

      <CreateFormularioDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSave={handleCreateSave}
      />

      {editingFormulario && (
        <EditFormularioDialog
          isOpen={!!editingFormulario}
          onClose={() => setEditingFormulario(null)}
          formulario={editingFormulario}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
};
