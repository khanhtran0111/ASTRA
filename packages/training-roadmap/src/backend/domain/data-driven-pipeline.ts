import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCoverageTarget } from './coverage-calculator.ts';
import { getSkillAliases, matchesSkill } from './skill-aliases.ts';
import { isDevelopmentTeam } from './trainee-allocator.ts';

export type DataSourceId = 'DS01' | 'DS02' | 'DS03' | 'DS04' | 'DS05' | 'MARKET';

export interface DataInventoryItem {
  sourceId: DataSourceId;
  fileName: string;
  rowCount: number;
  validRows: number;
  invalidRows: number;
  skippedRows: number;
  detectedColumns: string[];
  warnings: string[];
}

export interface IndexedEvidenceRef {
  sourceId: DataSourceId;
  rowId: string;
  field: string;
  value: string;
  reason: string;
}

export interface EvidenceIndexItem {
  id: string;
  sourceId: DataSourceId;
  rowId: string;
  entityType: string;
  entityId: string;
  rawText: string;
  normalizedText: string;
  extractedSkills: string[];
  extractedRoles: string[];
  extractedProjects: string[];
  extractedTimeframe: string | null;
  confidence: number;
  fields: Record<string, string>;
  skillGaps: string[];
  currentSkills: string[];
}

export interface CanonicalSkill {
  id: string;
  displayName: string;
  normalizedName: string;
  aliases: string[];
  sourceCoverage: DataSourceId[];
}

export interface TrainingCandidate {
  canonicalSkillId: string;
  topic: string;
  demandEvidenceRefs: IndexedEvidenceRef[];
  sourceCoverage: {
    hasEmployeeGap: boolean;
    hasProjectNeed: boolean;
    hasSurveyNeed: boolean;
    hasBodAlignment: boolean;
    hasTrainerCandidate: boolean;
    hasMarketSignal: boolean;
  };
}

export interface DataDrivenTrainee {
  employeeId: string;
  employeeName?: string;
  role?: string;
  team?: string;
  proficiency?: string;
  matchedGap: string;
  reason: string;
  evidenceRefs: IndexedEvidenceRef[];
}

export interface TrainerCandidate {
  trainerId: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  capacityStatus: 'FULL' | 'PARTIAL' | 'NONE';
  availabilityHoursPerMonth: number;
  evidenceRefs: IndexedEvidenceRef[];
}

export interface LearningPlanEstimate {
  totalHours: number;
  trainerContactHours: number;
  selfStudyHours: number;
  labHours: number;
  durationWeeks: number;
  prerequisites: string[];
  objectives: string[];
  evaluationCriteria: string;
}

export interface ScoreBreakdown {
  bodAlignment: number;
  projectUrgency: number;
  traineeGapImpact: number;
  surveyDemand: number;
  feasibility: number;
  marketTrend: number;
  riskPenalty: number;
}

export type DataDrivenFormat =
  | 'INTERNAL_TRAINING'
  | 'BLENDED_INTERNAL_SELF_STUDY'
  | 'SELF_STUDY_WITH_INTERNAL_MENTOR'
  | 'SELF_STUDY'
  | 'EXTERNAL_TRAINER';

export interface DataDrivenRoadmapItem {
  id: string;
  topic: string;
  canonicalSkillId: string;
  priority: 'P1' | 'P2' | 'P3';
  score: number;
  quarter: string;
  weeks: { startWeek: number; endWeek: number; durationWeeks: number };
  totalHours: number;
  trainerContactHours: number;
  selfStudyHours: number;
  labHours: number;
  format: DataDrivenFormat;
  trainerDecision: string;
  trainerCandidates: TrainerCandidate[];
  selectedTrainer: string | null;
  fallbackReason?:
    | 'ERR_NO_INTERNAL_SKILL'
    | 'ERR_NO_CAPACITY'
    | 'ERR_TIMELINE_CONFLICT'
    | 'ERR_LOW_CONFIDENCE_MATCH';
  trainees: DataDrivenTrainee[];
  objectives: string[];
  prerequisites: string[];
  evaluationCriteria: string;
  evidenceRefs: IndexedEvidenceRef[];
  scoreBreakdown: ScoreBreakdown;
  selectionReason: string;
  risks: string[];
  requiresHumanApproval: boolean;
}

export interface CoverageReport {
  totalRecordsBySource: Partial<Record<DataSourceId, number>>;
  validRecordsBySource: Partial<Record<DataSourceId, number>>;
  candidateCount: number;
  selectedCount: number;
  droppedCount: number;
  unmatchedSkills: string[];
  unmatchedTraineeRows: string[];
  unmatchedTrainerRows: string[];
  warnings: string[];
  coverageResult?: {
    targetGroup: string;
    totalEligibleEmployees: number;
    requiredCoveragePercent: number;
    requiredTraineeCount: number;
    selectedTraineeCount: number;
    achievedCoveragePercent: number;
    coverageStatus: 'MET' | 'NOT_MET';
    missingTraineeCount: number;
  };
}

export interface UnselectedCandidate {
  candidate: string;
  reasonDropped:
    | 'NO_INTERNAL_CONTEXT'
    | 'TRAINER_ONLY_NO_DEMAND'
    | 'NO_DS01_TRAINEE'
    | 'OUTSIDE_PROMPT_SCOPE'
    | 'LOWER_PRIORITY_THAN_LIMIT';
  evidenceRefs: IndexedEvidenceRef[];
  suggestedFix: string;
}

interface SourceRow {
  sourceId: DataSourceId;
  rowId: string;
  values: Record<string, string>;
}

export interface IngestedData {
  inventory: DataInventoryItem[];
  rows: SourceRow[];
  warnings: string[];
}

