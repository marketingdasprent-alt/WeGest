export interface ApifyRunCandidate {
  id: string;
  defaultDatasetId: string;
  startedAt: string;
}

type LoadRunInput = (runId: string) => Promise<unknown>;

function belongsToIntegration(input: unknown, integrationId: string): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;

  const record = input as Record<string, unknown>;
  return record.integracaoId === integrationId ||
    record.integracao_id === integrationId;
}

export async function findLatestRunForIntegration(
  runs: ApifyRunCandidate[],
  integrationId: string,
  loadRunInput: LoadRunInput,
): Promise<ApifyRunCandidate | null> {
  for (const run of runs) {
    try {
      if (belongsToIntegration(await loadRunInput(run.id), integrationId)) {
        return run;
      }
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : "erro desconhecido";
      console.warn(
        `[apify] não foi possível validar a run ${run.id}: ${message}`,
      );
    }
  }

  return null;
}
