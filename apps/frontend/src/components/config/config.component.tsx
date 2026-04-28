'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TZ = 'UTC';

function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  chat_direct_action: 'set via autopilot',
  orchestrator: 'AI generated',
  copywriter_agent: 'AI generated',
  user: 'manual',
};

function sourceLabel(src: string): string {
  return SOURCE_LABELS[src] ?? src.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Tab 1 — Post Stack
// ---------------------------------------------------------------------------

interface PostCandidate {
  id: string;
  platform: string;
  content: string;
  status: 'PENDING' | 'SCHEDULED' | 'RESERVED' | 'PUBLISHED' | 'EXPIRED' | 'FAILED';
  priority: number;
  source: string;
  expiresAt: string | null;
  createdAt: string;
  apScheduledSlot?: { scheduledAt: string }[];
  apPublishedPost?: { publishedAt: string }[];
}

const STATUS_STYLES: Record<PostCandidate['status'], string> = {
  PENDING:   'bg-yellow-500/20 text-yellow-400',
  SCHEDULED: 'bg-purple-500/20 text-purple-400',
  RESERVED:  'bg-blue-500/20 text-blue-400',
  PUBLISHED: 'bg-green-500/20 text-green-400',
  EXPIRED:   'bg-gray-500/20 text-gray-400',
  FAILED:    'bg-red-500/20 text-red-400',
};

const PostStackTab: FC = () => {
  const fetch = useFetch();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPriority, setEditPriority] = useState(0);

  const { data, mutate, isLoading } = useSWR('/autopilot/stack', async () => {
    const res = await fetch('/autopilot/stack');
    return (await res.json()) as { candidates: PostCandidate[] };
  }, { revalidateOnFocus: false });

  const startEdit = useCallback((c: PostCandidate) => {
    setEditingId(c.id);
    setEditContent(c.content);
    setEditPriority(c.priority);
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    await fetch(`/autopilot/stack/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: editContent, priority: editPriority }),
    });
    setEditingId(null);
    mutate();
  }, [editContent, editPriority, fetch, mutate]);

  const remove = useCallback(async (id: string) => {
    if (!(await deleteDialog('Remove this post from the stack?', 'Yes, remove'))) return;
    await fetch(`/autopilot/stack/${id}`, { method: 'DELETE' });
    mutate();
  }, [fetch, mutate]);

  const candidates = data?.candidates ?? [];

  if (isLoading) return <Spinner />;
  if (candidates.length === 0) return <Empty>No posts in the stack.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-textColor/50 text-xs">{candidates.length} item(s)</div>
      {candidates.map((c) => (
        <div key={c.id} className="rounded-[8px] border border-white/10 bg-newBgColorInner p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-sm text-textColor capitalize">{c.platform}</span>
            <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_STYLES[c.status])}>
              {c.status === 'PENDING' ? 'Queued' : c.status === 'RESERVED' ? 'Processing' : c.status.charAt(0) + c.status.slice(1).toLowerCase()}
            </span>
            {c.status === 'SCHEDULED' && c.apScheduledSlot?.[0] && (
              <span className="text-xs text-textColor/50">for {fmtTime(c.apScheduledSlot[0].scheduledAt)}</span>
            )}
            {c.status === 'PUBLISHED' && c.apPublishedPost?.[0] && (
              <span className="text-xs text-green-400/70">{fmtTime(c.apPublishedPost[0].publishedAt)}</span>
            )}
            {c.priority !== 999 && (
              <span className="text-xs text-textColor/50">priority {c.priority}</span>
            )}
            <span className="text-xs text-textColor/50">via {sourceLabel(c.source)}</span>
            {c.expiresAt && (
              <span className="text-xs text-textColor/50 ml-auto">
                expires {dayjs(c.expiresAt).format('MMM D, HH:mm')}
              </span>
            )}
          </div>

          {editingId === c.id && c.status !== 'PUBLISHED' ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm p-2 resize-y min-h-[100px] focus:outline-none focus:border-white/30"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-textColor/50 w-16">Priority</label>
                <input
                  type="number"
                  className="w-20 rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm p-1 focus:outline-none"
                  value={editPriority}
                  onChange={(e) => setEditPriority(Number(e.target.value))}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveEdit(c.id)}>Save</Button>
                <button className="text-xs text-textColor/50 hover:text-textColor px-3" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-textColor/80 whitespace-pre-line line-clamp-3">{c.content}</p>
              {c.status !== 'PUBLISHED' && (
              <div className="flex gap-2 mt-1">
                <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => startEdit(c)}>Edit</button>
                <button className="text-xs text-red-400 hover:text-red-300" onClick={() => remove(c.id)}>Delete</button>
              </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 2 — Scheduled Slots
// ---------------------------------------------------------------------------

interface ScheduledSlot {
  id: string;
  platform: string;
  scheduledAt: string;
  postCandidateId: string | null;
  type: 'pinned' | 'stack';
}

const ScheduledTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading } = useSWR('/autopilot/slots', async () => {
    const res = await fetch('/autopilot/slots');
    return (await res.json()) as { slots: ScheduledSlot[] };
  }, { revalidateOnFocus: false });

  const cancel = useCallback(async (id: string) => {
    if (!(await deleteDialog('Cancel this scheduled post?', 'Yes, cancel'))) return;
    await fetch(`/autopilot/slots/${id}`, { method: 'DELETE' });
    mutate();
  }, [fetch, mutate]);

  const slots = data?.slots ?? [];
  if (isLoading) return <Spinner />;
  if (slots.length === 0) return <Empty>No posts scheduled yet.</Empty>;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-textColor/50 text-xs">{slots.length} upcoming</div>
      {slots.map((s) => (
        <div key={s.id} className="rounded-[8px] border border-white/10 bg-newBgColorInner px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-semibold text-textColor capitalize flex-shrink-0">{s.platform}</span>
          <span className="text-xs text-textColor/70 flex-1">{fmtTime(s.scheduledAt)}</span>
          <span className={clsx(
            'text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0',
            s.type === 'pinned' ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400',
          )}>
            {s.type === 'pinned' ? 'Pinned' : 'Stack'}
          </span>
          <button className="text-xs text-red-400 hover:text-red-300 flex-shrink-0" onClick={() => cancel(s.id)}>
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 3 — Cadence
// ---------------------------------------------------------------------------

interface CadenceRow {
  id: string | null;
  platform: string;
  postsPerDay: number;
  preferredTimes: { time: number }[];
  timezone: string;
  active: boolean;
  pausedUntil: string | null;
  isDefault: boolean;
}

const MINUTES_IN_DAY = 24 * 60;

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const CadenceRow: FC<{ row: CadenceRow; onSaved: () => void }> = ({ row, onSaved }) => {
  const fetch = useFetch();
  const [postsPerDay, setPostsPerDay] = useState(row.postsPerDay);
  const [times, setTimes] = useState<{ time: number }[]>(row.preferredTimes);
  const [active, setActive] = useState(row.active);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newTime, setNewTime] = useState('09:00');

  const dirty =
    postsPerDay !== row.postsPerDay ||
    active !== row.active ||
    JSON.stringify(times) !== JSON.stringify(row.preferredTimes);

  const addTime = useCallback(() => {
    const mins = hhmmToMinutes(newTime);
    if (!times.find((t) => t.time === mins)) {
      setTimes((prev) => [...prev, { time: mins }].sort((a, b) => a.time - b.time));
    }
  }, [newTime, times]);

  const removeTime = useCallback((mins: number) => {
    setTimes((prev) => prev.filter((t) => t.time !== mins));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMsg('');
    await fetch(`/autopilot/cadence/${row.platform}`, {
      method: 'PATCH',
      body: JSON.stringify({ postsPerDay, preferredTimes: times, active }),
    });
    setSaving(false);
    setMsg('Saved');
    onSaved();
    setTimeout(() => setMsg(''), 2500);
  }, [postsPerDay, times, active, row.platform, fetch, onSaved]);

  return (
    <div className="rounded-[8px] border border-white/10 bg-newBgColorInner p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-textColor capitalize">{row.platform}</span>
        {row.isDefault && <span className="text-[11px] text-textColor/40 bg-white/5 px-2 py-0.5 rounded-full">defaults</span>}
        {row.pausedUntil && new Date(row.pausedUntil) > new Date() && (
          <span className="text-[11px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
            paused until {dayjs(row.pausedUntil).format('MMM D HH:mm')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textColor/50">Posts per day</label>
          <input
            type="number" min={1} max={20}
            className="rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none focus:border-white/30"
            value={postsPerDay}
            onChange={(e) => setPostsPerDay(Math.max(1, Math.min(20, Number(e.target.value))))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textColor/50">Active</label>
          <button
            onClick={() => setActive((v) => !v)}
            className={clsx(
              'text-xs font-medium px-3 py-2 rounded-[6px] border transition-colors text-left',
              active ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-textColor/50',
            )}
          >
            {active ? 'Active' : 'Paused'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-textColor/50">
          Preferred posting times
          <span className="ml-1 text-textColor/30">(empty = spread evenly through the day)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {times.map((t) => (
            <span key={t.time} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-textColor/80">
              {minutesToHHMM(t.time)}
              <button className="ml-1 text-textColor/30 hover:text-red-400 leading-none" onClick={() => removeTime(t.time)}>×</button>
            </span>
          ))}
          {times.length === 0 && <span className="text-xs text-textColor/30">none set</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            className="rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-1.5 focus:outline-none focus:border-white/30"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
          />
          <button
            className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 border border-blue-400/30 rounded-[6px]"
            onClick={addTime}
          >
            + Add time
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</Button>
        {msg && <span className="text-xs text-green-400">{msg}</span>}
      </div>
    </div>
  );
};

const CadenceTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading, isValidating } = useSWR('/autopilot/cadence', async () => {
    const res = await fetch('/autopilot/cadence');
    return (await res.json()) as { cadence: CadenceRow[] };
  }, { revalidateOnFocus: true });

  const cadence = data?.cadence ?? [];
  if (isLoading || (isValidating && cadence.length === 0)) return <Spinner />;
  if (cadence.length === 0) return (
    <div className="flex flex-col gap-3">
      <Empty>No connected channels found. Connect a channel first.</Empty>
      <button
        className="text-xs text-blue-400 hover:text-blue-300 self-start px-3 py-1.5 border border-blue-400/30 rounded-[6px]"
        onClick={() => mutate()}
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {cadence.map((row) => (
        <CadenceRow key={row.platform} row={row} onSaved={mutate} />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 4 — Business Profile
// ---------------------------------------------------------------------------

interface BusinessProfile {
  niche: string;
  brandVoiceShort: string;
  brandVoiceExtended: string;
  goals: string[];
  antiPatterns: string[];
  regulatoryFlags: string[];
  isDefault: boolean;
}

const StringArrayEditor: FC<{
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
}> = ({ label, hint, value, onChange }) => {
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-textColor/50">{label}
        {hint && <span className="ml-1 text-textColor/30">{hint}</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        {value.map((v, i) => (
          <span key={i} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-textColor/80">
            {v}
            <button className="ml-1 text-textColor/30 hover:text-red-400" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-textColor/30">none</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-1.5 focus:outline-none focus:border-white/30"
          placeholder="Type and press Add…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onChange([...value, draft.trim()]);
              setDraft('');
            }
          }}
        />
        <button
          className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 border border-blue-400/30 rounded-[6px]"
          onClick={() => { if (draft.trim()) { onChange([...value, draft.trim()]); setDraft(''); } }}
        >
          Add
        </button>
      </div>
    </div>
  );
};

const ProfileTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading } = useSWR('/autopilot/profile', async () => {
    const res = await fetch('/autopilot/profile');
    return (await res.json()) as BusinessProfile;
  }, { revalidateOnFocus: false });

  const [form, setForm] = useState<BusinessProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  const f = form ?? data;
  if (isLoading || !f) return <Spinner />;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMsg('');
    await fetch('/autopilot/profile', { method: 'PATCH', body: JSON.stringify(form) });
    setSaving(false);
    setMsg('Saved');
    mutate();
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-textColor/50">Niche</label>
        <input
          className="rounded-[8px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none focus:border-white/30"
          value={f.niche}
          placeholder="e.g. SaaS, E-commerce, Fitness…"
          onChange={(e) => setForm((prev) => ({ ...(prev ?? f), niche: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-textColor/50">Brand voice <span className="text-textColor/30">(short, 1–2 sentences)</span></label>
        <input
          className="rounded-[8px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none focus:border-white/30"
          value={f.brandVoiceShort}
          placeholder="Friendly, concise, data-driven…"
          onChange={(e) => setForm((prev) => ({ ...(prev ?? f), brandVoiceShort: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-textColor/50">Brand voice <span className="text-textColor/30">(extended)</span></label>
        <textarea
          rows={4}
          className="rounded-[8px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none focus:border-white/30 resize-y"
          value={f.brandVoiceExtended}
          placeholder="Describe your brand's communication style in detail…"
          onChange={(e) => setForm((prev) => ({ ...(prev ?? f), brandVoiceExtended: e.target.value }))}
        />
      </div>
      <StringArrayEditor
        label="Goals"
        hint="(e.g. grow LinkedIn following, drive signups)"
        value={f.goals}
        onChange={(goals) => setForm((prev) => ({ ...(prev ?? f), goals }))}
      />
      <StringArrayEditor
        label="Anti-patterns"
        hint="(topics or styles to avoid)"
        value={f.antiPatterns}
        onChange={(antiPatterns) => setForm((prev) => ({ ...(prev ?? f), antiPatterns }))}
      />
      <StringArrayEditor
        label="Regulatory flags"
        hint="(compliance constraints)"
        value={f.regulatoryFlags}
        onChange={(regulatoryFlags) => setForm((prev) => ({ ...(prev ?? f), regulatoryFlags }))}
      />
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {msg && <span className="text-xs text-green-400">{msg}</span>}
        {f.isDefault && <span className="text-xs text-textColor/40">showing defaults — save to persist</span>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 5 — Growth Rules
// ---------------------------------------------------------------------------

interface GrowthRule {
  id: string;
  ruleKey: string;
  ruleValue: unknown;
  active: boolean;
  source: string;
  updatedAt: string;
}

const RulesTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading } = useSWR('/autopilot/rules', async () => {
    const res = await fetch('/autopilot/rules');
    return (await res.json()) as { rules: GrowthRule[] };
  }, { revalidateOnFocus: false });

  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const toggleActive = useCallback(async (rule: GrowthRule) => {
    await fetch(`/autopilot/rules/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !rule.active }),
    });
    mutate();
  }, [fetch, mutate]);

  const remove = useCallback(async (id: string) => {
    if (!(await deleteDialog('Delete this rule?', 'Yes, delete'))) return;
    await fetch(`/autopilot/rules/${id}`, { method: 'DELETE' });
    mutate();
  }, [fetch, mutate]);

  const add = useCallback(async () => {
    if (!newKey.trim()) return;
    let ruleValue: unknown = newValue.trim();
    try { ruleValue = JSON.parse(newValue); } catch { /* keep as string */ }
    await fetch('/autopilot/rules', {
      method: 'POST',
      body: JSON.stringify({ ruleKey: newKey.trim(), ruleValue }),
    });
    setAdding(false);
    setNewKey('');
    setNewValue('');
    mutate();
  }, [newKey, newValue, fetch, mutate]);

  const rules = data?.rules ?? [];
  if (isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-textColor/50 text-xs flex-1">{rules.length} rule(s)</span>
        <button
          className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 border border-blue-400/30 rounded-[6px]"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? 'Cancel' : '+ New rule'}
        </button>
      </div>

      {adding && (
        <div className="rounded-[8px] border border-white/10 bg-newBgColorInner p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-textColor/50">Rule key</label>
            <input
              className="rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none"
              placeholder="e.g. post_frequency, hashtag_limit"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-textColor/50">Value <span className="text-textColor/30">(string or JSON)</span></label>
            <input
              className="rounded-[6px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none"
              placeholder='e.g. "daily" or {"max":5}'
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
          <Button onClick={add} disabled={!newKey.trim()}>Add rule</Button>
        </div>
      )}

      {rules.length === 0 && !adding && <Empty>No growth rules yet. The AI will create rules as it learns.</Empty>}

      {rules.map((r) => (
        <div key={r.id} className="rounded-[8px] border border-white/10 bg-newBgColorInner px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono text-textColor truncate">{r.ruleKey}</p>
            <p className="text-xs text-textColor/50 truncate">{JSON.stringify(r.ruleValue)}</p>
          </div>
          <span className={clsx('text-[11px] px-2 py-0.5 rounded-full flex-shrink-0',
            r.source === 'USER' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-textColor/40',
          )}>{r.source}</span>
          <button
            className={clsx('text-xs px-2 py-1 rounded-[4px] flex-shrink-0 border transition-colors',
              r.active ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/10 text-textColor/30',
            )}
            onClick={() => toggleActive(r)}
          >
            {r.active ? 'On' : 'Off'}
          </button>
          <button className="text-xs text-red-400 hover:text-red-300 flex-shrink-0" onClick={() => remove(r.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 6 — Memory
// ---------------------------------------------------------------------------

interface MemoryEntry {
  id: string;
  kind: string;
  content: string;
  createdAt: string;
}

const KIND_STYLES: Record<string, string> = {
  LEARNING:       'bg-blue-500/20 text-blue-400',
  BRAND_RULE:     'bg-purple-500/20 text-purple-400',
  ANECDOTE:       'bg-yellow-500/20 text-yellow-400',
  PERSONAL_STORY: 'bg-pink-500/20 text-pink-400',
  MILESTONE:      'bg-green-500/20 text-green-400',
  COMPETITOR:     'bg-red-500/20 text-red-400',
};

const MemoryTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading } = useSWR('/autopilot/memory', async () => {
    const res = await fetch('/autopilot/memory');
    return (await res.json()) as { memories: MemoryEntry[] };
  }, { revalidateOnFocus: false });

  const remove = useCallback(async (id: string) => {
    if (!(await deleteDialog('Delete this memory?', 'Yes, delete'))) return;
    await fetch(`/autopilot/memory/${id}`, { method: 'DELETE' });
    mutate();
  }, [fetch, mutate]);

  const memories = data?.memories ?? [];
  if (isLoading) return <Spinner />;
  if (memories.length === 0) return <Empty>No memories stored yet. The AI builds memory as you chat.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-textColor/50 text-xs">{memories.length} item(s)</div>
      {memories.map((m) => (
        <div key={m.id} className="rounded-[8px] border border-white/10 bg-newBgColorInner p-4 flex gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', KIND_STYLES[m.kind] ?? 'bg-white/5 text-textColor/50')}>
                {m.kind}
              </span>
              <span className="text-xs text-textColor/30">{dayjs(m.createdAt).format('MMM D, YYYY')}</span>
            </div>
            <p className="text-sm text-textColor/80 whitespace-pre-line">{m.content}</p>
          </div>
          <button className="text-xs text-red-400 hover:text-red-300 flex-shrink-0 self-start" onClick={() => remove(m.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 7 — Strategy optout
// ---------------------------------------------------------------------------

const StrategyTab: FC = () => {
  const fetch = useFetch();
  const { data, mutate, isLoading } = useSWR('/autopilot/strategy-optout', async () => {
    const res = await fetch('/autopilot/strategy-optout');
    return (await res.json()) as { optedOut: boolean };
  }, { revalidateOnFocus: false });

  const [saving, setSaving] = useState(false);

  const toggle = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    await fetch('/autopilot/strategy-optout', {
      method: 'PATCH',
      body: JSON.stringify({ optedOut: !data.optedOut }),
    });
    setSaving(false);
    mutate();
  }, [data, fetch, mutate]);

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="flex flex-col gap-5 max-w-md">
      <div>
        <h2 className="text-base font-semibold text-textColor">Strategy Data Sharing</h2>
        <p className="text-xs text-textColor/50 mt-0.5">
          When enabled, anonymized strategy patterns from your account contribute to cross-tenant insights that improve AI recommendations.
          No identifying information is shared. You can opt out at any time.
        </p>
      </div>

      <div className={clsx(
        'rounded-[8px] border p-4 flex items-center justify-between gap-4',
        data.optedOut ? 'border-red-500/20 bg-red-500/5' : 'border-green-500/20 bg-green-500/5',
      )}>
        <div>
          <p className="text-sm font-semibold text-textColor">
            {data.optedOut ? 'Opted out — not contributing' : 'Contributing anonymized data'}
          </p>
          <p className="text-xs text-textColor/50 mt-0.5">
            {data.optedOut
              ? 'Your patterns are not shared. AI recommendations rely on your own history only.'
              : 'You are contributing. This helps the AI learn what works across similar accounts.'}
          </p>
        </div>
        <Button onClick={toggle} disabled={saving}>
          {saving ? '…' : data.optedOut ? 'Opt back in' : 'Opt out'}
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 8 — Timezone
// ---------------------------------------------------------------------------

const TimezoneTab: FC = () => {
  const fetch = useFetch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, mutate, isLoading } = useSWR('/autopilot/config', async () => {
    const res = await fetch('/autopilot/config');
    return (await res.json()) as { timezone: string };
  }, { revalidateOnFocus: false });

  const saved = data?.timezone ?? DEFAULT_TZ;
  const displayed = pending ?? saved;

  const allZones = useMemo<string[]>(() => {
    try { return (Intl as any).supportedValuesOf('timeZone') as string[]; }
    catch {
      return ['America/New_York', 'America/Chicago', 'America/Los_Angeles',
        'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Dhaka',
        'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allZones.filter((z) => z.toLowerCase().includes(q)) : allZones;
  }, [allZones, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const save = useCallback(async () => {
    if (!pending) return;
    setSaving(true);
    await fetch('/autopilot/config', { method: 'PATCH', body: JSON.stringify({ timezone: pending }) });
    setSaving(false);
    setSavedMsg('Saved');
    mutate({ timezone: pending });
    setTimeout(() => setSavedMsg(''), 2500);
    setPending(null);
  }, [pending, fetch, mutate]);

  const isDirty = pending !== null && pending !== saved;

  return (
    <div className="flex flex-col gap-5 max-w-md">
      <div>
        <h2 className="text-base font-semibold text-textColor">Timezone</h2>
        <p className="text-xs text-textColor/50 mt-0.5">
          All times you mention in chat ("11 am", "tomorrow 3 pm") are interpreted in this timezone.
        </p>
      </div>

      {!isLoading && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-textColor/40 uppercase tracking-wide">Active</span>
          <span className="text-xs font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-textColor/80">{saved}</span>
          <span className="text-xs text-textColor/40">{offsetLabel(saved)}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5 relative">
        <label className="text-xs text-textColor/50">Change timezone</label>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayed}
          placeholder="Search timezone…"
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          className="w-full rounded-[8px] bg-white/5 border border-white/10 text-textColor text-sm px-3 py-2 focus:outline-none focus:border-blue-400/50 transition-colors cursor-pointer"
          readOnly={!open}
        />
        {open && (
          <div ref={dropdownRef} className="absolute top-full mt-1 left-0 right-0 z-50 rounded-[8px] border border-white/10 bg-[#1a1a2e] shadow-xl overflow-hidden">
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 && <p className="px-4 py-3 text-xs text-textColor/40">No timezone found</p>}
              {filtered.slice(0, 120).map((zone) => (
                <button
                  key={zone}
                  onMouseDown={(e) => { e.preventDefault(); setPending(zone); setOpen(false); setQuery(''); setSavedMsg(''); }}
                  className={clsx(
                    'w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-3 transition-colors',
                    zone === displayed ? 'bg-blue-500/20 text-blue-300' : 'text-textColor/80 hover:bg-white/5',
                  )}
                >
                  <span>{zone}</span>
                  <span className="text-xs text-textColor/40 shrink-0 font-mono">{offsetLabel(zone)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !isDirty}>{saving ? 'Saving…' : 'Save'}</Button>
        {isDirty && !saving && (
          <span className="text-xs text-textColor/40">
            {saved} → <span className="text-blue-400">{pending}</span>
          </span>
        )}
        {savedMsg && <span className="text-xs text-green-400">{savedMsg}</span>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared micro-components
// ---------------------------------------------------------------------------

const Spinner: FC = () => (
  <div className="text-textColor/50 text-sm p-4">Loading…</div>
);

const Empty: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-textColor/50 text-sm p-4">{children}</div>
);

// ---------------------------------------------------------------------------
// Root — 8 tabs, URL-synced via ?tab=<key>
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'stack',    label: 'Post Stack' },
  { key: 'scheduled',label: 'Scheduled'  },
  { key: 'cadence',  label: 'Cadence'    },
  { key: 'profile',  label: 'Profile'    },
  { key: 'rules',    label: 'Rules'      },
  { key: 'memory',   label: 'Memory'     },
  { key: 'strategy', label: 'Strategy'   },
  { key: 'timezone', label: 'Timezone'   },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export const ConfigPage: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = rawTab && TABS.some((t) => t.key === rawTab) ? rawTab : 'stack';

  const goTab = useCallback(
    (key: TabKey) => router.replace(`/config?tab=${key}`),
    [router],
  );

  return (
    <div className="flex flex-col h-full p-6 gap-6 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-bold text-textColor">Configuration</h1>
        <p className="text-sm text-textColor/50 mt-1">
          Everything the autopilot can configure via chat is also editable here.
        </p>
      </div>

      <div className="flex gap-0.5 border-b border-white/10 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => goTab(key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-textColor/50 hover:text-textColor',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'stack'     && <PostStackTab />}
        {tab === 'scheduled' && <ScheduledTab />}
        {tab === 'cadence'   && <CadenceTab />}
        {tab === 'profile'   && <ProfileTab />}
        {tab === 'rules'     && <RulesTab />}
        {tab === 'memory'    && <MemoryTab />}
        {tab === 'strategy'  && <StrategyTab />}
        {tab === 'timezone'  && <TimezoneTab />}
      </div>
    </div>
  );
};
