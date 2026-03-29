import { query } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow, ipcMain } from 'electron';
import { getDetectedClaudePath } from './claude';

const THINKING_TOKENS: Record<string, number | undefined> = {
  auto: undefined,
  low: 2048,
  med: 8192,
  high: 16000,
};

interface AuthConfig {
  mode: 'api-key' | 'max';
  key?: string;
}

interface EvalPayload {
  turtle: string;
  domain: string;
  intendedUse: string;
  auth: AuthConfig;
  model: string;
  effort: string;
}

let evalAbort: AbortController | null = null;

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getMainWindow();
  if (win) win.webContents.send(channel, ...args);
}

const EVAL_SYSTEM_PROMPT = `You are an expert ontology quality evaluator. Analyze OWL ontologies and produce structured quality assessments.

Evaluate the ontology on exactly these five dimensions:
1. Coverage — how well the ontology covers the domain concepts given the stated intended use
2. Consistency — logical consistency; no contradictions, circular hierarchies, or ambiguous definitions
3. Naming Conventions — quality and consistency of rdfs:label values and URI local names
4. Property Richness — appropriate use of object properties and datatype properties to capture domain knowledge
5. Hierarchy Depth — appropriate class hierarchy structure; neither too flat nor artificially deep

Respond with a brief plain-text analysis, then return your evaluation as a JSON object inside a \`\`\`json code block. The JSON must follow this exact structure:
{
  "score": <overall weighted 0-100>,
  "dimensions": [
    {
      "name": "<dimension name>",
      "score": <0-100>,
      "findings": ["<specific observation about the ontology>", ...],
      "suggestions": ["<concrete actionable suggestion>", ...]
    }
  ],
  "summary": "<2-3 sentence overall assessment>"
}

Each dimension must have 1-4 findings and 1-3 suggestions. Be specific and actionable.`;

export function registerEvalIPC(): void {
  ipcMain.handle('eval:run', async (_event, payload: EvalPayload) => {
    if (evalAbort) {
      evalAbort.abort();
    }
    evalAbort = new AbortController();

    const userPrompt = `Please evaluate this OWL ontology.

Domain: ${payload.domain}
Intended use: ${payload.intendedUse}

Ontology (Turtle format):
\`\`\`turtle
${payload.turtle}
\`\`\``;

    try {
      const authOptions =
        payload.auth.mode === 'api-key' && payload.auth.key
          ? { env: { ...process.env, ANTHROPIC_API_KEY: payload.auth.key } }
          : {
              pathToClaudeCodeExecutable: getDetectedClaudePath() || 'claude',
              env: process.env,
            };

      const thinkingBudgetTokens = THINKING_TOKENS[payload.effort];

      const options: Record<string, unknown> = {
        systemPrompt: EVAL_SYSTEM_PROMPT,
        maxTurns: 1,
        abortController: evalAbort,
        ...(payload.model ? { model: payload.model } : {}),
        ...(thinkingBudgetTokens ? { thinkingBudgetTokens } : {}),
        ...authOptions,
      };

      let fullText = '';

      for await (const msg of query({ prompt: userPrompt, options: options as never })) {
        if (msg.type === 'assistant') {
          const textBlocks = msg.message.content.filter((b: { type: string }) => b.type === 'text');
          const text = textBlocks.map((b: { text: string }) => b.text).join('');
          if (text) {
            fullText = text;
            sendToRenderer('eval:text', text);
          }
        }

        if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);
            if (jsonMatch) {
              try {
                const report = JSON.parse(jsonMatch[1].trim());
                sendToRenderer('eval:result', JSON.stringify(report));
              } catch {
                sendToRenderer('eval:error', 'Failed to parse evaluation report JSON');
              }
            } else {
              sendToRenderer('eval:error', 'No structured report found in response');
            }
          } else {
            sendToRenderer(
              'eval:error',
              (msg as { errors?: string[] }).errors?.join(', ') || 'Unknown error',
            );
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        sendToRenderer('eval:error', (err as Error).message || 'Eval failed');
      }
    } finally {
      evalAbort = null;
    }
  });

  ipcMain.handle('eval:abort', () => {
    if (evalAbort) {
      evalAbort.abort();
      evalAbort = null;
    }
  });
}
