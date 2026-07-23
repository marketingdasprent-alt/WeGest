import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Tag, Calendar, Link, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { DeleteFormularioDialog } from './DeleteFormularioDialog';

interface Formulario {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  campos: any[];
  configuracoes: any;
  created_at: string;
  updated_at: string;
  campanhas?: string[];
}

interface FormularioCardProps {
  formulario: Formulario;
  onEdit: (formulario: Formulario) => void;
  onToggleAtivo: (id: string, ativo: boolean) => void;
  onDelete: (id: string) => void;
  /** Só admins podem gerir formulários (criar/editar/ativar/eliminar) — ver RLS da tabela `formularios`. */
  podeGerir: boolean;
}

export const FormularioCard: React.FC<FormularioCardProps> = ({
  formulario,
  onEdit,
  onToggleAtivo,
  onDelete,
  podeGerir,
}) => {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'bg-green-500/20 text-green-300 border-green-500/30',
      'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'bg-orange-500/20 text-orange-300 border-orange-500/30',
      'bg-pink-500/20 text-pink-300 border-pink-500/30',
      'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    ];

    const hash = tag.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return colors[Math.abs(hash) % colors.length];
  };

  const copyFormLink = () => {
    const formLink = `${window.location.origin}/formulario/${formulario.id}`;
    navigator.clipboard.writeText(formLink);
    toast({
      title: 'Link copiado!',
      description: 'O link do formulário foi copiado para a área de transferência',
    });
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    onDelete(formulario.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Card
        className={`bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm transition-all duration-300 ${
          formulario.ativo
            ? 'hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/10'
            : 'opacity-75'
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg font-semibold truncate">
              {formulario.nome}
            </CardTitle>
            <div className="flex items-center gap-2">
              {podeGerir && (
                <Switch
                  checked={formulario.ativo}
                  onCheckedChange={() => onToggleAtivo(formulario.id, formulario.ativo)}
                  className="data-[state=checked]:bg-green-500"
                />
              )}
              <Badge
                variant={formulario.ativo ? 'default' : 'secondary'}
                className={
                  formulario.ativo
                    ? 'bg-green-500/20 text-green-300 border-green-500/30'
                    : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                }
              >
                {formulario.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </div>
          {formulario.descricao && (
            <p className="text-gray-400 text-sm mt-2 line-clamp-2">{formulario.descricao}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Link do Formulário */}
          <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-gray-300">Link de Divulgação</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={copyFormLink}
                className="border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1 truncate">/formulario/{formulario.id}</p>
          </div>

          {/* Campanhas Associadas */}
          {formulario.campanhas && formulario.campanhas.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-400">Campanhas</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {formulario.campanhas.slice(0, 3).map((campanha) => (
                  <Badge
                    key={campanha}
                    className={`${getTagColor(campanha)} px-2 py-1 text-xs border`}
                  >
                    {campanha}
                  </Badge>
                ))}
                {formulario.campanhas.length > 3 && (
                  <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/30 px-2 py-1 text-xs">
                    +{formulario.campanhas.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Data de Criação */}
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <Calendar className="h-3 w-3" />
            <span>
              Criado em {format(new Date(formulario.created_at), 'dd/MM/yyyy', { locale: pt })}
            </span>
          </div>

          {/* Ações */}
          {podeGerir && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(formulario)}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-yellow-500 hover:border-yellow-500/50"
              >
                <Edit className="h-3 w-3 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteClick}
                className="border-red-600/50 text-red-400 hover:bg-red-600/10 hover:border-red-500"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteFormularioDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        formularioNome={formulario.nome}
      />
    </>
  );
};
