import React from 'react';
import { User, Home } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { PhoneInput } from '@/components/ui/phone-input';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import {
  validarEmail,
  validarNIF,
  validarCodigoPostal,
  formatarCodigoPostal,
} from '@/lib/pt-validators';
import type { CandidaturaCampos } from '@/utils/candidatura';

interface DadosPessoaisSectionProps {
  campos: Pick<
    CandidaturaCampos,
    | 'nome'
    | 'email'
    | 'telefone'
    | 'nif'
    | 'morada'
    | 'cidade'
    | 'codigoPostal'
    | 'comprovativoMoradaUrl'
  >;
  setNome: (v: string) => void;
  setEmail: (v: string) => void;
  setTelefone: (v: string) => void;
  setNif: (v: string) => void;
  setMorada: (v: string) => void;
  setCidade: (v: string) => void;
  setCodigoPostal: (v: string) => void;
  setComprovativoMoradaUrl: (v: string) => void;
  fieldErrors: Record<string, string>;
  setFieldError: (field: string, msg: string) => void;
  clearFieldError: (field: string) => void;
  candidaturaId?: string;
  onUploadToDb: (column: string, url: string) => void;
}

export const DadosPessoaisSection: React.FC<DadosPessoaisSectionProps> = ({
  campos,
  setNome,
  setEmail,
  setTelefone,
  setNif,
  setMorada,
  setCidade,
  setCodigoPostal,
  setComprovativoMoradaUrl,
  fieldErrors,
  setFieldError,
  clearFieldError,
  onUploadToDb,
}) => {
  const renderError = (field: string) =>
    fieldErrors[field] ? (
      <p data-field-error="true" className="flex items-start gap-1 text-xs text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>{fieldErrors[field]}</span>
      </p>
    ) : null;

  return (
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
            Nome Completo <span className="text-destructive">*</span>
          </Label>
          <Input
            id="nome"
            value={campos.nome}
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
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={campos.email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError('email');
            }}
            onBlur={() => {
              if (campos.email) {
                const r = validarEmail(campos.email);
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
            Telefone <span className="text-destructive">*</span>
          </Label>
          <PhoneInput
            id="telefone"
            value={campos.telefone}
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
            NIF <span className="text-destructive">*</span>
          </Label>
          <Input
            id="nif"
            value={campos.nif}
            onChange={(e) => setNif(e.target.value.replace(/\D/g, '').slice(0, 9))}
            onBlur={() => {
              if (campos.nif.trim()) {
                const r = validarNIF(campos.nif);
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
            Morada <span className="text-destructive">*</span>
          </Label>
          <Input
            id="morada"
            value={campos.morada}
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
            Cidade <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cidade"
            value={campos.cidade}
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
            Código Postal <span className="text-destructive">*</span>
          </Label>
          <Input
            id="codigoPostal"
            value={campos.codigoPostal}
            onChange={(e) => {
              setCodigoPostal(formatarCodigoPostal(e.target.value));
              clearFieldError('codigoPostal');
            }}
            onBlur={() => {
              if (campos.codigoPostal.trim()) {
                const r = validarCodigoPostal(campos.codigoPostal);
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
            Comprovativo de Morada <span className="text-destructive">*</span>
          </Label>
          <DocumentUploader
            folder="comprovativo-morada"
            currentUrl={campos.comprovativoMoradaUrl}
            onUpload={(url) => {
              setComprovativoMoradaUrl(url);
              clearFieldError('comprovativoMoradaUrl');
              void onUploadToDb('comprovativo_morada_url', url);
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
  );
};
