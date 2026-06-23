import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Car,
  User,
  Calendar,
  Clock,
  FileText,
  Image,
  PlayCircle,
  Eye,
} from 'lucide-react';
import type { Ticket, Anexo, Viatura, Motorista } from './types';

interface Props {
  ticket: Ticket;
  anexos: Anexo[];
  viatura: Viatura | null;
  motorista: Motorista | null;
  criador: { nome: string } | null;
  onOpenGallery: () => void;
}

export const TicketSidebar: React.FC<Props> = ({
  ticket,
  anexos,
  viatura,
  motorista,
  criador,
  onOpenGallery,
}) => (
  <div className="space-y-6 lg:h-full lg:overflow-y-auto pr-1 custom-scrollbar">
    {ticket.descricao && (
      <Card className="border-l-4 border-l-primary shadow-sm">
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" /> Descrição do Problema
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed">{ticket.descricao}</p>
        </CardContent>
      </Card>
    )}

    <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-background to-muted/50">
      <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
          <Image className="h-3.5 w-3.5 text-primary" /> Multimédia
        </CardTitle>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {anexos.length} itens
        </Badge>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="flex gap-1 overflow-hidden h-12 mb-3">
          {anexos.slice(0, 4).map((anexo) => (
            <div key={anexo.id} className="w-1/4 h-full rounded border overflow-hidden bg-muted">
              {anexo.tipo_ficheiro?.startsWith('image/') ||
              anexo.nome_ficheiro?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <img src={anexo.ficheiro_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PlayCircle className="h-4 w-4 opacity-30" />
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs font-bold gap-2"
          onClick={onOpenGallery}
        >
          <Eye className="h-3.5 w-3.5" /> Ver Galeria Completa
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> Informações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {viatura && (
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground font-bold">Viatura</Label>
            <div className="flex items-center gap-2 mt-1">
              <Car className="h-4 w-4 text-blue-500" />
              <span className="font-mono font-bold text-sm">{viatura.matricula}</span>
            </div>
          </div>
        )}
        {motorista && (
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground font-bold">
              Motorista
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">{motorista.nome}</span>
            </div>
          </div>
        )}
        <Separator />
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground font-bold">
              Criado em
            </Label>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
            {criador && (
              <p className="text-[10px] text-muted-foreground mt-1 ml-5">por {criador.nome}</p>
            )}
          </div>
          {ticket.data_estimada && (
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                Previsão
              </Label>
              <div className="flex items-center gap-2 mt-1 text-xs text-amber-600">
                <Clock className="h-3 w-3" />
                <span>{format(new Date(ticket.data_estimada), 'dd/MM/yyyy')}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  </div>
);
