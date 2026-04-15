import type { Db } from "@paperclipai/db";

export type CompanyScaffoldStep = (db: Db, companyId: string) => Promise<void>;

const steps: CompanyScaffoldStep[] = [];

export function registerCompanyScaffoldStep(step: CompanyScaffoldStep): void {
  steps.push(step);
}

export async function scaffoldCompany(db: Db, companyId: string): Promise<void> {
  for (const step of steps) {
    await step(db, companyId);
  }
}

export function listCompanyScaffoldSteps(): readonly CompanyScaffoldStep[] {
  return steps;
}
