import { factories } from '@strapi/strapi';
import { evaluateProgram, rankMeetsGroup, type ProgramRecord, type StudentProfile, type MatchResult } from '../services/eligibility';
import { ReadinessGateClosedError, InsufficientCreditsError } from '../../student/services/wallet';

async function resolveOwnStudent(ctx: { state: { user?: { id: number } } }) {
  if (!ctx.state.user) return null;
  return strapi.db.query('api::student.student').findOne({
    where: { portalUser: ctx.state.user.id },
  }) as Promise<{
    id: number;
    level: 'Bachelors' | 'Masters' | null;
    cgpaPercentage: number | null;
    budgetAnnualEUR: number | null;
    specializationKeywords: string | null;
    targetIntake: string | null;
  } | null>;
}

async function getCatalogVersion(): Promise<string> {
  const tables = ['api::masters-program.masters-program', 'api::bachelors-program.bachelors-program', 'api::university.university'];
  let latest = 0;
  for (const uid of tables) {
    const row = (await strapi.db
      .query(uid)
      .findOne({ orderBy: { updatedAt: 'desc' }, select: ['updatedAt'] })) as { updatedAt?: string } | null;
    if (row?.updatedAt) latest = Math.max(latest, new Date(row.updatedAt).getTime());
  }
  return new Date(latest).toISOString();
}

async function fetchCandidatePrograms(level: 'Bachelors' | 'Masters' | null): Promise<ProgramRecord[]> {
  const uid = level === 'Bachelors' ? 'api::bachelors-program.bachelors-program' : 'api::masters-program.masters-program';
  const programType = level === 'Bachelors' ? 'bachelors-program' : 'masters-program';

  const rows = (await strapi.db.query(uid).findMany({
    where: { university: { englishTaughtOnly: true } },
    populate: ['university'],
  })) as any[];

  return rows
    .filter((row) => row.university) // only candidate programs linked to a restructured university record
    .map((row) => ({
      id: row.id,
      programType,
      program: row.program,
      field: row.field,
      fieldKeywords: row.fieldKeywords,
      university: {
        id: row.university.id,
        name: row.university.name,
        minCGPAPercentage: row.university.minCGPAPercentage ?? null,
        cgpaRequirementUnresolved: row.university.cgpaRequirementUnresolved ?? false,
        tuitionAnnual: row.university.tuitionAnnual ?? null,
        languageRequirement: row.university.languageRequirement ?? null,
        languageMinScore: row.university.languageMinScore ?? null,
        applicationFeeEUR: row.university.applicationFeeEUR ?? null,
        studyMode: row.university.studyMode ?? null,
        deadline: row.university.deadline ?? null,
        estimatedAdmissionDate: row.university.estimatedAdmissionDate ?? null,
        tuitionNote: row.university.tuitionNote ?? null,
      },
      minCGPAPercentageOverride: row.minCGPAPercentageOverride ?? null,
      tuitionAnnualOverride: row.tuitionAnnualOverride ?? null,
      languageRequirementOverride: row.languageRequirementOverride ?? null,
      languageMinScoreOverride: row.languageMinScoreOverride ?? null,
      durationMonthsOverride: row.durationMonthsOverride ?? null,
    }));
}

export default factories.createCoreController('api::match-run.match-run', ({ strapi }) => ({
  async find(ctx) {
    const own = await resolveOwnStudent(ctx);
    if (ctx.state.user) {
      ctx.query = {
        ...ctx.query,
        filters: { ...(ctx.query.filters as Record<string, unknown>), student: own?.id ?? -1 },
      };
    }
    return super.find(ctx);
  },

  async runMatch(ctx) {
    const student = await resolveOwnStudent(ctx);
    if (!student) return ctx.forbidden('No student record linked to this account.');

    const languageEvidenceItem = (await strapi.db.query('api::checklist-item.checklist-item').findOne({
      where: { student: student.id, code: 'language-evidence' },
      select: ['status'],
    })) as { status?: string } | null;

    const profile: StudentProfile = {
      level: student.level,
      cgpaPercentage: student.cgpaPercentage,
      budgetAnnualEUR: student.budgetAnnualEUR,
      specializationKeywords: student.specializationKeywords,
      languageEvidenceChecked: languageEvidenceItem?.status === 'Checked',
    };

    const inputSnapshot = {
      ...profile,
      targetIntake: student.targetIntake,
      requestedAt: new Date().toISOString(),
    };
    const catalogVersion = await getCatalogVersion();

    const matchRun = (await strapi.db.query('api::match-run.match-run').create({
      data: {
        student: student.id,
        status: 'Pending',
        inputSnapshot,
        catalogVersion,
        requestedAt: new Date().toISOString(),
      },
    })) as { id: number };

    const wallet = strapi.service('api::student.wallet') as {
      reserveCredit: (studentId: number, matchRunId: number) => Promise<number>;
      settleCredit: (studentId: number, matchRunId: number) => Promise<void>;
      releaseCredit: (studentId: number, matchRunId: number, reason?: string) => Promise<number>;
    };

    let balanceAfterReserve: number;
    try {
      balanceAfterReserve = await wallet.reserveCredit(student.id, matchRun.id);
    } catch (err) {
      await strapi.db.query('api::match-run.match-run').update({
        where: { id: matchRun.id },
        data: { status: 'Failed', failureReason: err instanceof Error ? err.constructor.name : 'unknown' },
      });
      if (err instanceof ReadinessGateClosedError) {
        return ctx.send({ error: 'readiness_gate_closed' }, 409);
      }
      if (err instanceof InsufficientCreditsError) {
        return ctx.send({ error: 'insufficient_credits', creditBalance: 0 }, 402);
      }
      throw err;
    }

    try {
      const candidates = await fetchCandidatePrograms(student.level);
      const programsById = new Map(candidates.map((p) => [p.id, p]));
      const allResults: MatchResult[] = candidates.map((program) => evaluateProgram(program, profile));

      const meets = allResults.filter((r) => r.verdict === 'Meets published criteria');
      const needsVerification = allResults.filter((r) => r.verdict === 'Needs verification');
      const doesNotMeet = allResults.filter((r) => r.verdict === 'Does not meet published criteria');

      if (meets.length === 0 && needsVerification.length === 0) {
        const creditBalance = await wallet.releaseCredit(student.id, matchRun.id, 'zero-results');
        await strapi.db.query('api::match-run.match-run').update({
          where: { id: matchRun.id },
          data: { status: 'Failed', failureReason: 'zero-results', results: allResults },
        });
        return ctx.send({ data: { matchRunId: matchRun.id, charged: false, creditBalance, results: { meets: [], needsVerification: [], doesNotMeet } } });
      }

      const rankedMeets = rankMeetsGroup(meets, programsById, profile);
      const results = { meets: rankedMeets, needsVerification, doesNotMeet };

      await wallet.settleCredit(student.id, matchRun.id);
      await strapi.db.query('api::match-run.match-run').update({
        where: { id: matchRun.id },
        data: { status: 'Completed', results, completedAt: new Date().toISOString() },
      });

      return ctx.send({ data: { matchRunId: matchRun.id, charged: true, creditBalance: balanceAfterReserve, results } });
    } catch (err) {
      await wallet.releaseCredit(student.id, matchRun.id, 'error');
      await strapi.db.query('api::match-run.match-run').update({
        where: { id: matchRun.id },
        data: { status: 'Failed', failureReason: 'error' },
      });
      throw err;
    }
  },
}));
