'use client';

import React, {
  FC,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { CardSelect } from './card-select';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

type UserMsg = {
  id: string;
  role: 'user';
  content: string;
};

type AssistantMsg = {
  id: string;
  role: 'assistant';
  content: string;
  streaming?: boolean;
  statusMessage?: string;
};

type ProposalMsg = {
  id: string;
  role: 'proposal';
  proposalId: string;
  rationale: string;
  targetEntity: string;
  changes: Record<string, unknown>;
  decided: boolean;
};

type DraftPreviewMsg = {
  id: string;
  role: 'draft_preview';
  pendingActionId: string;
  drafts: Array<{ platform: string; content: string; hashtags?: string[] }>;
  imageUrl?: string;
  publishAt: string;
  decided: boolean;
  confirmStatus?: 'loading' | 'done';
  confirmMessage?: string;
};

type ErrorMsg = {
  id: string;
  role: 'error';
  content: string;
};

type Message = UserMsg | AssistantMsg | ProposalMsg | DraftPreviewMsg | ErrorMsg;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function formatChanges(changes: Record<string, unknown>): string {
  return Object.entries(changes)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export const AutopilotChatLayout: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fetch = useFetch();

  // Load history on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/autopilot/chat/history');
        if (!res.ok) return;
        const data = await res.json();
        setMessages(
          (data.messages as { id: string; role: 'user' | 'assistant'; content: string }[]).map(
            (m) =>
              m.role === 'user'
                ? ({ id: m.id, role: 'user', content: m.content } as UserMsg)
                : ({ id: m.id, role: 'assistant', content: m.content, streaming: false } as AssistantMsg),
          ),
        );
      } catch {
        // non-fatal
      }
    })();
  }, []);

  // Auto-focus textarea on mount and after each response.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!sending) {
      textareaRef.current?.focus();
    }
  }, [sending]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const content = (overrideText ?? input).trim();
      if (!content || sending) return;

      // Clear the textarea only for normal sends, not chip clicks.
      if (!overrideText) setInput('');
      setSending(true);

      const assistantMsgId = makeId();

      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'user', content } as UserMsg,
        { id: assistantMsgId, role: 'assistant', content: '', streaming: true } as AssistantMsg,
      ]);

      try {
        const response = await fetch('/autopilot/chat', {
          method: 'POST',
          body: JSON.stringify({ content, source: 'web' }),
          headers: { Accept: 'text/event-stream' },
        });

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';
        let specialEmitted = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            switch (event.type) {
              case 'status': {
                setMessages((prev) =>
                  prev.map((m): Message =>
                    m.id === assistantMsgId && m.role === 'assistant'
                      ? { ...m, statusMessage: event.message as string }
                      : m
                  )
                );
                break;
              }

              case 'text': {
                assistantText += event.chunk as string;
                const partial = assistantText;
                setMessages((prev) =>
                  prev.map((m): Message =>
                    m.id === assistantMsgId && m.role === 'assistant'
                      ? { ...m, content: partial, statusMessage: undefined, streaming: true }
                      : m
                  )
                );
                break;
              }

              case 'proposal': {
                specialEmitted = true;
                const proposalMsgId = makeId();
                setMessages((prev) =>
                  prev
                    .filter((m) => m.id !== assistantMsgId)
                    .concat({
                      id: proposalMsgId,
                      role: 'proposal',
                      proposalId: event.proposalId as string,
                      rationale: event.rationale as string,
                      targetEntity: event.targetEntity as string,
                      changes: event.changes as Record<string, unknown>,
                      decided: false,
                    } as ProposalMsg)
                );
                break;
              }

              case 'draft_preview': {
                specialEmitted = true;
                const draftMsgId = makeId();
                setMessages((prev) =>
                  prev
                    .filter((m) => m.id !== assistantMsgId)
                    .concat({
                      id: draftMsgId,
                      role: 'draft_preview',
                      pendingActionId: event.pendingActionId as string,
                      drafts: event.drafts as DraftPreviewMsg['drafts'],
                      imageUrl: event.imageUrl as string | undefined,
                      publishAt: event.publishAt as string,
                      decided: false,
                    } as DraftPreviewMsg)
                );
                break;
              }

              case 'done': {
                if (!specialEmitted) {
                  setMessages((prev) =>
                    prev.map((m): Message =>
                      m.id === assistantMsgId && m.role === 'assistant'
                        ? { ...m, streaming: false }
                        : m
                    )
                  );
                }
                break;
              }

              case 'error': {
                setMessages((prev) =>
                  prev
                    .filter((m) => m.id !== assistantMsgId)
                    .concat({
                      id: makeId(),
                      role: 'error',
                      content: event.message as string,
                    } as ErrorMsg)
                );
                break;
              }
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== assistantMsgId)
            .concat({ id: makeId(), role: 'error', content: msg } as ErrorMsg)
        );
      } finally {
        setSending(false);
      }
    },
    [input, sending, fetch]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleProposalDecision = useCallback(
    async (proposalId: string, msgId: string, decision: 'confirm' | 'cancel') => {
      setMessages((prev) =>
        prev.map((m): Message =>
          m.id === msgId && m.role === 'proposal' ? { ...m, decided: true } : m
        )
      );
      try {
        await fetch(`/autopilot/chat/proposals/${proposalId}/${decision}`, {
          method: 'PATCH',
        });
      } catch {
        // non-fatal — the optimistic decided=true is already shown
      }
    },
    [fetch]
  );

  const handleDraftDecision = useCallback(
    async (pendingActionId: string, msgId: string, decision: 'confirm' | 'cancel') => {
      const loadingMsg = decision === 'confirm' ? 'Publishing…' : 'Cancelling…';
      setMessages((prev) =>
        prev.map((m): Message =>
          m.id === msgId && m.role === 'draft_preview'
            ? { ...m, decided: true, confirmStatus: 'loading', confirmMessage: loadingMsg }
            : m
        )
      );
      try {
        let resultMessage = decision === 'confirm' ? 'Queued.' : 'Cancelled.';
        if (decision === 'confirm') {
          const res = await fetch(`/autopilot/chat/pending-actions/${pendingActionId}/confirm`, {
            method: 'PATCH',
          });
          if (res.ok) {
            const data = await res.json();
            resultMessage = data.message ?? 'Queued.';
          }
        } else {
          await fetch('/autopilot/chat/pending-actions/cancel', { method: 'PATCH' });
          resultMessage = 'Cancelled.';
        }
        setMessages((prev) =>
          prev.map((m): Message =>
            m.id === msgId && m.role === 'draft_preview'
              ? { ...m, confirmStatus: 'done', confirmMessage: resultMessage }
              : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m): Message =>
            m.id === msgId && m.role === 'draft_preview'
              ? { ...m, confirmStatus: 'done', confirmMessage: 'Something went wrong.' }
              : m
          )
        );
      }
    },
    [fetch]
  );

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-[24px] flex flex-col gap-[16px]">
        {messages.length === 0 ? (
          <WelcomeState onChipClick={handleSend} sending={sending} />
        ) : (
          messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              onProposalDecision={handleProposalDecision}
              onDraftDecision={handleDraftDecision}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-[16px] border-t border-newBgLineColor">
        <div className="flex gap-[12px] items-end bg-newBgColorInner rounded-[12px] p-[12px] border border-newBgLineColor focus-within:border-textItemBlur transition-colors">
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent resize-none outline-none text-newTextColor placeholder:text-textItemBlur text-[14px] leading-[1.5] max-h-[160px] min-h-[60px]"
            placeholder="Message your autopilot…"
            value={input}
            rows={3}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="w-[36px] h-[36px] flex-shrink-0 rounded-[8px] bg-newBgColorInner flex items-center justify-center text-textItemBlur hover:text-textItemFocused disabled:opacity-30 transition-colors"
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            aria-label="Send message"
          >
            {sending ? <SpinnerIcon /> : <SendIcon />}
          </button>
        </div>
        <p className="text-[11px] text-textItemBlur text-center mt-[8px]">
          Autopilot AI · responses may be inaccurate
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Message row dispatcher
// ---------------------------------------------------------------------------

const MessageRow: FC<{
  message: Message;
  onProposalDecision: (
    proposalId: string,
    msgId: string,
    decision: 'confirm' | 'cancel'
  ) => void;
  onDraftDecision: (
    pendingActionId: string,
    msgId: string,
    decision: 'confirm' | 'cancel'
  ) => void;
}> = ({ message, onProposalDecision, onDraftDecision }) => {
  if (message.role === 'user' || message.role === 'assistant') {
    return <ChatBubble message={message} />;
  }
  if (message.role === 'proposal') {
    return (
      <ProposalBubble
        message={message}
        onDecision={(d) => onProposalDecision(message.proposalId, message.id, d)}
      />
    );
  }
  if (message.role === 'draft_preview') {
    return (
      <DraftPreviewBubble
        message={message}
        onDecision={(d) => onDraftDecision(message.pendingActionId, message.id, d)}
      />
    );
  }
  return <ErrorBubble message={message} />;
};

// ---------------------------------------------------------------------------
// Chat bubble (user + assistant)
// ---------------------------------------------------------------------------

const ChatBubble: FC<{ message: UserMsg | AssistantMsg }> = ({ message }) => {
  const isUser = message.role === 'user';
  const assistantMsg = !isUser ? (message as AssistantMsg) : null;
  const isStreaming = !!assistantMsg?.streaming;
  const statusMessage = assistantMsg?.statusMessage;
  const isEmpty = message.content === '';

  return (
    <div className={`flex gap-[12px] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-[32px] h-[32px] rounded-[10px] bg-newBgLineColor flex-shrink-0 flex items-center justify-center text-textItemFocused">
          <AutopilotIcon size={16} />
        </div>
      )}
      <div
        className={`max-w-[70%] px-[14px] py-[10px] rounded-[12px] text-[14px] leading-[1.6] ${
          isUser
            ? 'bg-boxFocused text-textItemFocused rounded-tr-[4px] whitespace-pre-wrap'
            : 'bg-newBgLineColor text-newTextColor rounded-tl-[4px]'
        }`}
      >
        {isStreaming && isEmpty ? (
          statusMessage ? (
            <span className="text-textItemBlur text-[13px] animate-pulse">{statusMessage}</span>
          ) : (
            <TypingDots />
          )
        ) : isUser ? (
          message.content
        ) : (
          <>
            <MarkdownContent content={message.content} />
            {isStreaming && (
              <span className="inline-block w-[2px] h-[14px] ml-[2px] bg-current animate-pulse align-text-bottom" />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Proposal bubble
// ---------------------------------------------------------------------------

/** Human-readable summary for a proposal's changes, by entity. */
function describeChanges(
  targetEntity: string,
  changes: Record<string, unknown>,
): string {
  if (targetEntity === 'tenant_strategy_optout') {
    return changes.optedOut === true
      ? "I'll stop sharing your anonymized strategy data with the pool. You can still read patterns from others."
      : "I'll resume contributing your anonymized strategy data. Your content is never shared — only structural patterns like timing and format.";
  }

  if (targetEntity === 'growth_rule') {
    const { ruleKey, ruleValue, active } = changes as {
      ruleKey?: string;
      ruleValue?: unknown;
      active?: boolean;
    };
    if (active === false) return "I'll turn this rule off.";
    const friendlyKeys: Record<string, string> = {
      posting_frequency: 'Posting frequency',
      best_time_to_post: 'Best time to post',
      content_mix: 'Content mix',
      hashtag_strategy: 'Hashtag strategy',
      engagement_target: 'Engagement target',
    };
    const label = ruleKey ? (friendlyKeys[ruleKey] ?? ruleKey.replace(/_/g, ' ')) : 'Rule';
    return ruleValue !== undefined ? `${label} → ${ruleValue}` : label;
  }

  if (targetEntity === 'business_profile') {
    const parts: string[] = [];
    if (changes.niche) parts.push(`Niche: ${changes.niche}`);
    if (Array.isArray(changes.goals) && (changes.goals as unknown[]).length)
      parts.push(`Goals: ${(changes.goals as string[]).join(', ')}`);
    if (changes.brandVoiceShort) parts.push(`Brand voice: ${changes.brandVoiceShort}`);
    if (parts.length) return parts.join(' · ');
  }

  return formatChanges(changes);
}

const ProposalBubble: FC<{
  message: ProposalMsg;
  onDecision: (decision: 'confirm' | 'cancel') => void;
}> = ({ message, onDecision }) => {
  const changesSummary = describeChanges(message.targetEntity, message.changes);

  return (
    <div className="flex gap-[12px] flex-row">
      <div className="w-[32px] h-[32px] rounded-[10px] bg-newBgLineColor flex-shrink-0 flex items-center justify-center text-textItemFocused">
        <AutopilotIcon size={16} />
      </div>
      <div className="max-w-[75%] flex flex-col gap-[10px]">
        <div className="px-[14px] py-[10px] rounded-[12px] bg-newBgLineColor text-newTextColor text-[14px] leading-[1.6] rounded-tl-[4px]">
          {message.rationale}
        </div>
        <CardSelect
          disabled={message.decided}
          options={[
            {
              id: 'confirm',
              label: 'Yes, do it',
              ...(changesSummary ? { description: changesSummary } : {}),
            },
            { id: 'cancel', label: 'No, skip' },
          ]}
          onSelect={(id) => onDecision(id as 'confirm' | 'cancel')}
        />
        {message.decided && (
          <p className="text-[12px] text-textItemBlur">Got it.</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Draft preview bubble
// ---------------------------------------------------------------------------

function formatPublishAt(publishAt: string): string {
  if (publishAt === 'now') return 'Posting right away';
  const d = new Date(publishAt);
  if (!isNaN(d.getTime())) {
    return `Scheduled for ${d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
  return `Scheduled for ${publishAt}`;
}

const DraftPreviewBubble: FC<{
  message: DraftPreviewMsg;
  onDecision: (decision: 'confirm' | 'cancel') => void;
}> = ({ message, onDecision }) => {
  return (
    <div className="flex gap-[12px] flex-row">
      <div className="w-[32px] h-[32px] rounded-[10px] bg-newBgLineColor flex-shrink-0 flex items-center justify-center text-textItemFocused">
        <AutopilotIcon size={16} />
      </div>
      <div className="max-w-[80%] flex flex-col gap-[10px]">
        <p className="text-[13px] text-textItemBlur">{formatPublishAt(message.publishAt)}</p>

        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imageUrl}
            alt="Generated image"
            className="rounded-[10px] max-h-[200px] object-cover"
          />
        )}

        {message.drafts.map((draft) => (
          <div
            key={draft.platform}
            className="rounded-[12px] bg-newBgLineColor text-newTextColor text-[14px] leading-[1.6] overflow-hidden"
          >
            <div className="px-[12px] py-[8px] border-b border-[rgba(255,255,255,0.07)] text-[12px] font-[600] text-textItemBlur uppercase tracking-wide">
              {draft.platform}
            </div>
            <div className="px-[14px] py-[10px] whitespace-pre-wrap">{draft.content}</div>
            {draft.hashtags && draft.hashtags.length > 0 && (
              <div className="px-[14px] pb-[10px] flex flex-wrap gap-[6px]">
                {draft.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[12px] text-textItemBlur bg-[rgba(255,255,255,0.05)] rounded-[6px] px-[8px] py-[2px]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {!message.decided ? (
          <div className="flex gap-[8px]">
            <button
              className="px-[14px] py-[7px] rounded-[8px] bg-boxFocused text-textItemFocused text-[13px] font-[600] hover:opacity-90 transition-opacity"
              onClick={() => onDecision('confirm')}
            >
              Post it
            </button>
            <button
              className="px-[14px] py-[7px] rounded-[8px] bg-newBgLineColor text-textItemBlur text-[13px] hover:text-newTextColor transition-colors"
              onClick={() => onDecision('cancel')}
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className={`text-[12px] text-textItemBlur ${message.confirmStatus === 'loading' ? 'animate-pulse' : ''}`}>
            {message.confirmMessage ?? 'Done.'}
          </p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Error bubble
// ---------------------------------------------------------------------------

const ErrorBubble: FC<{ message: ErrorMsg }> = ({ message }) => (
  <div className="flex gap-[12px] flex-row">
    <div className="w-[32px] h-[32px] rounded-[10px] bg-newBgLineColor flex-shrink-0 flex items-center justify-center text-red-400">
      <WarningIcon />
    </div>
    <div className="max-w-[70%] px-[14px] py-[10px] rounded-[12px] bg-newBgLineColor text-red-400 text-[13px] leading-[1.6] rounded-tl-[4px]">
      {message.content}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Welcome state
// ---------------------------------------------------------------------------

const STARTER_PROMPTS = [
  'Help me set up my business profile',
  'Set up my brand voice',
  'What should I post this week?',
  'Review my growth rules',
  'Manage data sharing settings',
];

const WelcomeState: FC<{
  onChipClick: (text: string) => void;
  sending: boolean;
}> = ({ onChipClick, sending }) => (
  <div className="flex flex-col flex-1 items-center justify-center gap-[24px] py-[48px] text-center">
    <div className="w-[64px] h-[64px] rounded-[20px] bg-newBgLineColor flex items-center justify-center text-textItemFocused">
      <AutopilotIcon size={32} />
    </div>
    <div className="flex flex-col gap-[8px]">
      <h2 className="text-[20px] font-[600] text-newTextColor">Autopilot</h2>
      <p className="text-[14px] text-textItemBlur max-w-[400px]">
        Your AI social media manager. Tell me your goals and I&apos;ll handle
        scheduling, content, and growth — just ask.
      </p>
    </div>
    <div className="flex flex-wrap gap-[8px] justify-center max-w-[480px]">
      {STARTER_PROMPTS.map((prompt) => (
        <StarterChip
          key={prompt}
          label={prompt}
          disabled={sending}
          onClick={() => onChipClick(prompt)}
        />
      ))}
    </div>
  </div>
);

const StarterChip: FC<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, disabled, onClick }) => (
  <button
    className="px-[12px] py-[6px] rounded-[8px] bg-newBgLineColor text-[13px] text-textItemBlur hover:text-textItemFocused hover:bg-boxFocused transition-colors disabled:opacity-40"
    disabled={disabled}
    onClick={onClick}
  >
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

const MarkdownContent: FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => (
        <h1 className="text-[18px] font-[700] mt-[12px] mb-[6px] first:mt-0">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-[16px] font-[600] mt-[10px] mb-[4px] first:mt-0">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-[15px] font-[600] mt-[8px] mb-[4px] first:mt-0">{children}</h3>
      ),
      p: ({ children }) => (
        <p className="mb-[8px] last:mb-0 leading-[1.6]">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="list-disc pl-[20px] mb-[8px] flex flex-col gap-[3px]">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="list-decimal pl-[20px] mb-[8px] flex flex-col gap-[3px]">{children}</ol>
      ),
      li: ({ children }) => (
        <li className="leading-[1.5]">{children}</li>
      ),
      strong: ({ children }) => (
        <strong className="font-[600]">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="italic">{children}</em>
      ),
      pre: ({ children }) => (
        <pre className="bg-[rgba(0,0,0,0.25)] rounded-[6px] p-[12px] text-[13px] font-mono overflow-x-auto whitespace-pre mb-[8px] mt-[4px]">
          {children}
        </pre>
      ),
      code: ({ className, children }) => (
        className
          ? <code className="font-mono text-[13px]">{children}</code>
          : <code className="bg-[rgba(0,0,0,0.2)] rounded-[4px] px-[5px] py-[2px] text-[13px] font-mono">{children}</code>
      ),
      blockquote: ({ children }) => (
        <blockquote className="border-l-[3px] border-textItemBlur pl-[12px] italic opacity-80 mb-[8px]">
          {children}
        </blockquote>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline opacity-80 hover:opacity-100"
        >
          {children}
        </a>
      ),
      hr: () => <hr className="border-newBgLineColor my-[12px] opacity-50" />,
      table: ({ children }) => (
        <div className="overflow-x-auto mb-[8px]">
          <table className="w-full border-collapse text-[13px]">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-[rgba(255,255,255,0.15)] px-[10px] py-[6px] text-left font-[600] bg-[rgba(0,0,0,0.2)]">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-[rgba(255,255,255,0.1)] px-[10px] py-[6px]">{children}</td>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const TypingDots: FC = () => (
  <span className="flex gap-[4px] items-center h-[20px]">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-[6px] h-[6px] rounded-full bg-textItemBlur animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </span>
);

const AutopilotIcon: FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M12 2C6.477 2 2 6.477 2 12c0 1.89.526 3.657 1.438 5.168L2 22l4.832-1.438A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 11h.01M12 11h.01M16 11h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const SendIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SpinnerIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    className="animate-spin"
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const WarningIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
