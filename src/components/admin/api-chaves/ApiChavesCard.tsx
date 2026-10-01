import { useState } from 'react';
import { KeyRound, Loader2, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApiChaves, useDesativarApiChave, type ApiChaveRow } from '@/hooks/useApiChaves';
import { ROTULO_ESCOPO, descreverValidade, mostrarPrefixo, rotuloPermissao } from '@/lib/apiChaves';
import { ApiChaveNovaDialog } from './ApiChaveNovaDialog';

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-PT') : '—');

/** Integrações → Chaves de API: lista, cria e desactiva (nunca apaga). */
export function ApiChavesCard() {
  const { data: chaves = [], isLoading } = useApiChaves();
  const desativar = useDesativarApiChave();
  const [nova, setNova] = useState(false);
  const [aDesativar, setADesativar] = useState<ApiChaveRow | null>(null);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" />
              Chaves de API
            </CardTitle>
            <CardDescription>
              Para o website de rent-a-car e outras integrações. A chave só se vê ao criar.
            </CardDescription>
          </div>
          <Button onClick={() => setNova(true)}>
            <Plus className="h-4 w-4" />
            Nova chave
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chaves.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há chaves.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Permissões</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {chaves.map((c) => (
                <TableRow key={c.id} className={c.ativo ? undefined : 'opacity-60'}>
                  <TableCell className="font-medium">
                    {c.nome}
                    {!c.ativo && (
                      <Badge variant="secondary" className="ml-2">
                        Desactivada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{mostrarPrefixo(c.prefixo)}</TableCell>
                  <TableCell>{ROTULO_ESCOPO[c.escopo] ?? c.escopo}</TableCell>
                  <TableCell className="text-xs">
                    {c.permissoes.map(rotuloPermissao).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-xs">{descreverValidade(c.expires_at)}</TableCell>
                  <TableCell className="text-xs">{dataHora(c.last_used_at)}</TableCell>
                  <TableCell className="text-right">{c.total_requests}</TableCell>
                  <TableCell className="text-right">
                    {c.ativo && (
                      <Button variant="outline" size="sm" onClick={() => setADesativar(c)}>
                        Desactivar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ApiChaveNovaDialog open={nova} onOpenChange={setNova} />

      <AlertDialog open={!!aDesativar} onOpenChange={(o) => !o && setADesativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar a chave «{aDesativar?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pedidos com esta chave passam a ser recusados de imediato. Não dá para reactivar:
              crie uma nova se precisar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aDesativar && desativar.mutate(aDesativar.id)}
              disabled={desativar.isPending}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
