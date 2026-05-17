import { jsonSchema2NodeInput, jsonSchema2NodeOutput } from '@fastgpt/global/core/app/jsonschema';
import type {
  JSONSchemaInputType,
  JSONSchemaOutputType
} from '@fastgpt/global/core/app/jsonschema';
import type { AppToolTemplateItemType } from '@fastgpt/global/core/app/tool/type';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  summarizeExecToolResponse,
  summarizeListFilesToolResponse,
  summarizeReadFileToolResponse,
  summarizeWriteFileToolResponse
} from './localSystemToolResponses';

const TOOL_VERSION = '1.0.0';
const TOOL_TAG_ID = 'hivechat-sandbox';
const TOOLSET_ID = 'systemTool-hivechat-sandbox';
const LIST_FILES_TOOL_ID = 'systemTool-hivechat-sandbox-list-files';
const READ_FILE_TOOL_ID = 'systemTool-hivechat-sandbox-read-file';
const WRITE_FILE_TOOL_ID = 'systemTool-hivechat-sandbox-write-file';
const EXEC_SHELL_TOOL_ID = 'systemTool-hivechat-sandbox-exec-shell';
const EXEC_ARGS_TOOL_ID = 'systemTool-hivechat-sandbox-exec-args';
const CONTINUE_COMMAND_TOOL_ID = 'systemTool-hivechat-sandbox-continue-command';
const STOP_COMMAND_TOOL_ID = 'systemTool-hivechat-sandbox-stop-command';
const LEGACY_EXEC_TOOL_ID = 'systemTool-hivechat-sandbox-exec';
const SANDBOX_CONTEXT_TOKEN_VAR = 'SandboxContextToken';
const getPositiveIntEnv = (key: string, fallback: number) => {
  const value = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const DEFAULT_EXEC_TIMEOUT_SECONDS = getPositiveIntEnv('HIVECHAT_SANDBOX_EXEC_TIMEOUT_SECONDS', 30);
const MAX_EXEC_TIMEOUT_SECONDS = Math.max(
  DEFAULT_EXEC_TIMEOUT_SECONDS,
  getPositiveIntEnv('HIVECHAT_SANDBOX_EXEC_MAX_TIMEOUT_SECONDS', 120)
);
const DEFAULT_AGENT_EXEC_WAIT_SECONDS = getPositiveIntEnv(
  'HIVECHAT_SANDBOX_AGENT_EXEC_WAIT_SECONDS',
  20
);
const MAX_AGENT_EXEC_WAIT_SECONDS = Math.max(
  DEFAULT_AGENT_EXEC_WAIT_SECONDS,
  getPositiveIntEnv('HIVECHAT_SANDBOX_AGENT_EXEC_MAX_WAIT_SECONDS', 300)
);
const SANDBOX_WORKSPACE_PREFIX = '/workspace';

const withRawResponseOutput = (outputs: FlowNodeOutputItemType[]): FlowNodeOutputItemType[] => [
  ...outputs,
  {
    id: NodeOutputKeyEnum.rawResponse,
    key: NodeOutputKeyEnum.rawResponse,
    required: true,
    label: 'rawResponse',
    description: 'Complete tool response payload',
    valueType: WorkflowIOValueTypeEnum.any,
    type: FlowNodeOutputTypeEnum.static
  }
];

const buildVersion = ({
  inputSchema,
  outputSchema
}: {
  inputSchema: JSONSchemaInputType;
  outputSchema: JSONSchemaOutputType;
}) => ({
  value: TOOL_VERSION,
  inputs: jsonSchema2NodeInput({
    jsonSchema: inputSchema,
    schemaType: 'http'
  }),
  outputs: withRawResponseOutput(jsonSchema2NodeOutput(outputSchema))
});

const toolsetMeta = {
  tags: [TOOL_TAG_ID] as string[],
  author: 'HiveChat',
  avatar: '/imgs/workflow/tool.svg',
  status: PluginStatusEnum.Normal,
  defaultInstalled: true,
  currentCost: 0,
  originCost: 0,
  systemKeyCost: 0,
  hasTokenFee: false
};

const listFilesInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Directory to inspect inside the sandbox workspace. Use an empty string, "." or "/" for the workspace root. Relative paths like input or src are preferred.'
    }
  }
};

const listFilesOutputSchema: JSONSchemaOutputType = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Sandbox session id'
    },
    path: {
      type: 'string',
      description: 'Directory path that was listed'
    },
    workspaceContainerPath: {
      type: 'string',
      description: 'Workspace root path inside the sandbox container'
    },
    entries: {
      type: 'array',
      description: 'Files and directories under the target path',
      items: {
        type: 'object'
      }
    }
  }
};

const readFileInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Relative path of the file to read, for example input/report.txt'
    }
  },
  required: ['path']
};

