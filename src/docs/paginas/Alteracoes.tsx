import { Badge } from '@/components/ui/badge';
import { GuiaPagina } from '../componentes/GuiaPagina';

type Tipo = 'Novo' | 'Correcção' | 'Incompatível';

interface Alteracao {
  data: string;
  versao: string;
  tipo: Tipo;
  texto: string;
}

/** Lista cronológica, mais recente primeiro. A versão é a do OpenAPI (info.version). */
const ALTERACOES: Alteracao[] = [
  {
    data: '2026-10-20',
    versao: '1.0.0',
    tipo: 'Correcção',
    texto:
      'imagem_url dos modelos (rent-a-car e TVDE, no catálogo e na disponibilidade) volta a ser ' +
      'a foto do próprio modelo, num link público e fixo que só muda quando a foto é ' +
      'substituída. null se o modelo não tiver foto; a foto das viaturas deixa de ser usada. ' +
      'A imagem das categorias não muda.',
  },
  {
    data: '2026-10-16',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Candidatura TVDE pelo site: o motorista guarda o rascunho, envia os 8 documentos ' +
      'directamente para um URL assinado e submete, tudo com a sessão da sua conta ' +
      '(X-Conta-Token). Rotas novas GET, PUT e POST /conta/candidatura e POST, PUT e DELETE ' +
      '/conta/candidatura-documentos/{tipo}. A API passa a aceitar o método PUT. Códigos novos ' +
      'CANDIDATURA_NAO_EDITAVEL (409), CANDIDATURA_INCOMPLETA (422) e PEDIDO_INVALIDO (422).',
  },
  {
    data: '2026-10-16',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Conta de cliente: quem cria conta no site (signUp com tipo_utilizador: cliente) e ' +
      'confirma o email vê as suas reservas e faturas. Rotas novas GET /conta, GET ' +
      '/conta/reservas, DELETE /conta/reservas/{codigo}, GET /conta/faturas e GET ' +
      '/conta/faturas/{id} (o PDF), todas com o cabeçalho X-Conta-Token (access_token da ' +
      'pessoa). Permissões novas conta:read e conta:write. O POST /reservas aceita o mesmo ' +
      'cabeçalho e põe a reserva na ficha da conta. X-Conta-Token passa a ser o nome do ' +
      'cabeçalho também no POST /tvde/candidaturas; X-Motorista-Token continua a funcionar.',
  },
  {
    data: '2026-10-14',
    versao: '1.0.0',
    tipo: 'Incompatível',
    texto:
      'Só se mostra o que se pode alugar. Rent-a-car: o levantamento em /disponibilidade, ' +
      '/cotacoes e /reservas tem de ser nos próximos 15 dias (senão 400 PERIODO_INVALIDO); o ' +
      'máximo de 30 dias de aluguer não muda. GET /modelos só lista modelos com um dia livre ' +
      'nos próximos 15 dias e traz disponivel_desde (AAAA-MM-DD, o primeiro); GET /modelos/{id} ' +
      'continua a responder, com disponivel_desde null quando não há dia livre. TVDE: ' +
      'GET /tvde/modelos e GET /tvde/disponibilidade só contam carros livres hoje, e inicio ' +
      'passa a ser só a data do levantamento; GET /tvde/modelos/{id} continua a responder. ' +
      'Modelos com preço 0 € na tarifa deixam de aparecer.',
  },
  {
    data: '2026-10-14',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Candidaturas TVDE com conta: o POST /tvde/candidaturas aceita o cabeçalho opcional ' +
      'X-Motorista-Token (access_token da sessão do motorista no WeGest) e liga a candidatura ' +
      'à conta. A resposta do POST e do GET traz com_conta. Códigos novos SESSAO_INVALIDA ' +
      '(401) e CONTA_INVALIDA (403). Sem o cabeçalho, nada muda.',
  },
  {
    data: '2026-10-09',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Candidaturas TVDE (fase D2): POST /tvde/candidaturas grava a candidatura de um motorista, ' +
      'que entra como submetido para a equipa aprovar, e GET /tvde/candidaturas/{id} devolve só ' +
      'o estado. A mesma referencia_externa nunca cria duas. Permissões novas ' +
      'tvde:candidaturas:write e tvde:candidaturas:read, limite de 50 candidaturas por dia por ' +
      'chave e código novo CANDIDATURA_EXISTENTE (409).',
  },
  {
    data: '2026-10-06',
    versao: '1.0.0',
    tipo: 'Correcção',
    texto:
      'imagem_url dos modelos (rent-a-car e TVDE, no catálogo e na disponibilidade) passa a ser ' +
      'a foto de uma viatura desse modelo, num link temporário válido 24 h que pode mudar entre ' +
      'pedidos: guarde o modelo, não o link. null se nenhuma viatura do modelo tiver foto. A ' +
      'imagem das categorias não muda.',
  },
  {
    data: '2026-10-06',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'TVDE (fase D1): GET /tvde/modelos e GET /tvde/modelos/{id} com o preço por semana e o IVA ' +
      'do TVDE, e GET /tvde/disponibilidade?inicio= com os carros livres a partir dessa data, sem ' +
      'fim. Permissão nova tvde:catalogo:read. O /health passa a dizer também tarifa_site_tvde.',
  },
  {
    data: '2026-10-02',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Reservas (fase C): POST /reservas cria uma reserva pendente, GET /reservas/{codigo} ' +
      'consulta-a e DELETE /reservas/{codigo} cancela-a enquanto está pendente. Códigos novos: ' +
      'PRECO_ALTERADO (409) e ESTADO_INVALIDO (409).',
  },
  {
    data: '2026-10-01',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Primeira versão pública (fase A): localizações, categorias, modelos, extras, ' +
      'coberturas e health, em https://api.wegest.pt/v1.',
  },
];

const VARIANTE: Record<Tipo, 'default' | 'secondary' | 'destructive'> = {
  Novo: 'default',
  Correcção: 'secondary',
  Incompatível: 'destructive',
};

export default function Alteracoes() {
  return (
    <GuiaPagina
      slug="alteracoes"
      introducao={<p>O que mudou na API, por versão. Mudanças incompatíveis vêm assinaladas.</p>}
    >
      <ol className="space-y-6">
        {ALTERACOES.map((a, i) => (
          // Lista fixa: o índice desempata duas alterações no mesmo dia e versão.
          <li key={`${a.data}-${i}`} className="border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={a.data} className="font-mono text-sm tabular-nums">
                {a.data}
              </time>
              <span className="font-mono text-sm text-muted-foreground">v{a.versao}</span>
              <Badge variant={VARIANTE[a.tipo]}>{a.tipo}</Badge>
            </div>
            <p className="mt-2 text-base leading-7">{a.texto}</p>
          </li>
        ))}
      </ol>
    </GuiaPagina>
  );
}
