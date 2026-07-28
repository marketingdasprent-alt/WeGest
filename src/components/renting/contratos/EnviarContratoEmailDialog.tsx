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
import {
  IDIOMAS_EMAIL,
  emailValido,
  isMensagemDefault,
  mensagemDefaultDocumento,
  type IdiomaEmail,
} from '@/lib/documentoEmail';
import { enviarContratoDocumentoEmail } from '@/lib/emailContratoDocumento';

const ASSUNTO_POR_IDIOMA: Record<IdiomaEmail, string> = {
  pt: 'Contrato de Aluguer',
  en: 'Rental Agreement',
  es: 'Contrato de Alquiler',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PDF já gerado pelo dialog "Gerar Documentos" — este componente só envia. */
  pdf: jsPDF | null;
  filename: string;
  /** Ex.: "Contrato #0123". */
  contextoLabel: string;
  /** Cliente e/ou condutor resolvidos do contrato. */
  entidades: ContactoEntidade[];
  /** Organização do contrato — a edge function usa-a para resolver a integração de email. */
  orgId: string;
}

/** Envio por email do PDF do contrato — mesmo padrão/UX de
 *  EnviarDocumentoEmailDialog (documentos fiscais), adaptado a um PDF já
 *  gerado localmente em vez de obtido do provider de faturação. */
export function EnviarContratoEmailDialog({
  open,
  onOpenChange,
  pdf,
  filename,
  contextoLabel,
  entidades,
  orgId,
}: Props) {
  const [entidadeTipo, setEntidadeTipo] = useState<string>('cliente');
  const [email, setEmail] = useState('');
  const [idioma, setIdioma] = useState<IdiomaEmail>('pt');
  const [mensagem, setMensagem] = useState(() => mensagemDefaultDocumento('pt'));
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
    setMensagem(mensagemDefaultDocumento('pt'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onEntidadeChange(tipo: string) {
    setEntidadeTipo(tipo);
    const ent = entidades.find((e) => e.tipo === tipo);
    setEmail(ent?.email ?? '');
  }

  function onIdiomaChange(novo: IdiomaEmail) {
    // Só substitui o corpo se o utilizador ainda não o tiver editado.
    setMensagem((atual) => (isMensagemDefault(atual) ? mensagemDefaultDocumento(novo) : atual));
    setIdioma(novo);
  }

  async function handleEnviar() {
    if (!pdf) return;
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
        pdf,
        filename,
        orgId,
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
            {contextoLabel} — envia o PDF em anexo para o cliente ou condutor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
            <Label>Mensagem</Label>
            <Textarea rows={9} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button onClick={handleEnviar} disabled={enviando || !email.trim() || !pdf}>
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
