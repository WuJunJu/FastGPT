import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { type AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

export const updateToolInputValue = ({
  params,
  inputs
}: {
  params: Record<string, any>;
  inputs: FlowNodeInputItemType[];
}) => {
  return inputs.map((input) => ({
    ...input,
    value: params[input.key] ?? input.value
  }));
};

const getIntEnv = (key: string, def: number) => {
  const v = process.env[key];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const filterToolResponseToPreview = (response: AIChatItemValueItemType[]) => {
  const previewChars = getIntEnv('TOOL_RESPONSE_PREVIEW_CHARS', 500);
  return response.map((item) => {
    if (item.type === ChatItemValueTypeEnum.tool) {
      const formatTools = item.tools?.map((tool) => {
        return {
          ...tool,
          response: sliceStrStartEnd(tool.response, previewChars, previewChars)
        };
      });
      return {
        ...item,
        tools: formatTools
      };
    }

    return item;
  });
};

// Limit tool response length for context (DB storage / next-round context)
export const filterToolResponseForContext = (response: AIChatItemValueItemType[]) => {
  const contextChars = getIntEnv('TOOL_RESPONSE_CONTEXT_CHARS', 8000);
  return response.map((item) => {
    if (item.type === ChatItemValueTypeEnum.tool) {
      const tools = item.tools?.map((tool) => ({
        ...tool,
        response: sliceStrStartEnd(tool.response, contextChars, contextChars)
      }));
      return {
        ...item,
        tools
      };
    }
    return item;
  });
};

export const formatToolResponse = (toolResponses: any) => {
  if (typeof toolResponses === 'object') {
    return JSON.stringify(toolResponses, null, 2);
  }

  return toolResponses ? String(toolResponses) : 'none';
};

// 在原参上改变值，不修改原对象，tool workflow 中，使用的还是原对象
export const initToolCallEdges = (edges: RuntimeEdgeItemType[], entryNodeIds: string[]) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};

export const initToolNodes = (
  nodes: RuntimeNodeItemType[],
  entryNodeIds: string[],
  startParams?: Record<string, any>
) => {
  nodes.forEach((node) => {
    if (entryNodeIds.includes(node.nodeId)) {
      node.isEntry = true;
      if (startParams) {
        node.inputs = updateToolInputValue({ params: startParams, inputs: node.inputs });
      }
    }
  });
};