const readFileOutputSchema: JSONSchemaOutputType = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'File path that was read'
    },
    sizeBytes: {
      type: 'number',
      description: 'File size in bytes'
    },
    truncated: {
      type: 'boolean',
      description: 'Whether the file content was truncated by the sandbox API'
    },
    contentText: {
      type: 'string',
      description: 'UTF-8 decoded file content when the file is text'
    },
    contentBase64: {
      type: 'string',
      description: 'Raw file content encoded as base64'
    }
  }
};

const writeFileInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Relative path to write, for example src/main.py or input/notes.txt'
    },
    content: {
      type: 'string',
      description:
        'UTF-8 text content to write. Use this for text files only, and do not send it together with contentBase64.'
    },
    contentBase64: {
      type: 'string',
      description:
        'Binary or exact file content encoded as base64. Use this for binary or exact byte writes only, and do not send it together with content.'
    },
    overwrite: {
      type: 'boolean',
      description: 'Whether an existing file can be replaced. Defaults to true'
    },
    contentType: {
      type: 'string',
      description: 'Optional MIME type sent to the sandbox upload endpoint'
    }
  },
  required: ['path']
};

const writeFileOutputSchema: JSONSchemaOutputType = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'File path that was written'
    },
    uploaded: {
      type: 'array',
      description: 'Uploaded file summary returned by the sandbox',
      items: {
        type: 'object'
      }
    },
    workspaceBytes: {
      type: 'number',
      description: 'Current workspace size in bytes'
    },
    degraded: {
      type: 'boolean',
      description: 'Whether the sandbox session is in degraded mode'
    }
  }
};

const execShellInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description:
        'Shell command to execute. Use this by default because it is the most natural and reliable choice for the agent.'
    },
    stdin: {
      type: 'string',
      description: 'Optional standard input text'
    },
    timeoutSeconds: {
      type: 'number',
      description: `Optional hard timeout in seconds for the underlying process. Leave empty unless you want the command to be force-limited.`
    },
    waitSeconds: {
      type: 'number',
      description: `How long to wait before returning control to the agent. Defaults to ${DEFAULT_AGENT_EXEC_WAIT_SECONDS}s and is capped at ${MAX_AGENT_EXEC_WAIT_SECONDS}s. If the command is still running, call Continue Command or Stop Command next.`
    },
    workdir: {
      type: 'string',
      description: 'Working directory relative to /workspace or an absolute sandbox path'
    },
    env: {
      type: 'object',
      description: 'Additional environment variables'
    }
  },
  required: ['command']
};

const execArgsInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    argv: {
      type: 'array',
      description:
        'Direct argv execution without a shell, for example ["python3","-V"]. Use this only when shell command form is unsuitable or exact argument passing is required.',
      items: {
        type: 'string'
      }
    },
    stdin: {
      type: 'string',
      description: 'Optional standard input text'
    },
    timeoutSeconds: {
      type: 'number',
      description: `Optional hard timeout in seconds for the underlying process. Leave empty unless you want the command to be force-limited.`
    },
    waitSeconds: {
      type: 'number',
      description: `How long to wait before returning control to the agent. Defaults to ${DEFAULT_AGENT_EXEC_WAIT_SECONDS}s and is capped at ${MAX_AGENT_EXEC_WAIT_SECONDS}s. If the command is still running, call Continue Command or Stop Command next.`
    },
    workdir: {
      type: 'string',
      description: 'Working directory relative to /workspace or an absolute sandbox path'
    },
    env: {
      type: 'object',
      description: 'Additional environment variables'
    }
  },
  required: ['argv']
};

const legacyExecInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description:
        'Legacy compatibility field. New workflows should use Exec Shell instead of this combined tool.'
    },
    argv: {
      type: 'array',
      description:
        'Legacy compatibility field. New workflows should use Exec Args when exact argument passing is required.',
      items: {
        type: 'string'
      }
    },
    stdin: {
      type: 'string',
      description: 'Optional standard input text'
    },
    timeoutSeconds: {
      type: 'number',
      description: `Optional hard timeout in seconds for the underlying process. Leave empty unless you want the command to be force-limited.`
    },
    waitSeconds: {
      type: 'number',
      description: `How long to wait before returning control to the agent. Defaults to ${DEFAULT_AGENT_EXEC_WAIT_SECONDS}s and is capped at ${MAX_AGENT_EXEC_WAIT_SECONDS}s.`
    },
    workdir: {
      type: 'string',
      description: 'Working directory relative to /workspace or an absolute sandbox path'
    },
    env: {
      type: 'object',
      description: 'Additional environment variables'
    }
  }
};

