# @seta/training-roadmap

Evidence-backed training-roadmap generation and review. The module owns a deterministic data-first coordinator, a run-scoped Agent 1 artifact, QA/revision control, human feedback, approval, versioning, and guarded export.

## Runtime contract

- `POST /api/training-roadmap/run` runs generation and QA as one controller flow and returns the final `RoadmapResult`.
- `POST /api/training-roadmap/feedback` reruns that same flow for the existing `runId` and creates a new final version.
- `POST /api/training-roadmap/qa` re-audits an existing artifact without mutating it; it is not the primary UI journey.
- `POST /api/training-roadmap/approve` and `/export` consume the persisted QA result and cannot bypass its decision.

Agent 1 and QA exchange `roadmap_output_agent.json` under the run-scoped `ASTRA_SCRATCH_DIR`; they do not rely on conversational delegation.

When QA requests revision, the controller reruns the deterministic coordinator from source data and records a new artifact revision. Resolved alignment/fallback warnings remain visible to human reviewers but are excluded from QA score deductions.

## Public surface

- `@seta/training-roadmap` — application services (Node)
- `@seta/training-roadmap/events` — event type constants + zod payload schemas
- `@seta/training-roadmap/rbac` — permission constants
- `@seta/training-roadmap/contracts` — browser-safe DTOs + zod schemas
- `@seta/training-roadmap/register` — `ContributionRegistry` hook (Node)

## Events emitted

_(none yet)_

## Events consumed

_(none yet)_

## RBAC

Module permissions are declared as a typed `statement` in `src/rbac.ts` and built into a `ModuleRbacManifest` via `toManifest(...)` from `@seta/shared-rbac`.

**Important:** the statement in `src/rbac.ts` is not the source of truth on its own — it must be mirrored into `packages/shared-rbac/src/inventory.ts` (the `INVENTORY` array). The runtime resolver, the `gen:rbac` codegen, and `@seta/identity` all build the permission registry from `INVENTORY` via `inventoryToManifests(INVENTORY)`. Until this module's permissions appear in `INVENTORY`, the aggregate parity test (`apps/server/tests/unit/rbac-registry-parity.test.ts`) will flag the module — that guardrail is intentional.

After updating both files (keep resources, actions, role permissions, and role descriptions identical):

1. Run `pnpm gen:rbac` to regenerate the `PermissionKey` union in `packages/shared-rbac/src/generated/`.
2. Add a per-module parity test — copy `packages/knowledge/tests/unit/rbac-parity.test.ts` as a starting point.

See `packages/knowledge/src/rbac.ts` for a complete example.
