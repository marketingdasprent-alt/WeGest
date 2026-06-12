import { useState, useEffect } from 'react';
import { DocumentTemplateList } from '@/components/admin/DocumentTemplateList';
import { DocumentTemplateEditor } from '@/components/admin/DocumentTemplateEditor';
import { DocumentTemplatePreviewDialog } from '@/components/admin/DocumentTemplatePreviewDialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import type { DocumentTemplate } from '@/types/documentTemplate';

export const DocumentosTab = () => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas');
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const { empresas } = useClientesEmpresas();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('cliente_empresa_id', { ascending: true })
        .order('versao', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
      toast.error('Erro ao carregar templates de documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setIsEditorOpen(true);
  };

  const handleNew = () => {
    setSelectedTemplate(null);
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    await fetchTemplates();
    setIsEditorOpen(false);
    setSelectedTemplate(null);
  };

  const handleDuplicate = async (template: DocumentTemplate) => {
    try {
      const { error } = await supabase.from('document_templates').insert({
        nome: `${template.nome} (Cópia)`,
        tipo: template.tipo,
        cliente_empresa_id: template.cliente_empresa_id,
        template_data: template.template_data,
        campos_dinamicos: template.campos_dinamicos,
        ativo: false,
        versao: 1,
      });

      if (error) throw error;
      toast.success('Template duplicado com sucesso');
      fetchTemplates();
    } catch (error) {
      console.error('Erro ao duplicar template:', error);
      toast.error('Erro ao duplicar template');
    }
  };

  const handleToggleStatus = async (template: DocumentTemplate) => {
    try {
      const { error } = await supabase
        .from('document_templates')
        .update({ ativo: !template.ativo })
        .eq('id', template.id);

      if (error) throw error;
      toast.success(`Template ${template.ativo ? 'desativado' : 'ativado'} com sucesso`);
      fetchTemplates();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status do template');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar documentos...</div>
      </div>
    );
  }

  const nomePorEmpresa: Record<string, string> = Object.fromEntries(
    empresas.map((e) => [e.id, e.nome])
  );
  const templatesFiltrados =
    filtroEmpresa === 'todas'
      ? templates
      : templates.filter((t) => t.cliente_empresa_id === filtroEmpresa);

  return (
    <div className="space-y-6">
      {isEditorOpen ? (
        <DocumentTemplateEditor
          template={selectedTemplate}
          onSave={handleSave}
          onCancel={() => {
            setIsEditorOpen(false);
            setSelectedTemplate(null);
          }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Templates de Documentos</h2>
              <p className="text-muted-foreground mt-1">
                Gerir templates de contratos e outros documentos
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleNew} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Novo Template
              </Button>
            </div>
          </div>

          <DocumentTemplateList
            templates={templatesFiltrados}
            nomePorEmpresa={nomePorEmpresa}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
            onPreview={(t) => setPreviewTemplate(t)}
          />
        </>
      )}
      <DocumentTemplatePreviewDialog
        template={previewTemplate}
        open={!!previewTemplate}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplate(null);
        }}
      />
    </div>
  );
};
