/**
 * Simplified eligibility + ranking engine, scoped per the approved plan.
 * Deliberate simplifications (all documented inline, not hidden):
 *
 * - englishTaughtOnly is used as a CATALOG FILTER (only English-taught
 *   programs are candidates at all, matching this pilot's PRD scope), not a
 *   per-student pass/fail rule — a program either is or isn't one we serve.
 * - Language evidence isn't evaluated against a specific numeric score (no
 *   per-test-band comparison is wired in) — but the readiness gate already
 *   requires an advisor to mark the student's "language-evidence" checklist
 *   item Checked before any match can run at all, so by match time we *do*
 *   know whether the student has verified English-proficiency evidence on
 *   file. A published language requirement is "Meets" when that item is
 *   Checked, "Needs verification" otherwise — never a silent, permanent
 *   unresolved for every real program.
 * - Budget is a SEPARATE constraint from the academic verdict (per PRD
 *   step 3: "distinguish a published academic failure from a student's
 *   strict cost... filter"). A program can be academically "Meets" while
 *   still being over budget — it stays visible (never silently dropped)
 *   with withinBudget:false, and the affordability score component
 *   reflects it directly rather than excluding it from results.
 * - timing/readiness is computed from how close the published deadline is
 *   (falling back to a neutral stub when the deadline free text isn't a
 *   parseable date). location/format fit stays stubbed to a fixed neutral
 *   value — no multi-destination preference is captured on the student
 *   profile, and none was requested this phase. Both are always written
 *   into scoreBreakdown, never hidden inside an opaque total.
 */

export type Verdict = 'Meets published criteria' | 'Needs verification' | 'Does not meet published criteria';

export interface StudentProfile {
  level: 'Bachelors' | 'Masters' | null;
  cgpaPercentage: number | null;
  budgetAnnualEUR: number | null;
  specializationKeywords: string | null;
  languageEvidenceChecked: boolean;
}

export interface UniversityFields {
  id: number;
  name: string;
  minCGPAPercentage: number | null;
  cgpaRequirementUnresolved: boolean;
  tuitionAnnual: number | null;
  languageRequirement: string | null;
  languageMinScore: number | null;
  applicationFeeEUR: number | null;
  studyMode: string | null;
  deadline: string | null;
  estimatedAdmissionDate: string | null;
  tuitionNote: string | null;
}

export interface ProgramRecord {
  id: number;
  programType: 'masters-program' | 'bachelors-program';
  program: string;
  field: string | null;
  fieldKeywords: string | null;
  university: UniversityFields | null;
  minCGPAPercentageOverride: number | null;
  tuitionAnnualOverride: number | null;
  languageRequirementOverride: string | null;
  languageMinScoreOverride: number | null;
  durationMonthsOverride: number | null;
}

export interface ScoreBreakdown {
  subjectCareer: number;
  affordability: number;
  timingReadiness: number;
  locationFormat: number;
  total: number;
}

export interface MatchDisplayInfo {
  tuitionAnnual: number | null;
  applicationFeeEUR: number | null;
  studyMode: string | null;
  deadline: string | null;
  classesStart: string | null;
  durationMonths: number;
  languageRequirement: string | null;
  languageMinScore: number | null;
  minCGPAPercentage: number | null;
  cgpaRequirementUnresolved: boolean;
  tuitionNote: string | null;
}

export interface MatchResult {
  programId: number;
  programType: 'masters-program' | 'bachelors-program';
  universityId: number | null;
  universityName: string;
  program: string;
  verdict: Verdict;
  reasons: string[];
  withinBudget: boolean | null;
  scoreBreakdown: ScoreBreakdown | null;
  rank: number | null;
  recommendedAreaOfStudy: string | null;
  whyThisMatch: string;
  recommendedActions: string[];
  display: MatchDisplayInfo;
}

function effective<T>(override: T | null | undefined, base: T | null | undefined): T | null {
  return override ?? base ?? null;
}

function evaluateCGPA(
  profile: StudentProfile,
  minCGPA: number | null,
  requirementUnresolved: boolean
): { status: 'pass' | 'fail' | 'unresolved'; reason?: string } {
  if (requirementUnresolved) {
    return { status: 'unresolved', reason: "This university's published CGPA requirement couldn't be confirmed yet." };
  }
  if (minCGPA === null) return { status: 'pass' };
  if (profile.cgpaPercentage === null) {
    return { status: 'unresolved', reason: 'No CGPA on file to check against this program\'s requirement.' };
  }
  if (profile.cgpaPercentage < minCGPA) {
    return {
      status: 'fail',
      reason: `Requires at least ${minCGPA}% — recorded CGPA is ${profile.cgpaPercentage}%.`,
    };
  }
  return { status: 'pass', reason: `Meets the ${minCGPA}% CGPA requirement.` };
}

