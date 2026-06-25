import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { useMotoristasAudiencia } from '@/hooks/useMotoristasAudiencia';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lista: any;
}

const ContactosListaDialog = ({ open, onOpenChange, lista }: Props) => {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [sortField, setSortField] = useState<'nome' | 'email' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: 'nome' | 'email') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const isSistema = lista.origem === 'motoristas_ativos';

  const { data: contactos, isLoading } = useQuery({
    queryKey: ['marketing-contactos', lista.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_contactos')
        .select('*')
        .eq('lista_id', lista.id)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !isSistema,
  });

  const { data: membrosSistema, isLoading: loadingSistema } = useMotoristasAudiencia(
    open && isSistema
  );

  const linhas = isSistema ? membrosSistema : contactos;
  const carregando = isSistema ? loadingSistema : isLoading;

  const sortedContactos = useMemo(() => {
    if (!linhas || !sortField) return linhas;
    return [...linhas].sort((a, b) => {
      const valA = (a[sortField] || '').toLowerCase();
      const valB = (b[sortField] || '').toLowerCase();
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [linhas, sortField, sortDirection]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('marketing_contactos')
        .insert({ lista_id: lista.id, nome, email });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-contactos', lista.id] });
      queryClient.invalidateQueries({ queryKey: ['marketing-listas-with-count'] });
      setNome('');
      setEmail('');
      toast.success('Contacto adicionado');
    },
    onError: (err: any) =>
      toast.error(
        err.message?.includes('duplicate') ? 'Email já existe nesta lista' : 'Erro ao adicionar'
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_contactos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-contactos', lista.id] });
      queryClient.invalidateQueries({ queryKey: ['marketing-listas-with-count'] });
      toast.success('Contacto removido');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contactos - {lista.nome}</DialogTitle>
        </DialogHeader>

        {!isSistema && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
            </div>
            <div className="flex-1">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />
            </div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!nome || !email || addMutation.isPending}
              size="sm"
              className="gap-1"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adicionar
            </Button>
          </div>
        )}

        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !linhas?.length ? (
          <p className="text-center text-muted-foreground py-8">
            {isSistema ? 'Nenhum motorista ativo com email.' : 'Nenhum contacto nesta lista.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 -ml-2"
                    onClick={() => toggleSort('nome')}
                  >
                    Nome
                    {sortField === 'nome' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 -ml-2"
                    onClick={() => toggleSort('email')}
                  >
                    Email
                    {sortField === 'email' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </TableHead>
                {!isSistema && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedContactos?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  {!isSistema && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Remover contacto"
                        aria-label="Remover contacto"
                        onClick={() => deleteMutation.mutate(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <p className="text-xs text-muted-foreground">
          {linhas?.length || 0} {isSistema ? 'motorista(s) ativo(s)' : 'contacto(s) nesta lista'}
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ContactosListaDialog;
