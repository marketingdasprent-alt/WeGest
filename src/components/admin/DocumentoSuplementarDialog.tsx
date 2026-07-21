import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateDocumentoSuplementar,
  useUpdateDocumentoSuplementar,
} from '@/hooks/useDocumentosSuplementares';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import type { DocumentoSuplementarComEmpresas } from '@/types/documentoSuplementar';

interface DocumentoSuplementarDialogProps {
  open: boolean;
  documento: DocumentoSuplementarComEmpresas | null;
  onOpenChange: (open: boolean) => void;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*';

export const DocumentoSuplementarDialog = ({
  open,
  documento,
  onOpenChange,
}: DocumentoSuplementarDialogProps) => {
  const { empresas } = useClientesEmpresas();
  const createMutation = useCreateDocumentoSuplementar();
  const updateMutation = useUpdateDocumentoSuplementar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [empresaIds, setEmpresaIds] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(documento?.nome ?? '');
    setAtivo(documento?.ativo ?? true);
    setEmpresaIds(new Set(documento?.empresaIds ?? []));
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, documento]);

  const toggleEmpresa = (id: string) => {
    setEmpresaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Indique um nome para o documento');
      return;
    }
    if (empresaIds.size === 0) {
      toast.error('Selecione pelo menos uma empresa');
      return;
    }
    if (!documento && !file) {
      toast.error('Selecione um ficheiro');
      return;
    }

    try {
      if (documento) {
        await updateMutation.mutateAsync({
          id: documento.id,
          nome,
          ativo,
          empresaIds: Array.from(empresaIds),
          file: file ?? undefined,
          ficheiroUrlAtual: documento.ficheiro_url,
        });
      } else {
        await createMutation.mutateAsync({ nome, file: file as File, empresaIds: Array.from(empresaIds) });
      }
      onOpenChange(false);
    } catch {
      // Erro já reportado ao utilizador via toast no onError do hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{documento ? 'Editar Documento Suplementar' : 'Novo Documento Suplementar'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome-suplementar">Nome</Label>
            <Input id="nome-suplementar" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Ficheiro</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {file ? file.name : documento ? 'Substituir ficheiro' : 'Escolher ficheiro'}
            </Button>
            <p className="text-xs text-muted-foreground">PDF, Word, Excel, imagem ou texto · máximo 10 MB</p>
          </div>

          <div className="space-y-1.5">
            <Label>Empresas associadas</Label>
            <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto">
              {empresas.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`empresa-suplementar-${e.id}`}
                    checked={empresaIds.has(e.id)}
                    onCheckedChange={() => toggleEmpresa(e.id)}
                  />
                  <label
                    htmlFor={`empresa-suplementar-${e.id}`}
                    className="text-sm cursor-pointer"
                    onClick={() => toggleEmpresa(e.id)}
                  >
                    {e.nome}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label>Ativo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
