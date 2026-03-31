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
const EXEC_TOOL_ID = 'systemTool-hivechat-sandbox-exec';
const SANDBOX_CONTEXT_TOKEN_VAR = 'SandboxContextToken';

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
      description: 'Directory to inspect inside the sandbox workspace, for example input or src'
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
      description: 'UTF-8 text content to write'
    },
    contentBase64: {
      type: 'string',
      description: 'Binary or exact file content encoded as base64'
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

const execInputSchema: JSONSchemaInputType = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'Shell command to execute. Use this for normal shell commands'
    },
    argv: {
      type: 'array',
      description: 'Direct argv execution without a shell, for example ["python3","-V"]',
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
      description: 'Execution timeout in seconds'
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
    workdir: {
      type: 'string',
      description: 'Working directory used for execution'
    }
  }
};

const localSystemTools: AppToolTemplateItemType[] = [
  {
    id: TOOLSET_ID,
    parentId: null,
    isFolder: true,
    name: 'HiveChat Sandbox',
    intro: 'Native HiveChat sandbox tools powered by the external sandbox bridge',
    toolDescription:
      'Use HiveChat-managed sandbox sessions and uploaded files through the injected SandboxContextToken variable.',
    userGuide:
      'HiveChat injects SandboxContextToken, SandboxChatId and SandboxSessionId into FastGPT global variables. These tools consume that context automatically and do not change FastGPT built-in sandbox behavior.',
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
      'List the contents of a sandbox directory such as input, src or the workspace root.',
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
      'Read a file from the sandbox and return both base64 bytes and decoded text when possible.',
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
      'Create or replace a sandbox file using UTF-8 text content or raw base64 content.',
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
    id: EXEC_TOOL_ID,
    parentId: TOOLSET_ID,
    isFolder: false,
    name: 'Exec',
    intro: 'Execute a command inside the current HiveChat sandbox session',
    toolDescription:
      'Run a shell command or argv command inside the sandbox and return stdout, stderr and exit code.',
    versionList: [
      buildVersion({
        inputSchema: execInputSchema,
        outputSchema: execOutputSchema
      })
    ],
    workflow: {
      nodes: [],
      edges: []
    },
    pluginOrder: 34,
    ...toolsetMeta
  }
];

const localSystemToolIdSet = new Set(localSystemTools.map((tool) => tool.id));

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
  execToolId: EXEC_TOOL_ID
});

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
    const response = await bridgeRequest('/v1/files/list', {
      contextToken,
      ...(getOptionalString(inputs.path) ? { path: getOptionalString(inputs.path) } : {})
    });

    const output = {
      sessionId: response.session_id || response.sessionId || '',
      path: response.path || getOptionalString(inputs.path) || '',
      workspaceContainerPath:
        response.workspace_container_path || response.workspaceContainerPath || '',
      entries: Array.isArray(response.entries) ? response.entries : [],
      [NodeOutputKeyEnum.rawResponse]: response
    };

    return {
      output,
      toolResponse: summarizeListFilesToolResponse({
        path: output.path,
        entries: output.entries
      })
    };
  }

  if (toolId === READ_FILE_TOOL_ID) {
    const path = getOptionalString(inputs.path);
    if (!path) {
      throw new Error('path is required');
    }

    const response = await bridgeRequest('/v1/files/read', {
      contextToken,
      path
    });

    const contentBase64 = String(response.content_base64 || response.contentBase64 || '');
    const output = {
      path: response.path || path,
      sizeBytes: Number(response.size_bytes || response.sizeBytes || 0),
      truncated: Boolean(response.truncated),
      contentText: decodeTextContent(contentBase64),
      contentBase64,
      [NodeOutputKeyEnum.rawResponse]: response
    };

    return {
      output,
      toolResponse: summarizeReadFileToolResponse({
        path: output.path,
        sizeBytes: output.sizeBytes,
        truncated: output.truncated,
        contentText: output.contentText
      })
    };
  }

  if (toolId === WRITE_FILE_TOOL_ID) {
    const path = getOptionalString(inputs.path);
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
      path: response.path || path,
      uploaded: Array.isArray(response.uploaded) ? response.uploaded : [],
      workspaceBytes: Number(response.workspace_bytes || response.workspaceBytes || 0),
      degraded: Boolean(response.degraded),
      [NodeOutputKeyEnum.rawResponse]: response
    };

    return {
      output,
      toolResponse: summarizeWriteFileToolResponse({
        path: output.path,
        uploaded: output.uploaded,
        degraded: output.degraded
      })
    };
  }

  if (toolId === EXEC_TOOL_ID) {
    const command = getOptionalString(inputs.command);
    const argv = getOptionalStringArray(inputs.argv);
    if (!command && !argv) {
      throw new Error('command or argv is required');
    }
    if (command && argv) {
      throw new Error('command and argv cannot be provided together');
    }

    const response = await bridgeRequest('/v1/exec', {
      contextToken,
      ...(command ? { command } : {}),
      ...(argv ? { argv } : {}),
      ...(getOptionalString(inputs.stdin) ? { stdin: getOptionalString(inputs.stdin) } : {}),
      ...(getOptionalNumber(inputs.timeoutSeconds) !== undefined
        ? { timeoutSeconds: getOptionalNumber(inputs.timeoutSeconds) }
        : {}),
      ...(getOptionalString(inputs.workdir) ? { workdir: getOptionalString(inputs.workdir) } : {}),
      ...(inputs.env && typeof inputs.env === 'object' ? { env: inputs.env } : {})
    });

    const output = {
      sessionId: response.session_id || response.sessionId || '',
      exitCode: Number(response.exit_code || response.exitCode || 0),
      timedOut: Boolean(response.timed_out || response.timedOut),
      durationMs: Number(response.duration_ms || response.durationMs || 0),
      stdout: String(response.stdout || ''),
      stderr: String(response.stderr || ''),
      workdir: String(response.workdir || ''),
      [NodeOutputKeyEnum.rawResponse]: response
    };

    return {
      output,
      toolResponse: summarizeExecToolResponse({
        command,
        argv,
        exitCode: output.exitCode,
        timedOut: output.timedOut,
        stdout: output.stdout,
        stderr: output.stderr
      })
    };
  }

  throw new Error(`Unsupported local system tool: ${toolId}`);
};
