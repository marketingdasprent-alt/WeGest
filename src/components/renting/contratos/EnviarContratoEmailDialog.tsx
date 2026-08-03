import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Send } from 'lucide-react';
import type jsPDF from 'jspdf';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContactoEntidade } from '@/hooks/useContactosDocumento';
import { IDIOMAS_EMAIL, emailValido, introDocumento, type IdiomaEmail } from '@/lib/documentoEmail';
import { enviarContratoDocumentoEmail } from '@/lib/emailContratoDocumento';

const ASSUNTO_POR_IDIOMA: Record<IdiomaEmail, string> = {
  pt: 'Contrato de Aluguer',
  en: 'Rental Agreement',
  es: 'Contrato de Alquiler',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documentos já gerados pelo dialog "Gerar Documentos" — este componente só
   *  envia. Cada um vai como anexo próprio, todos no mesmo email. */
  anexos: Array<{ pdf: jsPDF; filename: string }>;
  /** Ex.: "Contrato #0123". */
  contextoLabel: string;
  /** Cliente e/ou condutor resolvidos do contrato. */
  entidades: ContactoEntidade[];
  /** Organização do contrato — a edge function usa-a para resolver a integração de email. */
  orgId: string;
  /** Empresa emissora do contrato. Dá a marca ao email (logótipo/nome no
   *  cabeçalho) e assina a mensagem — sem isto o email saía assinado por uma
   *  empresa fixa, independentemente de quem emitiu o contrato. */
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  /** Dados do contrato mostrados no corpo do email (Contrato, Viatura,
   *  Período, Valor...). São eles que fazem o corpo ser um template. */
  detalhes?: Array<{ label: string; valor: string }>;
}

/** Envio por email do PDF do contrato — mesmo padrão/UX de
 *  EnviarDocumentoEmailDialog (documentos fiscais), adaptado a um PDF já
 *  gerado localmente em vez de obtido do provider de faturação. */
export function EnviarContratoEmailDialog({
  open,
  onOpenChange,
  anexos,
  contextoLabel,
  entidades,
  orgId,
  emissorNome,
  emissorLogoUrl,
  detalhes,
}: Props) {
  const [entidadeTipo, setEntidadeTipo] = useState<string>('cliente');
  const [email, setEmail] = useState('');
  const [idioma, setIdioma] = useState<IdiomaEmail>('pt');
  // Vazia de propósito: o corpo do email é o template (introdução + dados do
  // contrato). Isto é só para acrescentar uma nota, quando fizer falta.
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entidadeSelecionada = useMemo(
    () => entidades.find((e) => e.tipo === entidadeTipo) ?? entidades[0] ?? null,
    [entidades, entidadeTipo]
  );

  // (Re)inicializa os campos sempre que o dialog abre para um documento novo.
  useEffect(() => {
    if (!open) return;
    const inicial = entidades.find((e) => e.tipo === 'cliente') ?? entidades[0] ?? null;
    setEntidadeTipo(inicial?.tipo ?? 'cliente');
    setEmail(inicial?.email ?? '');
    setIdioma('pt');
    setMensagem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onEntidadeChange(tipo: string) {
    setEntidadeTipo(tipo);
    const ent = entidades.find((e) => e.tipo === tipo);
    setEmail(ent?.email ?? '');
  }

  // O idioma passou a afectar só o template (assunto + introdução), que é
  // gerado no envio — a nota do utilizador é dele e nunca é reescrita.
  function onIdiomaChange(novo: IdiomaEmail) {
    setIdioma(novo);
  }

  async function handleEnviar() {
    if (!anexos.length) return;
    const dest = email.trim();
    if (!emailValido(dest)) {
      toast.error('Indique um email de destino válido.');
      return;
    }
    setEnviando(true);
    try {
      await enviarContratoDocumentoEmail({
        to: dest,
        toNome: entidadeSelecionada?.nome,
        subject: `${ASSUNTO_POR_IDIOMA[idioma]} — ${contextoLabel}`,
        mensagem,
        intro: introDocumento(idioma),
        detalhes,
        anexos,
        orgId,
        emissorNome,
        emissorLogoUrl,
        titulo: ASSUNTO_POR_IDIOMA[idioma],
        categoria: 'Contrato',
      });
      toast.success(`Documento enviado para ${dest}.`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Falha ao enviar o documento: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (enviando ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Enviar documento por email
          </DialogTitle>
          <DialogDescription>
            {contextoLabel} —{' '}
            {anexos.length === 1
              ? 'envia o documento em anexo'
              : `envia os ${anexos.length} documentos em anexo`}{' '}
            para o cliente ou condutor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mostrar o que vai seguir: com vários documentos seleccionados é a
              única forma de confirmar, antes de enviar, que vão todos. */}
          {anexos.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {anexos.length === 1 ? 'Anexo' : `${anexos.length} anexos`}
              </p>
              <ul className="space-y-0.5">
                {anexos.map((a) => (
                  <li key={a.filename} className="text-xs text-foreground truncate">
                    📎 {a.filename}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {entidades.length > 0 && (
              <div className="space-y-1.5">
                <Label>Entidade</Label>
                <Select value={entidadeTipo} onValueChange={onEntidadeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {entidades.map((e) => (
                      <SelectItem key={e.tipo} value={e.tipo}>
                        {e.label}
                        {e.nome ? ` — ${e.nome}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={idioma} onValueChange={(v) => onIdiomaChange(v as IdiomaEmail)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDIOMAS_EMAIL.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email de destino *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.pt"
            />
            {entidadeSelecionada && !entidadeSelecionada.email && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {entidadeSelecionada.label} sem email registado — escreva o destino manualmente.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mensagem adicional (opcional)</Label>
            <Textarea
              rows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Deixe vazio para enviar só o contrato. O que escrever aqui é acrescentado ao email."
            />
            <p className="text-xs text-muted-foreground">
              O email já leva o cabeçalho da empresa, os dados do contrato e o anexo — não precisa
              de escrever nada.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={enviando || !email.trim() || anexos.length === 0}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
