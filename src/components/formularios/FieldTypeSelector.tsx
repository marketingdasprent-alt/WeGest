import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FormField } from './DynamicFieldEditor';

interface FieldTypeSelectorProps {
  value: FormField['type'];
  onChange: (value: FormField['type']) => void;
}

export const FieldTypeSelector: React.FC<FieldTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div>
      <Label>Tipo de Campo</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="text">Texto</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="tel">Telefone (simples)</SelectItem>
          <SelectItem value="phone">Telefone (com código país)</SelectItem>
          <SelectItem value="textarea">Área de Texto</SelectItem>
          <SelectItem value="select">Lista de Opções</SelectItem>
          <SelectItem value="date">Data</SelectItem>
          <SelectItem value="checkbox">Checkbox</SelectItem>
          <SelectItem value="radio">Botões de Rádio</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
