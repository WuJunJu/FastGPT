#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const base = process.env.FASTGPT_BASE_URL || 'http://127.0.0.1:3100';
const username = process.env.FASTGPT_ROOT_USER || 'root';
const password = process.env.FASTGPT_ROOT_PASSWORD || 'Wujunjun0121';
const appName = 'HiveChat Sandbox Bridge';
const modelName = 'hivechat-sandbox-bridge';
const displayName = 'HiveChat Sandbox Bridge';
const outputPath = process.env.HIVECHAT_BRIDGE_OUTPUT || '/tmp/fastgpt-hivechat-bridge.json';
const execToolId = 'systemTool-hivechat-sandbox-exec-shell';
const execNodeId = 'sandboxExec';
const hashPassword = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sandboxVariables = [
  {
    key: 'chatId',
    label: 'chatId',
    type: 'internal',
    description: 'HiveChat chat id',
    valueType: 'string',
    required: false,
    defaultValue: ''
  },
  {
    key: 'SandboxChatId',
    label: 'SandboxChatId',
    type: 'internal',
    description: 'HiveChat sandbox chat id',
    valueType: 'string',
    required: false,
    defaultValue: ''
  },
  {
    key: 'SandboxSessionId',
    label: 'SandboxSessionId',
    type: 'internal',
    description: 'HiveChat sandbox session id',
    valueType: 'string',
    required: false,
    defaultValue: ''
  },
  {
    key: 'SandboxContextToken',
    label: 'SandboxContextToken',
    type: 'internal',
    description: 'HiveChat sandbox context token',
    valueType: 'string',
    required: false,
    defaultValue: ''
  }
];

const systemConfigNode = {
  nodeId: 'userGuide',
  name: '系统配置',
  intro: 'HiveChat sandbox bridge config',
  avatar: 'core/workflow/template/systemConfig',
  flowNodeType: 'userGuide',
  position: { x: 260, y: -470 },
  version: '481',
  inputs: [
    {
      key: 'welcomeText',
      renderTypeList: ['hidden'],
      valueType: 'string',
      label: 'core.app.Welcome Text',
      value: ''
    },
    {
      key: 'variables',
      renderTypeList: ['hidden'],
      valueType: 'any',
      label: 'core.app.Chat Variable',
      value: sandboxVariables
    },
    {
      key: 'questionGuide',
      renderTypeList: ['hidden'],
      valueType: 'any',
      label: 'core.app.Question Guide',
      value: { open: false }
    },
    {
      key: 'tts',
      renderTypeList: ['hidden'],
      valueType: 'any',
      label: '',
      value: { type: 'web' }
    },
    {
      key: 'whisper',
      renderTypeList: ['hidden'],
      valueType: 'any',
      label: '',
      value: { open: false, autoSend: false, autoTTSResponse: false }
    },
    {
      key: 'scheduleTrigger',
      renderTypeList: ['hidden'],
      valueType: 'any',
      label: '',
      value: null
    }
  ],
  outputs: []
};

const workflowStartNode = {
  nodeId: '448745',
  name: '工作流开始',
  intro: '',
  avatar: 'core/workflow/template/workflowStart',
  flowNodeType: 'workflowStart',
  position: { x: 620, y: -340 },
  version: '481',
  inputs: [
    {
      key: 'userChatInput',
      renderTypeList: ['reference', 'textarea'],
      valueType: 'string',
      label: '用户问题',
      required: true,
      toolDescription: '用户问题'
    }
  ],
  outputs: [
    {
      id: 'userChatInput',
      key: 'userChatInput',
      label: '用户问题',
      type: 'static',
      valueType: 'string'
    }
  ]
};

const answerNode = {
  nodeId: 'answerBridge',
  name: '返回结果',
  intro: 'Format sandbox exec response',
  avatar: 'core/workflow/template/reply',
  flowNodeType: 'answerNode',
  position: { x: 1570, y: -250 },
  version: '481',
  inputs: [
    {
      key: 'text',
      renderTypeList: ['textarea', 'reference'],
      valueType: 'any',
      required: true,
      isRichText: false,
      maxLength: 100000,
      label: '返回内容',
      description: '返回内容',
      placeholder: '返回内容',
      value: [execNodeId, 'stdout']
    }
  ],
  outputs: []
};

const prepareExecToolNode = (node) => ({
  ...node,
  nodeId: execNodeId,
  name: 'HiveChat Sandbox Exec',
  intro: 'Execute the HiveChat sandbox through FastGPT native system tools',
  position: { x: 1060, y: -470 },
  inputs: Array.isArray(node.inputs)
    ? node.inputs.map((input) => {
        if (input.key === 'command') {
          return {
            ...input,
            value: 'ls -1 input && wc -c input/*'
          };
        }
        if (input.key === 'timeoutSeconds') {
          return {
            ...input,
            value: 30
          };
        }
        return input;
      })
    : []
});

