import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  GripVertical,
  Trash2,
  Type,
  Mail,
  Phone,
  Calendar,
  FileText,
  ToggleLeft,
  type LucideIcon,
} from 'lucide-react';
import { FormField } from './DynamicFieldEditor';
import { FieldEditor } from './FieldEditor';

interface FieldCardProps {
  field: FormField;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<FormField>) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

/**
 * Um ícone para CADA tipo de campo — o `Record` obriga-o.
 *
 * Faltava aqui o `phone` ("Telefone (com código país)"), que o selector de
 * tipos oferece na mesma: escolher esse tipo devolvia `undefined` e a página
 * inteira ia abaixo com o React error #130 ("Element type is invalid"), a
 * mostrar o ecrã de erro em vez do criador de formulários.
 *
 * Com `Record<FormField['type'], LucideIcon>`, acrescentar um tipo novo sem
 * lhe dar ícone passa a partir a compilação — deixa de poder chegar a
 * produção em silêncio.
 */
const fieldTypeIcons: Record<FormField['type'], LucideIcon> = {
  text: Type,
  email: Mail,
  tel: Phone,
  phone: Phone,
  textarea: FileText,
  select: ToggleLeft,
  date: Calendar,
  checkbox: ToggleLeft,
  radio: ToggleLeft,
};

export const FieldCard: React.FC<FieldCardProps> = ({
  field,
  isEditing,
  onEdit,
  onDelete,
  onUpdate,
  dragHandleProps,
}) => {
  // Cinto e suspensórios: os campos já gravados vêm da base de dados, onde o
  // `type` é texto livre. Um valor que o TypeScript não conhece não pode
  // voltar a deitar o ecrã abaixo.
  const IconComponent = fieldTypeIcons[field.type] ?? Type;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-foreground">
          <div className="flex items-center gap-3">
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing touch-none">
              <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            <IconComponent className="h-4 w-4 text-primary" />
            <span className="text-sm">{field.label}</span>
            {field.required && <span className="text-red-500 text-xs">*</span>}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground"
            >
              {isEditing ? 'Fechar' : 'Editar'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-destructive hover:text-destructive/80"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {isEditing && <FieldEditor field={field} onUpdate={onUpdate} />}
    </Card>
  );
};