const execOutputSchema: JSONSchemaOutputType = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Sandbox session id'
    },
    running: {
      type: 'boolean',
      description: 'Whether the command is still running'
    },
    completed: {
      type: 'boolean',
      description: 'Whether the command has completed'
    },
    terminalId: {
      type: 'string',
      description: 'Interactive terminal id for continuing or stopping a long-running command'
    },
    offset: {
      type: 'number',
      description: 'Offset used for this output snapshot'
    },
    nextOffset: {
      type: 'number',
      description: 'Use this offset in Continue Command or Stop Command to fetch only new output'
    },
    outputText: {
      type: 'string',
      description: 'Key terminal output snapshot for the command'
    },
    terminalOutputText: {
      type: 'string',
      description:
        'Full terminal output returned by the bridge after stripping the injected exec echo'
    },
    terminalOutputTruncated: {
      type: 'boolean',
      description:
        'Whether terminalOutputText was truncated because earlier bytes were no longer available'
    },
    outputTruncated: {
      type: 'boolean',
      description: 'Whether terminal output was truncated because the requested offset was too old'
    },
    previewTruncated: {
      type: 'boolean',
      description: 'Whether outputText was trimmed for brevity'
    },
    exitCode: {
      type: 'number',
      description: 'Process exit code'
    },
    timedOut: {
      type: 'boolean',
      description: 'Whether execution hit the timeout limit'
    },
    durationMs: {
      type: 'number',
      description: 'Execution duration in milliseconds'
    },
    stdout: {
      type: 'string',
      description: 'Captured standard output'
    },
    stderr: {
      type: 'string',
      description: 'Captured standard error'
    },
    command: {
      type: 'string',
      description: 'Original shell command when Exec Shell was used'
    },
    argv: {
      type: 'array',
      description: 'Original argv when Exec Args was used',
      items: {
        type: 'string'
      }
    },
    stdin: {
      type: 'string',
      description: 'Standard input text passed to the command, when provided'
    },
    workdir: {
      type: 'string',
      description: 'Working directory used for execution'
    },
    actionHint: {
      type: 'string',
      description: 'Next-step hint for the agent when the command is still running'
    }
  }
};

const continueCommandInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    terminalId: {
      type: 'string',
      description: 'terminalId returned by Exec Shell or Exec Args when a command is still running'
    },
    offset: {
      type: 'number',
      description: 'nextOffset returned by the previous command snapshot'
    },
    waitSeconds: {
      type: 'number',
      description: `How long to keep waiting for more output before returning again. Defaults to ${DEFAULT_AGENT_EXEC_WAIT_SECONDS}s and is capped at ${MAX_AGENT_EXEC_WAIT_SECONDS}s.`
    }
  },
  required: ['terminalId', 'offset']
};

const stopCommandInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    terminalId: {
      type: 'string',
      description: 'terminalId returned by Exec Shell or Exec Args'
    },
    offset: {
      type: 'number',
      description:
        'nextOffset returned by the previous command snapshot so only new output is fetched'
    },
    signal: {
      type: 'string',
      description:
        'Stop signal to send. Prefer interrupt first because it is the most reliable in this sandbox. Supported friendly values: interrupt, terminate, eof, kill.'
    },
    waitSeconds: {
      type: 'number',
      description: 'How long to wait for final output after signaling the command to stop.'
    }
  },
  required: ['terminalId', 'offset']
};

const stopCommandOutputSchema: JSONSchemaOutputType = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Sandbox session id'
    },
    stopped: {
      type: 'boolean',
      description: 'Whether the command stopped after signaling'
    },
    running: {
      type: 'boolean',
      description: 'Whether the command is still running after signaling'
    },
    completed: {
      type: 'boolean',
      description: 'Whether the command has completed after signaling'
    },
    terminalId: {
      type: 'string',
      description: 'Interactive terminal id'
    },
    signal: {
      type: 'string',
      description: 'Signal sent to the command'
    },
    offset: {
      type: 'number',
      description: 'Offset used for this output snapshot'
    },
    nextOffset: {
      type: 'number',
      description: 'Next offset for any further output polling'
    },
    outputText: {
      type: 'string',
      description: 'Key terminal output snapshot after signaling'
    },
    outputTruncated: {
      type: 'boolean',
      description: 'Whether terminal output was truncated because the requested offset was too old'
    },
    previewTruncated: {
      type: 'boolean',
      description: 'Whether outputText was trimmed for brevity'
    },
    exitCode: {
      type: 'number',
      description: 'Process exit code if available'
    },
    workdir: {
      type: 'string',
      description: 'Working directory used by the command'
    }
  }
};