function evaluateLanguage(
  requirement: string | null,
  minScore: number | null,
  languageEvidenceChecked: boolean
): { status: 'pass' | 'unresolved'; reason?: string } {
  if (!requirement || requirement === 'None') return { status: 'pass' };
  if (languageEvidenceChecked) {
    return { status: 'pass', reason: `Meets the ${requirement} requirement with your verified language evidence.` };
  }
  return {
    status: 'unresolved',
    reason: `Requires ${requirement}${minScore ? ` (min ${minScore})` : ''} — your language evidence hasn't been verified yet.`,
  };
}

function keywordOverlapScore(fieldKeywords: string | null, studentKeywords: string | null): number {
  if (!fieldKeywords || !studentKeywords) return 0.5; // neutral — insufficient data either side
  const programWords = new Set(
    fieldKeywords.toLowerCase().split(/[,\s]+/).filter(Boolean)
  );
  const studentWords = studentKeywords.toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (programWords.size === 0 || studentWords.length === 0) return 0.5;
  const matches = studentWords.filter((w) => programWords.has(w)).length;
  return Math.min(1, matches / studentWords.length);
}

function affordabilityScore(tuitionAnnual: number | null, budget: number | null): { score: number; withinBudget: boolean | null } {
  if (tuitionAnnual === null || budget === null) return { score: 0.5, withinBudget: null };
  if (budget >= tuitionAnnual) return { score: 1, withinBudget: true };
  const overBy = (tuitionAnnual - budget) / tuitionAnnual;
  return { score: Math.max(0, 1 - overBy), withinBudget: false };
}

