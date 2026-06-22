import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  PageChrome,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@seta/shared-ui';
import { AlertCircle, BarChart3, Database, Play, Route, ShieldCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  runTrainingRoadmap,
  submitReviewDecision,
  submitRevisionFeedback,
  type TrainingRoadmapDataSource,
} from '../api/training-roadmap-client.ts';
import { AnalysisKpiStrip } from '../components/analysis-kpi-strip.tsx';
import { DataCoveragePanel } from '../components/data-coverage-panel.tsx';
import { DatasetReadinessPanel } from '../components/dataset-readiness-panel.tsx';
import { ExecutionLogPanel } from '../components/execution-log-panel.tsx';
import { ExportProposalCard } from '../components/export-proposal-card.tsx';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { PriorityScoreTable } from '../components/priority-score-table.tsx';
import { QaFindingsPanel } from '../components/qa-findings-panel.tsx';
import { RoadmapGenerationStatus } from '../components/roadmap-generation-status.tsx';
import { RoadmapTable } from '../components/roadmap-table.tsx';
import { SkillGapTable } from '../components/skill-gap-table.tsx';
import { TrainerReadinessPanel } from '../components/trainer-readiness-panel.tsx';
import { member1AnalysisSnapshot } from '../data/member1-analysis-snapshot.ts';
import type { ApprovalDecision, RoadmapResult } from '../types.ts';

type View = 'data' | 'analysis' | 'roadmap';

const decisionLog: Record<ApprovalDecision, string> = {
  approved: 'Human reviewer approved the roadmap.',
  approved_with_risks: 'Human reviewer approved the roadmap with acknowledged risks.',
  revision_requested: 'Human reviewer requested a revision.',
  rejected: 'Human reviewer rejected the roadmap.',
};

export function TrainingRoadmapDemoPage() {
  const [result, setResult] = useState<RoadmapResult | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<TrainingRoadmapDataSource | null>(null);
  const [view, setView] = useState<View>('data');
  const [loading, setLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');

  const handleRun = useCallback(async () => {
    if (loading || reviewSubmitting) return;
    setLoading(true);
    setError(null);
    setApprovalToken(null);
    setView('roadmap');

    try {
      const response = await runTrainingRoadmap(userPrompt);
      setResult(response.data);
      setDataSource(response.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run training roadmap pipeline');
    } finally {
      setLoading(false);
    }
  }, [loading, reviewSubmitting, userPrompt]);

  const handleDecision = useCallback(
    async (decision: Exclude<ApprovalDecision, 'revision_requested'>, approvalNote?: string) => {
      if (!result) return;

      setReviewSubmitting(true);
      setError(null);

      try {
        const response = await submitReviewDecision(result.runId, decision, approvalNote);
        setApprovalToken(response.data.approvalToken);
        setDataSource(response.source);
        setResult((current) =>
          current
            ? {
                ...current,
                reviewStatus: response.data.reviewStatus,
                approvalToken: response.data.approvalToken,
                approvalNotes: response.data.approvalNotes,
                approvedBy: response.data.approvedBy,
                approvedAt: response.data.approvedAt,
                executionLog: [...current.executionLog, decisionLog[response.data.reviewStatus]],
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

      setReviewSubmitting(true);
      setError(null);
      setApprovalToken(null);

      try {
        const response = await submitRevisionFeedback(result.runId, feedback);
        setResult(response.data);
        setDataSource(response.source);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to regenerate training roadmap');
      } finally {
        setReviewSubmitting(false);
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
        <Button onClick={handleRun} disabled={loading || reviewSubmitting}>
          <Play aria-hidden />
          {result ? 'Generate Again' : 'Generate Roadmap'}
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
            Press Enter to generate · Shift+Enter for a new line
          </div>
        </div>
        <Alert variant="info">
          <ShieldCheck aria-hidden className="size-4" />
          <AlertTitle>Member 1 snapshot is ready</AlertTitle>
          <AlertDescription>
            Pipeline {member1AnalysisSnapshot.pipelineVersion} · run date{' '}
            {member1AnalysisSnapshot.runDate} · all five source files validated. The bundled
            snapshot keeps this demo stable while Member 2 completes roadmap generation.
          </AlertDescription>
        </Alert>

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

            {loading && <RoadmapGenerationStatus />}

            {!loading && !result && (
              <EmptyState
                icon={<Route className="size-6" />}
                title="Analysis ready for roadmap generation"
                description="Generate a provisional draft now. Member 2 can replace the mock response without changing the review UI."
                action={{ label: 'Generate Roadmap', onClick: handleRun }}
              />
            )}

            {!loading && result && (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-canvas px-4 py-3">
                  <div>
                    <div className="font-medium text-ink">Roadmap run {result.runId}</div>
                    <div className="text-caption text-ink-subtle">
                      Response received from the training-roadmap API.
                    </div>
                  </div>
                  <Badge variant={dataSource === 'api' ? 'success' : 'secondary'}>
                    API connected
                  </Badge>
                </div>
                <ExecutionLogPanel logs={result.executionLog} />
                <DataCoveragePanel result={result} />
                <RoadmapTable initiatives={result.initiatives} />
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
                    disabled={reviewSubmitting}
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
