// Adapter de faturação: Primavera. Fala só com o serviço do Primavera (providers/primavera-servico.ts).
// O agente local e a fila da AS Connect (primavera_jobs) foram retirados a 19/11/2026 por decisão do dono:
// uma integração sem `servico_url` já não emite e devolve uma mensagem a pedir a configuração do serviço.
import type { FaturacaoProvider } from '../types.ts';
import { primaveraServicoProvider } from './primavera-servico.ts';

export const primaveraProvider: FaturacaoProvider = primaveraServicoProvider;
