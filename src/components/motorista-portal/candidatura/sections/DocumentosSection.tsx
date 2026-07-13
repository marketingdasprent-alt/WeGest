import React from 'react';
import { FileCheck, FileText, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';

interface DocumentosSectionProps {
  // Licença TVDE
  licencaTvdeNumero: string;
  licencaTvdeValidade: string;
  licencaTvdeFicheiroUrl: string;
  setLicencaTvdeNumero: (v: string) => void;
  setLicencaTvdeValidade: (v: string) => void;
  setLicencaTvdeFicheiroUrl: (v: string) => void;
  // Documentos Adicionais
  registoCriminalUrl: string;
  comprovativoIbanUrl: string;
  setRegistoCriminalUrl: (v: string) => void;
  setComprovativoIbanUrl: (v: string) => void;
  fieldErrors: Record<string, string>;
  clearFieldError: (field: string) => void;
  onUploadToDb: (column: string, url: string) => void;
}

export const DocumentosSection: React.FC<DocumentosSectionProps> = ({
  licencaTvdeNumero, licencaTvdeValidade, licencaTvdeFicheiroUrl,
  setLicencaTvdeNumero, setLicencaTvdeValidade, setLicencaTvdeFicheiroUrl,
  registoCriminalUrl, comprovativoIbanUrl,
  setRegistoCriminalUrl, setComprovativoIbanUrl,
  fieldErrors, clearFieldError, onUploadToDb,
}) => {
  const renderError = (field: string) =>
    fieldErrors[field] ? (
      <p data-field-error="true" className="flex items-start gap-1 text-xs text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>{fieldErrors[field]}</span>
      </p>
    ) : null;

  return (
    <>
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
            <Label htmlFor="licencaTvdeNumero">Número da Licença TVDE <span className="text-red-500">*</span></Label>
            <Input
              id="licencaTvdeNumero" value={licencaTvdeNumero}
              onChange={(e) => { setLicencaTvdeNumero(e.target.value); clearFieldError('licencaTvdeNumero'); }}
              placeholder="Nº da licença TVDE"
              aria-invalid={!!fieldErrors.licencaTvdeNumero}
              className={fieldErrors.licencaTvdeNumero ? 'border-destructive' : ''}
            />
            {renderError('licencaTvdeNumero')}
          </div>
          <div className="space-y-2">
            <Label htmlFor="licencaTvdeValidade">Data de Validade <span className="text-red-500">*</span></Label>
            <Input
              id="licencaTvdeValidade" type="date" value={licencaTvdeValidade}
              onChange={(e) => { setLicencaTvdeValidade(e.target.value); clearFieldError('licencaTvdeValidade'); }}
              aria-invalid={!!fieldErrors.licencaTvdeValidade}
              className={fieldErrors.licencaTvdeValidade ? 'border-destructive' : ''}
            />
            {renderError('licencaTvdeValidade')}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Upload da Licença TVDE <span className="text-red-500">*</span></Label>
            <DocumentUploader
              folder="licenca-tvde" currentUrl={licencaTvdeFicheiroUrl}
              onUpload={(url) => { setLicencaTvdeFicheiroUrl(url); clearFieldError('licencaTvdeFicheiroUrl'); void onUploadToDb('licenca_tvde_ficheiro_url', url); }}
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
              folder="registo-criminal" currentUrl={registoCriminalUrl}
              onUpload={(url) => { setRegistoCriminalUrl(url); clearFieldError('registoCriminalUrl'); void onUploadToDb('registo_criminal_url', url); }}
              accept="application/pdf,image/jpeg,image/png"
            />
            <p className="text-xs text-muted-foreground">Certificado do registo criminal português (válido por 3 meses)</p>
            {renderError('registoCriminalUrl')}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-foreground">
              <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Comprovativo de IBAN <span className="text-red-500">*</span>
            </Label>
            <DocumentUploader
              folder="comprovativo-iban" currentUrl={comprovativoIbanUrl}
              onUpload={(url) => { setComprovativoIbanUrl(url); clearFieldError('comprovativoIbanUrl'); void onUploadToDb('comprovativo_iban_url', url); }}
              accept="application/pdf,image/jpeg,image/png"
            />
            <p className="text-xs text-muted-foreground">Documento bancário com IBAN para recebimento de pagamentos</p>
            {renderError('comprovativoIbanUrl')}
          </div>
        </CardContent>
      </Card>
    </>
  );
};
