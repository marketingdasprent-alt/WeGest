import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Copy, Power, Eye, FileText } from 'lucide-react';
import type { DocumentTemplate } from '@/types/documentTemplate';

interface DocumentTemplateListProps {
  templates: DocumentTemplate[];
  nomePorEmpresa?: Record<string, string>;
  canEdit?: boolean;
  onEdit: (template: DocumentTemplate) => void;
  onDuplicate: (template: DocumentTemplate) => void;
  onToggleStatus: (template: DocumentTemplate) => void;
  onPreview?: (template: DocumentTemplate) => void;
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const DocumentTemplateList = ({
  templates,
  nomePorEmpresa = {},
  canEdit = true,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onPreview,
}: DocumentTemplateListProps) => {
  const getEmpresaNome = (template: DocumentTemplate) => {
    const key = template.cliente_empresa_id ?? template.empresa_id ?? '';
    return nomePorEmpresa[key] || key || '—';
  };

  if (templates.length === 0) {
    return (
      <div className="border rounded-lg py-12 text-center text-muted-foreground">
        Nenhum template de documento encontrado.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {templates.map((template) => (
        <li
          key={template.id}
          className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-muted/30 transition-colors"
        >
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{template.nome}</p>
              <Badge variant={template.ativo ? 'default' : 'secondary'} className="text-xs">
                {template.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Empresa: {getEmpresaNome(template)} · Versão: {template.versao}
            </p>
            <p className="text-xs text-muted-foreground">
              Criado: {formatDate(template.created_at)} · Atualizado: {formatDate(template.updated_at)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(template)}
                title="Editar"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onPreview && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPreview(template)}
                title="Pré-visualizar"
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDuplicate(template)}
                title="Duplicar"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onToggleStatus(template)}
                title="Ativar/Desativar"
              >
                <Power className="h-4 w-4" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};
