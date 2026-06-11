import { useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { AdminLoadingState } from '@/components/admin/AdminLoadingState';
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied';
import { DocumentTemplateList } from '@/components/admin/DocumentTemplateList';
import { DocumentTemplateEditor } from '@/components/admin/DocumentTemplateEditor';
import { DocumentTemplatePreviewDialog } from '@/components/admin/DocumentTemplatePreviewDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
  template_data: any;
  campos_dinamicos: any;
  papel_timbrado_url?: string | null;
  ativo: boolean;
  versao: number;
  created_at: string;
  updated_at: string;
}

const AdminDocumentos = () => {
  const { isAdmin, hasAccessToResource, loading: adminLoading } = usePermissions();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);

  useEffect(() => {
    if (
      isAdmin ||
      hasAccessToResource('admin_documentos') ||
      hasAccessToResource('admin_documentos_preview')
    ) {
      fetchTemplates();
    }
  }, [isAdmin, hasAccessToResource]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('empresa_id', { ascending: true })
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
        empresa_id: template.empresa_id,
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

  if (adminLoading || loading) {
    return <AdminLoadingState message="A carregar documentos..." />;
  }

  const hasFullAccess = isAdmin || hasAccessToResource('admin_documentos');
  const hasPreviewAccess = hasFullAccess || hasAccessToResource('admin_documentos_preview');

  if (!hasPreviewAccess) {
    return <AdminAccessDenied />;
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Documentos</h1>
          <p className="text-muted-foreground mt-1">Gerir templates de contratos e documentos</p>
        </div>
        {hasFullAccess && (
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Template
          </Button>
        )}
      </div>

      {isEditorOpen && hasFullAccess ? (
        <DocumentTemplateEditor
          template={selectedTemplate}
          onSave={handleSave}
          onCancel={() => {
            setIsEditorOpen(false);
            setSelectedTemplate(null);
          }}
        />
      ) : (
        <DocumentTemplateList
          templates={templates}
          canEdit={hasFullAccess}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onToggleStatus={handleToggleStatus}
          onPreview={(t) => setPreviewTemplate(t)}
        />
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

export default AdminDocumentos;