export interface DataDrivenCoordinatorResult {
  runId: string;
  inventory: DataInventoryItem[];
  evidenceIndex: EvidenceIndexItem[];
  ontology: CanonicalSkill[];
  candidates: TrainingCandidate[];
  roadmap: { initiatives: DataDrivenRoadmapItem[] };
  coverageReport: CoverageReport;
  unselectedCandidates: UnselectedCandidate[];
  toolTrace: Array<{ tool: string; status: 'completed'; detail: string }>;
}

type SemanticField =
  | 'id'
  | 'name'
  | 'role'
  | 'team'
  | 'proficiency'
  | 'currentSkills'
  | 'skillGaps'
  | 'projectId'
  | 'requiredSkills'
  | 'timeframe'
  | 'employeeId'
  | 'surveyTopic'
  | 'trainerSkills'
  | 'capacity'
  | 'goalText'
  | 'marketSkill';

const COLUMN_ALIASES: Record<SemanticField, string[]> = {
  id: ['id', 'record_id', 'row_id'],
  name: ['employee_name', 'full_name', 'name'],
  role: ['position', 'job_title', 'role', 'title'],
  team: ['team', 'department', 'business_unit', 'group'],
  proficiency: ['proficiency_level', 'proficiency', 'level', 'seniority'],
  currentSkills: ['skills', 'current_skills', 'skill_set', 'competencies'],
  skillGaps: ['skill_gap', 'skill_gaps', 'development_needs', 'target_skills', 'gaps'],
  projectId: ['project_id', 'project_code', 'project'],
  requiredSkills: ['required_skills', 'technologies', 'technology_stack', 'project_skills'],
  timeframe: ['target_quarter', 'quarter', 'timeline', 'schedule', 'deadline'],
  employeeId: ['employee_id', 'staff_id', 'person_id'],
  surveyTopic: ['training_topic', 'requested_training', 'training_need', 'requested_skill'],
  trainerSkills: ['expertise', 'skill_areas', 'trainer_skills', 'skills'],
  capacity: [
    'availability_hours_per_month',
    'monthly_capacity',
    'available_hours',
    'capacity_hours',
  ],
  goalText: ['goal_description', 'objective', 'goal', 'description'],
  marketSkill: ['skill', 'trend_skill', 'technology', 'topic'],
};

const SOURCE_FILES: Array<{
  sourceId: DataSourceId;
  fileNames: string[];
  entityType: string;
  idAliases: string[];
  optional?: boolean;
}> = [
  {
    sourceId: 'DS01',
    fileNames: ['DS01_Employee_Skill_Profile.csv'],
    entityType: 'employee',
    idAliases: ['employee_id', 'staff_id', 'person_id'],
  },
  {
    sourceId: 'DS02',
    fileNames: ['DS02_Project_Roadmap.csv'],
    entityType: 'project',
    idAliases: ['project_id', 'project_code'],
  },
  {
    sourceId: 'DS03',
    fileNames: ['DS03_Training_Need_Survey.csv'],
    entityType: 'survey',
    idAliases: ['survey_id', 'response_id', 'id'],
  },
  {
    sourceId: 'DS04',
    fileNames: ['DS04_Internal_Trainer_List.csv'],
    entityType: 'trainer',
    idAliases: ['trainer_id', 'coach_id', 'id'],
  },
  {
    sourceId: 'DS05',
    fileNames: ['DS05_BOD_Training_Goals.csv'],
    entityType: 'goal',
    idAliases: ['goal_id', 'objective_id', 'id'],
  },
  {
    sourceId: 'MARKET',
    fileNames: ['market_trends.csv', 'market_trend.csv'],
    entityType: 'market_trend',
    idAliases: ['trend_id', 'id'],
    optional: true,
  },
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] ?? '';
    const next = raw[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findFile(dataDir: string, names: string[]): string | null {
  for (const name of names) {
    const path = resolve(dataDir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function valueFor(row: SourceRow | EvidenceIndexItem, field: SemanticField): string {
  const values = 'values' in row ? row.values : row.fields;
  for (const alias of COLUMN_ALIASES[field]) {
    const value = values[alias];
    if (value?.trim()) return value.trim();
  }
  return '';
}

function splitTerms(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\s*(?:;|,|\||\band\b|\bvà\b)\s*/i)
        .map((term) =>
          term
            .trim()
            .replace(/^[()[\]{}]+|[()[\]{}]+$/g, '')
            .trim(),
        )
        .filter((term) => term.length >= 2),
    ),
  ];
}

function extractGoalTerms(value: string): string[] {
  const terms: string[] = [];
  for (const match of value.matchAll(/\(([^)]+)\)/g)) {
    terms.push(...splitTerms(match[1] ?? ''));
  }
  for (const match of value.matchAll(
    /(?:skills?|technologies|capabilities)\s*[:=-]\s*([^.;]+)/gi,
  )) {
    terms.push(...splitTerms(match[1] ?? ''));
  }
  return [...new Set(terms)];
}

function normalizeTokens(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#/]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
      if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
      if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
      if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss'))
        return token.slice(0, -1);
      return token;
    })
    .join(' ');
}

