import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, Paperclip, X } from 'lucide-react';
import { useSoltarFicheiros } from '@/hooks/use-soltar-ficheiros';
import { TurnstileCaptcha } from '@/components/auth/TurnstileCaptcha';
import { TiLargarAqui } from './TiLargarAqui';
import { turnstileSiteKey } from '@/lib/turnstile';
import {
  TI_ANEXO_MAX_FICHEIROS,
  ficheiroParaBase64,
  validarListaFicheiros,
} from '@/lib/tiTicketAnexos';

/**
 * Formulário público de pedidos de informática. Quem preenche pode não ter
 * conta nenhuma: a autorização é o token do link, validado dentro da edge
 * function `ti-ticket-submeter`. As tabelas nunca são tocadas daqui.
 */
interface TiTicketFormularioProps {
  token: string;
  /** Sem isto, mostra a confirmação com o link para a conversa. */
  onSubmetido?: (r: { numero: number; acessoToken: string; anexosFalhou: boolean }) => void;
  /** Dentro de um diálogo: sem a moldura do cartão. */
  embutido?: boolean;
}

export function TiTicketFormulario({ token, onSubmetido, embutido }: TiTicketFormularioProps) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ficheiros, setFicheiros] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [submetido, setSubmetido] = useState<{ numero: number; acessoToken: string } | null>(null);
  const [anexosFalhou, setAnexosFalhou] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Cada token só serve uma vez: depois de um envio o widget é remontado.
  const [captchaVersao, setCaptchaVersao] = useState(0);
  const captchaEmFalta = !!turnstileSiteKey() && !captchaToken;

  const escolherFicheiros = (novos: FileList | File[] | null) => {
    if (!novos || novos.length === 0) return;
    const lista = [...ficheiros, ...Array.from(novos)];
    const erroValidacao = validarListaFicheiros(lista);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setErro(null);
    setFicheiros(lista);
  };

  const soltar = useSoltarFicheiros(escolherFicheiros);

  const removerFicheiro = (indice: number) => {
    setFicheiros((atual) => atual.filter((_, i) => i !== indice));
  };

  const submeter = async () => {
    if (!nome.trim()) return setErro('Indique o seu nome.');
    if (!email.includes('@')) return setErro('Indique um email válido.');
    if (!descricao.trim()) return setErro('Descreva o problema.');

    setErro(null);
    setAEnviar(true);
    try {
      const anexos = await Promise.all(
        ficheiros.map(async (file) => ({
          nome: file.name,
          mimeType: file.type,
          conteudoBase64: await ficheiroParaBase64(file),
        }))
      );

      const { data, error } = await supabase.functions.invoke('ti-ticket-submeter', {
        body: {
          token,
          nome,
          email,
          descricao,
          anexos,
          // Para o link do email de confirmação; o servidor valida o domínio.
          origem: window.location.origin,
          ...(captchaToken ? { captcha_token: captchaToken } : {}),
        },
      });

      if (error || !data?.success) {
        // A mensagem do servidor é a que interessa (link inválido, limite
        // excedido) — não a substituir por uma genérica.
        setErro(data?.error ?? 'Não foi possível registar o pedido.');
        return;
      }
      const resultado = { numero: data.numero as number, acessoToken: data.acesso_token as string };
      setAnexosFalhou(!!data.anexosFalhou);
      if (onSubmetido) onSubmetido({ ...resultado, anexosFalhou: !!data.anexosFalhou });
      else setSubmetido(resultado);
    } catch {
      setErro('Não foi possível ler os ficheiros anexados.');
    } finally {
      setAEnviar(false);
      setCaptchaToken(null);
      setCaptchaVersao((v) => v + 1);
    }
  };

  const Moldura = embutido ? 'div' : Card;

  if (submetido) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="font-semibold">Pedido #{submetido.numero} registado</p>
        <p className="text-sm text-muted-foreground">
          O suporte responde na conversa do pedido. Enviámos o link para o seu email.
        </p>
        <Button asChild>
          <Link to={`/ti/ticket/${submetido.acessoToken}`}>Abrir a conversa</Link>
        </Button>
        {anexosFalhou && (
          <p className="text-sm text-amber-600">
            O pedido ficou registado, mas não foi possível guardar os ficheiros anexados.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Moldura
      className={embutido ? 'relative space-y-4' : 'relative space-y-4 p-6'}
      {...soltar.zona}
    >
      <TiLargarAqui visivel={soltar.aArrastar} />
      <div className="space-y-2">
        <Label htmlFor="ti-nome">Nome</Label>
        <Input id="ti-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ti-email">Email</Label>
        <Input
          id="ti-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          É para aqui que enviamos o link para acompanhar o pedido.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ti-descricao">Qual é o problema?</Label>
        <Textarea
          id="ti-descricao"
          rows={5}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          onPaste={soltar.onPaste}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ti-anexos">Anexos (opcional)</Label>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ficheiros.length >= TI_ANEXO_MAX_FICHEIROS}
            onClick={() => document.getElementById('ti-anexos')?.click()}
            className="gap-2"
          >
            <Paperclip className="h-4 w-4" />
            Anexar ficheiro
          </Button>
          <span className="text-xs text-muted-foreground">
            ou arraste para aqui, ou cole um print (Ctrl+V) na descrição
          </span>
          <input
            id="ti-anexos"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
            className="hidden"
            onChange={(e) => {
              escolherFicheiros(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {ficheiros.length > 0 && (
          <ul className="space-y-1">
            {ficheiros.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removerFicheiro(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <TurnstileCaptcha key={captchaVersao} acao="ticket_ti" onToken={setCaptchaToken} />

      <Button onClick={submeter} disabled={aEnviar || captchaEmFalta} className="w-full gap-2">
        {aEnviar && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar pedido
      </Button>
    </Moldura>
  );
}
