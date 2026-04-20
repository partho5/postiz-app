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

type ErrorMsg = {
  id: string;
  role: 'error';
  content: string;
};

type Message = UserMsg | AssistantMsg | ProposalMsg | ErrorMsg;

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
  const fetch = useFetch();

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
        let proposalEmitted = false;

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
              case 'text': {
                assistantText += event.chunk as string;
                const partial = assistantText;
                setMessages((prev) =>
                  prev.map((m): Message =>
                    m.id === assistantMsgId && m.role === 'assistant'
                      ? { ...m, content: partial, streaming: true }
                      : m
                  )
                );
                break;
              }

              case 'proposal': {
                proposalEmitted = true;
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

              case 'done': {
                if (!proposalEmitted) {
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
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-[16px] border-t border-newBgLineColor">
        <div className="flex gap-[12px] items-end bg-newBgLineColor rounded-[12px] p-[12px]">
          <textarea
            className="flex-1 bg-transparent resize-none outline-none text-newTextColor placeholder:text-textItemBlur text-[14px] leading-[1.5] max-h-[120px] min-h-[24px]"
            placeholder="Message your autopilot…"
            value={input}
            rows={1}
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
}> = ({ message, onProposalDecision }) => {
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
  return <ErrorBubble message={message} />;
};

// ---------------------------------------------------------------------------
// Chat bubble (user + assistant)
// ---------------------------------------------------------------------------

const ChatBubble: FC<{ message: UserMsg | AssistantMsg }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isStreaming = !isUser && (message as AssistantMsg).streaming;
  const isEmpty = message.content === '';

  return (
    <div className={`flex gap-[12px] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-[32px] h-[32px] rounded-[10px] bg-newBgLineColor flex-shrink-0 flex items-center justify-center text-textItemFocused">
          <AutopilotIcon size={16} />
        </div>
      )}
      <div
        className={`max-w-[70%] px-[14px] py-[10px] rounded-[12px] text-[14px] leading-[1.6] whitespace-pre-wrap ${
          isUser
            ? 'bg-boxFocused text-textItemFocused rounded-tr-[4px]'
            : 'bg-newBgLineColor text-newTextColor rounded-tl-[4px]'
        }`}
      >
        {isStreaming && isEmpty ? (
          <TypingDots />
        ) : (
          <>
            {message.content}
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

const ProposalBubble: FC<{
  message: ProposalMsg;
  onDecision: (decision: 'confirm' | 'cancel') => void;
}> = ({ message, onDecision }) => {
  const changesSummary = formatChanges(message.changes);

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
          title="Apply this change?"
          disabled={message.decided}
          options={[
            {
              id: 'confirm',
              label: 'Apply changes',
              ...(changesSummary ? { description: changesSummary } : {}),
            },
            { id: 'cancel', label: 'Dismiss' },
          ]}
          onSelect={(id) => onDecision(id as 'confirm' | 'cancel')}
        />
        {message.decided && (
          <p className="text-[12px] text-textItemBlur">Decision recorded.</p>
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
