import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  X,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrgId } from '@/contexts/TenantContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

import {
  useApagarCampoCatalogo,
  useCamposCatalogo,
  useCamposDinamicos,
  useCriarCampoCatalogo,
  useSaveCamposDinamicos,
} from '@/hooks/useCamposDinamicos';
import {
  CAMPOS_CATALOGO,
  CATEGORIA_ORDEM,
  catalogoCompleto,
  categoriasOrdenadas,
  labelCategoria,
  resolverCampos,
  type CampoCategoria,
  type CampoEfetivo,
} from '@/lib/camposDinamicos';

const DECADA_OUSADA_ORG_ID = '11111111-1111-1111-1111-111111111111';

/** slug seguro para a chave a partir do rótulo. */
const slugChave = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * Configuração da paleta de campos dinâmicos dos templates (por organização):
 * escolher quais aparecem, reordenar e renomear o rótulo. A chave canónica
 * ({{chave}}) nunca muda — a resolução do PDF continua igual.
 */
export function CamposTab() {
  const { campos: carregados, isLoading } = useCamposDinamicos();
  const save = useSaveCamposDinamicos();
  const { toast } = useToast();

  // Gestão do catálogo — só a org provider (Década Ousada) E com a permissão
  // 'admin_campos_dinamicos'. A RLS garante que só a provider escreve.
  const orgId = useOrgId();
  const { canEdit } = usePermissions();
  const isProvider = orgId === DECADA_OUSADA_ORG_ID;
  const podeGerirCatalogo = isProvider && canEdit('admin_campos_dinamicos');
  const { data: custom = [] } = useCamposCatalogo();
  const criarCampo = useCriarCampoCatalogo();
  const apagarCampo = useApagarCampoCatalogo();

  const NOVA_CATEGORIA = '__nova__';
  const [novoLabel, setNovoLabel] = useState('');
  const [novaCategoria, setNovaCategoria] = useState<CampoCategoria>('contrato');
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [novaFonte, setNovaFonte] = useState('');

  // Categorias disponíveis no select (base + as já criadas pelo provider).
  const categoriasDisponiveis = useMemo(
    () => Array.from(new Set([...CATEGORIA_ORDEM, ...custom.map((c) => c.categoria)])),
    [custom]
  );

  // Categoria efectiva (escolhida ou nova digitada).
  const categoriaEfetiva =
    novaCategoria === NOVA_CATEGORIA ? novaCategoriaNome.trim() : novaCategoria;

  // Chaves já em uso (base + custom) para evitar colisões.
  const chavesExistentes = useMemo(
    () => new Set(catalogoCompleto(custom).map((c) => c.chave)),
    [custom]
  );
  const novaChave = slugChave(novoLabel);
  const chaveColide = !!novaChave && chavesExistentes.has(novaChave);
  const podeCriar =
    !!novoLabel.trim() && !!novaFonte && !!novaChave && !chaveColide && !!categoriaEfetiva;

  const handleCriarCampo = () => {
    if (!podeCriar) return;
    criarCampo.mutate(
      { chave: novaChave, label: novoLabel.trim(), categoria: categoriaEfetiva, fonte: novaFonte },
      {
        onSuccess: () => {
          setNovoLabel('');
          setNovaFonte('');
          // Mantém a categoria nova selecionada para criar vários campos seguidos.
          if (novaCategoria === NOVA_CATEGORIA) {
            setNovaCategoria(categoriaEfetiva);
            setNovaCategoriaNome('');
          }
          toast({ title: 'Campo criado', description: `{{${novaChave}}} disponível no catálogo.` });
        },
        onError: (e) =>
          toast({
            title: 'Erro ao criar',
            description: e instanceof Error ? e.message : 'Tenta novamente.',
            variant: 'destructive',
          }),
      }
    );
  };

  // Master ordenado: a posição no array é a ordem efectiva.
  const [items, setItems] = useState<CampoEfetivo[]>([]);

  useEffect(() => {
    setItems([...carregados].sort((a, b) => a.ordem - b.ordem));
  }, [carregados]);

  const setCampo = (chave: string, patch: Partial<CampoEfetivo>) =>
    setItems((prev) => prev.map((c) => (c.chave === chave ? { ...c, ...patch } : c)));

  // Reordena dentro da mesma categoria (troca com o vizinho mais próximo).
  const mover = (chave: string, dir: 'up' | 'down') => {
    setItems((prev) => {
      const arr = [...prev];
      const i = arr.findIndex((c) => c.chave === chave);
      if (i < 0) return prev;
      const cat = arr[i].categoria;
      const step = dir === 'up' ? -1 : 1;
      let j = i + step;
      while (j >= 0 && j < arr.length && arr[j].categoria !== cat) j += step;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const repor = () => setItems(resolverCampos([]));

  const guardar = () => {
    const comOrdem = items.map((c, i) => ({ ...c, ordem: i }));
    save.mutate(comOrdem, {
      onSuccess: () =>
        toast({ title: 'Campos guardados', description: 'A paleta de templates foi actualizada.' }),
      onError: (e) =>
        toast({
          title: 'Erro ao guardar',
          description: e instanceof Error ? e.message : 'Tenta novamente.',
          variant: 'destructive',
        }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Tags className="h-5 w-5 text-primary" />
            Campos Dinâmicos
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Escolhe que campos aparecem na paleta dos templates, a ordem e o rótulo. A chave
            inserida no documento ({'{{...}}'}) mantém-se — só muda o que vês no editor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={repor}
            disabled={save.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Repor predefinições
          </Button>
          <Button size="sm" className="gap-2" onClick={guardar} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {/* Gestão do catálogo — só provider com permissão */}
      {podeGerirCatalogo && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              Criar campo (catálogo do produto)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Só a vossa org cria campos. Cada campo novo aponta para um dado que o sistema já tem
              (alias) — assim o documento preenche sempre.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_1fr_auto] gap-3 items-start">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Rótulo</label>
                <Input
                  value={novoLabel}
                  onChange={(e) => setNovoLabel(e.target.value)}
                  placeholder="Ex: Titular do contrato"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Categoria</label>
                {novaCategoria === NOVA_CATEGORIA ? (
                  <div className="relative">
                    <Input
                      value={novaCategoriaNome}
                      onChange={(e) => setNovaCategoriaNome(e.target.value)}
                      placeholder="Nome da nova categoria"
                      className="h-9 pr-8"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNovaCategoria('contrato');
                        setNovaCategoriaNome('');
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="Escolher categoria existente"
                      aria-label="Cancelar nova categoria"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Select value={novaCategoria} onValueChange={(v) => setNovaCategoria(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasDisponiveis.map((c) => (
                        <SelectItem key={c} value={c}>
                          {labelCategoria(c)}
                        </SelectItem>
                      ))}
                      <SelectItem value={NOVA_CATEGORIA}>＋ Nova categoria…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Mostra o valor de…</label>
                <Select value={novaFonte} onValueChange={setNovaFonte}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Escolher dado do sistema..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPOS_CATALOGO.map((c) => (
                      <SelectItem key={c.chave} value={c.chave}>
                        {labelCategoria(c.categoria)} · {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Espaçador para alinhar o botão com os inputs (não com os labels). */}
              <div className="space-y-1">
                <label className="hidden sm:block text-xs text-transparent select-none">.</label>
                <Button
                  onClick={handleCriarCampo}
                  disabled={!podeCriar || criarCampo.isPending}
                  className="gap-2 h-9 w-full sm:w-auto"
                >
                  {criarCampo.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Criar
                </Button>
              </div>
            </div>

            {/* Preview da chave / aviso de colisão — fora da grelha (não desalinha). */}
            <p className="min-h-[1rem] font-mono text-[10px]">
              {novaChave ? (
                <span className={chaveColide ? 'text-destructive' : 'text-muted-foreground'}>
                  Insere no template: {`{{${novaChave}}}`}
                  {chaveColide && ' — já existe, escolhe outro rótulo'}
                </span>
              ) : null}
            </p>

            {custom.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Campos criados ({custom.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {custom.map((c) => {
                    const fonte = CAMPOS_CATALOGO.find((b) => b.chave === c.fonte);
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs"
                      >
                        <span className="font-medium">{c.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {`{{${c.chave}}}`} → {fonte?.label ?? c.fonte}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-destructive"
                          onClick={() => apagarCampo.mutate(c.id)}
                          aria-label="Apagar campo"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {categoriasOrdenadas(items).map((cat) => {
            const campos = items.filter((c) => c.categoria === cat);
            if (campos.length === 0) return null;
            const ativos = campos.filter((c) => c.ativo).length;
            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{labelCategoria(cat)}</span>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {ativos}/{campos.length} visíveis
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {campos.map((campo, idx) => (
                    <div
                      key={campo.chave}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2 transition-colors',
                        campo.ativo ? 'bg-card' : 'bg-muted/30 opacity-70'
                      )}
                    >
                      <Switch
                        checked={campo.ativo}
                        onCheckedChange={(v) => setCampo(campo.chave, { ativo: v })}
                        aria-label={`Mostrar ${campo.chave}`}
                      />
                      <div className="flex-1 min-w-0">
                        <Input
                          value={campo.label}
                          onChange={(e) => setCampo(campo.chave, { label: e.target.value })}
                          className="h-8 text-sm"
                          placeholder="Rótulo"
                        />
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {`{{${campo.chave}}}`}
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          disabled={idx === 0}
                          onClick={() => mover(campo.chave, 'up')}
                          aria-label="Subir"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          disabled={idx === campos.length - 1}
                          onClick={() => mover(campo.chave, 'down')}
                          aria-label="Descer"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
