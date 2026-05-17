import { describe, expect, it } from 'vitest';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { initToolNodes } from '@fastgpt/service/core/workflow/dispatch/ai/tool/utils';
import { rewriteRuntimeWorkFlow } from '@fastgpt/service/core/workflow/dispatch/utils';
import * as workflowUtils from '@fastgpt/service/core/workflow/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { vi } from 'vitest';

const createInput = (key: string, value?: any): FlowNodeInputItemType => ({
  key,
  label: key,
  renderTypeList: [],
  valueType: 'string' as any,
  value,
  toolDescription: key
});

const createNode = (): RuntimeNodeItemType => {
  const originalInputs: FlowNodeInputItemType[] = [
    createInput('command'),
    createInput('argv'),
    createInput('content'),
    createInput('contentBase64')
  ];

  return {
    nodeId: 'tool-node',
    name: 'Tool Node',
    flowNodeType: 'tool' as any,
    isEntry: false,
    inputs: originalInputs.map((item) => ({ ...item })),
    originalInputs: originalInputs.map((item) => ({ ...item })),
    outputs: [] as FlowNodeOutputItemType[]
  };
};

describe('initToolNodes', () => {
  it('resets mutually exclusive exec params between tool calls', () => {
    const node = createNode();

    initToolNodes([node], ['tool-node'], {
      command: 'python3 script.py'
    });
    expect(node.inputs.find((item) => item.key === 'command')?.value).toBe('python3 script.py');
    expect(node.inputs.find((item) => item.key === 'argv')?.value).toBeUndefined();

    initToolNodes([node], ['tool-node'], {
      argv: ['python3', '-V']
    });
    expect(node.inputs.find((item) => item.key === 'command')?.value).toBeUndefined();
    expect(node.inputs.find((item) => item.key === 'argv')?.value).toEqual(['python3', '-V']);
  });

  it('resets mutually exclusive write params between tool calls', () => {
    const node = createNode();

    initToolNodes([node], ['tool-node'], {
      content: 'hello'
    });
    expect(node.inputs.find((item) => item.key === 'content')?.value).toBe('hello');
    expect(node.inputs.find((item) => item.key === 'contentBase64')?.value).toBeUndefined();

    initToolNodes([node], ['tool-node'], {
      contentBase64: 'aGVsbG8='
    });
    expect(node.inputs.find((item) => item.key === 'content')?.value).toBeUndefined();
    expect(node.inputs.find((item) => item.key === 'contentBase64')?.value).toBe('aGVsbG8=');
  });
});

describe('rewriteRuntimeWorkFlow', () => {
  it('adds originalInputs for system toolset child nodes so mutually exclusive params reset correctly', async () => {
    const childInputs: FlowNodeInputItemType[] = [
      createInput('content', 'stale text'),
      createInput('contentBase64')
    ];

    vi.spyOn(workflowUtils, 'getSystemToolRunTimeNodeFromSystemToolset').mockResolvedValueOnce([
      {
        nodeId: 'toolset-child',
        name: 'Write File',
        flowNodeType: FlowNodeTypeEnum.tool,
        isEntry: false,
        inputs: childInputs.map((item) => ({ ...item })),
        outputs: [] as FlowNodeOutputItemType[],
        toolConfig: {
          systemTool: {
            toolId: 'systemTool-hivechat-sandbox-write-file'
          }
        }
      } as RuntimeNodeItemType
    ]);

    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'toolset-parent',
        name: 'HiveChat Sandbox',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        isEntry: false,
        inputs: [],
        outputs: [] as FlowNodeOutputItemType[],
        toolConfig: {
          systemToolSet: {
            toolId: 'systemTool-hivechat-sandbox',
            toolList: []
          }
        }
      } as RuntimeNodeItemType
    ];
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'agent',
        target: 'toolset-parent',
        sourceHandle: 'selectedTools',
        targetHandle: 'selectedTools',
        status: 'active'
      } as RuntimeEdgeItemType
    ];

    await rewriteRuntimeWorkFlow({ nodes, edges, lang: 'zh-CN' as any });

    const childNode = nodes.find((node) => node.nodeId === 'toolset-child');
    expect(childNode).toBeTruthy();
    expect(childNode?.originalInputs?.find((item) => item.key === 'content')?.value).toBe(
      'stale text'
    );

    initToolNodes(nodes, ['toolset-child'], {
      contentBase64: 'aGVsbG8='
    });

    expect(childNode?.inputs.find((item) => item.key === 'content')?.value).toBeUndefined();
    expect(childNode?.inputs.find((item) => item.key === 'contentBase64')?.value).toBe('aGVsbG8=');
  });
});
