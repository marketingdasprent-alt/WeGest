import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Bucket de storage reaproveitado do editor de templates (DocumentTemplateEditor)
// — mesma política de acesso (admin), evita criar um bucket novo só para isto.
const uploadImagem = async (file: File, prefix: string): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    toast.error('Utilizador não autenticado');
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    toast.error('Apenas administradores podem fazer upload de imagens');
    return null;
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${prefix}-${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage.from('document-templates').upload(fileName, file);
  if (error) {
    if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
      toast.error('Erro de permissão RLS. Verifique se você é administrador.');
    } else {
      toast.error(`Erro ao fazer upload: ${error.message || 'Erro desconhecido'}`);
    }
    return null;
  }

  const { data: urlData } = supabase.storage.from('document-templates').getPublicUrl(fileName);
  return urlData.publicUrl;
};

interface EmpresaImagemUploadProps {
  label: string;
  description: string;
  value: string;
  onChange: (url: string) => void;
  /** Prefixo do nome do ficheiro no bucket (só para legibilidade na listagem). */
  prefix: string;
  /** 'wide' para o papel timbrado (fundo A4), 'square' para o logótipo. */
  variant?: 'wide' | 'square';
}

/** Upload de uma imagem (papel timbrado / logótipo) associada a uma empresa
 *  emissora, com pré-visualização e botões Alterar/Remover. */
export const EmpresaImagemUpload: React.FC<EmpresaImagemUploadProps> = ({
  label,
  description,
  value,
  onChange,
  prefix,
  variant = 'wide',
}) => {
  const [uploading, setUploading] = useState(false);

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const url = await uploadImagem(file, prefix);
        if (url) {
          onChange(url);
          toast.success('Imagem carregada com sucesso!');
        }
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      {value ? (
        <div className="space-y-2">
          <div
            className={
              variant === 'square'
                ? 'h-16 w-16 border border-border rounded bg-card overflow-hidden flex items-center justify-center'
                : 'w-full max-h-40 border border-border rounded bg-card overflow-y-auto'
            }
          >
            <img
              src={value}
              alt={label}
              className={
                variant === 'square' ? 'h-full w-full object-contain' : 'w-full object-contain'
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={uploading}
              onClick={pick}
            >
              <Upload className="mr-2 h-3 w-3" />
              Alterar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => onChange('')}
            >
              <Trash2 className="mr-2 h-3 w-3" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={uploading}
          onClick={pick}
        >
          <ImageIcon className="mr-2 h-4 w-4" />
          {uploading ? 'A carregar...' : 'Fazer upload'}
        </Button>
      )}
    </div>
  );
};
