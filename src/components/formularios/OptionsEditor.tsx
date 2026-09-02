import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface OptionsEditorProps {
  options: string[] | undefined;
  onChange: (options: string[]) => void;
}

export const OptionsEditor: React.FC<OptionsEditorProps> = ({ options, onChange }) => {
  const handleOptionsChange = (value: string) => {
    const processedOptions = value.split('\n').filter((o) => o.trim() !== '');
    onChange(processedOptions);
  };

  return (
    <div>
      <Label>Opções (uma por linha)</Label>
      <Textarea
        value={options?.join('\n') || ''}
        onChange={(e) => handleOptionsChange(e.target.value)}
        className="min-h-[120px] resize-none font-mono"
        placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
        rows={6}
      />
      <p className="text-xs text-muted-foreground mt-2">
        Digite cada opção em uma linha separada. Pressione Enter para criar uma nova linha.
      </p>
    </div>
  );
};
