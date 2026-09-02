# viaverde-scraper-wegest

Cópia de referência (versionada aqui, mas **não** deployada automaticamente a partir deste repo). O actor real corre no Apify:

- Actor ID: `8fz3SqtaKV6RTT4sa`
- Nome: `viaverde-scraper-wegest`
- Conta Apify: `marketing.dasprent@gmail.com`

Para atualizar o actor no Apify depois de editar este código, publica manualmente (Apify Console → Source, ou API `PUT /v2/acts/{actorId}/versions/{versionNumber}` + `POST /v2/acts/{actorId}/builds`).

## O que faz

Faz login na área Empresas do Via Verde (`viaverde.pt/empresas`), abre o separador Movimentos, filtra pelo período pedido, exporta para Excel e envia os movimentos para o `callbackUrl` (edge function `robot-webhook` do WeGest).

Input esperado: `{ email, password, periodo_inicio, periodo_fim, callbackUrl }` (datas em `YYYY-MM-DD`).