function compact(value: string): string {
  return normalizeTokens(value).replace(/[^a-z0-9+#]+/g, '');
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeTokens(text)} `;
  const normalizedPhrase = ` ${normalizeTokens(phrase)} `;
  return normalizedPhrase.trim().length >= 2 && normalizedText.includes(normalizedPhrase);
}

function similarity(left: string, right: string): number {
  const a = normalizeTokens(left);
  const b = normalizeTokens(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const compactA = compact(a);
  const compactB = compact(b);
  const tokenCountA = a.split(' ').length;
  const tokenCountB = b.split(' ').length;
  if (
    Math.min(compactA.length, compactB.length) >= 4 &&
    tokenCountA === tokenCountB &&
    (compactA.includes(compactB) || compactB.includes(compactA))
  ) {
    return 0.88;
  }
  const tokensA = new Set(a.split(' '));
  const tokensB = new Set(b.split(' '));
  const overlap = [...tokensA].filter((token) => tokensB.has(token)).length;
  return overlap / new Set([...tokensA, ...tokensB]).size;
}

const termMatchCache = new Map<string, boolean>();

function termsMatch(left: string, right: string): boolean {
  const key = [normalizeTokens(left), normalizeTokens(right)].sort().join('\u0000');
  const cached = termMatchCache.get(key);
  if (cached !== undefined) return cached;
  const configuredAliasMatch =
    getSkillAliases(left).some((alias) => normalizeTokens(alias) === normalizeTokens(right)) ||
    getSkillAliases(right).some((alias) => normalizeTokens(alias) === normalizeTokens(left));
  const matched = similarity(left, right) >= 0.72 || configuredAliasMatch;
  termMatchCache.set(key, matched);
  return matched;
}

function evidenceRef(
  item: EvidenceIndexItem,
  field: string,
  value: string,
  reason: string,
): IndexedEvidenceRef {
  return { sourceId: item.sourceId, rowId: item.rowId, field, value, reason };
}

export function ingestAllSources(dataDir: string): IngestedData {
  const inventory: DataInventoryItem[] = [];
  const rows: SourceRow[] = [];
  const warnings: string[] = [];

  for (const source of SOURCE_FILES) {
    const defaultFileName = source.fileNames[0] ?? `${source.sourceId}.csv`;
    const filePath = findFile(dataDir, source.fileNames);
    if (!filePath) {
      const warning = `${source.sourceId} source is missing; remaining sources were processed.`;
      if (!source.optional) warnings.push(warning);
      inventory.push({
        sourceId: source.sourceId,
        fileName: defaultFileName,
        rowCount: 0,
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
        detectedColumns: [],
        warnings: source.optional ? [] : [warning],
      });
      continue;
    }

    try {
      const parsed = parseCsv(readFileSync(filePath, 'utf8'));
      const rawHeaders = parsed[0] ?? [];
      const headers = rawHeaders.map(normalizeHeader);
      const idColumn = source.idAliases.find((alias) => headers.includes(alias));
      let validRows = 0;
      let invalidRows = 0;
      let skippedRows = 0;
      for (const cells of parsed.slice(1)) {
        if (cells.every((cell) => !cell.trim())) {
          skippedRows += 1;
          continue;
        }
        const values = Object.fromEntries(
          headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']),
        );
        const rowId = idColumn ? values[idColumn]?.trim() : '';
        if (!rowId) {
          invalidRows += 1;
          continue;
        }
        validRows += 1;
        rows.push({ sourceId: source.sourceId, rowId, values });
      }
      const itemWarnings = idColumn ? [] : [`No supported ID column found in ${source.sourceId}.`];
      warnings.push(...itemWarnings);
      inventory.push({
        sourceId: source.sourceId,
        fileName: filePath.split('/').at(-1) ?? defaultFileName,
        rowCount: parsed.slice(1).length,
        validRows,
        invalidRows,
        skippedRows,
        detectedColumns: rawHeaders,
        warnings: itemWarnings,
      });
    } catch (error) {
      const warning = `${source.sourceId} is malformed: ${error instanceof Error ? error.message : String(error)}`;
      warnings.push(warning);
      inventory.push({
        sourceId: source.sourceId,
        fileName: filePath.split('/').at(-1) ?? defaultFileName,
        rowCount: 0,
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
        detectedColumns: [],
        warnings: [warning],
      });
    }
  }
  return { inventory, rows, warnings };
}

export function buildEvidenceIndex(ingested: IngestedData): EvidenceIndexItem[] {
  return ingested.rows.map((row) => {
    const currentSkills = splitTerms(valueFor(row, 'currentSkills'));
    const skillGaps = splitTerms(valueFor(row, 'skillGaps'));
    const extractedSkills =
      row.sourceId === 'DS01'
        ? [...currentSkills, ...skillGaps]
        : row.sourceId === 'DS02'
          ? splitTerms(valueFor(row, 'requiredSkills'))
          : row.sourceId === 'DS03'
            ? splitTerms(valueFor(row, 'surveyTopic'))
            : row.sourceId === 'DS04'
              ? splitTerms(valueFor(row, 'trainerSkills'))
              : row.sourceId === 'DS05'
                ? extractGoalTerms(valueFor(row, 'goalText'))
                : splitTerms(valueFor(row, 'marketSkill'));
    const rawText = Object.values(row.values).filter(Boolean).join(' | ');
    return {
      id: `${row.sourceId}:${row.rowId}`,
      sourceId: row.sourceId,
      rowId: row.rowId,
      entityType:
        SOURCE_FILES.find((source) => source.sourceId === row.sourceId)?.entityType ?? 'record',
      entityId: row.rowId,
      rawText,
      normalizedText: normalizeTokens(rawText),
      extractedSkills: [...new Set(extractedSkills)],
      extractedRoles: valueFor(row, 'role') ? [valueFor(row, 'role')] : [],
      extractedProjects: valueFor(row, 'projectId') ? [valueFor(row, 'projectId')] : [],
      extractedTimeframe: valueFor(row, 'timeframe') || null,
      confidence: extractedSkills.length > 0 ? 1 : 0.7,
      fields: row.values,
      skillGaps,
      currentSkills,
    };
  });
}

export function buildDynamicSkillOntology(index: EvidenceIndexItem[]): CanonicalSkill[] {
  const ontology: CanonicalSkill[] = [];
  for (const evidence of index) {
    for (const term of evidence.extractedSkills) {
      const existing = ontology.find((skill) => termsMatch(skill.displayName, term));
      if (existing) {
        if (!existing.aliases.includes(term)) existing.aliases.push(term);
        if (!existing.sourceCoverage.includes(evidence.sourceId)) {
          existing.sourceCoverage.push(evidence.sourceId);
        }
        continue;
      }
      const normalizedName = normalizeTokens(term);
      ontology.push({
        id: `skill-${compact(term) || ontology.length + 1}`,
        displayName: term,
        normalizedName,
        aliases: [term],
        sourceCoverage: [evidence.sourceId],
      });
    }
  }
  return ontology.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function evidenceSupportsSkill(evidence: EvidenceIndexItem, skill: CanonicalSkill): boolean {
  if (
    evidence.extractedSkills.some((term) => skill.aliases.some((alias) => termsMatch(term, alias)))
  ) {
    return true;
  }
  if (evidence.sourceId !== 'DS05') return false;
  return skill.aliases.some(
    (alias) =>
      containsNormalizedPhrase(evidence.rawText, alias) || matchesSkill(evidence.rawText, alias),
  );
}

export function generateTrainingCandidates(
  index: EvidenceIndexItem[],
  ontology: CanonicalSkill[],
): { candidates: TrainingCandidate[]; dropped: UnselectedCandidate[] } {
  const candidates: TrainingCandidate[] = [];
  const dropped: UnselectedCandidate[] = [];
  for (const skill of ontology) {
    const supporting = index.filter((evidence) => evidenceSupportsSkill(evidence, skill));
    const gapEvidence = supporting.filter(
      (evidence) =>
        evidence.sourceId === 'DS01' &&
        evidence.skillGaps.some((gap) => skill.aliases.some((alias) => termsMatch(gap, alias))),
    );
    const projectEvidence = supporting.filter((evidence) => evidence.sourceId === 'DS02');
    const surveyEvidence = supporting.filter((evidence) => evidence.sourceId === 'DS03');
    const bodEvidence = supporting.filter((evidence) => evidence.sourceId === 'DS05');
    const trainerEvidence = supporting.filter((evidence) => evidence.sourceId === 'DS04');
    const marketEvidence = supporting.filter((evidence) => evidence.sourceId === 'MARKET');
    const demandEvidence = [
      ...gapEvidence,
      ...projectEvidence,
      ...surveyEvidence,
      ...bodEvidence,
      ...marketEvidence,
    ];
    const refs = demandEvidence.map((evidence) =>
      evidenceRef(
        evidence,
        'extractedSkills',
        evidence.extractedSkills.join('; ') || evidence.rawText,
        `${evidence.sourceId} supports demand for ${skill.displayName}.`,
      ),
    );
    const hasInternalContext =
      gapEvidence.length + projectEvidence.length + surveyEvidence.length + bodEvidence.length > 0;
    if (!hasInternalContext) {
      dropped.push({
        candidate: skill.displayName,
        reasonDropped: marketEvidence.length > 0 ? 'NO_INTERNAL_CONTEXT' : 'TRAINER_ONLY_NO_DEMAND',
        evidenceRefs: refs,
        suggestedFix:
          marketEvidence.length > 0
            ? 'Add DS01, DS02, DS03, or DS05 evidence before prioritizing this trend.'
            : 'Add demand evidence; trainer availability alone does not create a training need.',
      });
      continue;
    }
    candidates.push({
      canonicalSkillId: skill.id,
      topic: skill.displayName,
      demandEvidenceRefs: refs,
      sourceCoverage: {
        hasEmployeeGap: gapEvidence.length > 0,
        hasProjectNeed: projectEvidence.length > 0,
        hasSurveyNeed: surveyEvidence.length > 0,
        hasBodAlignment: bodEvidence.length > 0,
        hasTrainerCandidate: trainerEvidence.length > 0,
        hasMarketSignal: marketEvidence.length > 0,
      },
    });
  }
  return { candidates, dropped };
}

function promptQuarter(prompt: string): string {
  const match = /Q([1-4])\D*(20\d{2})/i.exec(prompt);
  return match ? `Q${match[1]} ${match[2]}` : 'Unscheduled';
}

function promptLimit(prompt: string): number | undefined {
  const explicit = /(?:tối đa|max(?:imum)?|up to)\s*(\d+)\s+(?:training\s+)?initiatives?/i.exec(
    prompt,
  )?.[1];
  if (explicit) return Number.parseInt(explicit, 10);
  return /(?:create|tạo)\s+(?:only\s+|chỉ\s+)?(?:one|một|1)\s+(?:training\s+)?initiative/i.test(
    prompt,
  )
    ? 1
    : undefined;
}

function requestedRole(prompt: string, employees: EvidenceIndexItem[]): string | undefined {
  return [...new Set(employees.flatMap((employee) => employee.extractedRoles))].find((role) =>
    normalizeTokens(prompt).includes(normalizeTokens(role)),
  );
}

function requestedProficiency(prompt: string, employees: EvidenceIndexItem[]): string | undefined {
  const normalizedPrompt = normalizeTokens(prompt);
  const levels = [
    ...new Set(employees.map((employee) => valueFor(employee, 'proficiency'))),
  ].filter(Boolean);
  const aliases: Record<string, string[]> = {
    beginner: ['beginner', 'entry level', 'junior'],
    intermediate: ['intermediate', 'mid level', 'mid-level'],
    advanced: ['advanced', 'senior'],
  };
  return levels.find((level) => {
    const normalizedLevel = normalizeTokens(level);
    return [level, ...(aliases[normalizedLevel] ?? [])].some((alias) =>
      containsNormalizedPhrase(normalizedPrompt, alias),
    );
  });
}

function promptSkillScope(prompt: string): string {
  for (const pattern of [
    /(?:gồm|including|include)\s+(.+?)(?:,\s*(?:chỉ|only|using)|\s+cho|\s+for|\s+trong|\s+with|[.\n]|$)/i,
    /(?:tập trung|focused?\s+on)\s+(.+?)(?:,\s*(?:chỉ|only|using)|\s+cho|\s+for|\s+trong|\s+with|[.\n]|$)/i,
    /(?:về|about)\s+(.+?)(?:,\s*(?:chỉ|only|using)|\s+cho|\s+for|\s+trong|\s+with|[.\n]|$)/i,
  ]) {
    const scope = pattern.exec(prompt)?.[1];
    if (scope) return scope;
  }
  return prompt;
}

function matchedPromptAlias(prompt: string, skill: CanonicalSkill): string | null {
  return (
    skill.aliases
      .filter((alias) => containsNormalizedPhrase(prompt, alias))
      .sort((left, right) => normalizeTokens(right).length - normalizeTokens(left).length)[0] ??
    null
  );
}

function promptTopicLabel(prompt: string, skill: CanonicalSkill): string {
  if (promptLimit(prompt) !== 1) {
    return matchedPromptAlias(promptSkillScope(prompt), skill) ?? skill.displayName;
  }
  const scopedPhrase =
    /(?:về|about|focused?\s+on)\s+(.+?)(?:\s+cho|\s+for|\s+có|\s+with|[.\n]|$)/i.exec(prompt)?.[1];
  if (
    scopedPhrase &&
    scopedPhrase.length <= 100 &&
    skill.aliases.some((alias) => containsNormalizedPhrase(scopedPhrase, alias))
  ) {
    return scopedPhrase.trim();
  }
  return skill.displayName;
}

export function allocateTrainees(args: {
  candidate: TrainingCandidate;
  skill: CanonicalSkill;
  evidenceIndex: EvidenceIndexItem[];
  userPrompt: string;
  maxTrainees?: number;
}): DataDrivenTrainee[] {
  const employees = args.evidenceIndex.filter((item) => item.sourceId === 'DS01');
  const role = requestedRole(args.userPrompt, employees);
  const proficiency = requestedProficiency(args.userPrompt, employees);
  return employees
    .flatMap((employee) => {
      const matchedGap = employee.skillGaps.find((gap) =>
        args.skill.aliases.some((alias) => termsMatch(gap, alias)),
      );
      if (!matchedGap) return [];
      const employeeRole = valueFor(employee, 'role');
      if (role && normalizeTokens(employeeRole) !== normalizeTokens(role)) return [];
      const employeeProficiency = valueFor(employee, 'proficiency');
      if (proficiency && normalizeTokens(employeeProficiency) !== normalizeTokens(proficiency)) {
        return [];
      }
      let score = 60;
      if (role) score += 20;
      if (/beginner|intermediate|junior|mid/i.test(employeeProficiency)) score += 10;
      if (
        employee.currentSkills.some((current) =>
          args.skill.aliases.some((alias) => similarity(current, alias) >= 0.45),
        )
      ) {
        score += 10;
      }
      const ref = evidenceRef(
        employee,
        'Skill_Gap',
        valueFor(employee, 'skillGaps'),
        `${employeeRole || 'Employee'} has a DS01 gap matching ${args.candidate.topic}.`,
      );
      return [
        {
          employeeId: employee.entityId,
          ...(valueFor(employee, 'name') ? { employeeName: valueFor(employee, 'name') } : {}),
          ...(employeeRole ? { role: employeeRole } : {}),
          ...(valueFor(employee, 'team') ? { team: valueFor(employee, 'team') } : {}),
          ...(employeeProficiency ? { proficiency: employeeProficiency } : {}),
          matchedGap,
          reason: `Selected from the complete DS01 scan with direct gap evidence for ${args.candidate.topic}.`,
          evidenceRefs: [ref],
          score,
        },
      ];
    })
    .sort(
      (left, right) => right.score - left.score || left.employeeId.localeCompare(right.employeeId),
    )
    .slice(0, args.maxTrainees)
    .map(({ score: _score, ...trainee }) => trainee);
}

export function estimateLearningPlan(candidate: TrainingCandidate): LearningPlanEstimate {
  const sourceCount = Object.values(candidate.sourceCoverage).filter(Boolean).length;
  const totalHours = sourceCount >= 4 ? 24 : sourceCount >= 2 ? 16 : 12;
  const trainerContactHours = Math.max(2, Math.round(totalHours * 0.25));
  const labHours = Math.round(totalHours * 0.25);
  return {
    totalHours,
    trainerContactHours,
    selfStudyHours: totalHours - trainerContactHours - labHours,
    labHours,
    durationWeeks: Math.max(3, Math.ceil(totalHours / 4)),
    prerequisites: [],
    objectives: [`Apply ${candidate.topic} in an evidence-backed work scenario.`],
    evaluationCriteria: `Complete a practical ${candidate.topic} assessment reviewed against project or role evidence.`,
  };
}

export function matchTrainerCandidates(args: {
  candidate: TrainingCandidate;
  skill: CanonicalSkill;
  evidenceIndex: EvidenceIndexItem[];
  plan: LearningPlanEstimate;
}): TrainerCandidate[] {
  const monthlyContactHours = Math.ceil(
    args.plan.trainerContactHours / Math.max(1, Math.ceil(args.plan.durationWeeks / 4)),
  );
  return args.evidenceIndex
    .filter((item) => item.sourceId === 'DS04')
    .flatMap((trainer) => {
      const scoredSkills = trainer.extractedSkills
        .map((trainerSkill) => ({
          trainerSkill,
          score: Math.max(...args.skill.aliases.map((alias) => similarity(trainerSkill, alias))),
        }))
        .filter((match) => match.score >= 0.55)
        .sort((left, right) => right.score - left.score);
      if (scoredSkills.length === 0) return [];
      const capacity = Number.parseFloat(valueFor(trainer, 'capacity')) || 0;
      const capacityStatus: TrainerCandidate['capacityStatus'] =
        capacity >= monthlyContactHours ? 'FULL' : capacity > 0 ? 'PARTIAL' : 'NONE';
      return [
        {
          trainerId: trainer.entityId,
          fitScore: Math.round((scoredSkills[0]?.score ?? 0) * 100),
          matchedSkills: scoredSkills.map((match) => match.trainerSkill),
          missingSkills: [],
          capacityStatus,
          availabilityHoursPerMonth: capacity,
          evidenceRefs: [
            evidenceRef(
              trainer,
              'Expertise;Availability',
              `${valueFor(trainer, 'trainerSkills')} | ${capacity}h/month`,
              `DS04 trainer matched ${args.candidate.topic} with ${capacityStatus.toLowerCase()} capacity.`,
            ),
          ],
        },
      ];
    })
    .sort((left, right) => {
      const capacityOrder = { FULL: 2, PARTIAL: 1, NONE: 0 };
      return (
        capacityOrder[right.capacityStatus] - capacityOrder[left.capacityStatus] ||
        right.fitScore - left.fitScore
      );
    });
}

function scoreCandidate(args: {
  candidate: TrainingCandidate;
  trainees: DataDrivenTrainee[];
  trainers: TrainerCandidate[];
}): { score: number; priority: 'P1' | 'P2' | 'P3'; breakdown: ScoreBreakdown } {
  const coverage = args.candidate.sourceCoverage;
  const feasibility = args.trainers.some((trainer) => trainer.capacityStatus === 'FULL')
    ? 8
    : args.trainers.some((trainer) => trainer.capacityStatus === 'PARTIAL')
      ? 5
      : 0;
  const breakdown: ScoreBreakdown = {
    bodAlignment: coverage.hasBodAlignment ? 30 : 0,
    projectUrgency: coverage.hasProjectNeed ? 25 : 0,
    traineeGapImpact: Math.min(25, args.trainees.length * 5),
    surveyDemand: coverage.hasSurveyNeed ? 10 : 0,
    feasibility,
    marketTrend: coverage.hasMarketSignal ? 2 : 0,
    riskPenalty: args.trainees.length === 0 ? 30 : 0,
  };
  const score = Math.max(
    0,
    Object.entries(breakdown).reduce(
      (total, [key, value]) => total + (key === 'riskPenalty' ? -value : value),
      0,
    ),
  );
  return { score, priority: score >= 70 ? 'P1' : score >= 45 ? 'P2' : 'P3', breakdown };
}

function selectionReason(candidate: TrainingCandidate): string {
  const signals = Object.entries(candidate.sourceCoverage)
    .filter(([, present]) => present)
    .map(([name]) => name.replace(/^has/, ''));
  return `Selected from dynamic demand evidence: ${signals.join(', ')}.`;
}

export function runDataDrivenCoordinator(args: {
  dataDir: string;
  runId: string;
  userPrompt: string;
}): DataDrivenCoordinatorResult {
  const toolTrace: DataDrivenCoordinatorResult['toolTrace'] = [];
  const ingested = ingestAllSources(args.dataDir);
  toolTrace.push({
    tool: 'ingestAllSourcesTool',
    status: 'completed',
    detail: `Scanned ${ingested.inventory.length} configured sources.`,
  });
  const evidenceIndex = buildEvidenceIndex(ingested);
  toolTrace.push({
    tool: 'buildEvidenceIndexTool',
    status: 'completed',
    detail: `Indexed ${evidenceIndex.length} valid records.`,
  });
  const ontology = buildDynamicSkillOntology(evidenceIndex);
  toolTrace.push({
    tool: 'buildSkillOntologyTool',
    status: 'completed',
    detail: `Built ${ontology.length} canonical skills from source terms.`,
  });
  const generated = generateTrainingCandidates(evidenceIndex, ontology);
  toolTrace.push({
    tool: 'generateTrainingCandidatesTool',
    status: 'completed',
    detail: `Generated ${generated.candidates.length} demand-backed candidates.`,
  });

  const skillScope = promptSkillScope(args.userPrompt);
  const requestedSkillMatches = ontology.flatMap((skill) => {
    const alias = matchedPromptAlias(skillScope, skill);
    return alias ? [{ skill, alias }] : [];
  });
  const explicitlyRequestedSkills = requestedSkillMatches
    .filter(({ alias }, index, matches) => {
      const normalizedAlias = normalizeTokens(alias);
      return !matches.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          normalizeTokens(other.alias).length > normalizedAlias.length &&
          containsNormalizedPhrase(other.alias, alias),
      );
    })
    .map(({ skill }) => skill);
  const requestedIds = new Set(explicitlyRequestedSkills.map((skill) => skill.id));
  const hasExplicitSkillScope = requestedIds.size > 0;
  const maxTrainees = /(?:tối đa|max(?:imum)?|up to)\s*(\d+)/i.exec(args.userPrompt)?.[1];
  const enriched: DataDrivenRoadmapItem[] = [];
  const unselectedCandidates = [...generated.dropped];

  for (const candidate of generated.candidates) {
    const skill = ontology.find((item) => item.id === candidate.canonicalSkillId);
    if (!skill) continue;
    if (hasExplicitSkillScope && !requestedIds.has(skill.id)) {
      unselectedCandidates.push({
        candidate: candidate.topic,
        reasonDropped: 'OUTSIDE_PROMPT_SCOPE',
        evidenceRefs: candidate.demandEvidenceRefs,
        suggestedFix: 'Request this skill explicitly or remove the topic constraint.',
      });
      continue;
    }
    const trainees = allocateTrainees({
      candidate,
      skill,
      evidenceIndex,
      userPrompt: args.userPrompt,
      maxTrainees: maxTrainees ? Number.parseInt(maxTrainees, 10) : undefined,
    });
    if (trainees.length === 0) {
      unselectedCandidates.push({
        candidate: candidate.topic,
        reasonDropped: 'NO_DS01_TRAINEE',
        evidenceRefs: candidate.demandEvidenceRefs,
        suggestedFix:
          'Add a DS01 skill-gap record or move this candidate to an exploratory item requiring approval.',
      });
      continue;
    }
    const plan = estimateLearningPlan(candidate);
    const trainerCandidates = matchTrainerCandidates({ candidate, skill, evidenceIndex, plan });
    const fullTrainer = trainerCandidates.find((trainer) => trainer.capacityStatus === 'FULL');
    const partialTrainer = trainerCandidates.find(
      (trainer) => trainer.capacityStatus === 'PARTIAL',
    );
    const trainerEvidence = (fullTrainer ?? partialTrainer)?.evidenceRefs ?? [];
    const scored = scoreCandidate({ candidate, trainees, trainers: trainerCandidates });
    const format: DataDrivenFormat = fullTrainer
      ? 'INTERNAL_TRAINING'
      : partialTrainer
        ? 'BLENDED_INTERNAL_SELF_STUDY'
        : 'EXTERNAL_TRAINER';
    enriched.push({
      id: `initiative-${candidate.canonicalSkillId.replace(/^skill-/, '')}`,
      topic: promptTopicLabel(args.userPrompt, skill),
      canonicalSkillId: candidate.canonicalSkillId,
      priority: scored.priority,
      score: scored.score,
      quarter: promptQuarter(args.userPrompt),
      weeks: { startWeek: 1, endWeek: plan.durationWeeks, durationWeeks: plan.durationWeeks },
      totalHours: plan.totalHours,
      trainerContactHours: plan.trainerContactHours,
      selfStudyHours: plan.selfStudyHours,
      labHours: plan.labHours,
      format,
      trainerDecision: fullTrainer
        ? `${fullTrainer.trainerId} has the best skill fit and sufficient contact-hour capacity.`
        : partialTrainer
          ? `${partialTrainer.trainerId} is retained as an internal mentor; remaining hours use guided self-study.`
          : 'No sufficiently related internal trainer was found after normalized and fuzzy matching.',
      trainerCandidates,
      selectedTrainer: fullTrainer?.trainerId ?? partialTrainer?.trainerId ?? null,
      ...(!fullTrainer && !partialTrainer
        ? { fallbackReason: 'ERR_NO_INTERNAL_SKILL' as const }
        : {}),
      trainees,
      objectives: plan.objectives,
      prerequisites: plan.prerequisites,
      evaluationCriteria: plan.evaluationCriteria,
      evidenceRefs: [
        ...candidate.demandEvidenceRefs,
        ...trainees.flatMap((trainee) => trainee.evidenceRefs),
        ...trainerEvidence,
      ].filter(
        (ref, index, refs) =>
          refs.findIndex(
            (candidateRef) =>
              candidateRef.sourceId === ref.sourceId &&
              candidateRef.rowId === ref.rowId &&
              candidateRef.field === ref.field,
          ) === index,
      ),
      scoreBreakdown: scored.breakdown,
      selectionReason: selectionReason(candidate),
      risks: fullTrainer || partialTrainer ? [] : ['Internal trainer availability gap'],
      requiresHumanApproval: !fullTrainer,
    });
  }

  toolTrace.push({
    tool: 'allocateTraineesTool',
    status: 'completed',
    detail: `Allocated DS01-backed trainees for ${enriched.length} candidates.`,
  });
  toolTrace.push({
    tool: 'estimateLearningPlanTool',
    status: 'completed',
    detail: 'Separated contact, self-study, and lab hours.',
  });
  toolTrace.push({
    tool: 'matchTrainersTool',
    status: 'completed',
    detail: 'Scanned every DS04 trainer and retained ranked candidates.',
  });
  toolTrace.push({
    tool: 'scorePrioritiesTool',
    status: 'completed',
    detail: 'Calculated multi-source score breakdowns.',
  });

  const sorted = enriched.sort(
    (left, right) => right.score - left.score || left.topic.localeCompare(right.topic),
  );
  const limit = promptLimit(args.userPrompt);
  const initiatives = limit ? sorted.slice(0, limit) : sorted;
  for (const item of sorted.slice(limit ?? sorted.length)) {
    unselectedCandidates.push({
      candidate: item.topic,
      reasonDropped: 'LOWER_PRIORITY_THAN_LIMIT',
      evidenceRefs: item.evidenceRefs,
      suggestedFix: 'Increase the requested initiative limit or revise prioritization weights.',
    });
  }
  toolTrace.push({
    tool: 'generateRoadmapTool',
    status: 'completed',
    detail: `Selected ${initiatives.length} roadmap initiatives with non-empty trainees and evidence.`,
  });

  const totalRecordsBySource = Object.fromEntries(
    ingested.inventory.map((item) => [item.sourceId, item.rowCount]),
  );
  const validRecordsBySource = Object.fromEntries(
    ingested.inventory.map((item) => [item.sourceId, item.validRows]),
  );
  const matchedTrainees = new Set(
    initiatives.flatMap((item) => item.trainees.map((trainee) => trainee.employeeId)),
  );
  const matchedTrainers = new Set(
    initiatives.flatMap((item) => item.trainerCandidates.map((trainer) => trainer.trainerId)),
  );
  const coverageTarget = parseCoverageTarget(args.userPrompt);
  const eligibleEmployees = evidenceIndex.filter((item) => {
    if (item.sourceId !== 'DS01') return false;
    if (!coverageTarget) return true;
    const role = valueFor(item, 'role');
    return /development|engineering|\bdev\b/i.test(coverageTarget.targetGroup)
      ? isDevelopmentTeam(role)
      : normalizeTokens(role).includes(normalizeTokens(coverageTarget.targetGroup));
  });
  const coverageResult = coverageTarget
    ? (() => {
        const totalEligibleEmployees = eligibleEmployees.length;
        const requiredTraineeCount = Math.ceil(
          (totalEligibleEmployees * coverageTarget.requiredPercent) / 100,
        );
        const selectedTraineeCount = [...matchedTrainees].filter((employeeId) =>
          eligibleEmployees.some((employee) => employee.entityId === employeeId),
        ).length;
        return {
          targetGroup: coverageTarget.targetGroup,
          totalEligibleEmployees,
          requiredCoveragePercent: coverageTarget.requiredPercent,
          requiredTraineeCount,
          selectedTraineeCount,
          achievedCoveragePercent:
            totalEligibleEmployees > 0
              ? Math.round((selectedTraineeCount / totalEligibleEmployees) * 10000) / 100
              : 0,
          coverageStatus:
            selectedTraineeCount >= requiredTraineeCount ? ('MET' as const) : ('NOT_MET' as const),
          missingTraineeCount: Math.max(0, requiredTraineeCount - selectedTraineeCount),
        };
      })()
    : undefined;
  const coverageReport: CoverageReport = {
    totalRecordsBySource,
    validRecordsBySource,
    candidateCount: generated.candidates.length + generated.dropped.length,
    selectedCount: initiatives.length,
    droppedCount: unselectedCandidates.length,
    unmatchedSkills: unselectedCandidates.map((item) => item.candidate),
    unmatchedTraineeRows: evidenceIndex
      .filter(
        (item) =>
          item.sourceId === 'DS01' &&
          item.skillGaps.length > 0 &&
          !matchedTrainees.has(item.entityId),
      )
      .map((item) => item.entityId),
    unmatchedTrainerRows: evidenceIndex
      .filter((item) => item.sourceId === 'DS04' && !matchedTrainers.has(item.entityId))
      .map((item) => item.entityId),
    warnings: ingested.warnings,
    ...(coverageResult ? { coverageResult } : {}),
  };

  return {
    runId: args.runId,
    inventory: ingested.inventory,
    evidenceIndex,
    ontology,
    candidates: generated.candidates,
    roadmap: { initiatives },
    coverageReport,
    unselectedCandidates,
    toolTrace,
  };
}

export interface DataDrivenQaFinding {
  issueCode: string;
  affectedItemId: string;
  blockingLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
}

export interface DataDrivenRevisionAction {
  issueCode: string;
  affectedItemId: string;
  blockingLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  requiredToolToRerun: string;
  expectedFix: string;
}

export function auditDataDrivenRoadmap(args: {
  inventory: DataInventoryItem[];
  coverageReport: CoverageReport;
  initiatives: DataDrivenRoadmapItem[];
}): { findings: DataDrivenQaFinding[]; revisionActions: DataDrivenRevisionAction[] } {
  const findings: DataDrivenQaFinding[] = [];
  const revisionActions: DataDrivenRevisionAction[] = [];
  const add = (
    item: DataDrivenRoadmapItem,
    issueCode: string,
    message: string,
    requiredToolToRerun: string,
    expectedFix: string,
  ) => {
    findings.push({ issueCode, affectedItemId: item.id, blockingLevel: 'HIGH', message });
    revisionActions.push({
      issueCode,
      affectedItemId: item.id,
      blockingLevel: 'HIGH',
      requiredToolToRerun,
      expectedFix,
    });
  };

  for (const item of args.initiatives) {
    if (
      item.trainees.length === 0 ||
      item.trainees.some((trainee) => trainee.evidenceRefs.length === 0)
    ) {
      add(
        item,
        'NO_TRAINEE_EVIDENCE',
        'Every selected roadmap item must have DS01-backed trainees.',
        'allocateTraineesTool',
        'Scan all DS01 rows and attach direct skill-gap evidence, or drop the item.',
      );
    }
    if (item.evidenceRefs.length === 0) {
      add(
        item,
        'MISSING_EVIDENCE_REFS',
        'The roadmap item has no evidence index references.',
        'buildEvidenceIndexTool',
        'Attach demand and feasibility evidence before roadmap generation.',
      );
    }
    if (!item.scoreBreakdown || Object.keys(item.scoreBreakdown).length === 0) {
      add(
        item,
        'MISSING_SCORE_BREAKDOWN',
        'Priority score has no multi-source breakdown.',
        'scorePrioritiesTool',
        'Recalculate the score with BOD, project, gap, survey, feasibility, trend, and risk components.',
      );
    }
    if (item.format === 'EXTERNAL_TRAINER' && !item.fallbackReason) {
      add(
        item,
        'INVALID_TRAINER_FALLBACK',
        'External delivery has no approved fallback reason.',
        'matchTrainersTool',
        'Rescan DS04 and record a valid skill, capacity, timeline, or confidence reason.',
      );
    }
  }

  for (const sourceId of ['DS01', 'DS02', 'DS03', 'DS04', 'DS05'] as const) {
    if (!args.inventory.some((item) => item.sourceId === sourceId)) {
      findings.push({
        issueCode: 'SOURCE_NOT_AUDITED',
        affectedItemId: sourceId,
        blockingLevel: 'HIGH',
        message: `${sourceId} is absent from the data inventory.`,
      });
      revisionActions.push({
        issueCode: 'SOURCE_NOT_AUDITED',
        affectedItemId: sourceId,
        blockingLevel: 'HIGH',
        requiredToolToRerun: 'ingestAllSourcesTool',
        expectedFix: `Record ${sourceId} in inventory, including a missing or malformed warning.`,
      });
    }
  }
  return { findings, revisionActions };
}

export function defaultTrainingDataDir(): string {
  const configured = process.env.TRAINING_ROADMAP_DATA_DIR;
  if (configured) return configured;
  const candidates = [resolve(process.cwd(), 'data'), resolve(process.cwd(), '../../data')];
  return (
    candidates.find((candidate) => existsSync(candidate) && readdirSync(candidate).length > 0) ??
    resolve(process.cwd(), 'data')
  );
}
