import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCriarApiChave } from '@/hooks/useApiChaves';
import {
  PERMISSOES_POR_ESCOPO,
  parseIpWhitelist,
  rotuloPermissao,
  validarPermissoes,
} from '@/lib/apiChaves';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ESCOPO = 'rent_a_car' as const;

/** Cria uma chave da API de rent-a-car; a chave em claro só aparece no 2.º ecrã. */
export function ApiChaveNovaDialog({ open, onOpenChange }: Props) {
  const criar = useCriarApiChave();
  const [nome, setNome] = useState('');
  const [permissoes, setPermissoes] = useState<string[]>(['catalogo:read']);
  const [expiraEm, setExpiraEm] = useState('');
  const [ips, setIps] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [guardada, setGuardada] = useState(false);

  const repor = () => {
    setNome('');
    setPermissoes(['catalogo:read']);
    setExpiraEm('');
    setIps('');
    setErro(null);
    setChave(null);
    setCopiada(false);
    setGuardada(false);
    // A chave em claro também vive no MutationCache (data da mutação): limpa-se.
    criar.reset();
  };

  // Com a chave à vista, só fecha depois de copiada ou confirmada.
  const podeFechar = !chave || copiada || guardada;
  const mudarAberto = (aberto: boolean) => {
    if (!aberto && !podeFechar) return;
    if (!aberto) repor();
    onOpenChange(aberto);
  };

  const alternar = (p: string, marcada: boolean) =>
    setPermissoes((atual) => (marcada ? [...atual, p] : atual.filter((x) => x !== p)));

  const submeter = async () => {
    if (nome.trim().length < 2) return setErro('O nome tem de ter pelo menos 2 caracteres.');
    const erroPermissoes = validarPermissoes(ESCOPO, permissoes);
    if (erroPermissoes) return setErro(erroPermissoes);
    const whitelist = parseIpWhitelist(ips);
    if (whitelist.erro) return setErro(whitelist.erro);
    setErro(null);
    try {
      const criada = await criar.mutateAsync({
        nome: nome.trim(),
        escopo: ESCOPO,
        permissoes,
        expiraEm: expiraEm ? new Date(`${expiraEm}T23:59:59`).toISOString() : null,
        ipWhitelist: whitelist.ips,
      });
      setChave(criada.chave);
    } catch {
      // O toast já foi mostrado no onError do hook; o diálogo fica no formulário.
    }
  };

  const copiar = async () => {
    if (!chave) return;
    await navigator.clipboard.writeText(chave);
    setCopiada(true);
  };

  return (
    <Dialog open={open} onOpenChange={mudarAberto}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{chave ? 'Chave criada' : 'Nova chave de API'}</DialogTitle>
          <DialogDescription>
            {chave
              ? 'Guarde agora. Não volta a ser mostrada.'
              : 'Para o backend do website de rent-a-car. Nunca a ponha no browser.'}
          </DialogDescription>
        </DialogHeader>

        {chave ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={chave} className="font-mono text-xs" aria-label="Chave" />
              <Button type="button" variant="outline" onClick={copiar}>
                {copiada ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiada ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="api-chave-guardada"
                checked={guardada}
                onCheckedChange={(v) => setGuardada(v === true)}
              />
              <Label htmlFor="api-chave-guardada">Já guardei a chave</Label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-chave-nome">Nome</Label>
              <Input
                id="api-chave-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Website Década Ousada"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Permissões</legend>
              {PERMISSOES_POR_ESCOPO[ESCOPO].map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <Checkbox
                    id={`perm-${p}`}
                    checked={permissoes.includes(p)}
                    onCheckedChange={(v) => alternar(p, v === true)}
                  />
                  <Label htmlFor={`perm-${p}`} className="font-normal">
                    {rotuloPermissao(p)}
                  </Label>
                </div>
              ))}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="api-chave-expira">Válida até (opcional)</Label>
              <Input
                id="api-chave-expira"
                type="date"
                value={expiraEm}
                onChange={(e) => setExpiraEm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-chave-ips">IPs autorizados (opcional, um por linha)</Label>
              <Textarea
                id="api-chave-ips"
                rows={3}
                value={ips}
                onChange={(e) => setIps(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Só é fiável em chamadas directas ao URL do Supabase. Via wegest.pt o IP visto é o da
                Vercel.
              </p>
            </div>
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {chave ? (
            <Button type="button" disabled={!podeFechar} onClick={() => mudarAberto(false)}>
              Fechar
            </Button>
          ) : (
            <Button type="button" onClick={submeter} disabled={criar.isPending}>
              {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar chave
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
