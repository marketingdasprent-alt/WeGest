import { useState, type FormEvent, type ReactElement } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ContactModalProps {
  trigger: ReactElement;
}

export const ContactModal = ({ trigger }: ContactModalProps) => {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = {
      nome: String(formData.get('nome') ?? ''),
      email: String(formData.get('email') ?? ''),
      empresa: String(formData.get('empresa') ?? ''),
      mensagem: String(formData.get('mensagem') ?? ''),
      website: String(formData.get('website') ?? ''),
    };

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('contact-inquiry', { body });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Falha ao enviar');
      }
      toast.success('Mensagem enviada. Entramos em contacto em breve.');
      form.reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="dark bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fale conosco</DialogTitle>
          <DialogDescription>
            Deixe os seus dados e respondemos por email o mais rápido possível.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-nome">Nome</Label>
            <Input id="contact-nome" name="nome" required minLength={2} maxLength={100} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" name="email" type="email" required maxLength={200} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-empresa">Empresa (opcional)</Label>
            <Input id="contact-empresa" name="empresa" maxLength={100} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-mensagem">Mensagem</Label>
            <Textarea
              id="contact-mensagem"
              name="mensagem"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
            />
          </div>

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'A enviar...' : 'Enviar mensagem'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
