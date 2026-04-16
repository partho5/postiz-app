/**
 * Unit tests for proposal → confirm → apply pipeline — slice 1.4
 *
 * Uses an in-memory mock DB; no real Prisma / Postgres needed.
 * The business_profile applier is the primary test target because it has
 * the richest logic (upsert + field whitelist).
 */

import {
  createProposal,
  listPending,
  confirm,
  cancel,
  registerApplier,
  type ProposalDraft,
} from './proposals';
import { ApProposalStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// In-memory mock DB
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  organizationId: string;
  originMessageId: string | null;
  targetEntity: string;
  targetId: string | null;
  changes: object;
  rationale: string;
  expiresAt: Date;
  status: ApProposalStatus;
  createdAt: Date;
  decidedAt: Date | null;
};

type ProfileRow = {
  id: string;
  organizationId: string;
  niche: string;
  brandVoiceShort: string;
  brandVoiceExtended: string;
  goals: object;
  antiPatterns: object;
  regulatoryFlags: object;
  updatedBy: string;
  updatedAt: Date;
};

let nextId = 1;
function uid() {
  return `id-${nextId++}`;
}

function makeMockDb(
  initialProposals: ProposalRow[] = [],
  initialProfiles: ProfileRow[] = [],
) {
  const proposals = new Map<string, ProposalRow>(
    initialProposals.map((p) => [p.id, { ...p }]),
  );
  const profiles = new Map<string, ProfileRow>(
    initialProfiles.map((p) => [p.organizationId, { ...p }]),
  );

  return {
    apConfigChangeProposal: {
      async create({ data }: any): Promise<ProposalRow> {
        const row: ProposalRow = {
          id: uid(),
          organizationId: data.organizationId,
          originMessageId: data.originMessageId ?? null,
          targetEntity: data.targetEntity,
          targetId: data.targetId ?? null,
          changes: data.changes,
          rationale: data.rationale,
          expiresAt: data.expiresAt,
          status: data.status,
          createdAt: new Date(),
          decidedAt: null,
        };
        proposals.set(row.id, row);
        return { ...row };
      },
      async findUnique({ where }: any): Promise<ProposalRow | null> {
        return proposals.get(where.id) ? { ...proposals.get(where.id)! } : null;
      },
      async findMany({ where, orderBy }: any): Promise<ProposalRow[]> {
        const now = new Date();
        let results = [...proposals.values()].filter((p) => {
          if (where.organizationId && p.organizationId !== where.organizationId)
            return false;
          if (where.status && p.status !== where.status) return false;
          if (where.expiresAt?.gt && p.expiresAt <= now) return false;
          return true;
        });
        if (orderBy?.createdAt === 'desc') {
          results = results.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
        }
        return results.map((r) => ({ ...r }));
      },
      async update({ where, data }: any): Promise<ProposalRow> {
        const row = proposals.get(where.id);
        if (!row) throw new Error(`Proposal ${where.id} not found`);
        Object.assign(row, data);
        return { ...row };
      },
    },

    apBusinessProfile: {
      async upsert({ where, create, update }: any): Promise<ProfileRow> {
        const existing = profiles.get(where.organizationId);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row: ProfileRow = {
          id: uid(),
          organizationId: where.organizationId,
          niche: create.niche ?? '',
          brandVoiceShort: create.brandVoiceShort ?? '',
          brandVoiceExtended: create.brandVoiceExtended ?? '',
          goals: create.goals ?? [],
          antiPatterns: create.antiPatterns ?? [],
          regulatoryFlags: create.regulatoryFlags ?? [],
          updatedBy: create.updatedBy ?? 'AI',
          updatedAt: new Date(),
        };
        profiles.set(row.organizationId, row);
        return { ...row };
      },
    },

    // Expose internals for assertions
    _proposals: proposals,
    _profiles: profiles,
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = 'org-1';
const PAST = new Date(Date.now() - 60_000);   // 1 min ago
const FUTURE = new Date(Date.now() + 3_600_000); // 1 hr ahead

function pendingProposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: uid(),
    organizationId: TENANT,
    originMessageId: null,
    targetEntity: 'business_profile',
    targetId: null,
    changes: { niche: 'SaaS' },
    rationale: 'User said SaaS.',
    expiresAt: FUTURE,
    status: ApProposalStatus.PENDING,
    createdAt: new Date(),
    decidedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createProposal
// ---------------------------------------------------------------------------

describe('createProposal', () => {
  it('persists the proposal and returns its id', async () => {
    const db = makeMockDb();
    const draft: ProposalDraft = {
      targetEntity: 'business_profile',
      changes: { niche: 'Fintech' },
      rationale: 'User mentioned fintech.',
    };

    const id = await createProposal(db, TENANT, draft);
    expect(typeof id).toBe('string');
    expect(db._proposals.has(id)).toBe(true);

    const row = db._proposals.get(id)!;
    expect(row.status).toBe(ApProposalStatus.PENDING);
    expect(row.targetEntity).toBe('business_profile');
    expect(row.changes).toEqual({ niche: 'Fintech' });
  });

  it('sets expiresAt based on expiresInMinutes (default 60)', async () => {
    const db = makeMockDb();
    const before = Date.now();
    const id = await createProposal(db, TENANT, {
      targetEntity: 'business_profile',
      changes: {},
      rationale: 'r',
    });
    const after = Date.now();

    const row = db._proposals.get(id)!;
    const expiresMs = row.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 100);
  });

  it('stores originMessageId when provided', async () => {
    const db = makeMockDb();
    const id = await createProposal(
      db,
      TENANT,
      { targetEntity: 'business_profile', changes: {}, rationale: 'r' },
      'msg-42',
    );
    expect(db._proposals.get(id)!.originMessageId).toBe('msg-42');
  });
});

// ---------------------------------------------------------------------------
// listPending
// ---------------------------------------------------------------------------

describe('listPending', () => {
  it('returns only PENDING, non-expired proposals for the tenant', async () => {
    const p1 = pendingProposal({ id: uid() });
    const expired = pendingProposal({ id: uid(), expiresAt: PAST });
    const cancelled = pendingProposal({
      id: uid(),
      status: ApProposalStatus.CANCELLED,
    });
    const otherTenant = pendingProposal({ id: uid(), organizationId: 'org-2' });

    const db = makeMockDb([p1, expired, cancelled, otherTenant]);
    const results = await listPending(db, TENANT);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(p1.id);
  });

  it('returns an empty array when nothing is pending', async () => {
    const db = makeMockDb();
    const results = await listPending(db, TENANT);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// confirm — business_profile applier
// ---------------------------------------------------------------------------

describe('confirm — business_profile', () => {
  it('applies changes to business_profile and marks proposal APPLIED', async () => {
    const proposal = pendingProposal({
      changes: { niche: 'SaaS', brandVoiceShort: 'Bold' },
    });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(true);
    // Proposal status updated
    expect(db._proposals.get(proposal.id)!.status).toBe(ApProposalStatus.APPLIED);
    // Profile row created
    const profile = db._profiles.get(TENANT)!;
    expect(profile).toBeDefined();
    expect(profile.niche).toBe('SaaS');
    expect(profile.brandVoiceShort).toBe('Bold');
  });

  it('upserts when business_profile already exists', async () => {
    const proposal = pendingProposal({ changes: { niche: 'Fintech' } });
    const existingProfile: ProfileRow = {
      id: uid(),
      organizationId: TENANT,
      niche: 'OldNiche',
      brandVoiceShort: 'Calm',
      brandVoiceExtended: 'Very calm tone.',
      goals: [],
      antiPatterns: [],
      regulatoryFlags: [],
      updatedBy: 'USER',
      updatedAt: new Date(),
    };
    const db = makeMockDb([proposal], [existingProfile]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(true);
    expect(db._profiles.get(TENANT)!.niche).toBe('Fintech');
  });

  it('silently ignores non-whitelisted change fields', async () => {
    const proposal = pendingProposal({
      changes: { niche: 'Health', internalField: 'hack' },
    });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(true);
    const profile = db._profiles.get(TENANT)!;
    expect(profile.niche).toBe('Health');
    // internalField should NOT be on the profile object
    expect((profile as any).internalField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// confirm — guard conditions
// ---------------------------------------------------------------------------

describe('confirm — guard conditions', () => {
  it('returns not_found when the proposal does not exist', async () => {
    const db = makeMockDb();
    const result = await confirm(db, 'no-such-id');
    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('not_found');
  });

  it('returns expired for a proposal past its expiresAt', async () => {
    const proposal = pendingProposal({ expiresAt: PAST });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('expired');
    // Also persisted as EXPIRED in DB
    expect(db._proposals.get(proposal.id)!.status).toBe(ApProposalStatus.EXPIRED);
  });

  it('returns wrong_status for an already-cancelled proposal', async () => {
    const proposal = pendingProposal({
      status: ApProposalStatus.CANCELLED,
    });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('wrong_status');
  });

  it('returns no_applier for an unknown target entity', async () => {
    const proposal = pendingProposal({ targetEntity: 'cadence_config' });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('no_applier');
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('marks the proposal as CANCELLED', async () => {
    const proposal = pendingProposal();
    const db = makeMockDb([proposal]);

    await cancel(db, proposal.id);

    expect(db._proposals.get(proposal.id)!.status).toBe(ApProposalStatus.CANCELLED);
  });
});

// ---------------------------------------------------------------------------
// registerApplier — extension point
// ---------------------------------------------------------------------------

describe('registerApplier', () => {
  it('custom applier is called on confirm', async () => {
    const applierFn = jest.fn().mockResolvedValue(undefined);
    registerApplier('custom_entity', applierFn);

    const proposal = pendingProposal({
      targetEntity: 'custom_entity',
      changes: { foo: 'bar' },
    });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(true);
    expect(applierFn).toHaveBeenCalledTimes(1);
    expect(applierFn).toHaveBeenCalledWith(
      db,
      TENANT,
      null,
      { foo: 'bar' },
    );
  });

  it('returns apply_error when the applier throws', async () => {
    registerApplier('failing_entity', async () => {
      throw new Error('DB exploded');
    });

    const proposal = pendingProposal({ targetEntity: 'failing_entity' });
    const db = makeMockDb([proposal]);

    const result = await confirm(db, proposal.id);

    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('apply_error');
    expect((result as any).message).toContain('DB exploded');
  });
});
