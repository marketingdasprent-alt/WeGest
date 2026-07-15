import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RichTextEditorRef } from './RichTextEditor';
// Editor TipTap (~380KB) carregado só quando o editor de template é usado (lazy).
const RichTextEditor = lazy(() =>
  import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor }))
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCamposDinamicos } from '@/hooks/useCamposDinamicos';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { categoriasOrdenadas, labelCategoria, type BaseCategoria } from '@/lib/camposDinamicos';
import { TIPO_TEMPLATE_OPTIONS, type DocumentTemplate } from '@/types/documentTemplate';

const CATEGORIA_EMOJI: Record<BaseCategoria, string> = {
  motorista: '👤',
  cliente: '👥',
  empresa: '🏢',
  viatura: '🚗',
  contrato: '📄',
  danos: '🛠️',
};

interface DocumentTemplateEditorProps {
  template: DocumentTemplate | null;
  onSave: () => void;
  onCancel: () => void;
}

export const DocumentTemplateEditor = ({
  template,
  onSave,
  onCancel,
}: DocumentTemplateEditorProps) => {
  const [nome, setNome] = useState(template?.nome || '');
  const { empresas } = useClientesEmpresas();
  const [empresaId, setEmpresaId] = useState(
    template?.cliente_empresa_id || template?.empresa_id || ''
  );
  const [tipo, setTipo] = useState(template?.tipo || 'contrato_tvde');
  const [ativo, setAtivo] = useState(template?.ativo ?? true);
  const [conteudoCompleto, setConteudoCompleto] = useState('');
  const [papelTimbradoUrl, setPapelTimbradoUrl] = useState(template?.papel_timbrado_url || '');
  // Margens superior/inferior (mm) só usadas quando há papel timbrado.
  // Permitem ajustar o documento por template (cada timbrado tem logo/faixa
  // de altura diferente). Defaults globais: 50/38 (seguros). Baixar num
  // template específico quando o seu conteúdo precisa de caber numa só página.
  const [topMargin, setTopMargin] = useState<number>(
    typeof template?.template_data?.topMargin === 'number' ? template.template_data.topMargin : 50
  );
  const [bottomMargin, setBottomMargin] = useState<number>(
    typeof template?.template_data?.bottomMargin === 'number'
      ? template.template_data.bottomMargin
      : 38
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const editorRef = useRef<RichTextEditorRef>(null);

  // Se for novo template e ainda não tiver empresa seleccionada, usar a primeira disponível.
  // Depende intencionalmente só de `empresas` — não queremos re-executar quando empresaId muda.

  useEffect(() => {
    if (!template && !empresaId && empresas.length > 0) {
      setEmpresaId(empresas[0].id);
    }
  }, [empresas]);

  useEffect(() => {
    if (template) {
      setTipo(template.tipo || 'contrato_tvde');
      let content = '';

      if (template?.template_data?.conteudo) {
        content = template.template_data.conteudo;
      } else if (template?.template_data?.secoes) {
        // Migrar formato antigo (seções) para novo formato (conteúdo completo)
        const secoes = template.template_data.secoes;
        content = template.template_data.titulo ? template.template_data.titulo + '\n\n' : '';

        secoes.forEach((secao: any) => {
          if (secao.titulo) content += secao.titulo + '\n';
          if (secao.subtitulo) content += secao.subtitulo + '\n';
          if (secao.conteudo) content += secao.conteudo + '\n';
          if (secao.paragrafos) {
            secao.paragrafos.forEach((p: string) => {
              content += p + '\n';
            });
          }
          content += '\n';
        });
      }

      // Detectar se é texto simples ou HTML e converter se necessário
      const isHtml = /<[a-z][\s\S]*>/i.test(content);
      if (isHtml) {
        setConteudoCompleto(content);
      } else if (content) {
        // Converter texto simples para HTML básico, preservando estrutura
        const htmlContent = content
          .trim()
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((p) => {
            const formatted = p.trim().replace(/\n/g, '<br>');
            return `<p>${formatted}</p>`;
          })
          .join('');
        setConteudoCompleto(htmlContent || `<p>${content}</p>`);
      } else {
        setConteudoCompleto('<p></p>');
      }

      if (template?.papel_timbrado_url) {
        setPapelTimbradoUrl(template.papel_timbrado_url);
      }

      if (typeof template?.template_data?.topMargin === 'number') {
        setTopMargin(template.template_data.topMargin);
      }
      if (typeof template?.template_data?.bottomMargin === 'number') {
        setBottomMargin(template.template_data.bottomMargin);
      }
    }
  }, [template]);

  // Paleta vinda da configuração por organização (catálogo + overrides).
  // Renomear/esconder/reordenar é feito na tab Configurações → Campos.
  const { campos: camposEfetivos } = useCamposDinamicos();
  const camposDinamicos = categoriasOrdenadas(camposEfetivos)
    .map((cat) => ({
      key: cat,
      label: labelCategoria(cat),
      icon: (CATEGORIA_EMOJI as Record<string, string>)[cat] ?? '🏷️',
      campos: camposEfetivos
        .filter((c) => c.categoria === cat && c.ativo)
        .sort((a, b) => a.ordem - b.ordem),
    }))
    .filter((g) => g.campos.length > 0);

  const insertField = (field: string) => {
    if (editorRef.current) {
      editorRef.current.insertContent(field);
    }
  };

  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingImage(true);
      try {
        // Verificar se usuário é admin
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Usuário não autenticado');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (!profile?.is_admin) {
          toast.error('Apenas administradores podem fazer upload de imagens');
          return;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('document-templates')
          .upload(fileName, file);

        if (error) {
          // Log detalhado do erro
          const errorObj = error as any;
          console.error('Erro detalhado do upload:', {
            message: error.message,
            statusCode: errorObj.statusCode,
            error: errorObj.error,
            hint: errorObj.hint,
            details: errorObj.details,
            fullError: JSON.stringify(error, null, 2),
          });

          // Mensagens específicas baseadas no tipo de erro
          if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
            toast.error('Erro de permissão RLS. Verifique se você é administrador.');
          } else if (errorObj.statusCode === '400' || errorObj.statusCode === 400) {
            toast.error(`Erro 400: ${error.message || 'Requisição inválida ao servidor'}`);
          } else if (error.message?.includes('bucket')) {
            toast.error('Bucket de armazenamento não configurado corretamente');
          } else if (
            error.message?.includes('permission') ||
            error.message?.includes('unauthorized')
          ) {
            toast.error('Sem permissão para fazer upload. Verifique as políticas RLS.');
          } else {
            toast.error(`Erro ao fazer upload: ${error.message || 'Erro desconhecido'}`);
          }
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from('document-templates')
          .getPublicUrl(fileName);

        setPapelTimbradoUrl(urlData.publicUrl);
        toast.success('Imagem carregada com sucesso!');
      } catch (error) {
        console.error('Erro ao fazer upload:', error);
        if (
          !(error as any)?.message?.includes('bucket') &&
          !(error as any)?.message?.includes('policy')
        ) {
          toast.error('Erro ao fazer upload da imagem');
        }
      } finally {
        setUploadingImage(false);
      }
    };

    input.click();
  };

  const handleImageRemove = async () => {
    if (!papelTimbradoUrl) return;

    try {
      // Extrair nome do arquivo da URL
      const urlParts = papelTimbradoUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName && !fileName.includes('lovable-uploads')) {
        await supabase.storage.from('document-templates').remove([fileName]);
      }

      setPapelTimbradoUrl('');
      toast.success('Imagem removida');
    } catch (error) {
      console.error('Erro ao remover imagem:', error);
      toast.error('Erro ao remover imagem');
    }
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Por favor, insira um nome para o template');
      return;
    }

    if (!conteudoCompleto.trim()) {
      toast.error('Por favor, insira o conteúdo do template');
      return;
    }

    setSaving(true);
    try {
      // Determinar a versão correta
      let versao = template?.versao || 1;

      // Se for novo template, buscar versão máxima e incrementar
      if (!template?.id) {
        const { data: maxVersionTemplate } = await supabase
          .from('document_templates')
          .select('versao')
          .eq('cliente_empresa_id', empresaId)
          .eq('tipo', tipo)
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle();

        versao = (maxVersionTemplate?.versao || 0) + 1;
      }

      const templateData = {
        nome,
        tipo,
        cliente_empresa_id: empresaId || null,
        template_data: {
          conteudo: conteudoCompleto,
          topMargin,
          bottomMargin,
        } as any,
        // Snapshot da paleta efectiva no momento (informativo). A config real
        // vive em org_campos_dinamicos; aqui guardamos só um registo.
        campos_dinamicos: Object.fromEntries(
          camposDinamicos.map((g) => [g.key, g.campos.map((c) => `{{${c.chave}}}`)])
        ) as any,
        papel_timbrado_url: papelTimbradoUrl || null,
        ativo,
        versao,
      };

      if (template?.id) {
        const { error } = await supabase
          .from('document_templates')
          .update(templateData)
          .eq('id', template.id);

        if (error) throw error;
        toast.success('Template atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('document_templates').insert(templateData);

        if (error) throw error;
        toast.success('Template criado com sucesso!');
      }

      onSave();
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast.error('Erro ao salvar template. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com ações */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          {template ? 'Editar Template' : 'Novo Template'}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'A guardar...' : 'Guardar Template'}
          </Button>
        </div>
      </div>

      {/* Info sobre campos dinâmicos */}
      <Alert className="bg-blue-900/20 border-blue-700">
        <AlertDescription className="text-foreground">
          ✨ Use os campos dinâmicos ao lado para inserir dados automáticos. Clique em qualquer
          campo para inserir no cursor.
        </AlertDescription>
      </Alert>

      {/* Layout Principal: Editor (2/3) + Painel Lateral (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA PRINCIPAL - EDITOR */}
        <div className="lg:col-span-2 space-y-4">
          {/* Informações do Template */}
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Nome do Template</Label>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: Contrato Aluguer - WeGest"
                      className="bg-card border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Tipo de Documento</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="bg-card border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPO_TEMPLATE_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Empresa</Label>
                    <Select value={empresaId} onValueChange={setEmpresaId}>
                      <SelectTrigger className="bg-card border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                  <Label className="text-foreground">Ativo</Label>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Editor de Conteúdo */}
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Conteúdo do Contrato</CardTitle>
              <CardDescription className="text-muted-foreground">
                Digite o conteúdo completo do contrato. Use os campos dinâmicos ao lado para inserir
                dados automáticos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    A carregar editor…
                  </div>
                }
              >
                <RichTextEditor
                  ref={editorRef}
                  content={conteudoCompleto}
                  onChange={setConteudoCompleto}
                />
              </Suspense>
              <div className="mt-2 text-xs text-muted-foreground">
                {conteudoCompleto.length} caracteres
              </div>
            </CardContent>
          </Card>
        </div>

        {/* COLUNA LATERAL - FERRAMENTAS (fluxo normal, scroll da página) */}
        <div className="space-y-4 pr-2">
          {/* Campos Dinâmicos */}
          <Card className="bg-card border-border shadow-lg">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Campos Dinâmicos</CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                Clica para inserir no cursor, ou arrasta para o documento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {camposDinamicos.map((categoria) => (
                <div key={categoria.key} className="space-y-2">
                  <Label className="text-sm text-foreground font-bold flex items-center gap-2">
                    <span>{categoria.icon}</span>
                    {categoria.label}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {categoria.campos.map((campo) => (
                      <Badge
                        key={campo.chave}
                        variant="outline"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-campo-dinamico',
                            `{{${campo.chave}}}`
                          );
                          e.dataTransfer.setData('text/plain', `{{${campo.chave}}}`);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="cursor-grab active:cursor-grabbing hover:bg-yellow-500/20 hover:border-yellow-500 transition-all text-xs px-2 py-1 select-none"
                        onClick={() => insertField(`{{${campo.chave}}}`)}
                        title={`{{${campo.chave}}}`}
                      >
                        {campo.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Gestão de Papel Timbrado (legado) */}
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Papel Timbrado (legado)</CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                Formato A4 (210x297mm). Só é usado se a empresa do template não tiver papel timbrado
                definido — configura o timbre da empresa em Configurações → Empresas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {papelTimbradoUrl ? (
                <div className="space-y-3">
                  <div className="relative w-full max-h-[400px] border border-border rounded bg-card overflow-y-auto">
                    <img
                      src={papelTimbradoUrl}
                      alt="Papel timbrado"
                      className="w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleImageUpload}
                      disabled={uploadingImage}
                      className="flex-1"
                    >
                      <Upload className="mr-2 h-3 w-3" />
                      Alterar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleImageRemove}
                      className="flex-1"
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleImageUpload}
                  disabled={uploadingImage}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  {uploadingImage ? 'A carregar...' : 'Fazer upload de imagem'}
                </Button>
              )}
              <p className="text-xs text-gray-500">
                A imagem será usada como fundo do documento ao gerar contratos
              </p>

              {papelTimbradoUrl && (
                <div className="space-y-3 border-t border-border pt-3">
                  <div>
                    <Label className="text-foreground text-sm">Margens (mm)</Label>
                    <p className="text-xs text-muted-foreground">
                      Ajusta a distância ao topo e ao fundo se o conteúdo bater na logo ou na faixa
                      do timbrado.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Topo</Label>
                      <Input
                        type="number"
                        min={10}
                        max={120}
                        value={topMargin}
                        onChange={(e) => setTopMargin(Number(e.target.value) || 50)}
                        className="bg-card border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fundo</Label>
                      <Input
                        type="number"
                        min={10}
                        max={120}
                        value={bottomMargin}
                        onChange={(e) => setBottomMargin(Number(e.target.value) || 38)}
                        className="bg-card border-border text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