function parseDeadline(deadline: string | null): Date | null {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Real (not stubbed) timing/readiness component, computed from how close the
 * published deadline is. Falls back to the documented neutral stub when the
 * deadline is missing or its free text isn't a parseable date — this is a
 * display/free-text field the content team enters, not guaranteed structured.
 */
function timingReadinessScore(deadline: string | null): number {
  const date = parseDeadline(deadline);
  if (!date) return 0.75;
  const daysUntil = (date.getTime() - Date.now()) / 86_400_000;
  if (daysUntil < 0) return 0.2; // deadline has passed — still shown, never hidden, but scored low
  return Math.min(1, Math.max(0.2, daysUntil / 180));
}

function defaultDurationMonths(programType: 'masters-program' | 'bachelors-program'): number {
  return programType === 'bachelors-program' ? 36 : 24; // Italian academic-year norm
}

function buildWhyThisMatch(program: ProgramRecord, profile: StudentProfile, subjectCareer: number, withinBudget: boolean | null): string {
  const uniName = program.university?.name ?? 'this university';
  const field = program.field ?? 'this field';
  const parts: string[] = [];
  if (subjectCareer >= 0.5) {
    parts.push(`Your stated interest in ${profile.specializationKeywords?.trim() || field} lines up closely with ${uniName}'s ${field} programme.`);
  } else {
    parts.push(`This is a ${field} programme at ${uniName}, broadening your options beyond what you listed in your profile.`);
  }
  if (withinBudget === true) parts.push('It also fits within your stated annual budget.');
  else if (withinBudget === false) parts.push('Note that its tuition currently exceeds your stated budget, before any scholarship or funding.');
  return parts.join(' ');
}

function buildRecommendedActions(
  program: ProgramRecord,
  cgpaResult: { status: 'pass' | 'fail' | 'unresolved'; reason?: string },
  languageResult: { status: 'pass' | 'unresolved'; reason?: string },
  withinBudget: boolean | null
): string[] {
  const actions: string[] = [];
  const uniName = program.university?.name ?? 'this university';
  actions.push(`Prepare a personal statement explaining your interest in ${program.field ?? 'this programme'} at ${uniName}.`);
  if (languageResult.status === 'unresolved') {
    actions.push(`Confirm with your advisor how you'll satisfy ${uniName}'s English-language requirement (e.g. an MOI letter or test score).`);
  }
  if (cgpaResult.status === 'unresolved') {
    actions.push(cgpaResult.reason ?? `Confirm ${uniName}'s CGPA requirement with your advisor.`);
  }
  if (withinBudget === false) {
    actions.push('Discuss scholarship or funding options for this programme with your advisor.');
  }
  const deadlineDate = parseDeadline(program.university?.deadline ?? null);
  if (deadlineDate) {
    const daysUntil = Math.round((deadlineDate.getTime() - Date.now()) / 86_400_000);
    if (daysUntil >= 0 && daysUntil <= 60) {
      actions.push(`Submit before the ${program.university!.deadline} deadline — it's coming up.`);
    }
  }
  return actions.slice(0, 4);
}

export function evaluateProgram(program: ProgramRecord, profile: StudentProfile): MatchResult {
  const minCGPA = effective(program.minCGPAPercentageOverride, program.university?.minCGPAPercentage);
  const tuitionAnnual = effective(program.tuitionAnnualOverride, program.university?.tuitionAnnual);
  const languageRequirement = effective(program.languageRequirementOverride, program.university?.languageRequirement);
  const languageMinScore = effective(program.languageMinScoreOverride, program.university?.languageMinScore);

  const cgpaResult = evaluateCGPA(profile, minCGPA, program.university?.cgpaRequirementUnresolved ?? false);
  const languageResult = evaluateLanguage(languageRequirement, languageMinScore, profile.languageEvidenceChecked);

  const reasons: string[] = [];
  let verdict: Verdict;
  if (cgpaResult.status === 'fail') {
    verdict = 'Does not meet published criteria';
    reasons.push(cgpaResult.reason!);
  } else if (cgpaResult.status === 'unresolved' || languageResult.status === 'unresolved') {
    verdict = 'Needs verification';
    if (cgpaResult.status === 'unresolved') reasons.push(cgpaResult.reason!);
    if (languageResult.status === 'unresolved') reasons.push(languageResult.reason!);
  } else {
    verdict = 'Meets published criteria';
    if (cgpaResult.reason) reasons.push(cgpaResult.reason);
    if (languageResult.reason) reasons.push(languageResult.reason);
  }

  const { score: affordability, withinBudget } = affordabilityScore(tuitionAnnual, profile.budgetAnnualEUR);
  if (withinBudget === false) reasons.push('Tuition exceeds the stated budget before any funding is confirmed.');

  const subjectCareer = keywordOverlapScore(program.fieldKeywords, profile.specializationKeywords);

  return {
    programId: program.id,
    programType: program.programType,
    universityId: program.university?.id ?? null,
    universityName: program.university?.name ?? 'Unknown university',
    program: program.program,
    verdict,
    reasons,
    withinBudget,
    scoreBreakdown: null, // filled in by rankMeetsGroup for the "Meets" bucket only
    rank: null,
    recommendedAreaOfStudy: program.field ?? null,
    whyThisMatch: buildWhyThisMatch(program, profile, subjectCareer, withinBudget),
    recommendedActions: buildRecommendedActions(program, cgpaResult, languageResult, withinBudget),
    display: {
      tuitionAnnual,
      applicationFeeEUR: program.university?.applicationFeeEUR ?? null,
      studyMode: program.university?.studyMode ?? null,
      deadline: program.university?.deadline ?? null,
      classesStart: program.university?.estimatedAdmissionDate ?? null,
      durationMonths: program.durationMonthsOverride ?? defaultDurationMonths(program.programType),
      languageRequirement,
      languageMinScore,
      minCGPAPercentage: minCGPA,
      cgpaRequirementUnresolved: program.university?.cgpaRequirementUnresolved ?? false,
      tuitionNote: tuitionAnnual === null ? program.university?.tuitionNote ?? null : null,
    },
  };
}

export function rankMeetsGroup(results: MatchResult[], programsById: Map<number, ProgramRecord>, profile: StudentProfile): MatchResult[] {
  const scored = results.map((result) => {
    const program = programsById.get(result.programId)!;
    const subjectCareer = keywordOverlapScore(program.fieldKeywords, profile.specializationKeywords);
    const tuitionAnnual = effective(program.tuitionAnnualOverride, program.university?.tuitionAnnual);
    const { score: affordability } = affordabilityScore(tuitionAnnual, profile.budgetAnnualEUR);
    const timingReadiness = timingReadinessScore(program.university?.deadline ?? null);
    // Still stubbed — no destination/format preference is captured on the
    // student profile yet, and none was requested this phase.
    const locationFormat = 1;

    const total =
      subjectCareer * 40 + affordability * 30 + timingReadiness * 20 + locationFormat * 10;

    return {
      ...result,
      scoreBreakdown: { subjectCareer, affordability, timingReadiness, locationFormat, total },
    };
  });

  scored.sort((a, b) => (b.scoreBreakdown!.total ?? 0) - (a.scoreBreakdown!.total ?? 0));
  return scored.map((result, index) => ({ ...result, rank: index + 1 }));
}
