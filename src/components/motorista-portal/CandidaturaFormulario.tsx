import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Save,
  Send,
  User,
  FileText,
  Car,
  LogOut,
  Upload,
  X,
  CheckCircle2,
  FileCheck,
  Home,
  Building2,
} from 'lucide-react';
import {
  validarNIF,
  validarCodigoPostal,
  validarNumeroDocumento,
  formatarCodigoPostal,
  validarCartaConducao,
  validarTelefone,
  validarEmail,
} from '@/lib/pt-validators';
import { Candidatura } from '@/pages/motorista/PainelMotorista';
import { DocumentUploader } from './DocumentUploader';
import { PhoneInput } from '@/components/ui/phone-input';

interface CandidaturaFormularioProps {
  candidatura: Candidatura | null;
  onUpdate: () => void;
}

const CATEGORIAS_CARTA = ['A', 'A1', 'A2', 'AM', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'D', 'D1', 'DE'];
const TIPOS_DOCUMENTO = [
  { value: 'cc', label: 'Cartão de Cidadão (CC)' },
  { value: 'bi', label: 'Bilhete de Identidade (BI)' },
  { value: 'ar', label: 'Autorização de Residência (AR)' },
  { value: 'tr', label: 'Título de Residência' },
  { value: 'passaporte', label: 'Passaporte' },
];

