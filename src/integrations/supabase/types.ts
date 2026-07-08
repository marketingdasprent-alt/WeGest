export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      assistencia_anexos: {
        Row: {
          created_at: string | null
          ficheiro_url: string
          id: string
          legenda: string | null
          mensagem_id: string | null
          nome_ficheiro: string
          org_id: string | null
          tamanho: number | null
          ticket_id: string
          tipo_ficheiro: string | null
          tipo_inspecao: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          ficheiro_url: string
          id?: string
          legenda?: string | null
          mensagem_id?: string | null
          nome_ficheiro: string
          org_id?: string | null
          tamanho?: number | null
          ticket_id: string
          tipo_ficheiro?: string | null
          tipo_inspecao?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          ficheiro_url?: string
          id?: string
          legenda?: string | null
          mensagem_id?: string | null
          nome_ficheiro?: string
          org_id?: string | null
          tamanho?: number | null
          ticket_id?: string
          tipo_ficheiro?: string | null
          tipo_inspecao?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistencia_anexos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "assistencia_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_anexos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "assistencia_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      assistencia_categorias: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number | null
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number | null
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistencia_categorias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      assistencia_mensagens: {
        Row: {
          autor_id: string | null
          created_at: string | null
          id: string
          mensagem: string
          org_id: string | null
          ticket_id: string
          tipo: string | null
        }
        Insert: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          mensagem: string
          org_id?: string | null
          ticket_id: string
          tipo?: string | null
        }
        Update: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          mensagem?: string
          org_id?: string | null
          ticket_id?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistencia_mensagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_mensagens_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "assistencia_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      assistencia_ticket_acessos: {
        Row: {
          created_at: string | null
          id: string
          org_id: string | null
          profile_id: string | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          profile_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          profile_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistencia_ticket_acessos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_ticket_acessos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_ticket_acessos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "assistencia_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      assistencia_tickets: {
        Row: {
          adblue_nivel: string | null
          atribuido_a: string | null
          categoria_id: string | null
          cobrar_motorista: boolean | null
          combustivel_fim: string | null
          combustivel_inicio: string | null
          created_at: string | null
          criado_por: string | null
          data_estimada: string | null
          data_resolucao: string | null
          descricao: string | null
          eletricidade_qtd: number | null
          estado_limpeza: string | null
          fatura_url: string | null
          gpl_qtd: number | null
          id: string
          km_fim: number | null
          km_fim_indisponivel: boolean
          km_inicio: number | null
          km_inicio_indisponivel: boolean
          motorista_id: string | null
          numero: number
          numero_fatura: string | null
          org_id: string
          prioridade: string | null
          reparacao_id: string | null
          status: string | null
          titulo: string
          updated_at: string | null
          valor_orcamento: number | null
          valor_reparacao: number | null
          viatura_id: string
          viatura_substituta_id: string | null
        }
        Insert: {
          adblue_nivel?: string | null
          atribuido_a?: string | null
          categoria_id?: string | null
          cobrar_motorista?: boolean | null
          combustivel_fim?: string | null
          combustivel_inicio?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_estimada?: string | null
          data_resolucao?: string | null
          descricao?: string | null
          eletricidade_qtd?: number | null
          estado_limpeza?: string | null
          fatura_url?: string | null
          gpl_qtd?: number | null
          id?: string
          km_fim?: number | null
          km_fim_indisponivel?: boolean
          km_inicio?: number | null
          km_inicio_indisponivel?: boolean
          motorista_id?: string | null
          numero?: number
          numero_fatura?: string | null
          org_id?: string
          prioridade?: string | null
          reparacao_id?: string | null
          status?: string | null
          titulo: string
          updated_at?: string | null
          valor_orcamento?: number | null
          valor_reparacao?: number | null
          viatura_id: string
          viatura_substituta_id?: string | null
        }
        Update: {
          adblue_nivel?: string | null
          atribuido_a?: string | null
          categoria_id?: string | null
          cobrar_motorista?: boolean | null
          combustivel_fim?: string | null
          combustivel_inicio?: string | null
          created_at?: string | null
          criado_por?: string | null
          data_estimada?: string | null
          data_resolucao?: string | null
          descricao?: string | null
          eletricidade_qtd?: number | null
          estado_limpeza?: string | null
          fatura_url?: string | null
          gpl_qtd?: number | null
          id?: string
          km_fim?: number | null
          km_fim_indisponivel?: boolean
          km_inicio?: number | null
          km_inicio_indisponivel?: boolean
          motorista_id?: string | null
          numero?: number
          numero_fatura?: string | null
          org_id?: string
          prioridade?: string | null
          reparacao_id?: string | null
          status?: string | null
          titulo?: string
          updated_at?: string | null
          valor_orcamento?: number | null
          valor_reparacao?: number | null
          viatura_id?: string
          viatura_substituta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistencia_tickets_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "assistencia_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_tickets_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_tickets_reparacao_id_fkey"
            columns: ["reparacao_id"]
            isOneToOne: false
            referencedRelation: "viatura_reparacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_tickets_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistencia_tickets_viatura_substituta_id_fkey"
            columns: ["viatura_substituta_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_handover: {
        Row: {
          id: string;
          org_id: string;
          calendario_evento_id: string | null;
          contrato_id: string | null;
          papel: string;
          signatario_nome: string;
          signatario_id: string | null;
          storage_path: string;
          assinado_em: string;
          assinado_por_id: string;
        };
        Insert: {
          id?: string;
          org_id?: string;
          calendario_evento_id?: string | null;
          contrato_id?: string | null;
          papel: string;
          signatario_nome: string;
          signatario_id?: string | null;
          storage_path: string;
          assinado_em?: string;
          assinado_por_id: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          calendario_evento_id?: string | null;
          contrato_id?: string | null;
          papel?: string;
          signatario_nome?: string;
          signatario_id?: string | null;
          storage_path?: string;
          assinado_em?: string;
          assinado_por_id?: string;
        };
        Relationships: [];
      }
      bolt_drivers: {
        Row: {
          created_at: string | null
          dados_raw: Json | null
          driver_uuid: string
          email: string | null
          id: string
          integracao_id: string | null
          motorista_id: string | null
          name: string | null
          org_id: string | null
          phone: string | null
          registration_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dados_raw?: Json | null
          driver_uuid: string
          email?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          name?: string | null
          org_id?: string | null
          phone?: string | null
          registration_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dados_raw?: Json | null
          driver_uuid?: string
          email?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          name?: string | null
          org_id?: string | null
          phone?: string | null
          registration_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_drivers_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_drivers_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      bolt_mapeamento_motoristas: {
        Row: {
          auto_mapped: boolean | null
          created_at: string | null
          driver_name: string | null
          driver_phone: string | null
          driver_uuid: string
          id: string
          integracao_id: string | null
          motorista_id: string | null
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          auto_mapped?: boolean | null
          created_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_uuid: string
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_mapped?: boolean | null
          created_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_uuid?: string
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_mapeamento_motoristas_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_mapeamento_motoristas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_mapeamento_motoristas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      bolt_resumos_semanais: {
        Row: {
          categorias_ativas: string | null
          classificacao_media: number | null
          comissoes: number | null
          created_at: string | null
          desconto_comissao_app: number | null
          desconto_comissao_dinheiro: number | null
          dinheiro_recebido: number | null
          distancia_media_km: number | null
          distancia_total_km: number | null
          email: string | null
          ganhos_brutos_app: number | null
          ganhos_brutos_dinheiro: number | null
          ganhos_brutos_hora: number | null
          ganhos_brutos_total: number | null
          ganhos_campanha: number | null
          ganhos_liquidos: number | null
          ganhos_liquidos_hora: number | null
          gorjetas: number | null
          id: string
          identificador_individual: string | null
          identificador_motorista: string | null
          integracao_id: string
          iva_ganhos_app: number | null
          iva_ganhos_dinheiro: number | null
          iva_taxas_cancelamento: number | null
          iva_taxas_reserva: number | null
          motorista_id: string | null
          motorista_nome: string | null
          nivel: string | null
          org_id: string | null
          outras_taxas: number | null
          pagamento_previsto: number | null
          periodo: string
          periodo_fim: string | null
          periodo_inicio: string | null
          pontuacao_motorista: number | null
          portagens: number | null
          raw_data: Json | null
          reembolsos_despesas: number | null
          reembolsos_passageiros: number | null
          taxa_aceitacao: number | null
          taxa_finalizacao_aceites: number | null
          taxa_finalizacao_todas: number | null
          taxas_cancelamento: number | null
          taxas_reserva: number | null
          telefone: string | null
          tempo_online_min: number | null
          total_taxas: number | null
          updated_at: string | null
          utilizacao: number | null
          viagens_dinheiro_ativadas: string | null
          viagens_terminadas: number | null
        }
        Insert: {
          categorias_ativas?: string | null
          classificacao_media?: number | null
          comissoes?: number | null
          created_at?: string | null
          desconto_comissao_app?: number | null
          desconto_comissao_dinheiro?: number | null
          dinheiro_recebido?: number | null
          distancia_media_km?: number | null
          distancia_total_km?: number | null
          email?: string | null
          ganhos_brutos_app?: number | null
          ganhos_brutos_dinheiro?: number | null
          ganhos_brutos_hora?: number | null
          ganhos_brutos_total?: number | null
          ganhos_campanha?: number | null
          ganhos_liquidos?: number | null
          ganhos_liquidos_hora?: number | null
          gorjetas?: number | null
          id?: string
          identificador_individual?: string | null
          identificador_motorista?: string | null
          integracao_id: string
          iva_ganhos_app?: number | null
          iva_ganhos_dinheiro?: number | null
          iva_taxas_cancelamento?: number | null
          iva_taxas_reserva?: number | null
          motorista_id?: string | null
          motorista_nome?: string | null
          nivel?: string | null
          org_id?: string | null
          outras_taxas?: number | null
          pagamento_previsto?: number | null
          periodo: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          pontuacao_motorista?: number | null
          portagens?: number | null
          raw_data?: Json | null
          reembolsos_despesas?: number | null
          reembolsos_passageiros?: number | null
          taxa_aceitacao?: number | null
          taxa_finalizacao_aceites?: number | null
          taxa_finalizacao_todas?: number | null
          taxas_cancelamento?: number | null
          taxas_reserva?: number | null
          telefone?: string | null
          tempo_online_min?: number | null
          total_taxas?: number | null
          updated_at?: string | null
          utilizacao?: number | null
          viagens_dinheiro_ativadas?: string | null
          viagens_terminadas?: number | null
        }
        Update: {
          categorias_ativas?: string | null
          classificacao_media?: number | null
          comissoes?: number | null
          created_at?: string | null
          desconto_comissao_app?: number | null
          desconto_comissao_dinheiro?: number | null
          dinheiro_recebido?: number | null
          distancia_media_km?: number | null
          distancia_total_km?: number | null
          email?: string | null
          ganhos_brutos_app?: number | null
          ganhos_brutos_dinheiro?: number | null
          ganhos_brutos_hora?: number | null
          ganhos_brutos_total?: number | null
          ganhos_campanha?: number | null
          ganhos_liquidos?: number | null
          ganhos_liquidos_hora?: number | null
          gorjetas?: number | null
          id?: string
          identificador_individual?: string | null
          identificador_motorista?: string | null
          integracao_id?: string
          iva_ganhos_app?: number | null
          iva_ganhos_dinheiro?: number | null
          iva_taxas_cancelamento?: number | null
          iva_taxas_reserva?: number | null
          motorista_id?: string | null
          motorista_nome?: string | null
          nivel?: string | null
          org_id?: string | null
          outras_taxas?: number | null
          pagamento_previsto?: number | null
          periodo?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          pontuacao_motorista?: number | null
          portagens?: number | null
          raw_data?: Json | null
          reembolsos_despesas?: number | null
          reembolsos_passageiros?: number | null
          taxa_aceitacao?: number | null
          taxa_finalizacao_aceites?: number | null
          taxa_finalizacao_todas?: number | null
          taxas_cancelamento?: number | null
          taxas_reserva?: number | null
          telefone?: string | null
          tempo_online_min?: number | null
          total_taxas?: number | null
          updated_at?: string | null
          utilizacao?: number | null
          viagens_dinheiro_ativadas?: string | null
          viagens_terminadas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_resumos_semanais_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_resumos_semanais_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_resumos_semanais_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      bolt_sync_logs: {
        Row: {
          created_at: string | null
          detalhes: Json | null
          erros: number | null
          executado_por: string | null
          id: string
          integracao_id: string | null
          mensagem: string | null
          org_id: string | null
          status: string
          tipo: string
          viagens_atualizadas: number | null
          viagens_novas: number | null
        }
        Insert: {
          created_at?: string | null
          detalhes?: Json | null
          erros?: number | null
          executado_por?: string | null
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          org_id?: string | null
          status: string
          tipo: string
          viagens_atualizadas?: number | null
          viagens_novas?: number | null
        }
        Update: {
          created_at?: string | null
          detalhes?: Json | null
          erros?: number | null
          executado_por?: string | null
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          org_id?: string | null
          status?: string
          tipo?: string
          viagens_atualizadas?: number | null
          viagens_novas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_sync_logs_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_sync_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      bolt_vehicles: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string | null
          dados_raw: Json | null
          id: string
          integracao_id: string | null
          license_plate: string | null
          model: string | null
          org_id: string | null
          status: string | null
          updated_at: string | null
          vehicle_uuid: string
          viatura_id: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          dados_raw?: Json | null
          id?: string
          integracao_id?: string | null
          license_plate?: string | null
          model?: string | null
          org_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_uuid: string
          viatura_id?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          dados_raw?: Json | null
          id?: string
          integracao_id?: string | null
          license_plate?: string | null
          model?: string | null
          org_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_uuid?: string
          viatura_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_vehicles_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_vehicles_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      bolt_viagens: {
        Row: {
          commission: number | null
          created_at: string | null
          dados_raw: Json | null
          destination_address: string | null
          driver_earnings: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_uuid: string | null
          id: string
          integracao_id: string | null
          motorista_id: string | null
          order_created_timestamp: string | null
          order_reference: string
          order_status: string | null
          org_id: string | null
          payment_confirmed_timestamp: string | null
          payment_method: string | null
          pickup_address: string | null
          total_price: number | null
          updated_at: string | null
          vehicle_license_plate: string | null
          vehicle_model: string | null
          viatura_id: string | null
        }
        Insert: {
          commission?: number | null
          created_at?: string | null
          dados_raw?: Json | null
          destination_address?: string | null
          driver_earnings?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_uuid?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          order_created_timestamp?: string | null
          order_reference: string
          order_status?: string | null
          org_id?: string | null
          payment_confirmed_timestamp?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          total_price?: number | null
          updated_at?: string | null
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
          viatura_id?: string | null
        }
        Update: {
          commission?: number | null
          created_at?: string | null
          dados_raw?: Json | null
          destination_address?: string | null
          driver_earnings?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_uuid?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          order_created_timestamp?: string | null
          order_reference?: string
          order_status?: string | null
          org_id?: string | null
          payment_confirmed_timestamp?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          total_price?: number | null
          updated_at?: string | null
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bolt_viagens_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_viagens_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_viagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolt_viagens_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_cartoes: {
        Row: {
          card_id: string
          card_number: string | null
          card_status: string | null
          card_type: string | null
          created_at: string | null
          driver_name: string | null
          expiry_date: string | null
          id: string
          integracao_id: string
          motorista_id: string | null
          org_id: string | null
          raw_data: Json | null
          updated_at: string | null
          vehicle_registration: string | null
          viatura_id: string | null
        }
        Insert: {
          card_id: string
          card_number?: string | null
          card_status?: string | null
          card_type?: string | null
          created_at?: string | null
          driver_name?: string | null
          expiry_date?: string | null
          id?: string
          integracao_id: string
          motorista_id?: string | null
          org_id?: string | null
          raw_data?: Json | null
          updated_at?: string | null
          vehicle_registration?: string | null
          viatura_id?: string | null
        }
        Update: {
          card_id?: string
          card_number?: string | null
          card_status?: string | null
          card_type?: string | null
          created_at?: string | null
          driver_name?: string | null
          expiry_date?: string | null
          id?: string
          integracao_id?: string
          motorista_id?: string | null
          org_id?: string | null
          raw_data?: Json | null
          updated_at?: string | null
          vehicle_registration?: string | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bp_cartoes_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_cartoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_cartoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_cartoes_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_transacoes: {
        Row: {
          amount: number | null
          card_id: string | null
          created_at: string | null
          fuel_type: string | null
          id: string
          integracao_id: string
          motorista_id: string | null
          org_id: string | null
          quantity: number | null
          raw_data: Json | null
          station_location: string | null
          station_name: string | null
          transaction_date: string
          transaction_id: string
          updated_at: string | null
          viatura_id: string | null
        }
        Insert: {
          amount?: number | null
          card_id?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id: string
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date: string
          transaction_id: string
          updated_at?: string | null
          viatura_id?: string | null
        }
        Update: {
          amount?: number | null
          card_id?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id?: string
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date?: string
          transaction_id?: string
          updated_at?: string | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bp_transacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "bp_cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_transacoes_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_transacoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_transacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_transacoes_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      calendario_config: {
        Row: {
          created_at: string
          email_cc: string | null
          id: string
          org_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_cc?: string | null
          id?: string
          org_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_cc?: string | null
          id?: string
          org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendario_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendario_eventos: {
        Row: {
          cidade: string | null
          created_at: string
          criado_por: string
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          dia_todo: boolean
          id: string
          lembrete_enviado_dia: boolean
          lembrete_enviado_vespera: boolean
          lista_marca: string | null
          lista_modelo: string | null
          lista_notificada_em: string | null
          matricula_devolver: string | null
          motorista_id: string | null
          org_id: string | null
          origem_id: string | null
          origem_tipo: string | null
          realizado_em: string | null
          realizado_por_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          criado_por: string
          data_fim?: string | null
          data_inicio: string
          descricao?: string | null
          dia_todo?: boolean
          id?: string
          lembrete_enviado_dia?: boolean
          lembrete_enviado_vespera?: boolean
          lista_marca?: string | null
          lista_modelo?: string | null
          lista_notificada_em?: string | null
          matricula_devolver?: string | null
          motorista_id?: string | null
          org_id?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          realizado_em?: string | null
          realizado_por_id?: string | null
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          criado_por?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          dia_todo?: boolean
          id?: string
          lembrete_enviado_dia?: boolean
          lembrete_enviado_vespera?: boolean
          lista_marca?: string | null
          lista_modelo?: string | null
          lista_notificada_em?: string | null
          matricula_devolver?: string | null
          motorista_id?: string | null
          org_id?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          realizado_em?: string | null
          realizado_por_id?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendario_eventos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendario_eventos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendario_eventos_apagados: {
        Row: {
          apagado_em: string
          apagado_por: string | null
          cidade: string | null
          criado_por: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          evento_id: string
          id: string
          matricula_devolver: string | null
          motorista_id: string | null
          org_id: string | null
          origem_id: string | null
          origem_tipo: string | null
          realizado_em: string | null
          realizado_por_id: string | null
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          apagado_em?: string
          apagado_por?: string | null
          cidade?: string | null
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          evento_id: string
          id?: string
          matricula_devolver?: string | null
          motorista_id?: string | null
          org_id?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          realizado_em?: string | null
          realizado_por_id?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          apagado_em?: string
          apagado_por?: string | null
          cidade?: string | null
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          evento_id?: string
          id?: string
          matricula_devolver?: string | null
          motorista_id?: string | null
          org_id?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          realizado_em?: string | null
          realizado_por_id?: string | null
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: []
      }
      calendario_eventos_historico: {
        Row: {
          campo: string
          editado_em: string
          editado_por: string
          evento_id: string
          id: string
          org_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo: string
          editado_em?: string
          editado_por: string
          evento_id: string
          id?: string
          org_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo?: string
          editado_em?: string
          editado_por?: string
          evento_id?: string
          id?: string
          org_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendario_eventos_historico_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "calendario_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendario_eventos_historico_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_catalogo: {
        Row: {
          categoria: string
          chave: string
          created_at: string
          created_by: string | null
          fonte: string
          id: string
          label: string
        }
        Insert: {
          categoria: string
          chave: string
          created_at?: string
          created_by?: string | null
          fonte: string
          id?: string
          label: string
        }
        Update: {
          categoria?: string
          chave?: string
          created_at?: string
          created_by?: string | null
          fonte?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      cargo_permissoes: {
        Row: {
          cargo_id: string
          created_at: string | null
          id: string
          org_id: string | null
          pode_editar: boolean
          recurso_id: string
          tem_acesso: boolean | null
        }
        Insert: {
          cargo_id: string
          created_at?: string | null
          id?: string
          org_id?: string | null
          pode_editar?: boolean
          recurso_id: string
          tem_acesso?: boolean | null
        }
        Update: {
          cargo_id?: string
          created_at?: string | null
          id?: string
          org_id?: string | null
          pode_editar?: boolean
          recurso_id?: string
          tem_acesso?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cargo_permissoes_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_permissoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_permissoes_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes_frota: {
        Row: {
          ambito: string | null
          ativo: boolean
          cliente_id: string | null
          created_at: string
          data_validade: string | null
          detentor: string | null
          devolucao: string | null
          id: string
          limite: number | null
          motorista_id: string | null
          notas: string | null
          numero: string
          org_id: string
          pin: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ambito?: string | null
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          data_validade?: string | null
          detentor?: string | null
          devolucao?: string | null
          id?: string
          limite?: number | null
          motorista_id?: string | null
          notas?: string | null
          numero: string
          org_id?: string
          pin?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ambito?: string | null
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          data_validade?: string | null
          detentor?: string | null
          devolucao?: string | null
          id?: string
          limite?: number | null
          motorista_id?: string | null
          notas?: string | null
          numero?: string
          org_id?: string
          pin?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_frota_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_frota_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_anexos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          ficheiro_url: string
          id: string
          nome: string
          org_id: string
          tamanho_bytes: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url: string
          id?: string
          nome: string
          org_id?: string
          tamanho_bytes?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url?: string
          id?: string
          nome?: string
          org_id?: string
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_anexos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_documentos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          documento_id: string
          id: string
          org_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          documento_id: string
          id?: string
          org_id?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          documento_id?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documentos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cargo_representante: string | null
          cidade: string | null
          codigo: number
          codigo_postal: string | null
          created_at: string
          created_by: string | null
          data_nascimento: string | null
          deleted_at: string | null
          email: string | null
          genero: Database["public"]["Enums"]["genero_enum"] | null
          iban: string | null
          id: string
          is_emissora: boolean
          is_empresa: boolean
          licenca_tvde: string | null
          licenca_validade: string | null
          localidade: string | null
          logo_url: string | null
          morada: string | null
          naturalidade: string | null
          nif: string | null
          nome: string
          nome_comercial: string | null
          observacoes: string | null
          org_id: string
          pais: string | null
          papel_timbrado: string | null
          representante: string | null
          sede: string | null
          telefone: string | null
          tipo_cliente: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cargo_representante?: string | null
          cidade?: string | null
          codigo?: number
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          iban?: string | null
          id?: string
          is_emissora?: boolean
          is_empresa?: boolean
          licenca_tvde?: string | null
          licenca_validade?: string | null
          localidade?: string | null
          logo_url?: string | null
          morada?: string | null
          naturalidade?: string | null
          nif?: string | null
          nome: string
          nome_comercial?: string | null
          observacoes?: string | null
          org_id?: string
          pais?: string | null
          papel_timbrado?: string | null
          representante?: string | null
          sede?: string | null
          telefone?: string | null
          tipo_cliente?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cargo_representante?: string | null
          cidade?: string | null
          codigo?: number
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          email?: string | null
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          iban?: string | null
          id?: string
          is_emissora?: boolean
          is_empresa?: boolean
          licenca_tvde?: string | null
          licenca_validade?: string | null
          localidade?: string | null
          logo_url?: string | null
          morada?: string | null
          naturalidade?: string | null
          nif?: string | null
          nome?: string
          nome_comercial?: string | null
          observacoes?: string | null
          org_id?: string
          pais?: string | null
          papel_timbrado?: string | null
          representante?: string | null
          sede?: string | null
          telefone?: string | null
          tipo_cliente?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      conta_movimentos: {
        Row: {
          cobranca_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_movimento: string
          descricao: string | null
          entidade_id: string
          id: string
          nota_credito_id: string | null
          org_id: string
          origem: string
          primavera_ref: string | null
          recibo_id: string | null
          sincronizado_primavera: boolean
          tipo: string
          valor: number
        }
        Insert: {
          cobranca_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          descricao?: string | null
          entidade_id: string
          id?: string
          nota_credito_id?: string | null
          org_id: string
          origem: string
          primavera_ref?: string | null
          recibo_id?: string | null
          sincronizado_primavera?: boolean
          tipo: string
          valor: number
        }
        Update: {
          cobranca_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          descricao?: string | null
          entidade_id?: string
          id?: string
          nota_credito_id?: string | null
          org_id?: string
          origem?: string
          primavera_ref?: string | null
          recibo_id?: string | null
          sincronizado_primavera?: boolean
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "conta_movimentos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "contrato_cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_movimentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "conta_movimentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_movimentos_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_movimentos_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "notas_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_movimentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conta_movimentos_recibo_id_fkey"
            columns: ["recibo_id"]
            isOneToOne: false
            referencedRelation: "recibos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_anexos: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          ficheiro_url: string
          id: string
          mime_type: string | null
          nome: string
          org_id: string
          tamanho_bytes: number | null
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url: string
          id?: string
          mime_type?: string | null
          nome: string
          org_id: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url?: string
          id?: string
          mime_type?: string | null
          nome?: string
          org_id?: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_anexos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_anexos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_coberturas: {
        Row: {
          cobertura_id: string
          cobertura_nome: string
          contrato_id: string
          created_at: string
          created_by: string | null
          franquia_valor: number | null
          id: string
          org_id: string
          preco_dia: number
        }
        Insert: {
          cobertura_id: string
          cobertura_nome: string
          contrato_id: string
          created_at?: string
          created_by?: string | null
          franquia_valor?: number | null
          id?: string
          org_id: string
          preco_dia: number
        }
        Update: {
          cobertura_id?: string
          cobertura_nome?: string
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          franquia_valor?: number | null
          id?: string
          org_id?: string
          preco_dia?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_coberturas_cobertura_id_fkey"
            columns: ["cobertura_id"]
            isOneToOne: false
            referencedRelation: "renting_coberturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_coberturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_coberturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_coberturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_cobrancas: {
        Row: {
          contrato_condutor_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          destinatario_id: string
          destinatario_nome: string
          destinatario_papel: string
          documento_externo_ref: string | null
          emite_fatura_fiscal: boolean
          emitida_em: string | null
          estado: Database["public"]["Enums"]["cobranca_estado_enum"]
          id: string
          manual: boolean
          org_id: string
          pago_em: string | null
          periodo_ate: string
          periodo_de: string
          reserva_id: string | null
          tarifa_id: string | null
          tarifa_nome: string | null
          taxa_iva: number
          tipo_cobranca: string
          updated_at: string
          valor_iva: number | null
          valor_sem_iva: number
          valor_total: number | null
        }
        Insert: {
          contrato_condutor_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          destinatario_id: string
          destinatario_nome: string
          destinatario_papel: string
          documento_externo_ref?: string | null
          emite_fatura_fiscal?: boolean
          emitida_em?: string | null
          estado?: Database["public"]["Enums"]["cobranca_estado_enum"]
          id?: string
          manual?: boolean
          org_id: string
          pago_em?: string | null
          periodo_ate: string
          periodo_de: string
          reserva_id?: string | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          taxa_iva?: number
          tipo_cobranca?: string
          updated_at?: string
          valor_iva?: number | null
          valor_sem_iva: number
          valor_total?: number | null
        }
        Update: {
          contrato_condutor_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          destinatario_id?: string
          destinatario_nome?: string
          destinatario_papel?: string
          documento_externo_ref?: string | null
          emite_fatura_fiscal?: boolean
          emitida_em?: string | null
          estado?: Database["public"]["Enums"]["cobranca_estado_enum"]
          id?: string
          manual?: boolean
          org_id?: string
          pago_em?: string | null
          periodo_ate?: string
          periodo_de?: string
          reserva_id?: string | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          taxa_iva?: number
          tipo_cobranca?: string
          updated_at?: string
          valor_iva?: number | null
          valor_sem_iva?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_cobrancas_contrato_condutor_id_fkey"
            columns: ["contrato_condutor_id"]
            isOneToOne: false
            referencedRelation: "contrato_condutores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_cobrancas_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "renting_tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_condutores: {
        Row: {
          cliente_id: string | null
          contrato_id: string
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          id: string
          is_principal: boolean
          motivo_fim: string | null
          motorista_id: string | null
          org_id: string
          updated_at: string
          vigencia: unknown
        }
        Insert: {
          cliente_id?: string | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          is_principal?: boolean
          motivo_fim?: string | null
          motorista_id?: string | null
          org_id: string
          updated_at?: string
          vigencia?: unknown
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          is_principal?: boolean
          motivo_fim?: string | null
          motorista_id?: string | null
          org_id?: string
          updated_at?: string
          vigencia?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "contrato_condutores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_condutores_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_condutores_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_condutores_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_condutores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_extras: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          extra_id: string
          extra_nome: string
          id: string
          org_id: string
          preco_unidade: number
          quantidade: number
          tipo_calculo: string
          total: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          extra_id: string
          extra_nome: string
          id?: string
          org_id: string
          preco_unidade: number
          quantidade?: number
          tipo_calculo: string
          total: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          extra_id?: string
          extra_nome?: string
          id?: string
          org_id?: string
          preco_unidade?: number
          quantidade?: number
          tipo_calculo?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_extras_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_extras_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "renting_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_extras_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_media: {
        Row: {
          contrato_id: string | null
          contrato_renting_id: string | null
          created_at: string
          criado_por: string | null
          id: string
          nome_ficheiro: string | null
          org_id: string | null
          tamanho_bytes: number | null
          tipo: string
          tipo_ficheiro: string | null
          url: string
        }
        Insert: {
          contrato_id?: string | null
          contrato_renting_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome_ficheiro?: string | null
          org_id?: string | null
          tamanho_bytes?: number | null
          tipo: string
          tipo_ficheiro?: string | null
          url: string
        }
        Update: {
          contrato_id?: string | null
          contrato_renting_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome_ficheiro?: string | null
          org_id?: string | null
          tamanho_bytes?: number | null
          tipo?: string
          tipo_ficheiro?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_media_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_media_contrato_renting_id_fkey"
            columns: ["contrato_renting_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_media_contrato_renting_id_fkey"
            columns: ["contrato_renting_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_media_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_taxas: {
        Row: {
          base_calculo: number | null
          contrato_id: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          percentagem: number | null
          taxa_id: string
          taxa_nome: string
          valor_calculado: number
          valor_fixo: number | null
        }
        Insert: {
          base_calculo?: number | null
          contrato_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          percentagem?: number | null
          taxa_id: string
          taxa_nome: string
          valor_calculado: number
          valor_fixo?: number | null
        }
        Update: {
          base_calculo?: number | null
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          percentagem?: number | null
          taxa_id?: string
          taxa_nome?: string
          valor_calculado?: number
          valor_fixo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_taxas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_taxas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_taxas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_taxas_taxa_id_fkey"
            columns: ["taxa_id"]
            isOneToOne: false
            referencedRelation: "renting_taxas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          atualizado_em: string | null
          calendario_evento_id: string | null
          checkin_pendente: boolean
          checkout_pendente: boolean
          cidade_assinatura: string
          combustivel_checkin: string | null
          combustivel_checkout: string | null
          criado_em: string | null
          criado_por: string | null
          data_assinatura: string
          data_inicio: string
          documento_url: string | null
          duracao_meses: number | null
          eletricidade_checkin: string | null
          eletricidade_checkout: string | null
          empresa_id: string
          gpl_checkin: string | null
          gpl_checkout: string | null
          id: string
          km_checkin: number | null
          km_checkout: number | null
          motorista_documento_numero: string | null
          motorista_documento_tipo: string | null
          motorista_email: string | null
          motorista_id: string
          motorista_morada: string | null
          motorista_nif: string | null
          motorista_nome: string
          motorista_telefone: string | null
          numero_contrato: number | null
          org_id: string
          status: string | null
          template_id: string | null
          versao: number | null
          viatura_id: string | null
        }
        Insert: {
          atualizado_em?: string | null
          calendario_evento_id?: string | null
          checkin_pendente?: boolean
          checkout_pendente?: boolean
          cidade_assinatura: string
          combustivel_checkin?: string | null
          combustivel_checkout?: string | null
          criado_em?: string | null
          criado_por?: string | null
          data_assinatura: string
          data_inicio: string
          documento_url?: string | null
          duracao_meses?: number | null
          eletricidade_checkin?: string | null
          eletricidade_checkout?: string | null
          empresa_id: string
          gpl_checkin?: string | null
          gpl_checkout?: string | null
          id?: string
          km_checkin?: number | null
          km_checkout?: number | null
          motorista_documento_numero?: string | null
          motorista_documento_tipo?: string | null
          motorista_email?: string | null
          motorista_id: string
          motorista_morada?: string | null
          motorista_nif?: string | null
          motorista_nome: string
          motorista_telefone?: string | null
          numero_contrato?: number | null
          org_id?: string
          status?: string | null
          template_id?: string | null
          versao?: number | null
          viatura_id?: string | null
        }
        Update: {
          atualizado_em?: string | null
          calendario_evento_id?: string | null
          checkin_pendente?: boolean
          checkout_pendente?: boolean
          cidade_assinatura?: string
          combustivel_checkin?: string | null
          combustivel_checkout?: string | null
          criado_em?: string | null
          criado_por?: string | null
          data_assinatura?: string
          data_inicio?: string
          documento_url?: string | null
          duracao_meses?: number | null
          eletricidade_checkin?: string | null
          eletricidade_checkout?: string | null
          empresa_id?: string
          gpl_checkin?: string | null
          gpl_checkout?: string | null
          id?: string
          km_checkin?: number | null
          km_checkout?: number | null
          motorista_documento_numero?: string | null
          motorista_documento_tipo?: string | null
          motorista_email?: string | null
          motorista_id?: string
          motorista_morada?: string | null
          motorista_nif?: string | null
          motorista_nome?: string
          motorista_telefone?: string | null
          numero_contrato?: number | null
          org_id?: string
          status?: string | null
          template_id?: string | null
          versao?: number | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_edicoes: {
        Row: {
          campos_alterados: Json
          contrato_id: string
          editado_em: string | null
          editado_por: string | null
          id: string
          observacoes: string | null
          org_id: string | null
        }
        Insert: {
          campos_alterados: Json
          contrato_id: string
          editado_em?: string | null
          editado_por?: string | null
          id?: string
          observacoes?: string | null
          org_id?: string | null
        }
        Update: {
          campos_alterados?: Json
          contrato_id?: string
          editado_em?: string | null
          editado_por?: string | null
          id?: string
          observacoes?: string | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_edicoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_edicoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_prestacao: {
        Row: {
          codigo: number
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          deleted_at: string | null
          documento_url: string | null
          estado: string
          id: string
          motorista_email: string | null
          motorista_id: string
          motorista_morada: string | null
          motorista_nif: string | null
          motorista_nome: string | null
          motorista_telefone: string | null
          observacoes: string | null
          org_id: string
          reserva_id: string | null
          updated_at: string
          updated_by: string | null
          valor_semanal: number | null
          versao: number
          viatura_id: string | null
        }
        Insert: {
          codigo?: number
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          deleted_at?: string | null
          documento_url?: string | null
          estado?: string
          id?: string
          motorista_email?: string | null
          motorista_id: string
          motorista_morada?: string | null
          motorista_nif?: string | null
          motorista_nome?: string | null
          motorista_telefone?: string | null
          observacoes?: string | null
          org_id?: string
          reserva_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_semanal?: number | null
          versao?: number
          viatura_id?: string | null
        }
        Update: {
          codigo?: number
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          deleted_at?: string | null
          documento_url?: string | null
          estado?: string
          id?: string
          motorista_email?: string | null
          motorista_id?: string
          motorista_morada?: string | null
          motorista_nif?: string | null
          motorista_nome?: string | null
          motorista_telefone?: string | null
          observacoes?: string | null
          org_id?: string
          reserva_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_semanal?: number | null
          versao?: number
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_prestacao_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_prestacao_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_prestacao_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_prestacao_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_reimpressoes: {
        Row: {
          contrato_id: string
          id: string
          motivo: string | null
          org_id: string | null
          reimpresso_em: string | null
          reimpresso_por: string | null
        }
        Insert: {
          contrato_id: string
          id?: string
          motivo?: string | null
          org_id?: string | null
          reimpresso_em?: string | null
          reimpresso_por?: string | null
        }
        Update: {
          contrato_id?: string
          id?: string
          motivo?: string | null
          org_id?: string | null
          reimpresso_em?: string | null
          reimpresso_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_reimpressoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_reimpressoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_renting: {
        Row: {
          aluguer_longa_duracao: boolean
          caucao_valor: number | null
          cliente_id: string
          cobertura_franquia: number | null
          cobertura_id: string | null
          cobertura_nome: string | null
          cobertura_preco_dia: number | null
          codigo: number
          combustivel_entrada: string | null
          combustivel_saida: string | null
          comentarios_entrega: string | null
          comentarios_recolha: string | null
          contrato_anterior_id: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          deleted_at: string | null
          desconto_percentagem: number | null
          emissor_id: string | null
          estacao_entrega_id: string | null
          estacao_origem_viatura_id: string | null
          estacao_recolha_id: string | null
          estado_financeiro: Database["public"]["Enums"]["contrato_estado_financeiro_enum"]
          estado_operacional: Database["public"]["Enums"]["contrato_estado_operacional_enum"]
          facturado_em: string | null
          franquia_valor: number | null
          gestor_id: string | null
          grupo: string | null
          grupo_id: string | null
          grupo_nome: string | null
          id: string
          is_longa_duracao: boolean
          km_adicional_valor: number | null
          km_entrada: number | null
          km_saida: number | null
          kms_incluidos: number | null
          local_entrega: string | null
          local_recolha: string | null
          matricula: string | null
          motivo_versao: string | null
          numero_processo: string | null
          observacoes: string | null
          observacoes_internas: string | null
          org_id: string
          origem: Database["public"]["Enums"]["contrato_origem_enum"]
          periodo: unknown
          regime: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias: number | null
          renovacao_opcao:
            | Database["public"]["Enums"]["contrato_renovacao_opcao_enum"]
            | null
          reserva_id: string
          substituido_em: string | null
          tarifa_diaria: number | null
          tarifa_id: string | null
          tarifa_nome: string | null
          taxa_iva: number
          total_final: number | null
          total_iva: number | null
          total_subtotal: number | null
          transferista_id: string | null
          updated_at: string
          updated_by: string | null
          valor_total_manual: number | null
          versao: number
          viatura_id: string
          voo_referencia: string | null
          voucher_codigo: string | null
        }
        Insert: {
          aluguer_longa_duracao?: boolean
          caucao_valor?: number | null
          cliente_id: string
          cobertura_franquia?: number | null
          cobertura_id?: string | null
          cobertura_nome?: string | null
          cobertura_preco_dia?: number | null
          codigo?: number
          combustivel_entrada?: string | null
          combustivel_saida?: string | null
          comentarios_entrega?: string | null
          comentarios_recolha?: string | null
          contrato_anterior_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio: string
          deleted_at?: string | null
          desconto_percentagem?: number | null
          emissor_id?: string | null
          estacao_entrega_id?: string | null
          estacao_origem_viatura_id?: string | null
          estacao_recolha_id?: string | null
          estado_financeiro?: Database["public"]["Enums"]["contrato_estado_financeiro_enum"]
          estado_operacional?: Database["public"]["Enums"]["contrato_estado_operacional_enum"]
          facturado_em?: string | null
          franquia_valor?: number | null
          gestor_id?: string | null
          grupo?: string | null
          grupo_id?: string | null
          grupo_nome?: string | null
          id?: string
          is_longa_duracao?: boolean
          km_adicional_valor?: number | null
          km_entrada?: number | null
          km_saida?: number | null
          kms_incluidos?: number | null
          local_entrega?: string | null
          local_recolha?: string | null
          matricula?: string | null
          motivo_versao?: string | null
          numero_processo?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          origem?: Database["public"]["Enums"]["contrato_origem_enum"]
          periodo?: unknown
          regime?: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias?: number | null
          renovacao_opcao?:
            | Database["public"]["Enums"]["contrato_renovacao_opcao_enum"]
            | null
          reserva_id: string
          substituido_em?: string | null
          tarifa_diaria?: number | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          taxa_iva?: number
          total_final?: number | null
          total_iva?: number | null
          total_subtotal?: number | null
          transferista_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total_manual?: number | null
          versao?: number
          viatura_id: string
          voo_referencia?: string | null
          voucher_codigo?: string | null
        }
        Update: {
          aluguer_longa_duracao?: boolean
          caucao_valor?: number | null
          cliente_id?: string
          cobertura_franquia?: number | null
          cobertura_id?: string | null
          cobertura_nome?: string | null
          cobertura_preco_dia?: number | null
          codigo?: number
          combustivel_entrada?: string | null
          combustivel_saida?: string | null
          comentarios_entrega?: string | null
          comentarios_recolha?: string | null
          contrato_anterior_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          deleted_at?: string | null
          desconto_percentagem?: number | null
          emissor_id?: string | null
          estacao_entrega_id?: string | null
          estacao_origem_viatura_id?: string | null
          estacao_recolha_id?: string | null
          estado_financeiro?: Database["public"]["Enums"]["contrato_estado_financeiro_enum"]
          estado_operacional?: Database["public"]["Enums"]["contrato_estado_operacional_enum"]
          facturado_em?: string | null
          franquia_valor?: number | null
          gestor_id?: string | null
          grupo?: string | null
          grupo_id?: string | null
          grupo_nome?: string | null
          id?: string
          is_longa_duracao?: boolean
          km_adicional_valor?: number | null
          km_entrada?: number | null
          km_saida?: number | null
          kms_incluidos?: number | null
          local_entrega?: string | null
          local_recolha?: string | null
          matricula?: string | null
          motivo_versao?: string | null
          numero_processo?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          origem?: Database["public"]["Enums"]["contrato_origem_enum"]
          periodo?: unknown
          regime?: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias?: number | null
          renovacao_opcao?:
            | Database["public"]["Enums"]["contrato_renovacao_opcao_enum"]
            | null
          reserva_id?: string
          substituido_em?: string | null
          tarifa_diaria?: number | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          taxa_iva?: number
          total_final?: number | null
          total_iva?: number | null
          total_subtotal?: number | null
          transferista_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total_manual?: number | null
          versao?: number
          viatura_id?: string
          voo_referencia?: string | null
          voucher_codigo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_renting_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_cobertura_id_fkey"
            columns: ["cobertura_id"]
            isOneToOne: false
            referencedRelation: "renting_coberturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_contrato_anterior_id_fkey"
            columns: ["contrato_anterior_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contratos_renting_contrato_anterior_id_fkey"
            columns: ["contrato_anterior_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_emissor_id_fkey"
            columns: ["emissor_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_estacao_entrega_id_fkey"
            columns: ["estacao_entrega_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_estacao_origem_viatura_id_fkey"
            columns: ["estacao_origem_viatura_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_estacao_recolha_id_fkey"
            columns: ["estacao_recolha_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "renting_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "renting_tarifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_transferista_id_fkey"
            columns: ["transferista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_renting_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          cargo_id: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          org_id: string | null
          token: string
          usado: boolean | null
        }
        Insert: {
          cargo_id?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          org_id?: string | null
          token: string
          usado?: boolean | null
        }
        Update: {
          cargo_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          org_id?: string | null
          token?: string
          usado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos_obe: {
        Row: {
          ativo: boolean
          contrato: string | null
          created_at: string
          id: string
          notas: string | null
          nr_equipamento: string
          org_id: string
          updated_at: string
          viatura_id: string | null
        }
        Insert: {
          ativo?: boolean
          contrato?: string | null
          created_at?: string
          id?: string
          notas?: string | null
          nr_equipamento: string
          org_id?: string
          updated_at?: string
          viatura_id?: string | null
        }
        Update: {
          ativo?: boolean
          contrato?: string | null
          created_at?: string
          id?: string
          notas?: string | null
          nr_equipamento?: string
          org_id?: string
          updated_at?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivos_obe_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          ativo: boolean | null
          campos_dinamicos: Json
          cliente_empresa_id: string | null
          created_at: string | null
          criado_por: string | null
          empresa_id: string | null
          id: string
          nome: string
          org_id: string | null
          papel_timbrado_url: string | null
          template_data: Json
          tipo: string
          updated_at: string | null
          versao: number | null
        }
        Insert: {
          ativo?: boolean | null
          campos_dinamicos?: Json
          cliente_empresa_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          org_id?: string | null
          papel_timbrado_url?: string | null
          template_data: Json
          tipo?: string
          updated_at?: string | null
          versao?: number | null
        }
        Update: {
          ativo?: boolean | null
          campos_dinamicos?: Json
          cliente_empresa_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          org_id?: string | null
          papel_timbrado_url?: string | null
          template_data?: Json
          tipo?: string
          updated_at?: string | null
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_cliente_empresa_id_fkey"
            columns: ["cliente_empresa_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          arquivo_url: string | null
          created_at: string
          created_by: string | null
          data_emissao: string | null
          id: string
          numero: string | null
          org_id: string
          pais_emissao: string | null
          tipo: Database["public"]["Enums"]["tipo_documento_enum"]
          updated_at: string
          updated_by: string | null
          validade: string | null
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          id?: string
          numero?: string | null
          org_id?: string
          pais_emissao?: string | null
          tipo: Database["public"]["Enums"]["tipo_documento_enum"]
          updated_at?: string
          updated_by?: string | null
          validade?: string | null
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          id?: string
          numero?: string | null
          org_id?: string
          pais_emissao?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento_enum"]
          updated_at?: string
          updated_by?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      edp_transacoes: {
        Row: {
          amount: number | null
          card_number: string | null
          created_at: string | null
          fuel_type: string | null
          id: string
          integracao_id: string | null
          motorista_id: string | null
          org_id: string | null
          quantity: number | null
          raw_data: Json | null
          station_location: string | null
          station_name: string | null
          transaction_date: string
          transaction_id: string
          viatura_id: string | null
        }
        Insert: {
          amount?: number | null
          card_number?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date: string
          transaction_id: string
          viatura_id?: string | null
        }
        Update: {
          amount?: number | null
          card_number?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date?: string
          transaction_id?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edp_transacoes_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edp_transacoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edp_transacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          bounce_type: string | null
          bounced_at: string | null
          brevo_message_id: string | null
          campanha_id: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          envio_id: string | null
          error_message: string | null
          id: string
          last_event: string | null
          last_event_at: string | null
          nome: string | null
          opened_at: string | null
          org_id: string | null
          status: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          bounce_type?: string | null
          bounced_at?: string | null
          brevo_message_id?: string | null
          campanha_id: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email: string
          envio_id?: string | null
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          nome?: string | null
          opened_at?: string | null
          org_id?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          bounce_type?: string | null
          bounced_at?: string | null
          brevo_message_id?: string | null
          campanha_id?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string
          envio_id?: string | null
          error_message?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          nome?: string | null
          opened_at?: string | null
          org_id?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "marketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "marketing_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          cargo_representante: string | null
          created_at: string
          id: string
          licenca_tvde: string | null
          licenca_validade: string | null
          nif: string | null
          nome: string
          nome_completo: string
          org_id: string | null
          papel_timbrado: string | null
          representante: string | null
          sede: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo_representante?: string | null
          created_at?: string
          id: string
          licenca_tvde?: string | null
          licenca_validade?: string | null
          nif?: string | null
          nome: string
          nome_completo: string
          org_id?: string | null
          papel_timbrado?: string | null
          representante?: string | null
          sede?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo_representante?: string | null
          created_at?: string
          id?: string
          licenca_tvde?: string | null
          licenca_validade?: string | null
          nif?: string | null
          nome?: string
          nome_completo?: string
          org_id?: string | null
          papel_timbrado?: string | null
          representante?: string | null
          sede?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      estacoes: {
        Row: {
          ativa: boolean
          cidade: string | null
          created_at: string | null
          id: string
          morada: string | null
          nome: string
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativa?: boolean
          cidade?: string | null
          created_at?: string | null
          id?: string
          morada?: string | null
          nome: string
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativa?: boolean
          cidade?: string | null
          created_at?: string | null
          id?: string
          morada?: string | null
          nome?: string
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      formulario_campanhas: {
        Row: {
          campanha_tag: string
          created_at: string | null
          formulario_id: string
          id: string
          org_id: string
        }
        Insert: {
          campanha_tag: string
          created_at?: string | null
          formulario_id: string
          id?: string
          org_id?: string
        }
        Update: {
          campanha_tag?: string
          created_at?: string | null
          formulario_id?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulario_campanhas_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      formularios: {
        Row: {
          ativo: boolean | null
          campos: Json | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          campos?: Json | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          campos?: Json | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formularios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_webhooks: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          evento: string
          headers: Json | null
          id: string
          nome: string
          org_id: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          evento: string
          headers?: Json | null
          id?: string
          nome: string
          org_id?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          evento?: string
          headers?: Json | null
          id?: string
          nome?: string
          org_id?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cliente_nif: string | null
          cobranca_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_emissao: string | null
          erro_msg: string | null
          id: string
          numero: string | null
          observacoes: string | null
          org_id: string
          provider: string | null
          provider_docnum: string | null
          provider_doctype: string | null
          raw_response: Json | null
          referencia_externa: string | null
          serie: string | null
          status: string
          tipo: string
          total: number | null
          updated_at: string
        }
        Insert: {
          cliente_nif?: string | null
          cobranca_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          erro_msg?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          org_id: string
          provider?: string | null
          provider_docnum?: string | null
          provider_doctype?: string | null
          raw_response?: Json | null
          referencia_externa?: string | null
          serie?: string | null
          status?: string
          tipo: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          cliente_nif?: string | null
          cobranca_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          erro_msg?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          org_id?: string
          provider?: string | null
          provider_docnum?: string | null
          provider_doctype?: string | null
          raw_response?: Json | null
          referencia_externa?: string | null
          serie?: string | null
          status?: string
          tipo?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "contrato_cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "invoices_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_history: {
        Row: {
          alterado_em: string | null
          alterado_por: string | null
          id: string
          lead_id: string
          observacoes: string | null
          org_id: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          alterado_em?: string | null
          alterado_por?: string | null
          id?: string
          lead_id: string
          observacoes?: string | null
          org_id?: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          alterado_em?: string | null
          alterado_por?: string | null
          id?: string
          lead_id?: string
          observacoes?: string | null
          org_id?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_lead_status_history_lead_id"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_dasprent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_dasprent"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_dasprent: {
        Row: {
          campaign_tags: string[] | null
          created_at: string | null
          data_aluguer: string | null
          email: string
          formulario_id: string | null
          gestor_responsavel: string | null
          id: string
          nome: string
          observacoes: string | null
          observacoes_gestores: string | null
          org_id: string | null
          status: string | null
          telefone: string | null
          tem_formacao_tvde: boolean | null
          tipo_viatura: string | null
          updated_at: string | null
          valor_negocio: string | null
          zona: string | null
        }
        Insert: {
          campaign_tags?: string[] | null
          created_at?: string | null
          data_aluguer?: string | null
          email: string
          formulario_id?: string | null
          gestor_responsavel?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          observacoes_gestores?: string | null
          org_id?: string | null
          status?: string | null
          telefone?: string | null
          tem_formacao_tvde?: boolean | null
          tipo_viatura?: string | null
          updated_at?: string | null
          valor_negocio?: string | null
          zona?: string | null
        }
        Update: {
          campaign_tags?: string[] | null
          created_at?: string | null
          data_aluguer?: string | null
          email?: string
          formulario_id?: string | null
          gestor_responsavel?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          observacoes_gestores?: string | null
          org_id?: string | null
          status?: string | null
          telefone?: string | null
          tem_formacao_tvde?: boolean | null
          tipo_viatura?: string | null
          updated_at?: string | null
          valor_negocio?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_dasprent_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_dasprent_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_assinaturas: {
        Row: {
          atualizado_em: string
          conteudo_html: string
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          org_id: string | null
        }
        Insert: {
          atualizado_em?: string
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          org_id?: string | null
        }
        Update: {
          atualizado_em?: string
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assinaturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campanhas: {
        Row: {
          assinatura_id: string | null
          assunto: string
          conteudo_html: string
          criado_em: string
          criado_por: string | null
          enviado_em: string | null
          id: string
          lista_id: string | null
          nome: string
          org_id: string | null
          status: string
          total_abertos: number
          total_bounces: number
          total_clicados: number
          total_entregues: number
          total_enviados: number
          total_erros: number
        }
        Insert: {
          assinatura_id?: string | null
          assunto?: string
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          enviado_em?: string | null
          id?: string
          lista_id?: string | null
          nome: string
          org_id?: string | null
          status?: string
          total_abertos?: number
          total_bounces?: number
          total_clicados?: number
          total_entregues?: number
          total_enviados?: number
          total_erros?: number
        }
        Update: {
          assinatura_id?: string | null
          assunto?: string
          conteudo_html?: string
          criado_em?: string
          criado_por?: string | null
          enviado_em?: string | null
          id?: string
          lista_id?: string | null
          nome?: string
          org_id?: string | null
          status?: string
          total_abertos?: number
          total_bounces?: number
          total_clicados?: number
          total_entregues?: number
          total_enviados?: number
          total_erros?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campanhas_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "marketing_assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campanhas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "marketing_listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campanhas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contactos: {
        Row: {
          criado_em: string
          email: string
          id: string
          lista_id: string
          nome: string
          org_id: string | null
        }
        Insert: {
          criado_em?: string
          email: string
          id?: string
          lista_id: string
          nome: string
          org_id?: string | null
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          lista_id?: string
          nome?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contactos_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "marketing_listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contactos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_envio_detalhes: {
        Row: {
          contacto_email: string
          contacto_nome: string | null
          criado_em: string
          envio_id: string
          erro_mensagem: string | null
          id: string
          org_id: string | null
          status: string
        }
        Insert: {
          contacto_email: string
          contacto_nome?: string | null
          criado_em?: string
          envio_id: string
          erro_mensagem?: string | null
          id?: string
          org_id?: string | null
          status?: string
        }
        Update: {
          contacto_email?: string
          contacto_nome?: string | null
          criado_em?: string
          envio_id?: string
          erro_mensagem?: string | null
          id?: string
          org_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_envio_detalhes_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "marketing_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_envio_detalhes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_envios: {
        Row: {
          assinatura_id: string | null
          campanha_id: string
          enviado_em: string
          enviado_por: string | null
          id: string
          lista_id: string | null
          org_id: string | null
          total_enviados: number
          total_erros: number
        }
        Insert: {
          assinatura_id?: string | null
          campanha_id: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          lista_id?: string | null
          org_id?: string | null
          total_enviados?: number
          total_erros?: number
        }
        Update: {
          assinatura_id?: string | null
          campanha_id?: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          lista_id?: string | null
          org_id?: string | null
          total_enviados?: number
          total_erros?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_envios_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "marketing_assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "marketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_envios_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "marketing_listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_envios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_listas: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string | null
          origem: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id?: string | null
          origem?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string | null
          origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_listas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_candidaturas: {
        Row: {
          carta_categorias: string[] | null
          carta_conducao: string | null
          carta_conducao_verso_url: string | null
          carta_ficheiro_url: string | null
          carta_validade: string | null
          cidade: string | null
          codigo_postal: string | null
          comprovativo_iban_url: string | null
          comprovativo_morada_url: string | null
          created_at: string | null
          data_decisao: string | null
          data_submissao: string | null
          decidido_por: string | null
          documento_ficheiro_url: string | null
          documento_identificacao_verso_url: string | null
          documento_numero: string | null
          documento_tipo: string | null
          documento_validade: string | null
          email: string
          id: string
          licenca_tvde_ficheiro_url: string | null
          licenca_tvde_numero: string | null
          licenca_tvde_validade: string | null
          morada: string | null
          motivo_rejeicao: string | null
          nif: string | null
          nome: string
          observacoes: string | null
          org_id: string | null
          outros_documentos: Json | null
          registo_criminal_url: string | null
          status: string | null
          telefone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_conducao_verso_url?: string | null
          carta_ficheiro_url?: string | null
          carta_validade?: string | null
          cidade?: string | null
          codigo_postal?: string | null
          comprovativo_iban_url?: string | null
          comprovativo_morada_url?: string | null
          created_at?: string | null
          data_decisao?: string | null
          data_submissao?: string | null
          decidido_por?: string | null
          documento_ficheiro_url?: string | null
          documento_identificacao_verso_url?: string | null
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email: string
          id?: string
          licenca_tvde_ficheiro_url?: string | null
          licenca_tvde_numero?: string | null
          licenca_tvde_validade?: string | null
          morada?: string | null
          motivo_rejeicao?: string | null
          nif?: string | null
          nome: string
          observacoes?: string | null
          org_id?: string | null
          outros_documentos?: Json | null
          registo_criminal_url?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_conducao_verso_url?: string | null
          carta_ficheiro_url?: string | null
          carta_validade?: string | null
          cidade?: string | null
          codigo_postal?: string | null
          comprovativo_iban_url?: string | null
          comprovativo_morada_url?: string | null
          created_at?: string | null
          data_decisao?: string | null
          data_submissao?: string | null
          decidido_por?: string | null
          documento_ficheiro_url?: string | null
          documento_identificacao_verso_url?: string | null
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email?: string
          id?: string
          licenca_tvde_ficheiro_url?: string | null
          licenca_tvde_numero?: string | null
          licenca_tvde_validade?: string | null
          morada?: string | null
          motivo_rejeicao?: string | null
          nif?: string | null
          nome?: string
          observacoes?: string | null
          org_id?: string | null
          outros_documentos?: Json | null
          registo_criminal_url?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorista_candidaturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_custos_adicionais: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          motorista_id: string
          org_id: string
          semana_referencia: string
          status: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          motorista_id: string
          org_id?: string
          semana_referencia: string
          status?: string
          tipo: string
          valor?: number
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          motorista_id?: string
          org_id?: string
          semana_referencia?: string
          status?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "motorista_custos_adicionais_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_documentos: {
        Row: {
          created_at: string | null
          data_validade: string | null
          ficheiro_url: string
          id: string
          motorista_id: string
          nome_ficheiro: string | null
          observacoes: string | null
          org_id: string | null
          tipo_documento: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          data_validade?: string | null
          ficheiro_url: string
          id?: string
          motorista_id: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          tipo_documento: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          data_validade?: string | null
          ficheiro_url?: string
          id?: string
          motorista_id?: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          tipo_documento?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motorista_documentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_documentos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_financeiro: {
        Row: {
          acordo_pendente: boolean | null
          categoria: string | null
          created_at: string | null
          criado_por: string | null
          dano_id: string | null
          data_movimento: string
          data_pagamento: string | null
          descricao: string
          fatura_url: string | null
          id: string
          motorista_id: string
          org_id: string | null
          referencia: string | null
          reparacao_id: string | null
          status: string | null
          tipo: string
          valor: number
        }
        Insert: {
          acordo_pendente?: boolean | null
          categoria?: string | null
          created_at?: string | null
          criado_por?: string | null
          dano_id?: string | null
          data_movimento: string
          data_pagamento?: string | null
          descricao: string
          fatura_url?: string | null
          id?: string
          motorista_id: string
          org_id?: string | null
          referencia?: string | null
          reparacao_id?: string | null
          status?: string | null
          tipo: string
          valor: number
        }
        Update: {
          acordo_pendente?: boolean | null
          categoria?: string | null
          created_at?: string | null
          criado_por?: string | null
          dano_id?: string | null
          data_movimento?: string
          data_pagamento?: string | null
          descricao?: string
          fatura_url?: string | null
          id?: string
          motorista_id?: string
          org_id?: string | null
          referencia?: string | null
          reparacao_id?: string | null
          status?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "motorista_financeiro_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_financeiro_dano_id_fkey"
            columns: ["dano_id"]
            isOneToOne: false
            referencedRelation: "viatura_danos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_financeiro_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_financeiro_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_financeiro_reparacao_id_fkey"
            columns: ["reparacao_id"]
            isOneToOne: false
            referencedRelation: "viatura_reparacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_recibos: {
        Row: {
          codigo: number
          created_at: string | null
          data_validacao: string | null
          descricao: string
          ficheiro_url: string
          id: string
          motorista_id: string
          nome_ficheiro: string | null
          observacoes: string | null
          org_id: string | null
          periodo_referencia: string | null
          plataforma: string | null
          semana_referencia_inicio: string | null
          status: string | null
          tipo: string | null
          updated_at: string | null
          user_id: string | null
          validado_por: string | null
          valor_total: number | null
        }
        Insert: {
          codigo?: number
          created_at?: string | null
          data_validacao?: string | null
          descricao: string
          ficheiro_url: string
          id?: string
          motorista_id: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          periodo_referencia?: string | null
          plataforma?: string | null
          semana_referencia_inicio?: string | null
          status?: string | null
          tipo?: string | null
          updated_at?: string | null
          user_id?: string | null
          validado_por?: string | null
          valor_total?: number | null
        }
        Update: {
          codigo?: number
          created_at?: string | null
          data_validacao?: string | null
          descricao?: string
          ficheiro_url?: string
          id?: string
          motorista_id?: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          periodo_referencia?: string | null
          plataforma?: string | null
          semana_referencia_inicio?: string | null
          status?: string | null
          tipo?: string | null
          updated_at?: string | null
          user_id?: string | null
          validado_por?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "motorista_recibos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_recibos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorista_viaturas: {
        Row: {
          contrato_prestacao_assinatura: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          extintor_numero: string | null
          extintor_validade: string | null
          id: string
          motorista_id: string
          observacoes: string | null
          org_id: string | null
          status: string | null
          tipo: string | null
          viatura_id: string
        }
        Insert: {
          contrato_prestacao_assinatura?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          extintor_numero?: string | null
          extintor_validade?: string | null
          id?: string
          motorista_id: string
          observacoes?: string | null
          org_id?: string | null
          status?: string | null
          tipo?: string | null
          viatura_id: string
        }
        Update: {
          contrato_prestacao_assinatura?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          extintor_numero?: string | null
          extintor_validade?: string | null
          id?: string
          motorista_id?: string
          observacoes?: string | null
          org_id?: string | null
          status?: string | null
          tipo?: string | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorista_viaturas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_viaturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_viaturas_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas: {
        Row: {
          bolt_id: string | null
          carta_categorias: string[] | null
          carta_conducao: string | null
          carta_validade: string | null
          caucao: number | null
          created_at: string
          documento_numero: string | null
          documento_tipo: string | null
          documento_validade: string | null
          email: string | null
          gestor_id: string | null
          id: string
          morada: string | null
          nib: string | null
          nif: string | null
          nome: string
          observacoes: string | null
          org_id: string
          telefone: string | null
          uber_uuid: string | null
          updated_at: string
        }
        Insert: {
          bolt_id?: string | null
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_validade?: string | null
          caucao?: number | null
          created_at?: string
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email?: string | null
          gestor_id?: string | null
          id?: string
          morada?: string | null
          nib?: string | null
          nif?: string | null
          nome: string
          observacoes?: string | null
          org_id?: string
          telefone?: string | null
          uber_uuid?: string | null
          updated_at?: string
        }
        Update: {
          bolt_id?: string | null
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_validade?: string | null
          caucao?: number | null
          created_at?: string
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email?: string | null
          gestor_id?: string | null
          id?: string
          morada?: string | null
          nib?: string | null
          nif?: string | null
          nome?: string
          observacoes?: string | null
          org_id?: string
          telefone?: string | null
          uber_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motoristas_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoristas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas_ativos: {
        Row: {
          bolt_id: string | null
          carta_categorias: string[] | null
          carta_conducao: string | null
          carta_conducao_verso_url: string | null
          carta_ficheiro_url: string | null
          carta_validade: string | null
          cartao_bp: string | null
          cartao_edp: string | null
          cartao_frota: string | null
          cartao_repsol: string | null
          cidade: string | null
          cidade_assinatura: string | null
          cliente_id: string | null
          codigo: number
          codigo_postal: string | null
          comprovativo_iban_url: string | null
          comprovativo_morada_url: string | null
          created_at: string | null
          data_contratacao: string | null
          data_renovacao_contratacao: string | null
          documento_ficheiro_url: string | null
          documento_identificacao_verso_url: string | null
          documento_numero: string | null
          documento_tipo: string | null
          documento_validade: string | null
          email: string | null
          gestor_responsavel: string | null
          iban: string | null
          id: string
          is_slot: boolean | null
          licenca_tvde_ficheiro_url: string | null
          licenca_tvde_numero: string | null
          licenca_tvde_validade: string | null
          morada: string | null
          nif: string | null
          nome: string
          observacoes: string | null
          org_id: string | null
          perfil_rascunho: boolean
          recibo_verde: boolean | null
          registo_criminal_url: string | null
          seguro_valor_semanal: number | null
          slot_valor_semanal: number | null
          status_ativo: boolean | null
          telefone: string | null
          uber_uuid: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bolt_id?: string | null
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_conducao_verso_url?: string | null
          carta_ficheiro_url?: string | null
          carta_validade?: string | null
          cartao_bp?: string | null
          cartao_edp?: string | null
          cartao_frota?: string | null
          cartao_repsol?: string | null
          cidade?: string | null
          cidade_assinatura?: string | null
          cliente_id?: string | null
          codigo?: number
          codigo_postal?: string | null
          comprovativo_iban_url?: string | null
          comprovativo_morada_url?: string | null
          created_at?: string | null
          data_contratacao?: string | null
          data_renovacao_contratacao?: string | null
          documento_ficheiro_url?: string | null
          documento_identificacao_verso_url?: string | null
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email?: string | null
          gestor_responsavel?: string | null
          iban?: string | null
          id?: string
          is_slot?: boolean | null
          licenca_tvde_ficheiro_url?: string | null
          licenca_tvde_numero?: string | null
          licenca_tvde_validade?: string | null
          morada?: string | null
          nif?: string | null
          nome: string
          observacoes?: string | null
          org_id?: string | null
          perfil_rascunho?: boolean
          recibo_verde?: boolean | null
          registo_criminal_url?: string | null
          seguro_valor_semanal?: number | null
          slot_valor_semanal?: number | null
          status_ativo?: boolean | null
          telefone?: string | null
          uber_uuid?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bolt_id?: string | null
          carta_categorias?: string[] | null
          carta_conducao?: string | null
          carta_conducao_verso_url?: string | null
          carta_ficheiro_url?: string | null
          carta_validade?: string | null
          cartao_bp?: string | null
          cartao_edp?: string | null
          cartao_frota?: string | null
          cartao_repsol?: string | null
          cidade?: string | null
          cidade_assinatura?: string | null
          cliente_id?: string | null
          codigo?: number
          codigo_postal?: string | null
          comprovativo_iban_url?: string | null
          comprovativo_morada_url?: string | null
          created_at?: string | null
          data_contratacao?: string | null
          data_renovacao_contratacao?: string | null
          documento_ficheiro_url?: string | null
          documento_identificacao_verso_url?: string | null
          documento_numero?: string | null
          documento_tipo?: string | null
          documento_validade?: string | null
          email?: string | null
          gestor_responsavel?: string | null
          iban?: string | null
          id?: string
          is_slot?: boolean | null
          licenca_tvde_ficheiro_url?: string | null
          licenca_tvde_numero?: string | null
          licenca_tvde_validade?: string | null
          morada?: string | null
          nif?: string | null
          nome?: string
          observacoes?: string | null
          org_id?: string | null
          perfil_rascunho?: boolean
          recibo_verde?: boolean | null
          registo_criminal_url?: string | null
          seguro_valor_semanal?: number | null
          slot_valor_semanal?: number | null
          status_ativo?: boolean | null
          telefone?: string | null
          uber_uuid?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motoristas_ativos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_anexos: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          ficheiro_url: string
          id: string
          mime_type: string | null
          movimento_id: string
          nome: string
          org_id: string
          tamanho_bytes: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url: string
          id?: string
          mime_type?: string | null
          movimento_id: string
          nome: string
          org_id: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url?: string
          id?: string
          mime_type?: string | null
          movimento_id?: string
          nome?: string
          org_id?: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimento_anexos_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentos: {
        Row: {
          codigo: number
          colaborador_id: string | null
          colaborador_nome: string | null
          combustivel_final: number | null
          combustivel_inicial: number | null
          created_at: string
          created_by: string | null
          custo_estimado: number | null
          custo_final: number | null
          data_chegada: string | null
          data_partida: string | null
          eletricidade_final: string | null
          eletricidade_inicial: string | null
          estacao_destino_id: string | null
          estacao_origem_id: string | null
          estado: string
          gpl_final: string | null
          gpl_inicial: string | null
          id: string
          info: string | null
          km_final: number | null
          km_inicial: number | null
          matricula: string | null
          motivo: string | null
          observacoes: string | null
          observacoes_internas: string | null
          org_id: string
          prestador: string | null
          tipo: string
          updated_at: string
          viatura_id: string | null
        }
        Insert: {
          codigo: number
          colaborador_id?: string | null
          colaborador_nome?: string | null
          combustivel_final?: number | null
          combustivel_inicial?: number | null
          created_at?: string
          created_by?: string | null
          custo_estimado?: number | null
          custo_final?: number | null
          data_chegada?: string | null
          data_partida?: string | null
          eletricidade_final?: string | null
          eletricidade_inicial?: string | null
          estacao_destino_id?: string | null
          estacao_origem_id?: string | null
          estado?: string
          gpl_final?: string | null
          gpl_inicial?: string | null
          id?: string
          info?: string | null
          km_final?: number | null
          km_inicial?: number | null
          matricula?: string | null
          motivo?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          prestador?: string | null
          tipo: string
          updated_at?: string
          viatura_id?: string | null
        }
        Update: {
          codigo?: number
          colaborador_id?: string | null
          colaborador_nome?: string | null
          combustivel_final?: number | null
          combustivel_inicial?: number | null
          created_at?: string
          created_by?: string | null
          custo_estimado?: number | null
          custo_final?: number | null
          data_chegada?: string | null
          data_partida?: string | null
          eletricidade_final?: string | null
          eletricidade_inicial?: string | null
          estacao_destino_id?: string | null
          estacao_origem_id?: string | null
          estado?: string
          gpl_final?: string | null
          gpl_inicial?: string | null
          id?: string
          info?: string | null
          km_final?: number | null
          km_inicial?: number | null
          matricula?: string | null
          motivo?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          prestador?: string | null
          tipo?: string
          updated_at?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estacao_destino_id_fkey"
            columns: ["estacao_destino_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_estacao_origem_id_fkey"
            columns: ["estacao_origem_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_credito: {
        Row: {
          cobranca_id: string
          codigo: number
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_nota: string
          documento_externo_ref: string | null
          entidade_id: string
          estado: string
          id: string
          motivo: string
          org_id: string
          sincronizado_primavera: boolean
          updated_at: string
          valor: number
        }
        Insert: {
          cobranca_id: string
          codigo?: number
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_nota?: string
          documento_externo_ref?: string | null
          entidade_id: string
          estado?: string
          id?: string
          motivo: string
          org_id: string
          sincronizado_primavera?: boolean
          updated_at?: string
          valor: number
        }
        Update: {
          cobranca_id?: string
          codigo?: number
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_nota?: string
          documento_externo_ref?: string | null
          entidade_id?: string
          estado?: string
          id?: string
          motivo?: string
          org_id?: string
          sincronizado_primavera?: boolean
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_credito_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "contrato_cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "notas_credito_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacao_dispensas: {
        Row: {
          created_at: string
          notificacao_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notificacao_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notificacao_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_dispensas_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "notificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          candidatura_id: string | null
          created_at: string
          destinatario_id: string | null
          id: string
          mensagem: string | null
          org_id: string | null
          resolvida: boolean
          resolvida_em: string | null
          resolvida_por: string | null
          resolvida_por_nome: string | null
          severidade: string
          tipo: string
          titulo: string
          viatura_id: string | null
        }
        Insert: {
          candidatura_id?: string | null
          created_at?: string
          destinatario_id?: string | null
          id?: string
          mensagem?: string | null
          org_id?: string | null
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          resolvida_por_nome?: string | null
          severidade?: string
          tipo: string
          titulo: string
          viatura_id?: string | null
        }
        Update: {
          candidatura_id?: string | null
          created_at?: string
          destinatario_id?: string | null
          id?: string
          mensagem?: string | null
          org_id?: string | null
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          resolvida_por_nome?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_candidatura_id_fkey"
            columns: ["candidatura_id"]
            isOneToOne: false
            referencedRelation: "motorista_candidaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      org_campos_dinamicos: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          id: string
          label: string | null
          ordem: number
          org_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          id?: string
          label?: string | null
          ordem?: number
          org_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          id?: string
          label?: string | null
          ordem?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_campos_dinamicos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      org_definicoes: {
        Row: {
          created_at: string
          faturacao_provider: string | null
          iva_rent_a_car: number
          iva_tvde: number
          org_id: string
          privacidade_por_gestor: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          faturacao_provider?: string | null
          iva_rent_a_car?: number
          iva_tvde?: number
          org_id: string
          privacidade_por_gestor?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          faturacao_provider?: string | null
          iva_rent_a_car?: number
          iva_tvde?: number
          org_id?: string
          privacidade_por_gestor?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_definicoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          ativa: boolean
          codigo: string
          created_at: string
          dominio_erro: string | null
          dominio_status: string
          id: string
          logo_url: string | null
          morada: string | null
          nif: string | null
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          codigo: string
          created_at?: string
          dominio_erro?: string | null
          dominio_status?: string
          id?: string
          logo_url?: string | null
          morada?: string | null
          nif?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          codigo?: string
          created_at?: string
          dominio_erro?: string | null
          dominio_status?: string
          id?: string
          logo_url?: string | null
          morada?: string | null
          nif?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plataformas_configuracao: {
        Row: {
          anti_captcha_key: string | null
          apify_actor_id: string | null
          apify_api_token: string | null
          ativo: boolean | null
          auth_mode: string | null
          client_id: string | null
          client_secret: string | null
          company_id: number | null
          company_name: string | null
          config: Json | null
          cookies_json: string | null
          created_at: string | null
          criado_por: string | null
          encryption_key_fingerprint: string | null
          id: string
          intervalo_sync_horas: number | null
          last_oauth_at: string | null
          last_webhook_at: string | null
          logo_url: string | null
          nome: string
          oauth_enabled: boolean
          oauth_state_secret_hint: string | null
          org_id: string | null
          plataforma: string
          privacy_policy_url: string | null
          redirect_uri: string | null
          robot_target_platform: string | null
          sync_automatico: boolean | null
          uber_access_token: string | null
          uber_environment: string | null
          uber_refresh_token: string | null
          uber_scopes: string[] | null
          uber_token_expires_at: string | null
          ultimo_sync: string | null
          updated_at: string | null
          webhook_secret_hint: string | null
          webhook_signing_key: string | null
          webhook_url: string | null
        }
        Insert: {
          anti_captcha_key?: string | null
          apify_actor_id?: string | null
          apify_api_token?: string | null
          ativo?: boolean | null
          auth_mode?: string | null
          client_id?: string | null
          client_secret?: string | null
          company_id?: number | null
          company_name?: string | null
          config?: Json | null
          cookies_json?: string | null
          created_at?: string | null
          criado_por?: string | null
          encryption_key_fingerprint?: string | null
          id?: string
          intervalo_sync_horas?: number | null
          last_oauth_at?: string | null
          last_webhook_at?: string | null
          logo_url?: string | null
          nome?: string
          oauth_enabled?: boolean
          oauth_state_secret_hint?: string | null
          org_id?: string | null
          plataforma?: string
          privacy_policy_url?: string | null
          redirect_uri?: string | null
          robot_target_platform?: string | null
          sync_automatico?: boolean | null
          uber_access_token?: string | null
          uber_environment?: string | null
          uber_refresh_token?: string | null
          uber_scopes?: string[] | null
          uber_token_expires_at?: string | null
          ultimo_sync?: string | null
          updated_at?: string | null
          webhook_secret_hint?: string | null
          webhook_signing_key?: string | null
          webhook_url?: string | null
        }
        Update: {
          anti_captcha_key?: string | null
          apify_actor_id?: string | null
          apify_api_token?: string | null
          ativo?: boolean | null
          auth_mode?: string | null
          client_id?: string | null
          client_secret?: string | null
          company_id?: number | null
          company_name?: string | null
          config?: Json | null
          cookies_json?: string | null
          created_at?: string | null
          criado_por?: string | null
          encryption_key_fingerprint?: string | null
          id?: string
          intervalo_sync_horas?: number | null
          last_oauth_at?: string | null
          last_webhook_at?: string | null
          logo_url?: string | null
          nome?: string
          oauth_enabled?: boolean
          oauth_state_secret_hint?: string | null
          org_id?: string | null
          plataforma?: string
          privacy_policy_url?: string | null
          redirect_uri?: string | null
          robot_target_platform?: string | null
          sync_automatico?: boolean | null
          uber_access_token?: string | null
          uber_environment?: string | null
          uber_refresh_token?: string | null
          uber_scopes?: string[] | null
          uber_token_expires_at?: string | null
          ultimo_sync?: string | null
          updated_at?: string | null
          webhook_secret_hint?: string | null
          webhook_signing_key?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plataformas_configuracao_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      primavera_api_keys: {
        Row: {
          api_key: string
          api_secret: string | null
          ativo: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ip_whitelist: string[] | null
          last_used_at: string | null
          nome: string
          org_id: string
          permissoes: string[]
          rate_limit_per_minute: number
          total_requests: number
        }
        Insert: {
          api_key: string
          api_secret?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_whitelist?: string[] | null
          last_used_at?: string | null
          nome: string
          org_id: string
          permissoes?: string[]
          rate_limit_per_minute?: number
          total_requests?: number
        }
        Update: {
          api_key?: string
          api_secret?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_whitelist?: string[] | null
          last_used_at?: string | null
          nome?: string
          org_id?: string
          permissoes?: string[]
          rate_limit_per_minute?: number
          total_requests?: number
        }
        Relationships: [
          {
            foreignKeyName: "primavera_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      primavera_api_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          id: string
          ip_address: string | null
          method: string
          org_id: string
          request_body: Json | null
          response_summary: string | null
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method: string
          org_id: string
          request_body?: Json | null
          response_summary?: string | null
          status_code: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          org_id?: string
          request_body?: Json | null
          response_summary?: string | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "primavera_api_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "primavera_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "primavera_api_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assinatura_url: string | null
          cargo: string | null
          cargo_id: string | null
          created_at: string | null
          email: string | null
          id: string
          is_admin: boolean | null
          nome: string | null
          org_id: string
          tipo_utilizador: string
          updated_at: string | null
        }
        Insert: {
          assinatura_url?: string | null
          cargo?: string | null
          cargo_id?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          is_admin?: boolean | null
          nome?: string | null
          org_id?: string
          tipo_utilizador?: string
          updated_at?: string | null
        }
        Update: {
          assinatura_url?: string | null
          cargo?: string | null
          cargo_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean | null
          nome?: string | null
          org_id?: string
          tipo_utilizador?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      quadro_tokens: {
        Row: {
          id: string
          org_id: string
          token: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          token?: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          token?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quadro_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      realizacao_tokens: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          evento_id: string
          expires_at: string
          id: string
          org_id: string
          tipo: string
          used_at: string | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          evento_id: string
          expires_at?: string
          id?: string
          org_id: string
          tipo: string
          used_at?: string | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          evento_id?: string
          expires_at?: string
          id?: string
          org_id?: string
          tipo?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "realizacao_tokens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "realizacao_tokens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realizacao_tokens_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "calendario_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realizacao_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos: {
        Row: {
          codigo: number
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_recibo: string
          documento_externo_ref: string | null
          entidade_id: string
          estado: string
          id: string
          metodo: string | null
          observacoes: string | null
          org_id: string
          referencia: string | null
          sincronizado_primavera: boolean
          updated_at: string
          valor: number
        }
        Insert: {
          codigo?: number
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_recibo?: string
          documento_externo_ref?: string | null
          entidade_id: string
          estado?: string
          id?: string
          metodo?: string | null
          observacoes?: string | null
          org_id: string
          referencia?: string | null
          sincronizado_primavera?: boolean
          updated_at?: string
          valor: number
        }
        Update: {
          codigo?: number
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_recibo?: string
          documento_externo_ref?: string | null
          entidade_id?: string
          estado?: string
          id?: string
          metodo?: string | null
          observacoes?: string | null
          org_id?: string
          referencia?: string | null
          sincronizado_primavera?: boolean
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "recibos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos_importados: {
        Row: {
          aluguer: number | null
          caucao: number | null
          combustivel: number | null
          created_at: string | null
          faturado_bolt: number | null
          faturado_uber: number | null
          ficheiro_url: string | null
          id: string
          importado_por: string | null
          irs_percentagem: number | null
          iva_percentagem: number | null
          liquido: number | null
          motorista_id: string | null
          motorista_nome: string
          org_id: string | null
          outras_receitas: number | null
          outros_custos: number | null
          reparacoes: number | null
          seguros: number | null
          semana_fim: string
          semana_inicio: string
          semana_numero: number | null
          total_receber: number | null
          updated_at: string | null
          valores_anteriores: number | null
          via_verde: number | null
        }
        Insert: {
          aluguer?: number | null
          caucao?: number | null
          combustivel?: number | null
          created_at?: string | null
          faturado_bolt?: number | null
          faturado_uber?: number | null
          ficheiro_url?: string | null
          id?: string
          importado_por?: string | null
          irs_percentagem?: number | null
          iva_percentagem?: number | null
          liquido?: number | null
          motorista_id?: string | null
          motorista_nome: string
          org_id?: string | null
          outras_receitas?: number | null
          outros_custos?: number | null
          reparacoes?: number | null
          seguros?: number | null
          semana_fim: string
          semana_inicio: string
          semana_numero?: number | null
          total_receber?: number | null
          updated_at?: string | null
          valores_anteriores?: number | null
          via_verde?: number | null
        }
        Update: {
          aluguer?: number | null
          caucao?: number | null
          combustivel?: number | null
          created_at?: string | null
          faturado_bolt?: number | null
          faturado_uber?: number | null
          ficheiro_url?: string | null
          id?: string
          importado_por?: string | null
          irs_percentagem?: number | null
          iva_percentagem?: number | null
          liquido?: number | null
          motorista_id?: string | null
          motorista_nome?: string
          org_id?: string | null
          outras_receitas?: number | null
          outros_custos?: number | null
          reparacoes?: number | null
          seguros?: number | null
          semana_fim?: string
          semana_inicio?: string
          semana_numero?: number | null
          total_receber?: number | null
          updated_at?: string | null
          valores_anteriores?: number | null
          via_verde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recibos_importados_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_importados_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      recursos: {
        Row: {
          categoria: string
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          categoria: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          categoria?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      relatorio_pagamento_pagos: {
        Row: {
          id: string
          marcado_em: string
          marcado_por: string | null
          motorista_id: string
          org_id: string
          semana_inicio: string
        }
        Insert: {
          id?: string
          marcado_em?: string
          marcado_por?: string | null
          motorista_id: string
          org_id?: string
          semana_inicio: string
        }
        Update: {
          id?: string
          marcado_em?: string
          marcado_por?: string | null
          motorista_id?: string
          org_id?: string
          semana_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_pagamento_pagos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorio_pagamento_pagos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_coberturas: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          franquia_valor: number | null
          id: string
          nome: string
          org_id: string
          preco_dia: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          franquia_valor?: number | null
          id?: string
          nome: string
          org_id: string
          preco_dia: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          franquia_valor?: number | null
          id?: string
          nome?: string
          org_id?: string
          preco_dia?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renting_coberturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_extras: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string
          preco_unidade: number
          quantidade_maxima: number | null
          tipo_calculo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id: string
          preco_unidade: number
          quantidade_maxima?: number | null
          tipo_calculo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
          preco_unidade?: number
          quantidade_maxima?: number | null
          tipo_calculo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renting_extras_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_grupos: {
        Row: {
          ativo: boolean
          capacidade_deposito: number | null
          codigo: string
          codigo_sipp: string | null
          combustivel: string | null
          combustivel_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          idade_maxima_condutor: number | null
          idade_minima_condutor: number | null
          imagem_url: string | null
          isento_iva: boolean
          mapa_danos_url: string | null
          mapa_danos_verso_url: string | null
          marca_id: string | null
          modelo_id: string | null
          nome: string
          org_id: string
          reserva_max_minutos: number | null
          reserva_min_minutos: number | null
          tipo_id: string | null
          updated_at: string
          versao_id: string | null
        }
        Insert: {
          ativo?: boolean
          capacidade_deposito?: number | null
          codigo: string
          codigo_sipp?: string | null
          combustivel?: string | null
          combustivel_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          idade_maxima_condutor?: number | null
          idade_minima_condutor?: number | null
          imagem_url?: string | null
          isento_iva?: boolean
          mapa_danos_url?: string | null
          mapa_danos_verso_url?: string | null
          marca_id?: string | null
          modelo_id?: string | null
          nome: string
          org_id: string
          reserva_max_minutos?: number | null
          reserva_min_minutos?: number | null
          tipo_id?: string | null
          updated_at?: string
          versao_id?: string | null
        }
        Update: {
          ativo?: boolean
          capacidade_deposito?: number | null
          codigo?: string
          codigo_sipp?: string | null
          combustivel?: string | null
          combustivel_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          idade_maxima_condutor?: number | null
          idade_minima_condutor?: number | null
          imagem_url?: string | null
          isento_iva?: boolean
          mapa_danos_url?: string | null
          mapa_danos_verso_url?: string | null
          marca_id?: string | null
          modelo_id?: string | null
          nome?: string
          org_id?: string
          reserva_max_minutos?: number | null
          reserva_min_minutos?: number | null
          tipo_id?: string | null
          updated_at?: string
          versao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renting_grupos_combustivel_id_fkey"
            columns: ["combustivel_id"]
            isOneToOne: false
            referencedRelation: "viatura_combustiveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_grupos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "viatura_marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_grupos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "viatura_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_grupos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_grupos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "viatura_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_grupos_versao_id_fkey"
            columns: ["versao_id"]
            isOneToOne: false
            referencedRelation: "viatura_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_movimentacoes: {
        Row: {
          created_at: string
          created_by: string | null
          data_movimentacao: string
          estacao_destino_id: string
          estacao_origem_id: string | null
          id: string
          observacoes: string | null
          org_id: string
          viatura_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_movimentacao?: string
          estacao_destino_id: string
          estacao_origem_id?: string | null
          id?: string
          observacoes?: string | null
          org_id: string
          viatura_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_movimentacao?: string
          estacao_destino_id?: string
          estacao_origem_id?: string | null
          id?: string
          observacoes?: string | null
          org_id?: string
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renting_movimentacoes_estacao_destino_id_fkey"
            columns: ["estacao_destino_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_movimentacoes_estacao_origem_id_fkey"
            columns: ["estacao_origem_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_movimentacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_movimentacoes_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_tarifa_precos_modelo: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          modelo_id: string
          org_id: string
          preco_semana: number
          tarifa_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          modelo_id: string
          org_id: string
          preco_semana: number
          tarifa_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          modelo_id?: string
          org_id?: string
          preco_semana?: number
          tarifa_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renting_tarifa_precos_modelo_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "viatura_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_tarifa_precos_modelo_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_tarifa_precos_modelo_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "renting_tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_tarifas: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string | null
          grupo_id: string
          id: string
          km_adicional_valor: number | null
          kms_incluidos: number | null
          nome: string
          org_id: string
          preco_dia: number
          preco_fim_semana: number | null
          preco_mes: number | null
          preco_semana: number | null
          reserva_max_minutos: number | null
          reserva_min_minutos: number | null
          tipo: string
          updated_at: string
          valido_ate: string | null
          valido_de: string | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          grupo_id: string
          id?: string
          km_adicional_valor?: number | null
          kms_incluidos?: number | null
          nome: string
          org_id: string
          preco_dia: number
          preco_fim_semana?: number | null
          preco_mes?: number | null
          preco_semana?: number | null
          reserva_max_minutos?: number | null
          reserva_min_minutos?: number | null
          tipo?: string
          updated_at?: string
          valido_ate?: string | null
          valido_de?: string | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          grupo_id?: string
          id?: string
          km_adicional_valor?: number | null
          kms_incluidos?: number | null
          nome?: string
          org_id?: string
          preco_dia?: number
          preco_fim_semana?: number | null
          preco_mes?: number | null
          preco_semana?: number | null
          reserva_max_minutos?: number | null
          reserva_min_minutos?: number | null
          tipo?: string
          updated_at?: string
          valido_ate?: string | null
          valido_de?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renting_tarifas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "renting_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renting_tarifas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      renting_taxas: {
        Row: {
          aplicar_automaticamente: boolean
          ativa: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string
          percentagem: number | null
          updated_at: string
          valor_fixo: number | null
        }
        Insert: {
          aplicar_automaticamente?: boolean
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id: string
          percentagem?: number | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Update: {
          aplicar_automaticamente?: boolean
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
          percentagem?: number | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "renting_taxas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      reparacao_parcelas: {
        Row: {
          cobrada_em: string | null
          created_at: string | null
          id: string
          motorista_id: string
          numero_parcela: number
          org_id: string | null
          reparacao_id: string
          semana_referencia: string
          status: string
          valor: number
        }
        Insert: {
          cobrada_em?: string | null
          created_at?: string | null
          id?: string
          motorista_id: string
          numero_parcela: number
          org_id?: string | null
          reparacao_id: string
          semana_referencia: string
          status?: string
          valor: number
        }
        Update: {
          cobrada_em?: string | null
          created_at?: string | null
          id?: string
          motorista_id?: string
          numero_parcela?: number
          org_id?: string | null
          reparacao_id?: string
          semana_referencia?: string
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "reparacao_parcelas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparacao_parcelas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparacao_parcelas_reparacao_id_fkey"
            columns: ["reparacao_id"]
            isOneToOne: false
            referencedRelation: "viatura_reparacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      repsol_transacoes: {
        Row: {
          amount: number | null
          card_number: string | null
          created_at: string | null
          fuel_type: string | null
          id: string
          integracao_id: string | null
          motorista_id: string | null
          org_id: string | null
          quantity: number | null
          raw_data: Json | null
          station_location: string | null
          station_name: string | null
          transaction_date: string
          transaction_id: string
          viatura_id: string | null
        }
        Insert: {
          amount?: number | null
          card_number?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date: string
          transaction_id: string
          viatura_id?: string | null
        }
        Update: {
          amount?: number | null
          card_number?: string | null
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          integracao_id?: string | null
          motorista_id?: string | null
          org_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          station_location?: string | null
          station_name?: string | null
          transaction_date?: string
          transaction_id?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repsol_transacoes_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repsol_transacoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repsol_transacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_anexos: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          ficheiro_url: string
          id: string
          mime_type: string | null
          nome: string
          org_id: string
          reserva_id: string
          tamanho_bytes: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url: string
          id?: string
          mime_type?: string | null
          nome: string
          org_id: string
          reserva_id: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          ficheiro_url?: string
          id?: string
          mime_type?: string | null
          nome?: string
          org_id?: string
          reserva_id?: string
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_anexos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_condutores: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_principal: boolean
          motorista_id: string | null
          org_id: string
          reserva_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_principal?: boolean
          motorista_id?: string | null
          org_id: string
          reserva_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_principal?: boolean
          motorista_id?: string | null
          org_id?: string
          reserva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_condutores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_condutores_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_condutores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_condutores_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_extras: {
        Row: {
          created_at: string
          created_by: string | null
          extra_id: string
          extra_nome: string
          id: string
          org_id: string
          preco_unidade: number
          quantidade: number
          reserva_id: string
          tipo_calculo: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          extra_id: string
          extra_nome: string
          id?: string
          org_id: string
          preco_unidade: number
          quantidade?: number
          reserva_id: string
          tipo_calculo: string
          total: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          extra_id?: string
          extra_nome?: string
          id?: string
          org_id?: string
          preco_unidade?: number
          quantidade?: number
          reserva_id?: string
          tipo_calculo?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserva_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "renting_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_extras_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_extras_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_taxas: {
        Row: {
          base_calculo: number | null
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          percentagem: number | null
          reserva_id: string
          taxa_id: string
          taxa_nome: string
          valor_calculado: number
          valor_fixo: number | null
        }
        Insert: {
          base_calculo?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          percentagem?: number | null
          reserva_id: string
          taxa_id: string
          taxa_nome: string
          valor_calculado: number
          valor_fixo?: number | null
        }
        Update: {
          base_calculo?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          percentagem?: number | null
          reserva_id?: string
          taxa_id?: string
          taxa_nome?: string
          valor_calculado?: number
          valor_fixo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_taxas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_taxas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_taxas_taxa_id_fkey"
            columns: ["taxa_id"]
            isOneToOne: false
            referencedRelation: "renting_taxas"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          caucao_valor: number | null
          cliente_id: string | null
          cliente_nome: string | null
          cobertura_franquia: number | null
          cobertura_id: string | null
          cobertura_nome: string | null
          cobertura_preco_dia: number | null
          codigo: number
          condutor_id: string | null
          condutor_nome: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          deleted_at: string | null
          desconto: number
          emissor_id: string | null
          estacao_entrega_id: string | null
          estacao_recolha_id: string | null
          estado: Database["public"]["Enums"]["reserva_estado_enum"]
          franquia_valor: number | null
          gestor_id: string | null
          grupo: string | null
          grupo_id: string | null
          grupo_nome: string | null
          id: string
          is_longa_duracao: boolean
          km_adicional_valor: number | null
          kms_incluidos: number | null
          matricula: string | null
          observacoes: string | null
          observacoes_internas: string | null
          org_id: string
          periodo: unknown
          regime: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias: number | null
          renovacao_opcao: string | null
          slot_valor_mensal: number | null
          slot_valor_semanal: number | null
          tarifa_id: string | null
          tarifa_nome: string | null
          tarifa_preco_dia: number | null
          updated_at: string
          updated_by: string | null
          valor_total: number | null
          valor_total_manual: number | null
          viatura_id: string | null
        }
        Insert: {
          caucao_valor?: number | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cobertura_franquia?: number | null
          cobertura_id?: string | null
          cobertura_nome?: string | null
          cobertura_preco_dia?: number | null
          codigo?: number
          condutor_id?: string | null
          condutor_nome?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio: string
          deleted_at?: string | null
          desconto?: number
          emissor_id?: string | null
          estacao_entrega_id?: string | null
          estacao_recolha_id?: string | null
          estado?: Database["public"]["Enums"]["reserva_estado_enum"]
          franquia_valor?: number | null
          gestor_id?: string | null
          grupo?: string | null
          grupo_id?: string | null
          grupo_nome?: string | null
          id?: string
          is_longa_duracao?: boolean
          km_adicional_valor?: number | null
          kms_incluidos?: number | null
          matricula?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          periodo?: unknown
          regime?: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias?: number | null
          renovacao_opcao?: string | null
          slot_valor_mensal?: number | null
          slot_valor_semanal?: number | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          tarifa_preco_dia?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
          valor_total_manual?: number | null
          viatura_id?: string | null
        }
        Update: {
          caucao_valor?: number | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cobertura_franquia?: number | null
          cobertura_id?: string | null
          cobertura_nome?: string | null
          cobertura_preco_dia?: number | null
          codigo?: number
          condutor_id?: string | null
          condutor_nome?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          deleted_at?: string | null
          desconto?: number
          emissor_id?: string | null
          estacao_entrega_id?: string | null
          estacao_recolha_id?: string | null
          estado?: Database["public"]["Enums"]["reserva_estado_enum"]
          franquia_valor?: number | null
          gestor_id?: string | null
          grupo?: string | null
          grupo_id?: string | null
          grupo_nome?: string | null
          id?: string
          is_longa_duracao?: boolean
          km_adicional_valor?: number | null
          kms_incluidos?: number | null
          matricula?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          org_id?: string
          periodo?: unknown
          regime?: Database["public"]["Enums"]["contrato_regime_enum"]
          renovacao_intervalo_dias?: number | null
          renovacao_opcao?: string | null
          slot_valor_mensal?: number | null
          slot_valor_semanal?: number | null
          tarifa_id?: string | null
          tarifa_nome?: string | null
          tarifa_preco_dia?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
          valor_total_manual?: number | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_cobertura_id_fkey"
            columns: ["cobertura_id"]
            isOneToOne: false
            referencedRelation: "renting_coberturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_condutor_id_fkey"
            columns: ["condutor_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_emissor_id_fkey"
            columns: ["emissor_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_estacao_entrega_id_fkey"
            columns: ["estacao_entrega_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_estacao_recolha_id_fkey"
            columns: ["estacao_recolha_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "renting_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "renting_tarifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          integracao_id: string
          org_id: string | null
          plataforma: string
          robot_target_platform: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          integracao_id: string
          org_id?: string | null
          plataforma: string
          robot_target_platform?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          integracao_id?: string
          org_id?: string | null
          plataforma?: string
          robot_target_platform?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_queue_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_atividade_motoristas: {
        Row: {
          created_at: string | null
          driver_name: string | null
          id: string
          integracao_id: string
          org_id: string | null
          periodo: string | null
          raw_row: Json | null
          tempo_em_viagem_minutos: number | null
          tempo_online_minutos: number | null
          uber_driver_id: string
          viagens_concluidas: number | null
        }
        Insert: {
          created_at?: string | null
          driver_name?: string | null
          id?: string
          integracao_id: string
          org_id?: string | null
          periodo?: string | null
          raw_row?: Json | null
          tempo_em_viagem_minutos?: number | null
          tempo_online_minutos?: number | null
          uber_driver_id: string
          viagens_concluidas?: number | null
        }
        Update: {
          created_at?: string | null
          driver_name?: string | null
          id?: string
          integracao_id?: string
          org_id?: string | null
          periodo?: string | null
          raw_row?: Json | null
          tempo_em_viagem_minutos?: number | null
          tempo_online_minutos?: number | null
          uber_driver_id?: string
          viagens_concluidas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_atividade_motoristas_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_atividade_motoristas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_driver_compliance: {
        Row: {
          compliance_data: Json
          compliance_status: string | null
          created_at: string
          id: string
          integracao_id: string
          last_synced_at: string | null
          motorista_id: string | null
          org_id: string | null
          uber_driver_id: string
          updated_at: string
        }
        Insert: {
          compliance_data?: Json
          compliance_status?: string | null
          created_at?: string
          id?: string
          integracao_id: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          uber_driver_id: string
          updated_at?: string
        }
        Update: {
          compliance_data?: Json
          compliance_status?: string | null
          created_at?: string
          id?: string
          integracao_id?: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          uber_driver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_driver_compliance_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_compliance_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_compliance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_driver_profiles: {
        Row: {
          created_at: string
          decrypted_fields: Json | null
          encrypted_fields: Json | null
          id: string
          integracao_id: string
          last_synced_at: string | null
          motorista_id: string | null
          org_id: string | null
          profile_data: Json
          uber_driver_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decrypted_fields?: Json | null
          encrypted_fields?: Json | null
          id?: string
          integracao_id: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          profile_data?: Json
          uber_driver_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decrypted_fields?: Json | null
          encrypted_fields?: Json | null
          id?: string
          integracao_id?: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          profile_data?: Json
          uber_driver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_driver_profiles_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_profiles_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_driver_risk_profiles: {
        Row: {
          created_at: string
          id: string
          integracao_id: string
          last_synced_at: string | null
          motorista_id: string | null
          org_id: string | null
          risk_data: Json
          risk_level: string | null
          risk_score: number | null
          uber_driver_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integracao_id: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          risk_data?: Json
          risk_level?: string | null
          risk_score?: number | null
          uber_driver_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integracao_id?: string
          last_synced_at?: string | null
          motorista_id?: string | null
          org_id?: string | null
          risk_data?: Json
          risk_level?: string | null
          risk_score?: number | null
          uber_driver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_driver_risk_profiles_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_risk_profiles_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_risk_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_driver_tokens: {
        Row: {
          access_token: string
          consented_at: string
          created_at: string
          expires_at: string | null
          id: string
          integracao_id: string
          metadata: Json | null
          motorista_id: string | null
          org_id: string | null
          refresh_token: string | null
          revoked_at: string | null
          scope: string | null
          token_type: string | null
          uber_driver_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          consented_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          integracao_id: string
          metadata?: Json | null
          motorista_id?: string | null
          org_id?: string | null
          refresh_token?: string | null
          revoked_at?: string | null
          scope?: string | null
          token_type?: string | null
          uber_driver_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          consented_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          integracao_id?: string
          metadata?: Json | null
          motorista_id?: string | null
          org_id?: string | null
          refresh_token?: string | null
          revoked_at?: string | null
          scope?: string | null
          token_type?: string | null
          uber_driver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_driver_tokens_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_tokens_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_driver_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_drivers: {
        Row: {
          account_status: string | null
          city: string | null
          consent_granted_at: string | null
          created_at: string
          decrypted_fields: Json | null
          email: string | null
          encrypted_fields: Json | null
          first_name: string | null
          flow_type: string | null
          full_name: string | null
          id: string
          integracao_id: string
          last_name: string | null
          last_synced_at: string | null
          motorista_id: string | null
          onboarding_status: string | null
          org_id: string | null
          phone: string | null
          rating: number | null
          raw_profile: Json | null
          status: string | null
          uber_driver_id: string
          updated_at: string
        }
        Insert: {
          account_status?: string | null
          city?: string | null
          consent_granted_at?: string | null
          created_at?: string
          decrypted_fields?: Json | null
          email?: string | null
          encrypted_fields?: Json | null
          first_name?: string | null
          flow_type?: string | null
          full_name?: string | null
          id?: string
          integracao_id: string
          last_name?: string | null
          last_synced_at?: string | null
          motorista_id?: string | null
          onboarding_status?: string | null
          org_id?: string | null
          phone?: string | null
          rating?: number | null
          raw_profile?: Json | null
          status?: string | null
          uber_driver_id: string
          updated_at?: string
        }
        Update: {
          account_status?: string | null
          city?: string | null
          consent_granted_at?: string | null
          created_at?: string
          decrypted_fields?: Json | null
          email?: string | null
          encrypted_fields?: Json | null
          first_name?: string | null
          flow_type?: string | null
          full_name?: string | null
          id?: string
          integracao_id?: string
          last_name?: string | null
          last_synced_at?: string | null
          motorista_id?: string | null
          onboarding_status?: string | null
          org_id?: string | null
          phone?: string | null
          rating?: number | null
          raw_profile?: Json | null
          status?: string | null
          uber_driver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_drivers_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_drivers_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_sync_cursors: {
        Row: {
          created_at: string
          cursor_value: string | null
          domain: string
          id: string
          integracao_id: string
          metadata: Json
          org_id: string | null
          synced_from: string | null
          synced_to: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cursor_value?: string | null
          domain: string
          id?: string
          integracao_id: string
          metadata?: Json
          org_id?: string | null
          synced_from?: string | null
          synced_to?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cursor_value?: string | null
          domain?: string
          id?: string
          integracao_id?: string
          metadata?: Json
          org_id?: string | null
          synced_from?: string | null
          synced_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_sync_cursors_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_sync_cursors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_sync_logs: {
        Row: {
          created_at: string | null
          detalhes: Json | null
          erros: number | null
          executado_por: string | null
          id: string
          integracao_id: string | null
          mensagem: string | null
          org_id: string | null
          status: string
          tipo: string
          viagens_atualizadas: number | null
          viagens_novas: number | null
        }
        Insert: {
          created_at?: string | null
          detalhes?: Json | null
          erros?: number | null
          executado_por?: string | null
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          org_id?: string | null
          status: string
          tipo: string
          viagens_atualizadas?: number | null
          viagens_novas?: number | null
        }
        Update: {
          created_at?: string | null
          detalhes?: Json | null
          erros?: number | null
          executado_por?: string | null
          id?: string
          integracao_id?: string | null
          mensagem?: string | null
          org_id?: string | null
          status?: string
          tipo?: string
          viagens_atualizadas?: number | null
          viagens_novas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_sync_logs_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_sync_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_transactions: {
        Row: {
          commission_amount: number | null
          created_at: string
          currency: string | null
          gross_amount: number | null
          id: string
          integracao_id: string
          motorista_id: string | null
          net_amount: number | null
          occurred_at: string | null
          org_id: string | null
          raw_transaction: Json
          settled_at: string | null
          status: string | null
          transaction_type: string | null
          trip_reference: string | null
          uber_driver_id: string | null
          uber_transaction_id: string
          uber_vehicle_id: string | null
          updated_at: string
          viatura_id: string | null
        }
        Insert: {
          commission_amount?: number | null
          created_at?: string
          currency?: string | null
          gross_amount?: number | null
          id?: string
          integracao_id: string
          motorista_id?: string | null
          net_amount?: number | null
          occurred_at?: string | null
          org_id?: string | null
          raw_transaction?: Json
          settled_at?: string | null
          status?: string | null
          transaction_type?: string | null
          trip_reference?: string | null
          uber_driver_id?: string | null
          uber_transaction_id: string
          uber_vehicle_id?: string | null
          updated_at?: string
          viatura_id?: string | null
        }
        Update: {
          commission_amount?: number | null
          created_at?: string
          currency?: string | null
          gross_amount?: number | null
          id?: string
          integracao_id?: string
          motorista_id?: string | null
          net_amount?: number | null
          occurred_at?: string | null
          org_id?: string | null
          raw_transaction?: Json
          settled_at?: string | null
          status?: string | null
          transaction_type?: string | null
          trip_reference?: string | null
          uber_driver_id?: string | null
          uber_transaction_id?: string
          uber_vehicle_id?: string | null
          updated_at?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_transactions_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_transactions_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_transactions_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_vehicle_documents: {
        Row: {
          created_at: string
          document_id: string | null
          document_type: string | null
          expires_at: string | null
          id: string
          integracao_id: string
          org_id: string | null
          raw_document: Json
          status: string | null
          uber_vehicle_id: string
          uber_vehicle_uuid: string | null
          updated_at: string
          viatura_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          integracao_id: string
          org_id?: string | null
          raw_document?: Json
          status?: string | null
          uber_vehicle_id: string
          uber_vehicle_uuid?: string | null
          updated_at?: string
          viatura_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          integracao_id?: string
          org_id?: string | null
          raw_document?: Json
          status?: string | null
          uber_vehicle_id?: string
          uber_vehicle_uuid?: string | null
          updated_at?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_vehicle_documents_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_vehicle_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_vehicle_documents_uber_vehicle_uuid_fkey"
            columns: ["uber_vehicle_uuid"]
            isOneToOne: false
            referencedRelation: "uber_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_vehicle_documents_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_vehicles: {
        Row: {
          color: string | null
          created_at: string
          decrypted_fields: Json | null
          encrypted_fields: Json | null
          fleet_status: string | null
          id: string
          integracao_id: string
          last_synced_at: string | null
          license_plate: string | null
          make: string | null
          model: string | null
          normalized_license_plate: string | null
          org_id: string | null
          owner_id: string | null
          raw_vehicle: Json | null
          status: string | null
          supply_status: string | null
          uber_vehicle_id: string
          updated_at: string
          viatura_id: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          decrypted_fields?: Json | null
          encrypted_fields?: Json | null
          fleet_status?: string | null
          id?: string
          integracao_id: string
          last_synced_at?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          normalized_license_plate?: string | null
          org_id?: string | null
          owner_id?: string | null
          raw_vehicle?: Json | null
          status?: string | null
          supply_status?: string | null
          uber_vehicle_id: string
          updated_at?: string
          viatura_id?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          decrypted_fields?: Json | null
          encrypted_fields?: Json | null
          fleet_status?: string | null
          id?: string
          integracao_id?: string
          last_synced_at?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          normalized_license_plate?: string | null
          org_id?: string | null
          owner_id?: string | null
          raw_vehicle?: Json | null
          status?: string | null
          supply_status?: string | null
          uber_vehicle_id?: string
          updated_at?: string
          viatura_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_vehicles_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_vehicles_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_viagens: {
        Row: {
          commission: number | null
          created_at: string
          dados_raw: Json | null
          destination_address: string | null
          driver_earnings: number | null
          driver_name: string | null
          driver_phone: string | null
          external_trip_id: string | null
          id: string
          integracao_id: string
          motorista_id: string | null
          org_id: string | null
          payment_confirmed_at: string | null
          payment_method: string | null
          pickup_address: string | null
          total_price: number | null
          trip_created_at: string | null
          trip_reference: string
          trip_status: string | null
          updated_at: string
          vehicle_license_plate: string | null
          vehicle_model: string | null
          viatura_id: string | null
        }
        Insert: {
          commission?: number | null
          created_at?: string
          dados_raw?: Json | null
          destination_address?: string | null
          driver_earnings?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          external_trip_id?: string | null
          id?: string
          integracao_id: string
          motorista_id?: string | null
          org_id?: string | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          total_price?: number | null
          trip_created_at?: string | null
          trip_reference: string
          trip_status?: string | null
          updated_at?: string
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
          viatura_id?: string | null
        }
        Update: {
          commission?: number | null
          created_at?: string
          dados_raw?: Json | null
          destination_address?: string | null
          driver_earnings?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          external_trip_id?: string | null
          id?: string
          integracao_id?: string
          motorista_id?: string | null
          org_id?: string | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          total_price?: number | null
          trip_created_at?: string | null
          trip_reference?: string
          trip_status?: string | null
          updated_at?: string
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_viagens_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_viagens_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_viagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_viagens_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string | null
          event_type: string
          headers: Json
          id: string
          integracao_id: string | null
          org_id: string | null
          payload: Json
          processed_at: string | null
          processing_status: string
          signature: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type: string
          headers?: Json
          id?: string
          integracao_id?: string | null
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          signature?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          headers?: Json
          id?: string
          integracao_id?: string | null
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uber_webhook_events_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_webhook_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      uber_write_logs: {
        Row: {
          created_at: string
          entity_external_id: string | null
          entity_type: string
          error_message: string | null
          executado_por: string | null
          id: string
          integracao_id: string
          operation: string
          org_id: string | null
          request_payload: Json
          response_payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          entity_external_id?: string | null
          entity_type: string
          error_message?: string | null
          executado_por?: string | null
          id?: string
          integracao_id: string
          operation: string
          org_id?: string | null
          request_payload?: Json
          response_payload?: Json | null
          status: string
        }
        Update: {
          created_at?: string
          entity_external_id?: string | null
          entity_type?: string
          error_message?: string | null
          executado_por?: string | null
          id?: string
          integracao_id?: string
          operation?: string
          org_id?: string | null
          request_payload?: Json
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "uber_write_logs_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uber_write_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_org_ativa: {
        Row: {
          org_id: string
          user_id: string
        }
        Insert: {
          org_id: string
          user_id: string
        }
        Update: {
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_org_ativa_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizacoes: {
        Row: {
          cargo_id: string | null
          created_at: string
          id: string
          is_admin: boolean
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          cargo_id?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          cargo_id?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      via_verde_contas: {
        Row: {
          codigo_rac: string
          created_at: string
          criado_por: string | null
          ftp_ativo: boolean
          ftp_host: string
          ftp_modo_passivo: boolean
          ftp_password: string
          ftp_porta: number
          ftp_protocolo: string
          ftp_utilizador: string
          id: string
          integracao_id: string
          logo_url: string | null
          nome_conta: string
          org_id: string | null
          sync_ativo: boolean
          sync_email: string
          sync_password: string
          updated_at: string
        }
        Insert: {
          codigo_rac: string
          created_at?: string
          criado_por?: string | null
          ftp_ativo?: boolean
          ftp_host: string
          ftp_modo_passivo?: boolean
          ftp_password: string
          ftp_porta?: number
          ftp_protocolo?: string
          ftp_utilizador: string
          id?: string
          integracao_id: string
          logo_url?: string | null
          nome_conta: string
          org_id?: string | null
          sync_ativo?: boolean
          sync_email: string
          sync_password: string
          updated_at?: string
        }
        Update: {
          codigo_rac?: string
          created_at?: string
          criado_por?: string | null
          ftp_ativo?: boolean
          ftp_host?: string
          ftp_modo_passivo?: boolean
          ftp_password?: string
          ftp_porta?: number
          ftp_protocolo?: string
          ftp_utilizador?: string
          id?: string
          integracao_id?: string
          logo_url?: string | null
          nome_conta?: string
          org_id?: string | null
          sync_ativo?: boolean
          sync_email?: string
          sync_password?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "via_verde_contas_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "via_verde_contas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      via_verde_transacoes: {
        Row: {
          amount: number | null
          barreira_entrada: string | null
          barreira_saida: string | null
          contrato: string | null
          created_at: string | null
          id: string
          integracao_id: string | null
          matricula: string | null
          motorista_id: string | null
          nr_equipamento: string | null
          operador: string | null
          org_id: string | null
          raw_data: Json | null
          tipo_evento: string | null
          transaction_date: string | null
          transaction_id: string
          viatura_id: string | null
        }
        Insert: {
          amount?: number | null
          barreira_entrada?: string | null
          barreira_saida?: string | null
          contrato?: string | null
          created_at?: string | null
          id?: string
          integracao_id?: string | null
          matricula?: string | null
          motorista_id?: string | null
          nr_equipamento?: string | null
          operador?: string | null
          org_id?: string | null
          raw_data?: Json | null
          tipo_evento?: string | null
          transaction_date?: string | null
          transaction_id: string
          viatura_id?: string | null
        }
        Update: {
          amount?: number | null
          barreira_entrada?: string | null
          barreira_saida?: string | null
          contrato?: string | null
          created_at?: string | null
          id?: string
          integracao_id?: string | null
          matricula?: string | null
          motorista_id?: string | null
          nr_equipamento?: string | null
          operador?: string | null
          org_id?: string | null
          raw_data?: Json | null
          tipo_evento?: string | null
          transaction_date?: string | null
          transaction_id?: string
          viatura_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "via_verde_transacoes_integracao_id_fkey"
            columns: ["integracao_id"]
            isOneToOne: false
            referencedRelation: "plataformas_configuracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "via_verde_transacoes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "via_verde_transacoes_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_combustiveis: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          org_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          org_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_combustiveis_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_dano_fotos: {
        Row: {
          contrato_id: string | null
          created_at: string | null
          dano_id: string
          descricao: string | null
          ficheiro_url: string
          id: string
          nome_ficheiro: string | null
          org_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string | null
          dano_id: string
          descricao?: string | null
          ficheiro_url: string
          id?: string
          nome_ficheiro?: string | null
          org_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          contrato_id?: string | null
          created_at?: string | null
          dano_id?: string
          descricao?: string | null
          ficheiro_url?: string
          id?: string
          nome_ficheiro?: string | null
          org_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viatura_dano_fotos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_dano_fotos_dano_id_fkey"
            columns: ["dano_id"]
            isOneToOne: false
            referencedRelation: "viatura_danos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_dano_fotos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_dano_fotos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_danos: {
        Row: {
          cobranca_id: string | null
          condutor_cliente_id: string | null
          contrato_id: string | null
          contrato_id_origem: string | null
          contrato_renting_id: string | null
          created_at: string | null
          data_ocorrencia: string | null
          data_registo: string | null
          descricao: string
          estado: string | null
          id: string
          localizacao: string | null
          motorista_id: string | null
          observacoes: string | null
          org_id: string | null
          registado_por: string | null
          registo_fotografico: boolean
          ticket_id: string | null
          updated_at: string | null
          valor: number | null
          valor_cobrado: number | null
          viatura_id: string
        }
        Insert: {
          cobranca_id?: string | null
          condutor_cliente_id?: string | null
          contrato_id?: string | null
          contrato_id_origem?: string | null
          contrato_renting_id?: string | null
          created_at?: string | null
          data_ocorrencia?: string | null
          data_registo?: string | null
          descricao: string
          estado?: string | null
          id?: string
          localizacao?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          org_id?: string | null
          registado_por?: string | null
          registo_fotografico?: boolean
          ticket_id?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_cobrado?: number | null
          viatura_id: string
        }
        Update: {
          cobranca_id?: string | null
          condutor_cliente_id?: string | null
          contrato_id?: string | null
          contrato_id_origem?: string | null
          contrato_renting_id?: string | null
          created_at?: string | null
          data_ocorrencia?: string | null
          data_registo?: string | null
          descricao?: string
          estado?: string | null
          id?: string
          localizacao?: string | null
          motorista_id?: string | null
          observacoes?: string | null
          org_id?: string | null
          registado_por?: string | null
          registo_fotografico?: boolean
          ticket_id?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_cobrado?: number | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_danos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "contrato_cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_condutor_cliente_id_fkey"
            columns: ["condutor_cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_contrato_id_origem_fkey"
            columns: ["contrato_id_origem"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_contrato_renting_id_fkey"
            columns: ["contrato_renting_id"]
            isOneToOne: false
            referencedRelation: "contrato_renting_totais"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "viatura_danos_contrato_renting_id_fkey"
            columns: ["contrato_renting_id"]
            isOneToOne: false
            referencedRelation: "contratos_renting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "assistencia_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_danos_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_documentos: {
        Row: {
          created_at: string | null
          data_validade: string | null
          ficheiro_url: string
          id: string
          nome_ficheiro: string | null
          observacoes: string | null
          org_id: string | null
          tipo_documento: string
          updated_at: string | null
          uploaded_by: string | null
          viatura_id: string
        }
        Insert: {
          created_at?: string | null
          data_validade?: string | null
          ficheiro_url: string
          id?: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          tipo_documento: string
          updated_at?: string | null
          uploaded_by?: string | null
          viatura_id: string
        }
        Update: {
          created_at?: string | null
          data_validade?: string | null
          ficheiro_url?: string
          id?: string
          nome_ficheiro?: string | null
          observacoes?: string | null
          org_id?: string | null
          tipo_documento?: string
          updated_at?: string | null
          uploaded_by?: string | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_documentos_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_marcas: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          org_id: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          org_id: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_marcas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_modelos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          marca_id: string
          nome: string
          org_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          marca_id: string
          nome: string
          org_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          marca_id?: string
          nome?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_modelos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "viatura_marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_modelos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_multas: {
        Row: {
          created_at: string | null
          data_infracao: string
          data_pagamento: string | null
          descricao: string | null
          estado: string | null
          id: string
          motorista_id: string | null
          observacoes: string | null
          org_id: string | null
          registado_por: string | null
          updated_at: string | null
          valor: number | null
          viatura_id: string
        }
        Insert: {
          created_at?: string | null
          data_infracao: string
          data_pagamento?: string | null
          descricao?: string | null
          estado?: string | null
          id?: string
          motorista_id?: string | null
          observacoes?: string | null
          org_id?: string | null
          registado_por?: string | null
          updated_at?: string | null
          valor?: number | null
          viatura_id: string
        }
        Update: {
          created_at?: string | null
          data_infracao?: string
          data_pagamento?: string | null
          descricao?: string | null
          estado?: string | null
          id?: string
          motorista_id?: string | null
          observacoes?: string | null
          org_id?: string | null
          registado_por?: string | null
          updated_at?: string | null
          valor?: number | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_multas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_multas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_multas_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_proprietarios: {
        Row: {
          created_at: string
          id: string
          nome: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_proprietarios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_reparacoes: {
        Row: {
          cobrar_motorista: boolean
          created_at: string | null
          custo: number | null
          dano_id: string | null
          data_entrada: string | null
          data_inicio_cobranca: string | null
          data_saida: string | null
          descricao: string
          id: string
          km_entrada: number | null
          motorista_responsavel_id: string | null
          num_parcelas: number | null
          observacoes: string | null
          oficina: string | null
          org_id: string | null
          registado_por: string | null
          status_financeiro: string | null
          updated_at: string | null
          valor_a_cobrar: number | null
          viatura_id: string
        }
        Insert: {
          cobrar_motorista?: boolean
          created_at?: string | null
          custo?: number | null
          dano_id?: string | null
          data_entrada?: string | null
          data_inicio_cobranca?: string | null
          data_saida?: string | null
          descricao: string
          id?: string
          km_entrada?: number | null
          motorista_responsavel_id?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          oficina?: string | null
          org_id?: string | null
          registado_por?: string | null
          status_financeiro?: string | null
          updated_at?: string | null
          valor_a_cobrar?: number | null
          viatura_id: string
        }
        Update: {
          cobrar_motorista?: boolean
          created_at?: string | null
          custo?: number | null
          dano_id?: string | null
          data_entrada?: string | null
          data_inicio_cobranca?: string | null
          data_saida?: string | null
          descricao?: string
          id?: string
          km_entrada?: number | null
          motorista_responsavel_id?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          oficina?: string | null
          org_id?: string | null
          registado_por?: string | null
          status_financeiro?: string | null
          updated_at?: string | null
          valor_a_cobrar?: number | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_reparacoes_dano_id_fkey"
            columns: ["dano_id"]
            isOneToOne: false
            referencedRelation: "viatura_danos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_reparacoes_motorista_responsavel_id_fkey"
            columns: ["motorista_responsavel_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_reparacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_reparacoes_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_reservas: {
        Row: {
          created_at: string | null
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          estado: string | null
          id: string
          motivo: string | null
          motorista_id: string | null
          org_id: string | null
          updated_at: string | null
          viatura_id: string
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          data_fim?: string | null
          data_inicio: string
          estado?: string | null
          id?: string
          motivo?: string | null
          motorista_id?: string | null
          org_id?: string | null
          updated_at?: string | null
          viatura_id: string
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          estado?: string | null
          id?: string
          motivo?: string | null
          motorista_id?: string | null
          org_id?: string | null
          updated_at?: string | null
          viatura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_reservas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas_ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_reservas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_reservas_viatura_id_fkey"
            columns: ["viatura_id"]
            isOneToOne: false
            referencedRelation: "viaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_tipos: {
        Row: {
          ativo: boolean
          criado_em: string
          elegivel_tvde: boolean
          id: string
          nome: string
          org_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          elegivel_tvde?: boolean
          id?: string
          nome: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          elegivel_tvde?: boolean
          id?: string
          nome?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_tipos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viatura_versoes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          modelo_id: string
          nome: string
          org_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo_id: string
          nome: string
          org_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo_id?: string
          nome?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viatura_versoes_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "viatura_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viatura_versoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      viaturas: {
        Row: {
          ano: number | null
          categoria: string | null
          checklist_saida: Json | null
          combustivel: string | null
          combustivel_id: string | null
          cor: string | null
          created_at: string | null
          custo_km_adicional: number | null
          custo_viatura: number | null
          custos_adicionais: number | null
          custos_operacionais: number | null
          data_aquisicao: string | null
          data_matricula: string | null
          data_primeiro_pagamento: string | null
          data_validade_financeira: string | null
          data_venda: string | null
          estacao_id: string | null
          extintor_numero: string | null
          extintor_validade: string | null
          grupo_id: string | null
          habilitada_tvde: boolean
          id: string
          impostos_aquisicao: number | null
          inspecao_validade: string | null
          is_slot: boolean | null
          is_vendida: boolean | null
          iva_tipo: string | null
          km_atual: number | null
          limite_km_mensal: number | null
          limite_kms: number | null
          marca: string
          marca_id: string | null
          matricula: string
          metodo_depreciacao: string | null
          modelo: string
          modelo_id: string | null
          num_prestacoes: number | null
          numero_chassis: string | null
          numero_motor: string | null
          obe_estado: string | null
          obe_numero: string | null
          observacoes: string | null
          org_id: string
          proprietario_id: string | null
          seguradora: string | null
          seguro_numero: string | null
          seguro_validade: string | null
          status: string | null
          tipo_financiamento: string | null
          tipo_frota: string | null
          tipo_id: string | null
          total_viatura: number | null
          updated_at: string | null
          valor_aluguer: number | null
          valor_diario: number | null
          valor_mensal: number | null
          valor_prestacao: number | null
          valor_residual: number | null
          valor_venda: number | null
          venda_observacoes: string | null
          vida_util_anos: number | null
        }
        Insert: {
          ano?: number | null
          categoria?: string | null
          checklist_saida?: Json | null
          combustivel?: string | null
          combustivel_id?: string | null
          cor?: string | null
          created_at?: string | null
          custo_km_adicional?: number | null
          custo_viatura?: number | null
          custos_adicionais?: number | null
          custos_operacionais?: number | null
          data_aquisicao?: string | null
          data_matricula?: string | null
          data_primeiro_pagamento?: string | null
          data_validade_financeira?: string | null
          data_venda?: string | null
          estacao_id?: string | null
          extintor_numero?: string | null
          extintor_validade?: string | null
          grupo_id?: string | null
          habilitada_tvde?: boolean
          id?: string
          impostos_aquisicao?: number | null
          inspecao_validade?: string | null
          is_slot?: boolean | null
          is_vendida?: boolean | null
          iva_tipo?: string | null
          km_atual?: number | null
          limite_km_mensal?: number | null
          limite_kms?: number | null
          marca: string
          marca_id?: string | null
          matricula: string
          metodo_depreciacao?: string | null
          modelo: string
          modelo_id?: string | null
          num_prestacoes?: number | null
          numero_chassis?: string | null
          numero_motor?: string | null
          obe_estado?: string | null
          obe_numero?: string | null
          observacoes?: string | null
          org_id?: string
          proprietario_id?: string | null
          seguradora?: string | null
          seguro_numero?: string | null
          seguro_validade?: string | null
          status?: string | null
          tipo_financiamento?: string | null
          tipo_frota?: string | null
          tipo_id?: string | null
          total_viatura?: number | null
          updated_at?: string | null
          valor_aluguer?: number | null
          valor_diario?: number | null
          valor_mensal?: number | null
          valor_prestacao?: number | null
          valor_residual?: number | null
          valor_venda?: number | null
          venda_observacoes?: string | null
          vida_util_anos?: number | null
        }
        Update: {
          ano?: number | null
          categoria?: string | null
          checklist_saida?: Json | null
          combustivel?: string | null
          combustivel_id?: string | null
          cor?: string | null
          created_at?: string | null
          custo_km_adicional?: number | null
          custo_viatura?: number | null
          custos_adicionais?: number | null
          custos_operacionais?: number | null
          data_aquisicao?: string | null
          data_matricula?: string | null
          data_primeiro_pagamento?: string | null
          data_validade_financeira?: string | null
          data_venda?: string | null
          estacao_id?: string | null
          extintor_numero?: string | null
          extintor_validade?: string | null
          grupo_id?: string | null
          habilitada_tvde?: boolean
          id?: string
          impostos_aquisicao?: number | null
          inspecao_validade?: string | null
          is_slot?: boolean | null
          is_vendida?: boolean | null
          iva_tipo?: string | null
          km_atual?: number | null
          limite_km_mensal?: number | null
          limite_kms?: number | null
          marca?: string
          marca_id?: string | null
          matricula?: string
          metodo_depreciacao?: string | null
          modelo?: string
          modelo_id?: string | null
          num_prestacoes?: number | null
          numero_chassis?: string | null
          numero_motor?: string | null
          obe_estado?: string | null
          obe_numero?: string | null
          observacoes?: string | null
          org_id?: string
          proprietario_id?: string | null
          seguradora?: string | null
          seguro_numero?: string | null
          seguro_validade?: string | null
          status?: string | null
          tipo_financiamento?: string | null
          tipo_frota?: string | null
          tipo_id?: string | null
          total_viatura?: number | null
          updated_at?: string | null
          valor_aluguer?: number | null
          valor_diario?: number | null
          valor_mensal?: number | null
          valor_prestacao?: number | null
          valor_residual?: number | null
          valor_venda?: number | null
          venda_observacoes?: string | null
          vida_util_anos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "viaturas_combustivel_id_fkey"
            columns: ["combustivel_id"]
            isOneToOne: false
            referencedRelation: "viatura_combustiveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_estacao_id_fkey"
            columns: ["estacao_id"]
            isOneToOne: false
            referencedRelation: "estacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "renting_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "viatura_marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "viatura_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_proprietario_id_fkey"
            columns: ["proprietario_id"]
            isOneToOne: false
            referencedRelation: "viatura_proprietarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viaturas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "viatura_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contrato_renting_totais: {
        Row: {
          cobertura_custo: number | null
          contrato_id: string | null
          dias: number | null
          estado_financeiro:
            | Database["public"]["Enums"]["contrato_estado_financeiro_enum"]
            | null
          extra_custo: number | null
          facturado_em: string | null
          is_snapshot: boolean | null
          iva: number | null
          subtotal: number | null
          taxa_custo: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aprovar_candidatura_motorista: {
        Args: { p_candidatura_id: string }
        Returns: string
      }
      assign_gestors_from_history: {
        Args: never
        Returns: {
          first_interaction: string
          gestor_nome: string
          lead_id: string
        }[]
      }
      assign_lead_on_first_view: {
        Args: { lead_id_param: string; user_id_param: string }
        Returns: boolean
      }
      associar_cartao_combustivel: {
        Args: { p_card: string; p_motorista: string; p_plataforma: string }
        Returns: number
      }
      calcular_valor_aluguer: {
        Args: {
          p_dias: number
          p_regime: Database["public"]["Enums"]["contrato_regime_enum"]
          p_tarifa_id: string
        }
        Returns: number
      }
      can_edit: {
        Args: { _recurso: string; _user_id: string }
        Returns: boolean
      }
      can_view_financeiro: { Args: never; Returns: boolean }
      consumir_token_realizacao: {
        Args: { p_token: string }
        Returns: {
          cidade: string
          contrato_id: string
          data_inicio: string
          evento_id: string
          matricula: string
          tipo: string
        }[]
      }
      conta_corrente_saldo: { Args: { p_entidade_id: string }; Returns: number }
      contexto_folha_por_token: {
        Args: { p_token: string }
        Returns: {
          viatura_id: string
          emissor_id: string
          empresa_nome: string
          empresa_nif: string
          empresa_sede: string
          empresa_licenca_tvde: string
          empresa_licenca_validade: string
          empresa_representante: string
          empresa_cargo_representante: string
          condutor_nome: string
          condutor_email: string
          cliente_nome: string
          km_saida: number
          combustivel_saida: string
        }[]
      }
      contrato_historico_resumo: {
        Args: { p_contrato_id: string }
        Returns: {
          ator_id: string | null
          ator_nome: string | null
          criado_em: string
          detalhe: string | null
          evento_tipo: string
        }[]
      }
      contrato_tem_conflito: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_excluir_id?: string
          p_reserva_id?: string
          p_viatura_id: string
        }
        Returns: boolean
      }
      criar_versao_contrato_renting: {
        Args: { p_contrato_id: string; p_motivo: string }
        Returns: string
      }
      current_user_cargo: { Args: never; Returns: string }
      ensure_lista_motoristas: {
        Args: never
        Returns: Database["public"]["Tables"]["marketing_listas"]["Row"]
      }
      execute_gestor_assignment: { Args: never; Returns: number }
      fn_contrato_dias: {
        Args: { p_data_fim: string; p_data_inicio: string }
        Returns: number
      }
      generate_primavera_api_key: { Args: never; Returns: string }
      gerar_cobranca_dano: { Args: { p_dano_id: string }; Returns: string }
      gerar_cobranca_renta_car: {
        Args: { p_contrato_id: string }
        Returns: string
      }
      gerar_cobrancas_tvde_semanais: {
        Args: { p_semanas_a_frente?: number }
        Returns: number
      }
      gerar_contrato_atomico: {
        Args: {
          p_calendario_evento_id?: string
          p_checkout_pendente?: boolean
          p_cidade_assinatura: string
          p_criado_por: string
          p_data_assinatura: string
          p_data_inicio: string
          p_duracao_meses: number
          p_empresa_id: string
          p_force_new_version?: boolean
          p_motorista_documento_numero: string
          p_motorista_documento_tipo: string
          p_motorista_email: string
          p_motorista_id: string
          p_motorista_morada: string
          p_motorista_nif: string
          p_motorista_nome: string
          p_motorista_telefone: string
          p_template_id?: string
          p_viatura_id?: string
        }
        Returns: {
          created_at: string
          data_assinatura: string
          data_inicio: string
          empresa_id: string
          id: string
          is_existing: boolean
          motorista_id: string
          motorista_nome: string
          numero_contrato: number
          status: string
        }[]
      }
      gerar_token_danos: {
        Args: { p_viatura_id: string; p_contrato_renting_id?: string | null }
        Returns: string
      }
      gerar_token_realizacao: { Args: { p_evento_id: string }; Returns: string }
      get_cartao_historico_consumo: {
        Args: { p_numero: string; p_tipo: string }
        Returns: {
          amount: number
          fuel_type: string
          motorista_nome: string
          quantity: number
          station_name: string
          transaction_date: string
        }[]
      }
      get_cartoes_combustivel_nao_associados:
        | {
            Args: never
            Returns: {
              card_number: string
              nome: string
              plataforma: string
              total: number
              transacoes: number
            }[]
          }
        | {
            Args: { p_desde?: string }
            Returns: {
              card_number: string
              nome: string
              plataforma: string
              total: number
              transacoes: number
            }[]
          }
      get_current_org_id: { Args: never; Returns: string }
      get_gestores: {
        Args: never
        Returns: {
          nome: string
        }[]
      }
      get_obe_historico_portagens: {
        Args: { p_nr_equipamento: string }
        Returns: {
          amount: number
          barreira_entrada: string
          barreira_saida: string
          matricula: string
          motorista_nome: string
          operador: string
          transaction_date: string
        }[]
      }
      get_uber_platform_config: {
        Args: { p_integracao_id: string }
        Returns: {
          ativo: boolean
          client_id: string
          client_secret: string
          encryption_key_fingerprint: string
          id: string
          nome: string
          oauth_enabled: boolean
          oauth_state_secret_hint: string
          plataforma: string
          privacy_policy_url: string
          redirect_uri: string
          uber_environment: string
          uber_scopes: string[]
          webhook_secret_hint: string
          webhook_signing_key: string
          webhook_url: string
        }[]
      }
      get_ultima_importacao_por_integracao: {
        Args: { p_ids: string[]; p_plataforma: string }
        Returns: {
          integracao_id: string
          periodo_fim: string
          periodo_inicio: string
          ultima_data: string
        }[]
      }
      has_permission:
        | { Args: { _recurso: string; _user_id: string }; Returns: boolean }
        | {
            Args: { _acao: string; _recurso: string; _user_id: string }
            Returns: boolean
          }
      has_renting_access: { Args: never; Returns: boolean }
      has_renting_contratos_access: { Args: never; Returns: boolean }
      has_renting_faturacao_access: { Args: never; Returns: boolean }
      has_renting_movimentacoes_access: { Args: never; Returns: boolean }
      has_renting_reservas_access: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iban_valido: { Args: { p_iban: string }; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_decada_ousada_admin: { Args: never; Returns: boolean }
      is_storage_admin: { Args: never; Returns: boolean }
      listar_colaboradores: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      manage_cron_job: {
        Args: {
          p_action: string
          p_anon_key?: string
          p_body?: string
          p_cron_expression?: string
          p_function_url?: string
          p_job_name: string
        }
        Returns: Json
      }
      marketing_lista_contagem: {
        Args: { p_lista_id: string }
        Returns: number
      }
      merge_motoristas: {
        Args: { p_principal: string; p_secundaria: string }
        Returns: undefined
      }
      nif_pt_valido: { Args: { p_nif: string }; Returns: boolean }
      norm_nome_match: { Args: { t: string }; Returns: string }
      normalize_owner_name: { Args: { input_name: string }; Returns: string }
      normalize_phone: { Args: { input_phone: string }; Returns: string }
      normalize_plate: { Args: { input_plate: string }; Returns: string }
      notificacao_dispensada: { Args: { p_id: string }; Returns: boolean }
      org_privacidade_por_gestor: { Args: never; Returns: boolean }
      realizar_token_realizacao: {
        Args: { p_token: string; p_km?: number; p_combustivel?: string }
        Returns: undefined
      }
      recalcular_disponibilidade_viatura: {
        Args: { p_viatura_id: string }
        Returns: undefined
      }
      rejeitar_candidatura_motorista: {
        Args: { p_candidatura_id: string; p_motivo?: string }
        Returns: boolean
      }
      reserva_tem_conflito: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_excluir_id?: string
          p_viatura_id: string
        }
        Returns: boolean
      }
      resolver_notificacao: { Args: { p_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      trocar_condutor: {
        Args: {
          p_contrato_id: string
          p_data_troca?: string
          p_motivo?: string
          p_novo_cliente_id: string
        }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      viaturas_com_disponibilidade: {
        Args: { p_data_fim: string; p_data_inicio: string; p_org_id?: string }
        Returns: {
          conflitos: Json
          disponivel: boolean
          viatura_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "gestor_tvde" | "gestor_comercial" | "colaborador"
      cobranca_estado_enum: "pendente" | "emitida" | "paga" | "anulada"
      contrato_estado_financeiro_enum:
        | "pendente"
        | "facturado"
        | "pago"
        | "anulado"
      contrato_estado_operacional_enum:
        | "agendado"
        | "em_curso"
        | "devolvido"
        | "cancelado"
      contrato_origem_enum: "sistema" | "online" | "telefone" | "balcao"
      contrato_regime_enum: "rent_a_car" | "tvde" | "slot"
      contrato_renovacao_opcao_enum:
        | "primeiro_dia_mes"
        | "mesmo_dia_cada_mes"
        | "intervalo_dias"
      genero_enum: "M" | "F" | "Outro"
      reserva_estado_enum:
        | "pendente"
        | "confirmada"
        | "em_curso"
        | "concluida"
        | "cancelada"
        | "expirada"
      tipo_documento_enum:
        | "Cartão Cidadão"
        | "Passaporte"
        | "Autorização de Residência"
        | "Carta de Condução"
        | "Outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor_tvde", "gestor_comercial", "colaborador"],
      cobranca_estado_enum: ["pendente", "emitida", "paga", "anulada"],
      contrato_estado_financeiro_enum: [
        "pendente",
        "facturado",
        "pago",
        "anulado",
      ],
      contrato_estado_operacional_enum: [
        "agendado",
        "em_curso",
        "devolvido",
        "cancelado",
      ],
      contrato_origem_enum: ["sistema", "online", "telefone", "balcao"],
      contrato_regime_enum: ["rent_a_car", "tvde", "slot"],
      contrato_renovacao_opcao_enum: [
        "primeiro_dia_mes",
        "mesmo_dia_cada_mes",
        "intervalo_dias",
      ],
      genero_enum: ["M", "F", "Outro"],
      reserva_estado_enum: [
        "pendente",
        "confirmada",
        "em_curso",
        "concluida",
        "cancelada",
        "expirada",
      ],
      tipo_documento_enum: [
        "Cartão Cidadão",
        "Passaporte",
        "Autorização de Residência",
        "Carta de Condução",
        "Outro",
      ],
    },
  },
} as const
