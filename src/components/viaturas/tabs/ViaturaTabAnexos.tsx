import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Paperclip, Loader2, Trash2, Eye, Download, FileText, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface Documento {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
  observacoes: string | null;
  created_at: string;
}

interface ViaturaTabAnexosProps {
  viaturaId: string | undefined;
}

// Documentos que são geridos em outras tabs
const EXCLUDED_TIPOS = [
  'dua',
  'dua_frente',
  'dua_verso',
  'dav',
  'ac',
  'ipo',
  'carta_verde',
  'contrato_obe',
];

export function ViaturaTabAnexos({ viaturaId }: ViaturaTabAnexosProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataValidade, setDataValidade] = useState('');

  useEffect(() => {
    if (viaturaId) {
      loadDocumentos();
    }
  }, [viaturaId]);

  const loadDocumentos = async () => {
    if (!viaturaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viatura_documentos')
        .select('*')
        .eq('viatura_id', viaturaId)
        .not('tipo_documento', 'in', `(${EXCLUDED_TIPOS.join(',')})`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocumentos(data || []);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
      toast.error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!viaturaId || !selectedFile) {
      toast.error('Selecione um ficheiro');
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const tipo = tipoDocumento.trim() || 'outros';
      const fileName = `${viaturaId}/${tipo}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('viatura-documentos')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { error } = await supabase.from('viatura_documentos').insert({
        viatura_id: viaturaId,
        tipo_documento: tipo,
        ficheiro_url: fileName,
        nome_ficheiro: selectedFile.name,
        data_validade: dataValidade || null,
        observacoes: observacoes.trim() || null,
      });

      if (error) throw error;

      toast.success('Documento anexado com sucesso!');
      setDialogOpen(false);
      resetForm();
      loadDocumentos();
    } catch (error) {
      console.error('Erro ao anexar documento:', error);
      toast.error('Erro ao anexar documento');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: Documento) => {
    try {
      const { data, error } = await supabase.storage
        .from('viatura-documentos')
        .createSignedUrl(doc.ficheiro_url, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar documento:', error);
      toast.error('Erro ao visualizar documento');
    }
  };

  const handleDownload = async (doc: Documento) => {
    try {
      const { data, error } = await supabase.storage
        .from('viatura-documentos')
        .download(doc.ficheiro_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nome_ficheiro || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao descarregar documento:', error);
      toast.error('Erro ao descarregar documento');
    }
  };

  const handleDelete = async (doc: Documento) => {
    if (!podeEditar) return;
    if (!confirm('Tem certeza que deseja eliminar este documento?')) return;

    try {
      await supabase.storage.from('viatura-documentos').remove([doc.ficheiro_url]);

      const { error } = await supabase.from('viatura_documentos').delete().eq('id', doc.id);

      if (error) throw error;
      toast.success('Documento eliminado!');
      loadDocumentos();
    } catch (error) {
      console.error('Erro ao eliminar documento:', error);
      toast.error('Erro ao eliminar documento');
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setTipoDocumento('');
    setObservacoes('');
    setDataValidade('');
  };

  const getFileIcon = (filename: string | null) => {
    if (!filename) return <File className="h-5 w-5" />;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || ''))
      return <FileText className="h-5 w-5 text-blue-500" />;
    return <File className="h-5 w-5" />;
  };

  if (!viaturaId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para anexar documentos.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Outros Anexos
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Anexo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Anexar Documento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>
                  Ficheiro <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label htmlFor="tipo">Tipo de Documento</Label>
                <Input
                  id="tipo"
                  placeholder="Ex: Orçamento, Relatório, Recibo..."
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="validade">Data de Validade (opcional)</Label>
                <Input
                  id="validade"
                  type="date"
                  value={dataValidade}
                  onChange={(e) => setDataValidade(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="observacoes">Observações</Label>
                <Input
                  id="observacoes"
                  placeholder="Notas adicionais..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
                  {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Anexar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documentos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum documento anexado.</p>
            <p className="text-sm">Clique em "Novo Anexo" para adicionar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documentos.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 border rounded-lg p-3">
                <div className="flex items-center justify-center w-10 h-10 bg-muted rounded">
                  {getFileIcon(doc.nome_ficheiro)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.nome_ficheiro || 'Documento'}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {doc.tipo_documento}
                    </Badge>
                    <span>{format(new Date(doc.created_at), 'dd/MM/yyyy')}</span>
                    {doc.data_validade && (
                      <span>• Validade: {format(new Date(doc.data_validade), 'dd/MM/yyyy')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleView(doc)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDownload(doc)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {podeEditar && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