const hiddenLocalSystemTools: AppToolTemplateItemType[] = [
  {
    id: LEGACY_EXEC_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Exec',
    intro: 'Legacy compatibility tool for older HiveChat sandbox workflows',
    toolDescription:
      'Compatibility alias for older workflows. New workflows should use Exec Shell by default, or Exec Args when exact argument passing is required.',
    versionList: [
      buildVersion({
        inputSchema: legacyExecInputSchema,
        outputSchema: execOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 999,
    ...toolsetMeta
  }
];

const localSystemTools: AppToolTemplateItemType[] = [
  {
    id: TOOLSET_ID,
    parentId: null,
    isFolder: true,
    name: 'HiveChat Sandbox',
    intro: 'Native HiveChat sandbox tools powered by the external sandbox bridge',
    toolDescription:
      'Operate on the current HiveChat sandbox workspace. Inspect input/ and existing files first, write deliverables to output/, and use execution tools only after you know what files and commands are needed.',
    userGuide:
      'HiveChat injects SandboxContextToken, SandboxChatId and SandboxSessionId automatically. Treat this like a small workspace: user-provided files are usually under input/, generated files should go to output/, and code can live under src/ or the workspace root. Prefer list/read before write/exec, avoid re-reading large files unless necessary, and return concise conclusions instead of raw base64 or long dumps. For execution, default to Exec Shell with command. Use Exec Args only when shell command form is unsuitable, fails because of quoting issues, or exact argv passing is required. If Exec Shell or Exec Args returns running=true, inspect outputText and then call Continue Command to wait longer or Stop Command to terminate it. Do not assume a long-running command has finished until completed=true or running=false.',
    pluginOrder: 30,
    workflow: {
      nodes: [],
      edges: []
    },
    ...toolsetMeta
  },
  {
    id: LIST_FILES_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'List Files',
    intro: 'List files and directories in the current HiveChat sandbox session',
    toolDescription:
      'Inspect a directory such as input/, output/ or src/ before taking further actions. Use this first when you need to discover available files.',
    versionList: [
      buildVersion({
        inputSchema: listFilesInputSchema,
        outputSchema: listFilesOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 31,
    ...toolsetMeta
  },
  {
    id: READ_FILE_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Read File',
    intro: 'Read a file from the current HiveChat sandbox session',
    toolDescription:
      'Read a file when you already know the path. Best for confirming small text files or extracting exact content after listing.',
    versionList: [
      buildVersion({
        inputSchema: readFileInputSchema,
        outputSchema: readFileOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 32,
    ...toolsetMeta
  },
  {
    id: WRITE_FILE_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Write File',
    intro: 'Write or overwrite a file inside the current HiveChat sandbox session',
    toolDescription:
      'Create or replace a file in the sandbox. Prefer writing final artifacts to output/ and source files to src/ or a task-specific folder. Provide exactly one of content or contentBase64.',
    versionList: [
      buildVersion({
        inputSchema: writeFileInputSchema,
        outputSchema: writeFileOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 33,
    ...toolsetMeta
  },
  {
    id: EXEC_SHELL_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Exec Shell',
    intro: 'Execute a shell command inside the current HiveChat sandbox session',
    toolDescription:
      'Default execution tool. Run one shell command inside the sandbox once the needed files and workdir are clear. Prefer this tool first because it matches normal agent behavior best. If the command keeps running beyond the wait window, the tool returns the current output snapshot and a terminalId so the agent can continue waiting or stop it explicitly.',
    versionList: [
      buildVersion({
        inputSchema: execShellInputSchema,
        outputSchema: execOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 34,
    ...toolsetMeta
  },
  {
    id: EXEC_ARGS_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Exec Args',
    intro: 'Execute a process with exact argv inside the current HiveChat sandbox session',
    toolDescription:
      'Advanced execution tool. Use this only when Exec Shell is unsuitable or exact argument passing is required. If the command keeps running beyond the wait window, the tool returns the current output snapshot and a terminalId so the agent can continue waiting or stop it explicitly.',
    versionList: [
      buildVersion({
        inputSchema: execArgsInputSchema,
        outputSchema: execOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 35,
    ...toolsetMeta
  },
  {
    id: CONTINUE_COMMAND_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Continue Command',
    intro: 'Wait longer for a previously started sandbox command and fetch only the new output',
    toolDescription:
      'Use this only after Exec Shell or Exec Args returned running=true. Provide the terminalId and nextOffset from the previous response. This returns only the newly produced output and whether the command has now completed.',
    versionList: [
      buildVersion({
        inputSchema: continueCommandInputSchema,
        outputSchema: execOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 36,
    ...toolsetMeta
  },
  {
    id: STOP_COMMAND_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Stop Command',
    intro: 'Stop a previously started sandbox command and fetch the latest output',
    toolDescription:
      'Use this after Exec Shell, Exec Args or Continue Command when the command should be stopped. Prefer signal=interrupt first. If you request terminate or kill, the bridge may automatically fall back to interrupt when the stronger signal cannot be delivered reliably.',
    versionList: [
      buildVersion({
        inputSchema: stopCommandInputSchema,
        outputSchema: stopCommandOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 37,
    ...toolsetMeta
  }
];

const localSystemToolsById = new Map(
  [...localSystemTools, ...hiddenLocalSystemTools].map((tool) => [tool.id, tool] as const)
);
const localSystemToolIdSet = new Set(localSystemToolsById.keys());

const getBridgeConfig = () => {
  const baseUrl = (
    process.env.HIVECHAT_SANDBOX_BRIDGE_URL ||
    process.env.HIVECHAT_BRIDGE_URL ||
    'http://127.0.0.1:3080'
  )
    .trim()
    .replace(/\/+$/g, '');
  const apiKey = (
    process.env.HIVECHAT_SANDBOX_BRIDGE_API_KEY ||
    process.env.HIVECHAT_BRIDGE_API_KEY ||
    ''
  ).trim();
  const timeoutMs = Math.max(
    1000,
    Number.parseInt(process.env.HIVECHAT_SANDBOX_BRIDGE_TIMEOUT_MS || '120000', 10) || 120000
  );

  return {
    baseUrl,
    apiKey,
    timeoutMs
  };
};

const bridgeRequest = async (path: string, body: Record<string, any>) => {
  const { baseUrl, apiKey, timeoutMs } = getBridgeConfig();
  if (!baseUrl) {
    throw new Error('Missing HIVECHAT_SANDBOX_BRIDGE_URL');
  }
  if (!apiKey) {
    throw new Error('Missing HIVECHAT_SANDBOX_BRIDGE_API_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(async () => ({
      error: await response.text().catch(() => '')
    }));

    if (!response.ok) {
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : typeof payload?.message === 'string'
            ? payload.message
            : `HiveChat sandbox bridge request failed: ${response.status}`;
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const getOptionalString = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
};

const getFirstDefined = (...values: any[]) =>
  values.find((value) => value !== undefined && value !== null);

const normalizeSandboxRelativePathInput = (
  value: any,
  {
    allowRoot = false
  }: {
    allowRoot?: boolean;
  } = {}
) => {
  if (value === undefined || value === null) {
    return allowRoot ? '' : undefined;
  }

  let candidate = String(value).trim().replace(/\\/g, '/');
  if (!candidate) {
    return allowRoot ? '' : undefined;
  }

  if (
    candidate === '.' ||
    candidate === '/' ||
    candidate === SANDBOX_WORKSPACE_PREFIX ||
    candidate === `${SANDBOX_WORKSPACE_PREFIX}/`
  ) {
    return allowRoot ? '' : undefined;
  }

  if (candidate.startsWith(`${SANDBOX_WORKSPACE_PREFIX}/`)) {
    candidate = candidate.slice(SANDBOX_WORKSPACE_PREFIX.length + 1);
  }

  return candidate;
};

const normalizeSandboxDisplayPath = (value: any) => {
  const normalized = normalizeSandboxRelativePathInput(value, {
    allowRoot: true
  });
  return normalized === undefined ? '' : normalized;
};

const getOptionalNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getOptionalBoolean = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

const getOptionalStringArray = (value: any) => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((item) => String(item));
};

const normalizeExecTimeoutSeconds = (value: any) => {
  const parsed = getOptionalNumber(value);
  if (parsed === undefined || parsed <= 0) {
    return DEFAULT_EXEC_TIMEOUT_SECONDS;
  }
  return Math.min(MAX_EXEC_TIMEOUT_SECONDS, Math.max(1, Math.floor(parsed)));
};
const getOptionalExecTimeoutSeconds = (value: any) => {
  const parsed = getOptionalNumber(value);
  if (parsed === undefined || parsed <= 0) {
    return undefined;
  }
  return Math.min(MAX_EXEC_TIMEOUT_SECONDS, Math.max(1, Math.floor(parsed)));
};
const normalizeAgentExecWaitSeconds = (value: any) => {
  const parsed = getOptionalNumber(value);
  if (parsed === undefined || parsed <= 0) {
    return DEFAULT_AGENT_EXEC_WAIT_SECONDS;
  }
  return Math.min(MAX_AGENT_EXEC_WAIT_SECONDS, Math.max(1, Math.floor(parsed)));
};

const decodeTextContent = (base64: string) => {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const text = buffer.toString('utf8');
    if (text.includes('\u0000') || text.includes('\uFFFD')) {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
};

const buildExecOutputFromResponse = (response: Record<string, any>) => {
  const outputText = String(
    getFirstDefined(
      response.output_text,
      response.outputText,
      response.terminal_output_text,
      response.terminalOutputText,
      response.stdout,
      ''
    )
  );
  const terminalOutputText = String(
    getFirstDefined(response.terminal_output_text, response.terminalOutputText, outputText, '')
  );
  const stdout = String(getFirstDefined(response.stdout, terminalOutputText, ''));
  const stderr = String(getFirstDefined(response.stderr, ''));
  const exitCodeValue = getFirstDefined(response.exit_code, response.exitCode);

  return {
    sessionId: String(getFirstDefined(response.session_id, response.sessionId, '')),
    running: Boolean(response.running),
    completed: response.completed === undefined ? !response.running : Boolean(response.completed),
    terminalId: String(getFirstDefined(response.terminal_id, response.terminalId, '')),
    offset: Number(getFirstDefined(response.offset, 0)),
    nextOffset: Number(getFirstDefined(response.next_offset, response.nextOffset, 0)),
    outputText,
    terminalOutputText,
    terminalOutputTruncated: Boolean(
      getFirstDefined(response.terminal_output_truncated, response.terminalOutputTruncated, false)
    ),
    outputTruncated: Boolean(
      getFirstDefined(response.output_truncated, response.outputTruncated, false)
    ),
    previewTruncated: Boolean(
      getFirstDefined(response.preview_truncated, response.previewTruncated, false)
    ),
    exitCode: exitCodeValue === undefined || exitCodeValue === null ? null : Number(exitCodeValue),
    timedOut: Boolean(getFirstDefined(response.timed_out, response.timedOut, false)),
    durationMs: Number(getFirstDefined(response.duration_ms, response.durationMs, 0)),
    stdout,
    stderr,
    workdir: String(getFirstDefined(response.workdir, '')),
    actionHint: String(getFirstDefined(response.action_hint, response.actionHint, '')),
    stopped: Boolean(response.stopped),
    signal: String(getFirstDefined(response.signal, '')),
    command: getOptionalString(response.command) ?? null,
    argv: Array.isArray(response.argv) ? response.argv.map(String) : null,
    stdin: response.stdin === undefined || response.stdin === null ? null : String(response.stdin),
    [NodeOutputKeyEnum.rawResponse]: response
  };
};

const buildListFilesToolResponseForUI = ({
  summary,
  output
}: {
  summary: string;
  output: {
    path: string;
    workspaceContainerPath: string;
    entries: Array<Record<string, any>>;
  };
}) => ({
  kind: 'sandbox_list_files',
  summary,
  path: normalizeSandboxDisplayPath(output.path),
  workspaceContainerPath: String(output.workspaceContainerPath || SANDBOX_WORKSPACE_PREFIX),
  entries: output.entries
});

const buildReadFileToolResponseForUI = ({
  summary,
  output
}: {
  summary: string;
  output: {
    path: string;
    sizeBytes: number;
    truncated: boolean;
    contentText?: string;
    contentBase64: string;
  };
}) => ({
  kind: 'sandbox_read_file',
  summary,
  path: normalizeSandboxDisplayPath(output.path),
  sizeBytes: output.sizeBytes,
  truncated: output.truncated,
  contentText: output.contentText,
  hasBinaryContent: !output.contentText && Boolean(output.contentBase64)
});

const buildWriteFileToolResponseForUI = ({
  summary,
  output
}: {
  summary: string;
  output: {
    path: string;
    uploaded: Array<Record<string, any>>;
    workspaceBytes: number;
    degraded: boolean;
  };
}) => ({
  kind: 'sandbox_write_file',
  summary,
  path: normalizeSandboxDisplayPath(output.path),
  uploaded: output.uploaded,
  workspaceBytes: output.workspaceBytes,
  degraded: output.degraded
});

const buildExecToolResponseForUI = ({
  summary,
  output,
  command,
  argv,
  stdin,
  workdir
}: {
  summary: string;
  output: ReturnType<typeof buildExecOutputFromResponse>;
  command?: string;
  argv?: string[];
  stdin?: string;
  workdir?: string;
}) => ({
  kind: 'sandbox_exec',
  summary,
  running: output.running,
  completed: output.completed,
  stopped: output.stopped,
  terminalId: output.terminalId,
  offset: output.offset,
  nextOffset: output.nextOffset,
  command: command ?? output.command ?? null,
  argv: argv ?? output.argv ?? null,
  stdin: stdin ?? output.stdin ?? null,
  workdir: getOptionalString(output.workdir) ?? getOptionalString(workdir) ?? '',
  outputText: output.outputText,
  terminalOutputText: output.terminalOutputText,
  terminalOutputTruncated: output.terminalOutputTruncated,
  outputTruncated: output.outputTruncated,
  previewTruncated: output.previewTruncated,
  stdout: output.stdout,
  stderr: output.stderr,
  exitCode: output.exitCode,
  timedOut: output.timedOut,
  durationMs: output.durationMs,
  actionHint: output.actionHint,
  signal: output.signal
});

const resolveContextToken = ({
  inputs,
  variables
}: {
  inputs: Record<string, any>;
  variables?: Record<string, any>;
}) => {
  const inputToken = getOptionalString(inputs.contextToken);
  if (inputToken) return inputToken;

  const variableToken = getOptionalString(variables?.[SANDBOX_CONTEXT_TOKEN_VAR]);
  if (variableToken) return variableToken;

  throw new Error(
    `Missing sandbox context token. HiveChat must inject ${SANDBOX_CONTEXT_TOKEN_VAR} into FastGPT global variables.`
  );
};

export const getLocalSystemTools = (): AppToolTemplateItemType[] => localSystemTools;
export const getLocalSystemToolById = (toolId: string) => localSystemToolsById.get(toolId);

export const getLocalSystemToolTags = () => [
  {
    id: TOOL_TAG_ID,
    name: 'HiveChat Sandbox'
  }
];

export const isLocalSystemTool = (toolId: string) => localSystemToolIdSet.has(toolId);

export const getLocalSystemToolIds = () => ({
  toolsetId: TOOLSET_ID,
  listFilesToolId: LIST_FILES_TOOL_ID,
  readFileToolId: READ_FILE_TOOL_ID,
  writeFileToolId: WRITE_FILE_TOOL_ID,
  execShellToolId: EXEC_SHELL_TOOL_ID,
  execArgsToolId: EXEC_ARGS_TOOL_ID,
  continueCommandToolId: CONTINUE_COMMAND_TOOL_ID,
  stopCommandToolId: STOP_COMMAND_TOOL_ID,
  legacyExecToolId: LEGACY_EXEC_TOOL_ID
});

const runExecTool = async ({
  contextToken,
  inputs,
  command,
  argv
}: {
  contextToken: string;
  inputs: Record<string, any>;
  command?: string;
  argv?: string[];
}) => {
  const response = await bridgeRequest('/v1/exec/start', {
    contextToken,
    ...(command ? { command } : {}),
    ...(argv ? { argv } : {}),
    ...(getOptionalString(inputs.stdin) ? { stdin: getOptionalString(inputs.stdin) } : {}),
    ...(getOptionalExecTimeoutSeconds(inputs.timeoutSeconds) !== undefined
      ? { timeoutSeconds: getOptionalExecTimeoutSeconds(inputs.timeoutSeconds) }
      : {}),
    waitSeconds: normalizeAgentExecWaitSeconds(inputs.waitSeconds),
    ...(getOptionalString(inputs.workdir) ? { workdir: getOptionalString(inputs.workdir) } : {}),
    ...(inputs.env && typeof inputs.env === 'object' ? { env: inputs.env } : {})
  });

  const output = buildExecOutputFromResponse(response);
  const toolResponse = summarizeExecToolResponse({
    running: output.running,
    completed: output.completed,
    command,
    argv,
    exitCode: output.exitCode ?? undefined,
    timedOut: output.timedOut,
    actionHint: output.actionHint,
    terminalId: output.terminalId,
    nextOffset: output.nextOffset,
    outputText: output.outputText,
    stdout: output.stdout,
    stderr: output.stderr
  });

  return {
    output,
    toolResponse,
    toolResponseForUI: buildExecToolResponseForUI({
      summary: toolResponse,
      output,
      command,
      argv,
      stdin: getOptionalString(inputs.stdin),
      workdir: getOptionalString(inputs.workdir)
    })
  };
};

export const runLocalSystemTool = async ({
  toolId,
  inputs,
  variables
}: {
  toolId: string;
  inputs: Record<string, any>;
  variables?: Record<string, any>;
}) => {
  const contextToken = resolveContextToken({ inputs, variables });

  if (toolId === LIST_FILES_TOOL_ID) {
    const path = normalizeSandboxRelativePathInput(inputs.path, {
      allowRoot: true
    });
    const response = await bridgeRequest('/v1/files/list', {
      contextToken,
      ...(path !== undefined ? { path } : {})
    });

    const output = {
      sessionId: response.session_id || response.sessionId || '',
      path: normalizeSandboxDisplayPath(
        getFirstDefined(response.path, response.relative_path, path, '')
      ),
      workspaceContainerPath:
        response.workspace_container_path || response.workspaceContainerPath || '',
      entries: Array.isArray(response.entries) ? response.entries : [],
      [NodeOutputKeyEnum.rawResponse]: response
    };
    const toolResponse = summarizeListFilesToolResponse({
      path: output.path,
      entries: output.entries
    });

    return {
      output,
      toolResponse,
      toolResponseForUI: buildListFilesToolResponseForUI({
        summary: toolResponse,
        output
      })
    };
  }

  if (toolId === READ_FILE_TOOL_ID) {
    const path = normalizeSandboxRelativePathInput(inputs.path);
    if (!path) {
      throw new Error('path is required');
    }

    const response = await bridgeRequest('/v1/files/read', {
      contextToken,
      path
    });

    const contentBase64 = String(response.content_base64 || response.contentBase64 || '');
    const output = {
      path: normalizeSandboxDisplayPath(
        getFirstDefined(response.path, response.relative_path, path)
      ),
      sizeBytes: Number(response.size_bytes || response.sizeBytes || 0),
      truncated: Boolean(response.truncated),
      contentText: decodeTextContent(contentBase64),
      contentBase64,
      [NodeOutputKeyEnum.rawResponse]: response
    };
    const toolResponse = summarizeReadFileToolResponse({
      path: output.path,
      sizeBytes: output.sizeBytes,
      truncated: output.truncated,
      contentText: output.contentText
    });

    return {
      output,
      toolResponse,
      toolResponseForUI: buildReadFileToolResponseForUI({
        summary: toolResponse,
        output
      })
    };
  }

  if (toolId === WRITE_FILE_TOOL_ID) {
    const path = normalizeSandboxRelativePathInput(inputs.path);
    if (!path) {
      throw new Error('path is required');
    }

    const content = getOptionalString(inputs.content);
    const contentBase64 = getOptionalString(inputs.contentBase64);
    if (!content && !contentBase64) {
      throw new Error('content or contentBase64 is required');
    }
    if (content && contentBase64) {
      throw new Error('content and contentBase64 cannot be provided together');
    }

    const response = await bridgeRequest('/v1/files/write', {
      contextToken,
      path,
      ...(content !== undefined ? { content } : {}),
      ...(contentBase64 !== undefined ? { contentBase64 } : {}),
      ...(getOptionalBoolean(inputs.overwrite) !== undefined
        ? { overwrite: getOptionalBoolean(inputs.overwrite) }
        : {}),
      ...(getOptionalString(inputs.contentType)
        ? { contentType: getOptionalString(inputs.contentType) }
        : {})
    });

    const output = {
      path: normalizeSandboxDisplayPath(
        getFirstDefined(response.path, response.relative_path, path)
      ),
      uploaded: Array.isArray(response.uploaded) ? response.uploaded : [],
      workspaceBytes: Number(response.workspace_bytes || response.workspaceBytes || 0),
      degraded: Boolean(response.degraded),
      [NodeOutputKeyEnum.rawResponse]: response
    };
    const toolResponse = summarizeWriteFileToolResponse({
      path: output.path,
      uploaded: output.uploaded,
      workspaceBytes: output.workspaceBytes,
      degraded: output.degraded
    });

    return {
      output,
      toolResponse,
      toolResponseForUI: buildWriteFileToolResponseForUI({
        summary: toolResponse,
        output
      })
    };
  }

  if (toolId === LEGACY_EXEC_TOOL_ID) {
    const command = getOptionalString(inputs.command);
    const argv = getOptionalStringArray(inputs.argv);

    if (!command && !argv) {
      throw new Error('command or argv is required');
    }
    if (command && argv) {
      throw new Error('command and argv cannot be provided together');
    }

    return runExecTool({
      contextToken,
      inputs,
      command,
      argv
    });
  }

  if (toolId === EXEC_SHELL_TOOL_ID) {
    const command = getOptionalString(inputs.command);
    if (!command) {
      throw new Error('command is required');
    }

    return runExecTool({
      contextToken,
      inputs,
      command
    });
  }

  if (toolId === EXEC_ARGS_TOOL_ID) {
    const argv = getOptionalStringArray(inputs.argv);
    if (!argv) {
      throw new Error('argv is required');
    }

    return runExecTool({
      contextToken,
      inputs,
      argv
    });
  }

  if (toolId === CONTINUE_COMMAND_TOOL_ID) {
    const terminalId = getOptionalString(inputs.terminalId);
    if (!terminalId) {
      throw new Error('terminalId is required');
    }

    const offset = getOptionalNumber(inputs.offset);
    if (offset === undefined || offset < 0) {
      throw new Error('offset is required');
    }

    const response = await bridgeRequest('/v1/exec/continue', {
      contextToken,
      terminalId,
      offset,
      waitSeconds: normalizeAgentExecWaitSeconds(inputs.waitSeconds)
    });
    const output = buildExecOutputFromResponse(response);
    const toolResponse = summarizeExecToolResponse({
      running: output.running,
      completed: output.completed,
      exitCode: output.exitCode ?? undefined,
      timedOut: output.timedOut,
      actionHint: output.actionHint,
      terminalId: output.terminalId,
      nextOffset: output.nextOffset,
      outputText: output.outputText,
      stdout: output.stdout,
      stderr: output.stderr
    });

    return {
      output,
      toolResponse,
      toolResponseForUI: buildExecToolResponseForUI({
        summary: toolResponse,
        output
      })
    };
  }

  if (toolId === STOP_COMMAND_TOOL_ID) {
    const terminalId = getOptionalString(inputs.terminalId);
    if (!terminalId) {
      throw new Error('terminalId is required');
    }

    const offset = getOptionalNumber(inputs.offset);
    if (offset === undefined || offset < 0) {
      throw new Error('offset is required');
    }

    const response = await bridgeRequest('/v1/exec/stop', {
      contextToken,
      terminalId,
      offset,
      ...(getOptionalString(inputs.signal) ? { signal: getOptionalString(inputs.signal) } : {}),
      waitSeconds: normalizeAgentExecWaitSeconds(inputs.waitSeconds)
    });
    const output = buildExecOutputFromResponse(response);
    const toolResponse = summarizeExecToolResponse({
      running: output.running,
      completed: output.completed,
      exitCode: output.exitCode ?? undefined,
      timedOut: output.timedOut,
      actionHint: output.signal ? `stop signal sent: ${output.signal}` : undefined,
      terminalId: output.terminalId,
      nextOffset: output.nextOffset,
      outputText: output.outputText,
      stdout: output.stdout,
      stderr: output.stderr
    });

    return {
      output,
      toolResponse,
      toolResponseForUI: buildExecToolResponseForUI({
        summary: toolResponse,
        output
      })
    };
  }

  throw new Error(`Unsupported local system tool: ${toolId}`);
};