export const CandidaturaFormulario: React.FC<CandidaturaFormularioProps> = ({
  candidatura,
  onUpdate,
}) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setFieldError = (field: string, msg: string) =>
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });

  // Mensagem de erro inline e consistente para qualquer campo/documento.
  // O atributo data-field-error permite levar o motorista ao primeiro erro.
  const renderError = (field: string) =>
    fieldErrors[field] ? (
      <p data-field-error="true" className="flex items-start gap-1 text-xs text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>{fieldErrors[field]}</span>
      </p>
    ) : null;

  const metadataNome = typeof user?.user_metadata?.nome === 'string' ? user.user_metadata.nome : '';
  const metadataTelefone =
    typeof user?.user_metadata?.telefone === 'string' ? user.user_metadata.telefone : '';

  // Dados pessoais
  const [nome, setNome] = useState(candidatura?.nome || metadataNome || '');
  const [email, setEmail] = useState(candidatura?.email || user?.email || '');
  const [telefone, setTelefone] = useState(candidatura?.telefone || metadataTelefone || '');
  const [nif, setNif] = useState(candidatura?.nif || '');
  const [morada, setMorada] = useState(candidatura?.morada || '');
  const [codigoPostal, setCodigoPostal] = useState(candidatura?.codigo_postal || '');
  const [cidade, setCidade] = useState(candidatura?.cidade || '');

  // Documento de identificação
  const [documentoTipo, setDocumentoTipo] = useState(candidatura?.documento_tipo || '');
  const [documentoNumero, setDocumentoNumero] = useState(candidatura?.documento_numero || '');
  const [documentoValidade, setDocumentoValidade] = useState(candidatura?.documento_validade || '');
  const [documentoFicheiroUrl, setDocumentoFicheiroUrl] = useState(
    candidatura?.documento_ficheiro_url || ''
  );
  const [documentoIdentificacaoVersoUrl, setDocumentoIdentificacaoVersoUrl] = useState(
    candidatura?.documento_identificacao_verso_url || ''
  );

  // Carta de condução
  const [cartaConducao, setCartaConducao] = useState(candidatura?.carta_conducao || '');
  const [cartaCategorias, setCartaCategorias] = useState<string[]>(
    candidatura?.carta_categorias || []
  );
  const [cartaValidade, setCartaValidade] = useState(candidatura?.carta_validade || '');
  const [cartaFicheiroUrl, setCartaFicheiroUrl] = useState(candidatura?.carta_ficheiro_url || '');
  const [cartaConducaoVersoUrl, setCartaConducaoVersoUrl] = useState(
    candidatura?.carta_conducao_verso_url || ''
  );

  // Licença TVDE
  const [licencaTvdeNumero, setLicencaTvdeNumero] = useState(
    candidatura?.licenca_tvde_numero || ''
  );
  const [licencaTvdeValidade, setLicencaTvdeValidade] = useState(
    candidatura?.licenca_tvde_validade || ''
  );
  const [licencaTvdeFicheiroUrl, setLicencaTvdeFicheiroUrl] = useState(
    candidatura?.licenca_tvde_ficheiro_url || ''
  );

  // Documentos adicionais
  const [registoCriminalUrl, setRegistoCriminalUrl] = useState(
    candidatura?.registo_criminal_url || ''
  );
  const [comprovativoMoradaUrl, setComprovativoMoradaUrl] = useState(
    candidatura?.comprovativo_morada_url || ''
  );
  const [comprovativoIbanUrl, setComprovativoIbanUrl] = useState(
    candidatura?.comprovativo_iban_url || ''
  );

  // Gravação automática local — protege o motorista de perder tudo se
  // minimizar, atualizar, fechar a página por engano ou a gravação na BD falhar.
  const draftKey = user ? `candidatura_rascunho_${user.id}` : null;
  const hydratedRef = useRef(false);

  // Conjunto de campos do formulário (sem metadados), usado para gravar/comparar o rascunho local.
  const currentDraftFields = () => ({
    nome,
    email,
    telefone,
    nif,
    morada,
    codigo_postal: codigoPostal,
    cidade,
    documento_tipo: documentoTipo,
    documento_numero: documentoNumero,
    documento_validade: documentoValidade,
    documento_ficheiro_url: documentoFicheiroUrl,
    documento_identificacao_verso_url: documentoIdentificacaoVersoUrl,
    carta_conducao: cartaConducao,
    carta_categorias: cartaCategorias,
    carta_validade: cartaValidade,
    carta_ficheiro_url: cartaFicheiroUrl,
    carta_conducao_verso_url: cartaConducaoVersoUrl,
    licenca_tvde_numero: licencaTvdeNumero,
    licenca_tvde_validade: licencaTvdeValidade,
    licenca_tvde_ficheiro_url: licencaTvdeFicheiroUrl,
    registo_criminal_url: registoCriminalUrl,
    comprovativo_morada_url: comprovativoMoradaUrl,
    comprovativo_iban_url: comprovativoIbanUrl,
  });

  useEffect(() => {
    setNome(candidatura?.nome || metadataNome || '');
    setEmail(candidatura?.email || user?.email || '');
    setTelefone(candidatura?.telefone || metadataTelefone || '');
    setNif(candidatura?.nif || '');
    setMorada(candidatura?.morada || '');
    setCodigoPostal(candidatura?.codigo_postal || '');
    setCidade(candidatura?.cidade || '');
    setDocumentoTipo(candidatura?.documento_tipo || '');
    setDocumentoNumero(candidatura?.documento_numero || '');
    setDocumentoValidade(candidatura?.documento_validade || '');
    setDocumentoFicheiroUrl(
      candidatura?.documento_frente_url || candidatura?.documento_ficheiro_url || ''
    );
    setDocumentoIdentificacaoVersoUrl(candidatura?.documento_identificacao_verso_url || '');
    setCartaConducao(candidatura?.carta_conducao || '');
    setCartaCategorias(candidatura?.carta_categorias || []);
    setCartaValidade(candidatura?.carta_validade || '');
    setCartaFicheiroUrl(candidatura?.carta_frente_url || candidatura?.carta_ficheiro_url || '');
    setCartaConducaoVersoUrl(candidatura?.carta_conducao_verso_url || '');
    setLicencaTvdeNumero(candidatura?.licenca_tvde_numero || '');
    setLicencaTvdeValidade(candidatura?.licenca_tvde_validade || '');
    setLicencaTvdeFicheiroUrl(candidatura?.licenca_tvde_ficheiro_url || '');
    setRegistoCriminalUrl(candidatura?.registo_criminal_url || '');
    setComprovativoMoradaUrl(candidatura?.comprovativo_morada_url || '');
    setComprovativoIbanUrl(candidatura?.comprovativo_iban_url || '');
  }, [candidatura, metadataNome, metadataTelefone, user?.email]);

  // Restaurar rascunho guardado localmente (corre uma vez, após a sincronização com a BD).
  // Só sobrepõe se o rascunho local for mais recente do que o que está guardado na BD.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (!draftKey) return;

    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;

      const draft = JSON.parse(raw);
      const draftTime = draft?._savedAt ? Date.parse(draft._savedAt) : 0;
      const dbTime = candidatura?.updated_at ? Date.parse(candidatura.updated_at) : 0;
      if (draftTime <= dbTime) return;

      // Neste ponto os campos ainda refletem o que veio da BD. Se o rascunho local
      // for idêntico, não há nada para recuperar (evita o aviso "recuperado" falso).
      const { _savedAt: _ignored, ...draftFields } = draft;
      if (JSON.stringify(draftFields) === JSON.stringify(currentDraftFields())) return;

      if (typeof draft.nome === 'string') setNome(draft.nome);
      if (typeof draft.email === 'string') setEmail(draft.email);
      if (typeof draft.telefone === 'string') setTelefone(draft.telefone);
      if (typeof draft.nif === 'string') setNif(draft.nif);
      if (typeof draft.morada === 'string') setMorada(draft.morada);
      if (typeof draft.codigo_postal === 'string') setCodigoPostal(draft.codigo_postal);
      if (typeof draft.cidade === 'string') setCidade(draft.cidade);
      if (typeof draft.documento_tipo === 'string') setDocumentoTipo(draft.documento_tipo);
      if (typeof draft.documento_numero === 'string') setDocumentoNumero(draft.documento_numero);
      if (typeof draft.documento_validade === 'string')
        setDocumentoValidade(draft.documento_validade);
      if (typeof draft.documento_ficheiro_url === 'string')
        setDocumentoFicheiroUrl(draft.documento_ficheiro_url);
      if (typeof draft.documento_identificacao_verso_url === 'string')
        setDocumentoIdentificacaoVersoUrl(draft.documento_identificacao_verso_url);
      if (typeof draft.carta_conducao === 'string') setCartaConducao(draft.carta_conducao);
      if (Array.isArray(draft.carta_categorias)) setCartaCategorias(draft.carta_categorias);
      if (typeof draft.carta_validade === 'string') setCartaValidade(draft.carta_validade);
      if (typeof draft.carta_ficheiro_url === 'string')
        setCartaFicheiroUrl(draft.carta_ficheiro_url);
      if (typeof draft.carta_conducao_verso_url === 'string')
        setCartaConducaoVersoUrl(draft.carta_conducao_verso_url);
      if (typeof draft.licenca_tvde_numero === 'string')
        setLicencaTvdeNumero(draft.licenca_tvde_numero);
      if (typeof draft.licenca_tvde_validade === 'string')
        setLicencaTvdeValidade(draft.licenca_tvde_validade);
      if (typeof draft.licenca_tvde_ficheiro_url === 'string')
        setLicencaTvdeFicheiroUrl(draft.licenca_tvde_ficheiro_url);
      if (typeof draft.registo_criminal_url === 'string')
        setRegistoCriminalUrl(draft.registo_criminal_url);
      if (typeof draft.comprovativo_morada_url === 'string')
        setComprovativoMoradaUrl(draft.comprovativo_morada_url);
      if (typeof draft.comprovativo_iban_url === 'string')
        setComprovativoIbanUrl(draft.comprovativo_iban_url);

      toast({
        title: 'Rascunho recuperado',
        description: 'Recuperámos os dados que tinha preenchido neste dispositivo.',
      });
    } catch (e) {
      console.error('Erro ao restaurar rascunho local:', e);
    }
    // currentDraftFields lê o estado atual de propósito; esta effect corre só uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, candidatura, toast]);

  // Gravar automaticamente no dispositivo a cada alteração (após o restauro inicial).
  useEffect(() => {
    if (!hydratedRef.current || !draftKey) return;

    const fields = currentDraftFields();
    const serialized = JSON.stringify(fields);

    // Não reescreve (nem atualiza _savedAt) se o conteúdo não mudou.
    const existingRaw = localStorage.getItem(draftKey);
    if (existingRaw) {
      try {
        const { _savedAt: _ignored, ...existingFields } = JSON.parse(existingRaw);
        if (JSON.stringify(existingFields) === serialized) return;
      } catch {
        /* JSON inválido — segue e regrava */
      }
    }

    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ ...fields, _savedAt: new Date().toISOString() })
      );
    } catch (e) {
      console.error('Erro ao guardar rascunho local:', e);
    }
    // currentDraftFields deriva dos campos abaixo, já todos listados nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftKey,
    nome,
    email,
    telefone,
    nif,
    morada,
    codigoPostal,
    cidade,
    documentoTipo,
    documentoNumero,
    documentoValidade,
    documentoFicheiroUrl,
    documentoIdentificacaoVersoUrl,
    cartaConducao,
    cartaCategorias,
    cartaValidade,
    cartaFicheiroUrl,
    cartaConducaoVersoUrl,
    licencaTvdeNumero,
    licencaTvdeValidade,
    licencaTvdeFicheiroUrl,
    registoCriminalUrl,
    comprovativoMoradaUrl,
    comprovativoIbanUrl,
  ]);

  // Persiste imediatamente o URL de um ficheiro na BD após upload bem-sucedido.
  // Só faz UPDATE se já existir candidatura — candidaturas novas ficam protegidas
  // pelo rascunho local até ao primeiro "Guardar".
  const saveUploadUrlToDb = async (column: string, url: string) => {
    if (!user || !candidatura) return;
    try {
      await supabase
        .from('motorista_candidaturas')
        .update({ [column]: url || null } as TablesUpdate<'motorista_candidaturas'>)
        .eq('id', candidatura.id);
      onUpdate();
    } catch (err) {
      console.error('Erro ao persistir URL do ficheiro na BD:', err);
    }
  };

  const clearLocalDraft = () => {
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch (e) {
        console.error('Erro ao limpar rascunho local:', e);
      }
    }
  };

  const handleCategoriaToggle = (categoria: string) => {
    clearFieldError('cartaCategorias');
    setCartaCategorias((prev) =>
      prev.includes(categoria) ? prev.filter((c) => c !== categoria) : [...prev, categoria]
    );
  };

  const buildCandidaturaData = () => ({
    user_id: user!.id,
    nome,
    email,
    telefone: telefone || null,
    nif: nif || null,
    morada: morada || null,
    codigo_postal: codigoPostal || null,
    cidade: cidade || null,
    documento_tipo: documentoTipo || null,
    documento_numero: documentoNumero || null,
    documento_validade: documentoValidade || null,
    documento_ficheiro_url: documentoFicheiroUrl || null,
    documento_identificacao_verso_url: documentoIdentificacaoVersoUrl || null,
    carta_conducao: cartaConducao || null,
    carta_categorias: cartaCategorias.length > 0 ? cartaCategorias : null,
    carta_validade: cartaValidade || null,
    carta_ficheiro_url: cartaFicheiroUrl || null,
    carta_conducao_verso_url: cartaConducaoVersoUrl || null,
    licenca_tvde_numero: licencaTvdeNumero || null,
    licenca_tvde_validade: licencaTvdeValidade || null,
    licenca_tvde_ficheiro_url: licencaTvdeFicheiroUrl || null,
    registo_criminal_url: registoCriminalUrl || null,
    comprovativo_morada_url: comprovativoMoradaUrl || null,
    comprovativo_iban_url: comprovativoIbanUrl || null,
  });

  // Traduz qualquer erro do sistema para uma mensagem clara para o motorista.
  const traduzirErro = (msg?: string, fallback = 'Ocorreu um erro. Tente novamente.') => {
    const m = (msg || '').toLowerCase();
    if (m === 'sem_permissao_guardar')
      return 'Não foi possível guardar — a sua sessão não tem permissões adequadas. Feche a sessão, entre novamente e tente outra vez.';
    if (
      m.includes('row-level security') ||
      m.includes('permission') ||
      m.includes('not authorized') ||
      m.includes('rls')
    )
      return 'Não tem permissão para esta ação. Inicie sessão novamente e tente outra vez.';
    if (m.includes('could not find') && m.includes('column'))
      return 'Erro de base de dados: uma coluna está em falta. O administrador precisa de aplicar a migration mais recente no Supabase.';
    if (m.includes('duplicate') || m.includes('already exists') || m.includes('unique'))
      return 'Já existe um registo com estes dados.';
    if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
      return 'Falha de ligação. Verifique a sua internet e tente novamente.';
    if (m.includes('jwt') || m.includes('expired') || m.includes('session'))
      return 'A sua sessão expirou. Inicie sessão novamente.';
    if (m.includes('too large') || m.includes('payload'))
      return 'Os ficheiros são demasiado grandes. Reduza o tamanho e tente novamente.';
    return msg || fallback;
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const data = buildCandidaturaData() as TablesInsert<'motorista_candidaturas'>;

      if (candidatura) {
        const { data: rows, error } = await supabase
          .from('motorista_candidaturas')
          .update(data)
          .eq('id', candidatura.id)
          .select('id');

        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('sem_permissao_guardar');
      } else {
        const { error } = await supabase
          .from('motorista_candidaturas')
          .insert({ ...data, status: 'rascunho' });

        if (error) throw error;
      }

      toast({
        title: 'Guardado',
        description: 'Os seus dados foram guardados com sucesso.',
      });

      onUpdate();
    } catch (error: any) {
      console.error('Erro ao guardar:', error);
      toast({
        title: 'Erro',
        description: traduzirErro(error.message, 'Ocorreu um erro ao guardar.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Devolve a lista de problemas (vazia = tudo ok). Cada mensagem diz a secção/documento
  // e o que falta/como corrigir, e fica também marcada a vermelho junto ao campo.
  const validateForm = (): string[] => {
    const errors: Record<string, string> = {};
    const UPLOAD_HINT = 'carregue o ficheiro (PDF, JPG ou PNG, até 10MB).';

    // Dados Pessoais
    if (!nome.trim()) errors.nome = 'Dados Pessoais — Nome: preencha o seu nome completo.';
    if (!email.trim()) {
      errors.email = 'Dados Pessoais — Email: indique o seu email.';
    } else {
      const r = validarEmail(email);
      if (!r.valid) errors.email = `Dados Pessoais — Email: ${r.message}`;
    }
    if (!telefone.trim()) {
      errors.telefone = 'Dados Pessoais — Telefone: indique o seu número de telefone.';
    } else {
      const r = validarTelefone(telefone);
      if (!r.valid) errors.telefone = `Dados Pessoais — Telefone: ${r.message}`;
    }
    if (!nif.trim()) {
      errors.nif = 'Dados Pessoais — NIF: indique o seu NIF (9 dígitos).';
    } else {
      const r = validarNIF(nif);
      if (!r.valid) errors.nif = `Dados Pessoais — NIF: ${r.message}`;
    }
    if (!morada.trim()) errors.morada = 'Dados Pessoais — Morada: indique a sua morada.';
    if (!cidade.trim()) errors.cidade = 'Dados Pessoais — Cidade: indique a sua cidade.';
    if (!codigoPostal.trim()) {
      errors.codigoPostal = 'Dados Pessoais — Código Postal: indique o código postal (0000-000).';
    } else {
      const r = validarCodigoPostal(codigoPostal);
      if (!r.valid) errors.codigoPostal = `Dados Pessoais — Código Postal: ${r.message}`;
    }
    if (!comprovativoMoradaUrl)
      errors.comprovativoMoradaUrl = `Dados Pessoais — Comprovativo de Morada: ${UPLOAD_HINT}`;

    // Documento de Identificação
    if (!documentoTipo)
      errors.documentoTipo = 'Documento de Identificação — Tipo: selecione o tipo de documento.';
    if (!documentoNumero.trim()) {
      errors.documentoNumero =
        'Documento de Identificação — Número: indique o número do documento.';
    } else if (documentoTipo) {
      const r = validarNumeroDocumento(documentoTipo, documentoNumero);
      if (!r.valid) errors.documentoNumero = `Documento de Identificação — Número: ${r.message}`;
    }
    if (!documentoValidade)
      errors.documentoValidade =
        'Documento de Identificação — Validade: indique a data de validade.';
    if (!documentoFicheiroUrl)
      errors.documentoFicheiroUrl = `Documento de Identificação — Frente: ${UPLOAD_HINT}`;
    if (!documentoIdentificacaoVersoUrl)
      errors.documentoIdentificacaoVersoUrl = `Documento de Identificação — Verso: ${UPLOAD_HINT}`;

    // Carta de Condução
    if (!cartaConducao.trim()) {
      errors.cartaConducao = 'Carta de Condução — Número: indique o número da carta.';
    } else {
      const r = validarCartaConducao(cartaConducao);
      if (!r.valid) errors.cartaConducao = `Carta de Condução — Número: ${r.message}`;
    }
    if (cartaCategorias.length === 0)
      errors.cartaCategorias =
        'Carta de Condução — Categorias: selecione pelo menos uma categoria (ex.: B).';
    if (!cartaValidade)
      errors.cartaValidade = 'Carta de Condução — Validade: indique a data de validade.';
    if (!cartaFicheiroUrl) errors.cartaFicheiroUrl = `Carta de Condução — Frente: ${UPLOAD_HINT}`;
    if (!cartaConducaoVersoUrl)
      errors.cartaConducaoVersoUrl = `Carta de Condução — Verso: ${UPLOAD_HINT}`;

    // Licença TVDE
    if (!licencaTvdeNumero.trim())
      errors.licencaTvdeNumero = 'Licença TVDE — Número: indique o número da licença.';
    if (!licencaTvdeValidade)
      errors.licencaTvdeValidade = 'Licença TVDE — Validade: indique a data de validade.';
    if (!licencaTvdeFicheiroUrl)
      errors.licencaTvdeFicheiroUrl = `Licença TVDE — Ficheiro: ${UPLOAD_HINT}`;

    // Documentos Adicionais
    if (!registoCriminalUrl) errors.registoCriminalUrl = `Registo Criminal: ${UPLOAD_HINT}`;
    if (!comprovativoIbanUrl) errors.comprovativoIbanUrl = `Comprovativo de IBAN: ${UPLOAD_HINT}`;

    setFieldErrors(errors);
    return Object.values(errors);
  };

  const scrollToFirstError = () => {
    setTimeout(() => {
      const el = document.querySelector('[data-field-error="true"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const handleSubmit = async () => {
    const problemas = validateForm();
    if (problemas.length > 0) {
      const visiveis = problemas.slice(0, 6);
      toast({
        title:
          problemas.length === 1
            ? '1 ponto por corrigir antes de submeter'
            : `${problemas.length} pontos por corrigir antes de submeter`,
        description: (
          <div className="mt-1 space-y-1">
            <p>Corrija o seguinte (também assinalado a vermelho no formulário):</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {visiveis.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {problemas.length > visiveis.length && (
                <li>e mais {problemas.length - visiveis.length}…</li>
              )}
            </ul>
          </div>
        ),
        variant: 'destructive',
      });
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        ...buildCandidaturaData(),
        status: 'submetido',
        data_submissao: new Date().toISOString(),
      } as TablesInsert<'motorista_candidaturas'>;

      if (candidatura) {
        const { data: rows, error } = await supabase
          .from('motorista_candidaturas')
          .update(data)
          .eq('id', candidatura.id)
          .select('id');

        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('sem_permissao_guardar');
      } else {
        const { error } = await supabase.from('motorista_candidaturas').insert(data);

        if (error) throw error;
      }

      clearLocalDraft();

      toast({
        title: 'Candidatura Submetida!',
        description: 'Os seus documentos serão analisados pela nossa equipa.',
      });

      onUpdate();
    } catch (error: any) {
      console.error('Erro ao submeter:', error);
      toast({
        title: 'Erro',
        description: traduzirErro(error.message, 'Ocorreu um erro ao submeter a candidatura.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const completionPercentage = () => {
    const fields = [
      nome,
      email,
      telefone,
      nif,
      morada,
      cidade,
      documentoTipo,
      documentoNumero,
      documentoValidade,
      documentoFicheiroUrl,
      cartaConducao,
      cartaCategorias.length > 0,
      cartaValidade,
      cartaFicheiroUrl,
      licencaTvdeNumero,
      licencaTvdeValidade,
      licencaTvdeFicheiroUrl,
      registoCriminalUrl,
      comprovativoMoradaUrl,
      comprovativoIbanUrl,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card/50 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Car className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">WeGest</h1>
              <p className="text-sm text-muted-foreground">Candidatura de Motorista</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{nome || user?.email}</p>
              <p className="text-xs text-muted-foreground">{completionPercentage()}% completo</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${completionPercentage()}%` }}
          />
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 pb-8 space-y-6">
        <p className="text-xs text-muted-foreground">
          <span className="text-red-500 font-semibold">*</span> Campos obrigatórios
        </p>
        {/* Dados Pessoais */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Dados Pessoais</CardTitle>
            </div>
            <CardDescription>Informações básicas para a sua candidatura</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">
                Nome Completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  clearFieldError('nome');
                }}
                placeholder="O seu nome completo"
                aria-invalid={!!fieldErrors.nome}
                className={fieldErrors.nome ? 'border-destructive' : ''}
              />
              {renderError('nome')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError('email');
                }}
                onBlur={() => {
                  if (email) {
                    const r = validarEmail(email);
                    if (!r.valid) setFieldError('email', r.message!);
                  }
                }}
                placeholder="seu@email.com"
                className={fieldErrors.email ? 'border-destructive' : ''}
              />
              {renderError('email')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">
                Telefone <span className="text-red-500">*</span>
              </Label>
              <PhoneInput
                id="telefone"
                value={telefone}
                onChange={(v) => {
                  setTelefone(v);
                  clearFieldError('telefone');
                }}
                defaultCountry="PT"
              />
              {renderError('telefone')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nif">
                NIF <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nif"
                value={nif}
                onChange={(e) => setNif(e.target.value.replace(/\D/g, '').slice(0, 9))}
                onBlur={() => {
                  if (nif.trim()) {
                    const r = validarNIF(nif);
                    if (!r.valid) setFieldError('nif', r.message!);
                    else clearFieldError('nif');
                  }
                }}
                placeholder="123456789"
                maxLength={9}
                inputMode="numeric"
                aria-invalid={!!fieldErrors.nif}
                className={fieldErrors.nif ? 'border-destructive' : ''}
              />
              {renderError('nif')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="morada">
                Morada <span className="text-red-500">*</span>
              </Label>
              <Input
                id="morada"
                value={morada}
                onChange={(e) => {
                  setMorada(e.target.value);
                  clearFieldError('morada');
                }}
                placeholder="Rua, número, andar..."
                aria-invalid={!!fieldErrors.morada}
                className={fieldErrors.morada ? 'border-destructive' : ''}
              />
              {renderError('morada')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cidade">
                Cidade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cidade"
                value={cidade}
                onChange={(e) => {
                  setCidade(e.target.value);
                  clearFieldError('cidade');
                }}
                placeholder="Lisboa"
                aria-invalid={!!fieldErrors.cidade}
                className={fieldErrors.cidade ? 'border-destructive' : ''}
              />
              {renderError('cidade')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigoPostal">
                Código Postal <span className="text-red-500">*</span>
              </Label>
              <Input
                id="codigoPostal"
                value={codigoPostal}
                onChange={(e) => {
                  const formatted = formatarCodigoPostal(e.target.value);
                  setCodigoPostal(formatted);
                  clearFieldError('codigoPostal');
                }}
                onBlur={() => {
                  if (codigoPostal.trim()) {
                    const r = validarCodigoPostal(codigoPostal);
                    if (!r.valid) setFieldError('codigoPostal', r.message!);
                    else clearFieldError('codigoPostal');
                  }
                }}
                placeholder="0000-000"
                maxLength={8}
                inputMode="numeric"
                aria-invalid={!!fieldErrors.codigoPostal}
                className={fieldErrors.codigoPostal ? 'border-destructive' : ''}
              />
              {renderError('codigoPostal')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-2 text-foreground">
                <Home className="h-4 w-4 text-muted-foreground" />
                Comprovativo de Morada <span className="text-red-500">*</span>
              </Label>
              <DocumentUploader
                folder="comprovativo-morada"
                currentUrl={comprovativoMoradaUrl}
                onUpload={(url) => {
                  setComprovativoMoradaUrl(url);
                  clearFieldError('comprovativoMoradaUrl');
                  void saveUploadUrlToDb('comprovativo_morada_url', url);
                }}
                accept="application/pdf,image/jpeg,image/png"
              />
              <p className="text-xs text-muted-foreground">
                Fatura de serviços, contrato de arrendamento ou declaração da junta de freguesia
              </p>
              {renderError('comprovativoMoradaUrl')}
            </div>
          </CardContent>
        </Card>

        {/* Documento de Identificação */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="bg-blue-50/50 dark:bg-blue-900/20 pb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-lg">Documento de Identificação</CardTitle>
            </div>
            <CardDescription>CC, Título de Residência ou outro documento válido</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Tipo de Documento <span className="text-red-500">*</span>
              </Label>
              <Select
                value={documentoTipo}
                onValueChange={(v) => {
                  setDocumentoTipo(v);
                  clearFieldError('documentoTipo');
                  clearFieldError('documentoNumero');
                }}
              >
                <SelectTrigger className={fieldErrors.documentoTipo ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((tipo) => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderError('documentoTipo')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentoNumero">
                Número do Documento <span className="text-red-500">*</span>
              </Label>
              <Input
                id="documentoNumero"
                value={documentoNumero}
                onChange={(e) => {
                  setDocumentoNumero(e.target.value.toUpperCase());
                  clearFieldError('documentoNumero');
                }}
                onBlur={() => {
                  if (documentoNumero.trim() && documentoTipo) {
                    const r = validarNumeroDocumento(documentoTipo, documentoNumero);
                    if (!r.valid) setFieldError('documentoNumero', r.message!);
                    else clearFieldError('documentoNumero');
                  }
                }}
                placeholder="Nº do documento"
                aria-invalid={!!fieldErrors.documentoNumero}
                className={fieldErrors.documentoNumero ? 'border-destructive' : ''}
              />
              {renderError('documentoNumero')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentoValidade">
                Data de Validade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="documentoValidade"
                type="date"
                value={documentoValidade}
                onChange={(e) => {
                  setDocumentoValidade(e.target.value);
                  clearFieldError('documentoValidade');
                }}
                aria-invalid={!!fieldErrors.documentoValidade}
                className={fieldErrors.documentoValidade ? 'border-destructive' : ''}
              />
              {renderError('documentoValidade')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                Documento de Identificação <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block mb-1">Frente</span>
                  <DocumentUploader
                    folder="documento-identificacao"
                    currentUrl={documentoFicheiroUrl}
                    onUpload={(url) => {
                      setDocumentoFicheiroUrl(url);
                      clearFieldError('documentoFicheiroUrl');
                      void saveUploadUrlToDb('documento_ficheiro_url', url);
                    }}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                  {renderError('documentoFicheiroUrl')}
                </div>
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block mb-1">Verso</span>
                  <DocumentUploader
                    folder="documento-identificacao"
                    currentUrl={documentoIdentificacaoVersoUrl}
                    onUpload={(url) => {
                      setDocumentoIdentificacaoVersoUrl(url);
                      clearFieldError('documentoIdentificacaoVersoUrl');
                      void saveUploadUrlToDb('documento_identificacao_verso_url', url);
                    }}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                  {renderError('documentoIdentificacaoVersoUrl')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carta de Condução */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="bg-primary/10 pb-4">
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Carta de Condução</CardTitle>
            </div>
            <CardDescription>Dados da sua carta de condução válida</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cartaConducao">
                Número da Carta <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cartaConducao"
                value={cartaConducao}
                onChange={(e) => {
                  setCartaConducao(e.target.value.toUpperCase());
                  clearFieldError('cartaConducao');
                }}
                onBlur={() => {
                  if (cartaConducao) {
                    const r = validarCartaConducao(cartaConducao);
                    if (!r.valid) setFieldError('cartaConducao', r.message!);
                  }
                }}
                placeholder="Nº da carta de condução"
                className={fieldErrors.cartaConducao ? 'border-destructive' : ''}
              />
              {renderError('cartaConducao')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cartaValidade">
                Data de Validade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cartaValidade"
                type="date"
                value={cartaValidade}
                onChange={(e) => {
                  setCartaValidade(e.target.value);
                  clearFieldError('cartaValidade');
                }}
                aria-invalid={!!fieldErrors.cartaValidade}
                className={fieldErrors.cartaValidade ? 'border-destructive' : ''}
              />
              {renderError('cartaValidade')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                Categorias <span className="text-red-500">*</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS_CARTA.map((cat) => (
                  <div key={cat} className="flex items-center space-x-2">
                    <Checkbox
                      id={`cat-${cat}`}
                      checked={cartaCategorias.includes(cat)}
                      onCheckedChange={() => handleCategoriaToggle(cat)}
                    />
                    <label
                      htmlFor={`cat-${cat}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground"
                    >
                      {cat}
                    </label>
                  </div>
                ))}
              </div>
              {renderError('cartaCategorias')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                Upload da Carta de Condução <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block mb-1">Frente</span>
                  <DocumentUploader
                    folder="carta-conducao"
                    currentUrl={cartaFicheiroUrl}
                    onUpload={(url) => {
                      setCartaFicheiroUrl(url);
                      clearFieldError('cartaFicheiroUrl');
                      void saveUploadUrlToDb('carta_ficheiro_url', url);
                    }}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                  {renderError('cartaFicheiroUrl')}
                </div>
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground block mb-1">Verso</span>
                  <DocumentUploader
                    folder="carta-conducao"
                    currentUrl={cartaConducaoVersoUrl}
                    onUpload={(url) => {
                      setCartaConducaoVersoUrl(url);
                      clearFieldError('cartaConducaoVersoUrl');
                      void saveUploadUrlToDb('carta_conducao_verso_url', url);
                    }}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                  {renderError('cartaConducaoVersoUrl')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Licença TVDE */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-900/20 pb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-lg">Licença TVDE</CardTitle>
            </div>
            <CardDescription>Certificado de formação TVDE obrigatório</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="licencaTvdeNumero">
                Número da Licença TVDE <span className="text-red-500">*</span>
              </Label>
              <Input
                id="licencaTvdeNumero"
                value={licencaTvdeNumero}
                onChange={(e) => {
                  setLicencaTvdeNumero(e.target.value);
                  clearFieldError('licencaTvdeNumero');
                }}
                placeholder="Nº da licença TVDE"
                aria-invalid={!!fieldErrors.licencaTvdeNumero}
                className={fieldErrors.licencaTvdeNumero ? 'border-destructive' : ''}
              />
              {renderError('licencaTvdeNumero')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="licencaTvdeValidade">
                Data de Validade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="licencaTvdeValidade"
                type="date"
                value={licencaTvdeValidade}
                onChange={(e) => {
                  setLicencaTvdeValidade(e.target.value);
                  clearFieldError('licencaTvdeValidade');
                }}
                aria-invalid={!!fieldErrors.licencaTvdeValidade}
                className={fieldErrors.licencaTvdeValidade ? 'border-destructive' : ''}
              />
              {renderError('licencaTvdeValidade')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                Upload da Licença TVDE <span className="text-red-500">*</span>
              </Label>
              <DocumentUploader
                folder="licenca-tvde"
                currentUrl={licencaTvdeFicheiroUrl}
                onUpload={(url) => {
                  setLicencaTvdeFicheiroUrl(url);
                  clearFieldError('licencaTvdeFicheiroUrl');
                  void saveUploadUrlToDb('licenca_tvde_ficheiro_url', url);
                }}
                accept="application/pdf,image/jpeg,image/png"
              />
              {renderError('licencaTvdeFicheiroUrl')}
            </div>
          </CardContent>
        </Card>

        {/* Documentos Adicionais */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="bg-amber-50/50 dark:bg-amber-900/20 pb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-lg">Documentos Adicionais</CardTitle>
            </div>
            <CardDescription>Documentos obrigatórios para completar a candidatura</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Registo Criminal <span className="text-red-500">*</span>
              </Label>
              <DocumentUploader
                folder="registo-criminal"
                currentUrl={registoCriminalUrl}
                onUpload={(url) => {
                  setRegistoCriminalUrl(url);
                  clearFieldError('registoCriminalUrl');
                  void saveUploadUrlToDb('registo_criminal_url', url);
                }}
                accept="application/pdf,image/jpeg,image/png"
              />
              <p className="text-xs text-muted-foreground">
                Certificado do registo criminal português (válido por 3 meses)
              </p>
              {renderError('registoCriminalUrl')}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-foreground">
                <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Comprovativo de IBAN <span className="text-red-500">*</span>
              </Label>
              <DocumentUploader
                folder="comprovativo-iban"
                currentUrl={comprovativoIbanUrl}
                onUpload={(url) => {
                  setComprovativoIbanUrl(url);
                  clearFieldError('comprovativoIbanUrl');
                  void saveUploadUrlToDb('comprovativo_iban_url', url);
                }}
                accept="application/pdf,image/jpeg,image/png"
              />
              <p className="text-xs text-muted-foreground">
                Documento bancário com IBAN para recebimento de pagamentos
              </p>
              {renderError('comprovativoIbanUrl')}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          As suas alterações ficam guardadas automaticamente neste dispositivo, mesmo que feche a
          página.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving || submitting}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Guardar Rascunho
              </>
            )}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A submeter...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submeter Candidatura
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
