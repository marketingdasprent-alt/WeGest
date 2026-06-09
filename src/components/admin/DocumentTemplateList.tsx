import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Copy, Power } from 'lucide-react';

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string | null;
  cliente_empresa_id?: string | null;
  template_data: any;
  campos_dinamicos: any;
  ativo: boolean;
  versao: number;
  created_at: string;
  updated_at: string;
}

interface DocumentTemplateListProps {
  templates: DocumentTemplate[];
  nomePorEmpresa?: Record<string, string>;
  onEdit: (template: DocumentTemplate) => void;
  onDuplicate: (template: DocumentTemplate) => void;
  onToggleStatus: (template: DocumentTemplate) => void;
}

export const DocumentTemplateList = ({
  templates,
  nomePorEmpresa = {},
  onEdit,
  onDuplicate,
  onToggleStatus,
}: DocumentTemplateListProps) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEmpresaNome = (template: DocumentTemplate) => {
    const key = template.cliente_empresa_id ?? template.empresa_id ?? '';
    return nomePorEmpresa[key] || key || '—';
  };

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Nenhum template de documento encontrado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-xl">{template.nome}</CardTitle>
                <CardDescription className="mt-2">
                  <div className="flex flex-col gap-1">
                    <span>Empresa: {getEmpresaNome(template)}</span>
                    <span>Versão: {template.versao}</span>
                  </div>
                </CardDescription>
              </div>
              <Badge variant={template.ativo ? 'default' : 'secondary'}>
                {template.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <p>Criado: {formatDate(template.created_at)}</p>
                <p>Atualizado: {formatDate(template.updated_at)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(template)}
                  className="flex-1"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => onDuplicate(template)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => onToggleStatus(template)}>
                  <Power className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
