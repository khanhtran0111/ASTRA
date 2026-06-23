import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  PageChrome,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@seta/shared-ui';
import { AlertCircle, BarChart3, Database, Loader2, Play, Route } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePanelUI } from '@/modules/agent/chat-experience/agent-provider';
import {
  runTrainingRoadmap,
  submitReviewDecision,
  submitRevisionFeedback,
  TrainingRoadmapIntentHandoffError,
} from '../api/training-roadmap-client.ts';
import { AnalysisKpiStrip } from '../components/analysis-kpi-strip.tsx';
import { DataCoveragePanel } from '../components/data-coverage-panel.tsx';
import { DatasetReadinessPanel } from '../components/dataset-readiness-panel.tsx';
import { ExportProposalCard } from '../components/export-proposal-card.tsx';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { PriorityScoreTable } from '../components/priority-score-table.tsx';
import { QaFindingsPanel } from '../components/qa-findings-panel.tsx';
import { RoadmapProgressStatus } from '../components/roadmap-progress-status.tsx';
import { RoadmapTable } from '../components/roadmap-table.tsx';
import { SkillGapTable } from '../components/skill-gap-table.tsx';
import { TrainerReadinessPanel } from '../components/trainer-readiness-panel.tsx';
import { member1AnalysisSnapshot } from '../data/member1-analysis-snapshot.ts';
import type {
  ApprovalDecision,
  DraftRoadmapOutput,
  RoadmapResult,
  TrainingInitiative,
} from '../types.ts';

type View = 'data' | 'analysis' | 'roadmap';

function flattenDraftRoadmap(draft?: DraftRoadmapOutput): TrainingInitiative[] {
  if (!draft) return [];

  return Object.entries(draft.quarters).flatMap(([quarter, items]) =>
    items.map((item) => ({
      id: item.classId,
      topic: item.topic,
      priority: item.priorityScore >= 85 ? 'P1' : item.priorityScore >= 65 ? 'P2' : ('P3' as const),
      score: item.priorityScore,
      quarter: quarter.replace(/_/g, ' '),
      targetTrainees: item.trainees,
      trainerName: item.resource.trainerId,
      format: item.resource.isExternalRequired ? 'external' : 'internal',
      estimatedHours: item.estimatedHours,
      evidence: item.evidence,
      riskFlags: [],
    })),
  );
}