const buildAppBody = (execNode) => ({
  name: appName,
  avatar: 'core/app/type/workflowFill',
  intro: 'Execute HiveChat sandbox commands through FastGPT native system tools.',
  type: 'advanced',
  modules: [systemConfigNode, workflowStartNode, execNode, answerNode],
  edges: [
    {
      source: '448745',
      target: execNodeId,
      sourceHandle: '448745-source-right',
      targetHandle: `${execNodeId}-target-left`
    },
    {
      source: execNodeId,
      target: 'answerBridge',
      sourceHandle: `${execNodeId}-source-right`,
      targetHandle: 'answerBridge-target-left'
    }
  ],
  chatConfig: {
    variables: sandboxVariables,
    fileSelectConfig: {
      canSelectFile: true,
      canSelectImg: false,
      maxFiles: 10,
      canSelectVideo: false,
      canSelectAudio: false,
      canSelectCustomFileExtension: false,
      customFileExtensionList: [],
      autoInjectFileContent: true,
      inlineFileMetadata: false
    }
  }
});

const mustJson = async (response) => {
  const payload = await response.json().catch(async () => ({
    text: await response.text().catch(() => '')
  }));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload?.data ?? payload;
};

const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, init);
  return mustJson(response);
};

const login = async () => {
  const codePayload = await request(
    `/api/support/user/account/preLogin?username=${encodeURIComponent(username)}`
  );
  const loginPayload = await request('/api/support/user/account/loginByPassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: hashPassword(password),
      code: codePayload.code
    })
  });
  return loginPayload.token;
};

const authFetch = async (token, path, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('token', token);
  return request(path, { ...init, headers });
};

const getExecToolNode = async (token) => {
  const previewNode = await authFetch(
    token,
    `/api/core/app/tool/getPreviewNode?appId=${encodeURIComponent(execToolId)}`,
    {
      method: 'GET'
    }
  );
  return prepareExecToolNode(previewNode);
};

const ensureApp = async (token) => {
  const execNode = await getExecToolNode(token);
  const appBody = buildAppBody(execNode);

  const appList = await authFetch(token, '/api/core/app/list', {
    method: 'POST',
    body: JSON.stringify({ searchKey: appName, type: 'advanced' })
  });
  const existing = Array.isArray(appList)
    ? appList.find((item) => item?.name === appName && item?.type === 'advanced')
    : null;

  if (!existing) {
    const appId = await authFetch(token, '/api/core/app/create', {
      method: 'POST',
      body: JSON.stringify(appBody)
    });
    await authFetch(token, `/api/core/app/version/publish?appId=${encodeURIComponent(appId)}`, {
      method: 'POST',
      body: JSON.stringify({
        nodes: appBody.modules,
        edges: appBody.edges,
        chatConfig: appBody.chatConfig,
        isPublish: true,
        versionName: appName
      })
    });
    return appId;
  }

  const appId = existing._id || existing.id;
  await authFetch(token, `/api/core/app/update?appId=${encodeURIComponent(appId)}`, {
    method: 'POST',
    body: JSON.stringify({
      name: appName,
      intro: appBody.intro,
      nodes: appBody.modules,
      edges: appBody.edges,
      chatConfig: appBody.chatConfig
    })
  });
  await authFetch(token, `/api/core/app/version/publish?appId=${encodeURIComponent(appId)}`, {
    method: 'POST',
    body: JSON.stringify({
      nodes: appBody.modules,
      edges: appBody.edges,
      chatConfig: appBody.chatConfig,
      isPublish: true,
      versionName: appName
    })
  });
  return appId;
};

const ensureAppKey = async (token, appId) => {
  const keyList = await authFetch(
    token,
    `/api/support/openapi/list?appId=${encodeURIComponent(appId)}`,
    {
      method: 'GET'
    }
  );
  if (Array.isArray(keyList) && keyList.length > 0) {
    return keyList[0].apiKey;
  }
  return authFetch(token, '/api/support/openapi/create', {
    method: 'POST',
    body: JSON.stringify({
      appId,
      name: 'HiveChat Bridge Key'
    })
  });
};

const main = async () => {
  const token = await login();
  const appId = await ensureApp(token);
  const apiKey = await ensureAppKey(token, appId);
  const output = {
    appId,
    apiKey,
    modelName,
    displayName,
    endpoint: `${base}/api/v1/chat/completions`
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
