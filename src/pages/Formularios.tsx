import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FormularioCard } from '@/components/formularios/FormularioCard';
import { CreateFormularioDialog } from '@/components/formularios/CreateFormularioDialog';
import { EditFormularioDialog } from '@/components/formularios/EditFormularioDialog';
import { Button } from '@/components/ui/button';
import { Plus, FileText, Loader2 } from 'lucide-react';
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

const Formularios = () => {
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingFormulario, setEditingFormulario] = useState<Formulario | null>(null);
  const { toast } = useToast();
  const { isAdmin } = usePermissions();

  useEffect(() => {
    fetchFormularios();
  }, []);

  const createDefaultFormulario = async () => {
    try {
      // Verificar se já existe um formulário geral
      const { data: existingForm } = await supabase
        .from('formularios')
        .select('id')
        .eq('nome', 'Formulário Geral')
        .single();

      if (existingForm) return;

      // Criar o formulário geral com os campos da landing page
      const defaultFields = [
        {
          id: 'nomeCompleto',
          type: 'text',
          label: 'Nome Completo',
          placeholder: 'Digite seu nome completo',
          required: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email Corporativo',
          placeholder: 'seu.email@empresa.com',
          required: true,
        },
        {
          id: 'telefone',
          type: 'tel',
          label: 'Telefone/WhatsApp',
          placeholder: '+351 xxx xxx xxx',
          required: true,
        },
        {
          id: 'zona',
          type: 'select',
          label: 'Zona de Residência',
          placeholder: 'Selecione sua região',
          required: true,
          options: [
            'Lisboa e Vale do Tejo',
            'Porto e Norte',
            'Centro de Portugal',
            'Alentejo',
            'Algarve',
            'Açores',
            'Madeira',
          ],
        },
        {
          id: 'tipoViatura',
          type: 'select',
          label: 'Tipo de Viatura',
          placeholder: 'Selecione o tipo de viatura',
          required: true,
          options: ['Comercial', 'Passageiros'],
        },
        {
          id: 'dataAluguer',
          type: 'date',
          label: 'Data Pretendida para Aluguer',
          placeholder: 'Selecionar data',
          required: true,
        },
        {
          id: 'observacoes',
          type: 'textarea',
          label: 'Observações (Opcional)',
          placeholder:
            'Adicione qualquer informação adicional que possa ser útil para personalizar sua experiência...',
          required: false,
        },
      ];

      const { data: formulario, error } = await supabase
        .from('formularios')
        .insert({
          nome: 'Formulário Geral',
          descricao: 'Formulário padrão para captura de leads na página inicial',
          ativo: true,
          campos: defaultFields,
        })
        .select()
        .single();

      if (error) throw error;

      // Adicionar a campanha "Geral"
      await supabase.from('formulario_campanhas').insert({
        formulario_id: formulario.id,
        campanha_tag: 'Geral',
      });
    } catch (error) {
      console.error('Erro ao criar formulário padrão:', error);
    }
  };

  const fetchFormularios = async () => {
    try {
      // Criar formulário padrão se necessário
      await createDefaultFormulario();

      const { data: formulariosData, error } = await supabase
        .from('formularios')
        .select('id, nome, descricao, ativo, campos, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Campanhas de TODOS os formulários numa única query (evita N+1: antes
      // era uma query por formulário dentro de um Promise.all).
      const ids = (formulariosData || []).map((f) => f.id);
      const campanhasPorForm = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: campanhas, error: campanhasError } = await supabase
          .from('formulario_campanhas')
          .select('formulario_id, campanha_tag')
          .in('formulario_id', ids);
        if (campanhasError) {
          console.error('Erro ao buscar campanhas:', campanhasError);
        } else {
          for (const c of campanhas ?? []) {
            const arr = campanhasPorForm.get(c.formulario_id) ?? [];
            arr.push(c.campanha_tag);
            campanhasPorForm.set(c.formulario_id, arr);
          }
        }
      }

      const formulariosWithCampanhas = (formulariosData || []).map((formulario) => ({
        ...formulario,
        campanhas: campanhasPorForm.get(formulario.id) ?? [],
        configuracoes: {},
      }));

      setFormularios(formulariosWithCampanhas);
    } catch (error) {
      console.error('Erro ao carregar formulários:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar formulários',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFormulario = async (formData: any) => {
    try {
      const { data: formulario, error } = await supabase
        .from('formularios')
        .insert({
          nome: formData.nome,
          descricao: formData.descricao,
          ativo: formData.ativo,
          campos: formData.campos || [],
        })
        .select()
        .single();

      if (error) throw error;

      // Adicionar campanhas associadas
      if (formData.campanhas && formData.campanhas.length > 0) {
        const campanhasData = formData.campanhas.map((campanha: string) => ({
          formulario_id: formulario.id,
          campanha_tag: campanha,
        }));

        const { error: campanhasError } = await supabase
          .from('formulario_campanhas')
          .insert(campanhasData);

        if (campanhasError) throw campanhasError;
      }

      await fetchFormularios();
      toast({
        title: 'Sucesso',
        description: 'Formulário criado com sucesso',
      });
    } catch (error) {
      console.error('Erro ao criar formulário:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao criar formulário',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateFormulario = async (id: string, formData: any) => {
    try {
      const { error } = await supabase
        .from('formularios')
        .update({
          nome: formData.nome,
          descricao: formData.descricao,
          ativo: formData.ativo,
          campos: formData.campos || [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Atualizar campanhas associadas
      await supabase.from('formulario_campanhas').delete().eq('formulario_id', id);

      if (formData.campanhas && formData.campanhas.length > 0) {
        const campanhasData = formData.campanhas.map((campanha: string) => ({
          formulario_id: id,
          campanha_tag: campanha,
        }));

        const { error: campanhasError } = await supabase
          .from('formulario_campanhas')
          .insert(campanhasData);

        if (campanhasError) throw campanhasError;
      }

      await fetchFormularios();
      toast({
        title: 'Sucesso',
        description: 'Formulário atualizado com sucesso',
      });
    } catch (error) {
      console.error('Erro ao atualizar formulário:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar formulário',
        variant: 'destructive',
      });
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('formularios')
        .update({
          ativo: !ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      await fetchFormularios();
      toast({
        title: 'Sucesso',
        description: `Formulário ${!ativo ? 'ativado' : 'desativado'} com sucesso`,
      });
    } catch (error) {
      console.error('Erro ao alterar status do formulário:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao alterar status do formulário',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteFormulario = async (id: string) => {
    if (!isAdmin) return;
    try {
      // Primeiro apenas remover as referências do formulário nos leads (definir como null)
      const { error: leadsError } = await supabase
        .from('leads_dasprent')
        .update({ formulario_id: null })
        .eq('formulario_id', id);

      if (leadsError) throw leadsError;

      // Depois deletar as campanhas associadas
      const { error: campanhasError } = await supabase
        .from('formulario_campanhas')
        .delete()
        .eq('formulario_id', id);

      if (campanhasError) throw campanhasError;

      // Por fim deletar o formulário
      const { error } = await supabase.from('formularios').delete().eq('id', id);

      if (error) throw error;

      await fetchFormularios();
      toast({
        title: 'Sucesso',
        description: 'Formulário excluído com sucesso. Os leads associados foram preservados.',
      });
    } catch (error) {
      console.error('Erro ao excluir formulário:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir formulário',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-white text-lg">Carregando formulários...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />

      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-gradient-to-r from-primary/20 to-primary/30 border border-primary/30">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Gestão de Formulários</h1>
                <p className="text-gray-400 mt-1">
                  Crie e gerencie formulários para suas campanhas
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Formulário
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total de Formulários</p>
                  <p className="text-white text-2xl font-bold">{formularios.length}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Formulários Ativos</p>
                  <p className="text-white text-2xl font-bold">
                    {formularios.filter((f) => f.ativo).length}
                  </p>
                </div>
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border border-gray-700/50 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Formulários Inativos</p>
                  <p className="text-white text-2xl font-bold">
                    {formularios.filter((f) => !f.ativo).length}
                  </p>
                </div>
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
              </div>
            </div>
          </div>

          {/* Lista de Formulários */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {formularios.map((formulario) => (
              <FormularioCard
                key={formulario.id}
                formulario={formulario}
                onEdit={(formulario) => setEditingFormulario(formulario)}
                onToggleAtivo={handleToggleAtivo}
                onDelete={handleDeleteFormulario}
                podeGerir={isAdmin}
              />
            ))}
          </div>

          {formularios.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Nenhum formulário encontrado
              </h3>
              <p className="text-gray-400 mb-4">
                Crie seu primeiro formulário para começar a capturar leads
              </p>
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Formulário
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateFormularioDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSave={handleCreateFormulario}
      />

      <EditFormularioDialog
        formulario={editingFormulario}
        isOpen={!!editingFormulario}
        onClose={() => setEditingFormulario(null)}
        onSave={handleUpdateFormulario}
      />
    </div>
  );
};

export default Formularios;