export function TrainingRoadmapDemoPage() {
  const { setPanelOpen, setPendingPrompt } = usePanelUI();
  const [result, setResult] = useState<RoadmapResult | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [view, setView] = useState<View>('data');
  const [loading, setLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const visibleInitiatives = !result
    ? []
    : result.initiatives.length > 0
      ? result.initiatives
      : result.draftInitiatives?.length
        ? result.draftInitiatives
        : flattenDraftRoadmap(result.draftRoadmap);
  const showingDraftFallback =
    Boolean(result && result.initiatives.length === 0) && visibleInitiatives.length > 0;

  const handleRun = useCallback(async () => {
    if (loading || reviewSubmitting || revisionSubmitting) return;
    setLoading(true);
    setError(null);
    setHandoffMessage(null);
    setApprovalToken(null);
    setView('roadmap');

    try {
      const response = await runTrainingRoadmap(userPrompt);
      setResult(response.data);
    } catch (err) {
      if (err instanceof TrainingRoadmapIntentHandoffError) {
        setHandoffMessage(err.message);
        setPendingPrompt({ text: userPrompt, autoSend: true });
        setPanelOpen(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to run training roadmap pipeline');
      }
    } finally {
      setLoading(false);
    }
  }, [loading, reviewSubmitting, revisionSubmitting, setPanelOpen, setPendingPrompt, userPrompt]);

  const handleDecision = useCallback(
    async (decision: Exclude<ApprovalDecision, 'revision_requested'>, approvalNote?: string) => {
      if (!result) return;

      setReviewSubmitting(true);
      setError(null);

      try {
        const response = await submitReviewDecision(result.runId, decision, approvalNote);
        setApprovalToken(response.data.approvalToken);
        setResult((current) =>
          current
            ? {
                ...current,
                reviewStatus: response.data.reviewStatus,
                approvalToken: response.data.approvalToken,
                approvalNotes: response.data.approvalNotes,
                approvedBy: response.data.approvedBy,
                approvedAt: response.data.approvedAt,
              }
            : current,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit review decision');
      } finally {
        setReviewSubmitting(false);
      }
    },
    [result],
  );

  const handleRevision = useCallback(
    async (feedback: string) => {
      if (!result) return;

      setRevisionSubmitting(true);
      setError(null);
      setApprovalToken(null);

      try {
        const response = await submitRevisionFeedback(result.runId, feedback);
        setResult(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to regenerate training roadmap');
      } finally {
        setRevisionSubmitting(false);
      }
    },
    [result],
  );

  return (
    <PageChrome
      breadcrumb={['ASTRA']}
      title="Training Roadmap"
      subtitle="Data readiness, evidence-backed analysis, and human review"
      actions={
        <Button onClick={handleRun} disabled={loading || reviewSubmitting || revisionSubmitting}>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {loading ? 'Generating roadmap' : result ? 'Generate Again' : 'Generate Roadmap'}
        </Button>
      }
    >
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="userPrompt" className="text-sm font-medium">
            Constraints Prompt
          </label>
          <Textarea
            id="userPrompt"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleRun();
              }
            }}
            placeholder="Hãy tạo lộ trình đào tạo Q3 cho team Frontend gồm 12 nhân sự Mid-level. Mục tiêu là nâng cao React..."
            rows={3}
          />
          <div className="text-caption text-ink-subtle">
            Press Enter to generate · Shift+Enter for a new line · Task and people requests open
            Agent Chat
          </div>
        </div>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="data">
              <Database aria-hidden className="mr-2 size-4" />
              Dataset
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <BarChart3 aria-hidden className="mr-2 size-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="roadmap">
              <Route aria-hidden className="mr-2 size-4" />
              Roadmap &amp; Review
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-4">
            <DatasetReadinessPanel snapshot={member1AnalysisSnapshot} />
            <AnalysisKpiStrip snapshot={member1AnalysisSnapshot} />
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <AnalysisKpiStrip snapshot={member1AnalysisSnapshot} />
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
              <SkillGapTable gaps={member1AnalysisSnapshot.skillGaps} />
              <TrainerReadinessPanel snapshot={member1AnalysisSnapshot} />
            </div>
            <PriorityScoreTable priorities={member1AnalysisSnapshot.priorities} />
            <Alert>
              <AlertDescription>
                Scoring formula: {member1AnalysisSnapshot.scoringFormula}. Priority totals are{' '}
                <strong>{member1AnalysisSnapshot.priorityCounts.P1} P1</strong>,{' '}
                <strong>{member1AnalysisSnapshot.priorityCounts.P2} P2</strong>, and{' '}
                <strong>{member1AnalysisSnapshot.priorityCounts.P3} P3</strong>.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="roadmap" className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {handoffMessage && (
              <Alert variant="info">
                <Route aria-hidden className="size-4" />
                <AlertTitle>Prompt routed to Agent Chat</AlertTitle>
                <AlertDescription>{handoffMessage}</AlertDescription>
              </Alert>
            )}

            {loading && <RoadmapProgressStatus mode="generate" />}
            {revisionSubmitting && <RoadmapProgressStatus mode="revision" />}

            {!loading && !result && (
              <EmptyState
                icon={<Route className="size-6" />}
                title="Ready to generate a roadmap"
                description="Enter the training constraints, then generate a draft for review."
                action={{ label: 'Generate Roadmap', onClick: handleRun }}
              />
            )}

            {!loading && result && (
              <div className="grid gap-4">
                <DataCoveragePanel result={result} />
                {showingDraftFallback && (
                  <Alert variant="info">
                    <AlertDescription>
                      Showing the generated draft because quality review has not produced final
                      initiatives yet.
                    </AlertDescription>
                  </Alert>
                )}
                <RoadmapTable initiatives={visibleInitiatives} />
                <QaFindingsPanel
                  findings={result.qaFindings}
                  score={result.qaScore}
                  riskLevel={result.riskLevel}
                  riskReason={result.riskReason}
                  qaDecision={result.qaDecision}
                  blockingIssues={result.blockingIssues}
                  revisionInstructions={result.revisionInstructions}
                  dataRevisionActions={result.dataRevisionActions}
                />
                <div className="grid gap-4 xl:grid-cols-2">
                  <HitlApprovalCard
                    runId={result.runId}
                    reviewStatus={result.reviewStatus}
                    qaDecision={result.qaDecision}
                    approvalRequirement={result.approvalRequirement}
                    reviewPack={result.reviewPack}
                    onDecision={handleDecision}
                    onRevision={handleRevision}
                    disabled={reviewSubmitting || revisionSubmitting}
                  />
                  <ExportProposalCard result={result} approvalToken={approvalToken} />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageChrome>
  );
}
