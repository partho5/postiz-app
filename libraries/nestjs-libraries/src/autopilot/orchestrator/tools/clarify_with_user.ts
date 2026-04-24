/**
 * `clarify_with_user` tool — slice 1.3.c
 *
 * The orchestrator calls this when it cannot make progress without a
 * specific piece of information from the user. It exists as an explicit
 * tool (rather than letting the LLM emit free text) so the dispatch loop
 * can see "the model is asking, not acting" and stop after one step.
 *
 * Behaviour:
 *   - emits the question as a `text` chunk so the chat UI shows it like
 *     any other assistant turn
 *   - returns `emitted: true` so the orchestrator does not re-stream the
 *     same text in a final reply
 */

import { z } from 'zod';
import type { OrchestratorTool } from '../types';

const inputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      'Concise question to ask the user. One sentence. No filler. ' +
        'Example: "Which platform — twitter or linkedin?"',
    ),
});

export type ClarifyWithUserInput = z.infer<typeof inputSchema>;
export interface ClarifyWithUserOutput {
  asked: string;
}

export function createClarifyWithUserTool(): OrchestratorTool<
  ClarifyWithUserInput,
  ClarifyWithUserOutput
> {
  return {
    name: 'clarify_with_user',
    description:
      'Ask the user one short follow-up question when essential information is missing. Use sparingly — only when no available tool can resolve the ambiguity.',
    parameters: inputSchema,
    handler: async (ctx, input) => {
      ctx.emit({ type: 'text', chunk: input.question });
      return {
        observation: `asked the user: "${input.question}". Stop and wait for their reply.`,
        data: { asked: input.question },
        emitted: true,
      };
    },
  };
}
