import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Send,
  Paperclip,
  Loader2,
  X,
  Image as ImageIcon,
  FileText,
  Play,
  Eye,
  Download,
  Wrench,
  CheckCircle2,
  Gauge,
  Fuel,
  Droplets,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { Mensagem, Anexo, Ticket } from './types';

interface TicketChatProps {
  ticket: Ticket;
  mensagens: Mensagem[];
  userId: string | undefined;
  canReply: boolean;
  canEditLegenda: boolean;
  novaMensagem: string;
  onNovaMensagemChange: (value: string) => void;
  selectedFiles: File[];
  onFilesSelect: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  sending: boolean;
  onSend: () => void;
  onOpenLightbox: (mediaList: Anexo[], index: number) => void;
  onEditLegenda: (id: string, legenda: string) => void;
}

export const TicketChat: React.FC<TicketChatProps> = ({
  ticket,
  mensagens,
  userId,
  canReply,
  canEditLegenda,
  novaMensagem,
  onNovaMensagemChange,
  selectedFiles,
  onFilesSelect,
  onRemoveFile,
  sending,
  onSend,
  onOpenLightbox,
  onEditLegenda,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 200);
    return () => clearTimeout(t);
  }, [mensagens]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onFilesSelect(files);
  };

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const getAutorRole = (autorId: string | undefined) => {
    if (!autorId) return null;
    if (autorId === ticket.criado_por) return 'Gestor';
    if (autorId === ticket.atribuido_a) return 'Assistência';
    return null;
  };

  return (
    <Card className="flex flex-col lg:flex-1 border-none shadow-md lg:overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader className="border-b bg-muted/30 py-3 shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Conversação em Tempo Real
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex flex-col flex-1 lg:min-h-0">
        <div className="overflow-y-auto h-[55vh] lg:h-auto lg:max-h-none lg:flex-1 p-4">
          {mensagens.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 italic">
              Ainda não há mensagens neste ticket.
            </p>
          ) : (
            <div className="space-y-4">
              {mensagens.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  ticket={ticket}
                  userId={userId}
                  canEditLegenda={canEditLegenda}
                  getAutorRole={getAutorRole}
                  onOpenLightbox={onOpenLightbox}
                  onEditLegenda={onEditLegenda}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <Separator />

        <div className="bg-muted/30 border-t p-4 space-y-3">
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-background border shadow-sm px-2 py-1.5 rounded-md text-xs animate-in zoom-in-95"
                >
                  {getFileIcon(file.type)}
                  <span className="max-w-[150px] truncate font-medium">{file.name}</span>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => onRemoveFile(index)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {canReply ? (
            <div className="flex items-end gap-3 bg-background border rounded-xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={handleFileInput}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Anexar ficheiros"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </div>

              <Textarea
                placeholder="Escreva uma mensagem..."
                value={novaMensagem}
                onChange={(e) => onNovaMensagemChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (novaMensagem.trim() || selectedFiles.length > 0) {
                      onSend();
                    }
                  }
                }}
                className="flex-1 min-h-[44px] max-h-[200px] border-none shadow-none focus-visible:ring-0 resize-none py-2.5 px-0 text-sm"
                disabled={sending}
              />

              <Button
                size="icon"
                className="h-10 w-10 rounded-full shrink-0 shadow-md transition-all active:scale-95"
                onClick={onSend}
                disabled={sending || (!novaMensagem.trim() && selectedFiles.length === 0)}
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          ) : (
            <div className="text-center py-2 px-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200 text-sm italic">
              Não tens permissão para responder a este ticket.
            </div>
          )}

          <p className="hidden sm:block text-[10px] text-muted-foreground text-center">
            Prime{' '}
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[9px] font-medium opacity-100">
              Enter
            </kbd>{' '}
            para enviar,{' '}
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[9px] font-medium opacity-100">
              Shift + Enter
            </kbd>{' '}
            para nova linha.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

interface MessageBubbleProps {
  msg: Mensagem;
  ticket: Ticket;
  userId: string | undefined;
  canEditLegenda: boolean;
  getAutorRole: (autorId: string | undefined) => string | null;
  onOpenLightbox: (mediaList: Anexo[], index: number) => void;
  onEditLegenda: (id: string, legenda: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  ticket,
  userId,
  canEditLegenda,
  getAutorRole,
  onOpenLightbox,
  onEditLegenda,
}) => {
  const isStatusChange =
    msg.tipo === 'status_change' &&
    !msg.mensagem.startsWith('Ticket criado') &&
    !msg.mensagem.toLowerCase().startsWith('viatura reparada');
  const isOwnMessage = msg.autor?.id === userId;

  const bubbleClass = isStatusChange
    ? 'bg-muted/50 text-center text-sm'
    : isOwnMessage
      ? 'bg-primary/10 ml-4 sm:ml-8'
      : 'bg-muted mr-4 sm:mr-8';

  return (
    <div className={`p-3 rounded-lg ${bubbleClass}`}>
      {msg.tipo !== 'status_change' && (
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm">{msg.autor?.nome || 'Sistema'}</span>
          {(msg.autor?.cargo || getAutorRole(msg.autor?.id)) && (
            <Badge
              variant="outline"
              className={
                (msg.autor?.cargo || getAutorRole(msg.autor?.id)) === 'Gestor' ||
                (msg.autor?.cargo || '').includes('Gestor')
                  ? 'border-blue-500 text-blue-500 text-xs py-0 px-1.5'
                  : 'border-green-500 text-green-500 text-xs py-0 px-1.5'
              }
            >
              {msg.autor?.grupo?.nome || msg.autor?.cargo || getAutorRole(msg.autor?.id)}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
          </span>
        </div>
      )}
      {msg.tipo !== 'anexo' && (
        <div className={msg.tipo === 'status_change' ? 'italic' : ''}>
          <MessageContent text={msg.mensagem} ticket={ticket} anexosCount={msg.anexos?.length} />
        </div>
      )}

      {msg.anexos && msg.anexos.length > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-w-3xl">
          {msg.anexos.map((anexo) => (
            <AnexoCard
              key={anexo.id}
              anexo={anexo}
              anexos={msg.anexos || []}
              canEditLegenda={canEditLegenda}
              onOpenLightbox={onOpenLightbox}
              onEditLegenda={onEditLegenda}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MessageContentProps {
  text: string;
  ticket: Ticket;
  anexosCount?: number;
}

const MessageContent: React.FC<MessageContentProps> = ({ text, ticket, anexosCount = 0 }) => {
  if (text.startsWith('Ticket criado com check-in completo')) {
    const data = parseMessageData(text);
    return (
      <CheckCard
        title="Check-in de Entrada Efetuado"
        accent="primary"
        rows={[
          {
            icon: <Gauge className="h-3 w-3 text-blue-500" />,
            label: 'KM Inicial',
            value: data['KM Inicial'],
          },
          {
            icon: <Fuel className="h-3 w-3 text-orange-500" />,
            label: 'Combustível',
            value: data['Combustível'],
          },
          {
            icon: <Droplets className="h-3 w-3 text-cyan-500" />,
            label: 'AdBlue',
            value: data['AdBlue'],
          },
          {
            icon: <Sparkles className="h-3 w-3 text-yellow-500" />,
            label: 'Limpeza',
            value: data['Limpeza'],
          },
          {
            icon: <Wallet className="h-3 w-3 text-green-500" />,
            label: 'Orçamento',
            value: data['Orçamento Estimado'],
          },
          {
            icon: <ImageIcon className="h-3 w-3 text-purple-500" />,
            label: 'Media',
            value: `${data['Média']?.split(' ')[0] || '0'} ficheiros`,
          },
        ]}
      />
    );
  }

  if (text.startsWith('Viatura Reparada. Valor:')) {
    return (
      <CheckCard
        title="Check-out de Saída Efetuado"
        accent="green"
        rows={[
          {
            icon: <Gauge className="h-3 w-3 text-blue-500" />,
            label: 'KM Final',
            value: ticket.km_fim?.toString(),
          },
          {
            icon: <Fuel className="h-3 w-3 text-orange-500" />,
            label: 'Combustível',
            value: ticket.combustivel_fim,
          },
          { icon: <Droplets className="h-3 w-3 text-cyan-500" />, label: 'AdBlue', value: '---' },
          {
            icon: <Sparkles className="h-3 w-3 text-yellow-500" />,
            label: 'Limpeza',
            value: '---',
          },
          {
            icon: <Wallet className="h-3 w-3 text-green-500" />,
            label: 'Valor Total',
            value: ticket.valor_reparacao ? `${ticket.valor_reparacao}€` : undefined,
          },
          {
            icon: <ImageIcon className="h-3 w-3 text-purple-500" />,
            label: 'Media',
            value: `${anexosCount} ficheiros`,
          },
        ]}
        footer={text}
      />
    );
  }

  if (text.startsWith('Viatura reparada com check-out completo')) {
    const data = parseMessageData(text);
    return (
      <CheckCard
        title="Check-out de Saída Efetuado"
        accent="green"
        rows={[
          {
            icon: <Gauge className="h-3 w-3 text-blue-500" />,
            label: 'KM Final',
            value: data['KM Final'] || ticket.km_fim?.toString(),
          },
          {
            icon: <Fuel className="h-3 w-3 text-orange-500" />,
            label: 'Combustível',
            value: data['Combustível'] || ticket.combustivel_fim,
          },
          {
            icon: <Droplets className="h-3 w-3 text-cyan-500" />,
            label: 'AdBlue',
            value: data['AdBlue'],
          },
          {
            icon: <Sparkles className="h-3 w-3 text-yellow-500" />,
            label: 'Limpeza',
            value: data['Limpeza'],
          },
          {
            icon: <Wallet className="h-3 w-3 text-green-500" />,
            label: 'Valor Total',
            value:
              data['Valor Total'] ||
              (ticket.valor_reparacao ? `${ticket.valor_reparacao}€` : undefined),
          },
          {
            icon: <ImageIcon className="h-3 w-3 text-purple-500" />,
            label: 'Media',
            value: data['Média'] || '0 ficheiros',
          },
        ]}
        descricao={data['Descrição'] || ticket.descricao || undefined}
      />
    );
  }

  return <p className="text-sm whitespace-pre-wrap">{text}</p>;
};

function parseMessageData(text: string): Record<string, string> {
  const parts = text.split(' - ');
  const data: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.includes(': ')) {
      const [key, ...val] = part.split(': ');
      data[key.trim()] = val.join(': ').trim();
    }
  });
  return data;
}

interface CheckCardProps {
  title: string;
  accent: 'primary' | 'green';
  rows: { icon: React.ReactNode; label: string; value: string | null | undefined }[];
  footer?: string;
  descricao?: string;
}

const CheckCard: React.FC<CheckCardProps> = ({ title, accent, rows, footer, descricao }) => {
  const accentBorder = accent === 'primary' ? 'border-primary/20' : 'border-green-500/20';
  const accentBorderLight = accent === 'primary' ? 'border-primary/10' : 'border-green-500/10';
  const accentText = accent === 'primary' ? 'text-primary' : 'text-green-600';
  const Icon = accent === 'primary' ? CheckCircle2 : CheckCircle2;

  return (
    <div
      className={`bg-background/40 backdrop-blur-sm border ${accentBorder} rounded-xl p-4 my-2 space-y-4 shadow-sm`}
    >
      <div className={`flex items-center gap-2 border-b ${accentBorderLight} pb-2`}>
        <Icon className={`h-4 w-4 ${accentText}`} />
        <span className={`font-bold text-sm ${accentText} uppercase tracking-wider`}>{title}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <span className="text-[10px] uppercase text-muted-foreground font-bold flex items-center gap-1">
              {row.icon} {row.label}
            </span>
            <p className="text-sm font-bold capitalize">{row.value || '---'}</p>
          </div>
        ))}
      </div>

      {footer && (
        <div className={`mt-4 pt-2 border-t ${accentBorderLight}`}>
          <p className="text-[10px] text-muted-foreground italic">{footer}</p>
        </div>
      )}

      {descricao && (
        <div className={`mt-4 pt-2 border-t ${accentBorderLight}`}>
          <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">
            Resumo da Reparação
          </span>
          <p className="text-xs italic text-muted-foreground">"{descricao}"</p>
        </div>
      )}
    </div>
  );
};

interface AnexoCardProps {
  anexo: Anexo;
  anexos: Anexo[];
  canEditLegenda: boolean;
  onOpenLightbox: (mediaList: Anexo[], index: number) => void;
  onEditLegenda: (id: string, legenda: string) => void;
}

const AnexoCard: React.FC<AnexoCardProps> = ({
  anexo,
  anexos,
  canEditLegenda,
  onOpenLightbox,
  onEditLegenda,
}) => {
  const isImage =
    anexo.tipo_ficheiro?.startsWith('image/') ||
    anexo.tipo_ficheiro === 'foto' ||
    !!anexo.ficheiro_url?.match(/\.(jpg|jpeg|png|webp)$/i);
  const isVideo =
    !isImage &&
    (anexo.tipo_ficheiro === 'video' || !!anexo.ficheiro_url?.match(/\.(mp4|webm|mov|ogg)$/i));
  const isOther = !isImage && !isVideo;
  const indexInList = anexos.indexOf(anexo);

  return (
    <div className="flex flex-col bg-background rounded border overflow-hidden">
      {isImage && (
        <div
          className="relative cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onOpenLightbox(anexos, indexInList)}
        >
          <img
            src={anexo.ficheiro_url}
            alt={anexo.nome_ficheiro}
            className="w-full aspect-square object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://placehold.co/400x300?text=Imagem+Indispon%C3%ADvel';
            }}
          />
          {anexo.legenda && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 backdrop-blur-sm italic">
              "{anexo.legenda}"
            </div>
          )}
        </div>
      )}

      {isVideo && (
        <div
          className="relative cursor-pointer hover:opacity-90 transition-opacity bg-black flex items-center justify-center aspect-square"
          onClick={() => onOpenLightbox(anexos, indexInList)}
        >
          <video
            src={anexo.ficheiro_url}
            className="w-full h-full object-cover opacity-60"
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-10 w-10 text-white opacity-90 drop-shadow-md" />
          </div>
        </div>
      )}

      {isOther && (
        <div className="flex items-center gap-2 p-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-xs truncate">{anexo.nome_ficheiro}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1 px-1 pb-1 pt-0.5">
        <a
          href={anexo.ficheiro_url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-muted rounded"
          title="Ver"
        >
          <Eye className="h-3 w-3 text-muted-foreground" />
        </a>
        <a
          href={anexo.ficheiro_url}
          download={anexo.nome_ficheiro}
          className="p-1 hover:bg-muted rounded"
          title="Descarregar"
        >
          <Download className="h-3 w-3 text-muted-foreground" />
        </a>
        {canEditLegenda && (
          <button
            onClick={() => onEditLegenda(anexo.id, anexo.legenda || '')}
            className="p-1 hover:bg-muted rounded text-primary"
            title="Editar Legenda"
          >
            <Wrench className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
