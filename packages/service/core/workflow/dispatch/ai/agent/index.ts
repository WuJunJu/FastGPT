import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  ChatDispatchProps,
  DispatchNodeResultType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { filterToolNodeIdByEdges, getNodeErrResponse, getHistories } from '../../utils';
import { runToolCall } from './toolCall';
import { type DispatchToolModuleProps, type ToolNodeItemType } from './type';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chatValue2RuntimePrompt,
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getMultiplePrompt } from './constants';
import { filterToolResponseToPreview, filterToolResponseForContext } from './utils';
import { getFileContentFromLinks, getHistoryFileLinks } from '../../tools/readFiles';
import { formatInlineFileMetadata, formatTraditionalFileList } from '../utils';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { postTextCensor } from '../../../../chat/postTextCensor';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunTools = async (props: DispatchToolModuleProps): Promise<Response> => {
  let {
    node: { nodeId, name, isEntry, version, inputs },
    runtimeNodes,
    runtimeEdges,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    externalProvider,
    usageId,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      aiChatVision,
      aiChatReasoning
    }
  } = props;

  try {
    const toolModel = getLLMModel(model);
    const useVision = aiChatVision && toolModel.vision;
    const chatHistories = getHistories(history, histories);

    props.params.aiChatVision = aiChatVision && toolModel.vision;
    props.params.aiChatReasoning = aiChatReasoning && toolModel.reasoning;
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });

    // Gets the module to which the tool is connected
    const toolNodes = toolNodeIds
      .map((nodeId) => {
        const tool = runtimeNodes.find((item) => item.nodeId === nodeId);
        return tool;
      })
      .filter(Boolean)
      .map<ToolNodeItemType>((tool) => {
        const toolParams: FlowNodeInputItemType[] = [];
        // Raw json schema(MCP tool)
        let jsonSchema: JSONSchemaInputType | undefined = undefined;
        tool?.inputs.forEach((input) => {
          if (input.toolDescription) {
            toolParams.push(input);
          }

          if (input.key === NodeInputKeyEnum.toolData || input.key === 'toolData') {
            const value = input.value as McpToolDataType;
            jsonSchema = value.inputSchema;
          }
        });

        return {
          ...(tool as RuntimeNodeItemType),
          toolParams,
          jsonSchema
        };
      });

    // Check interactive entry
    props.node.isEntry = false;

    // 获取配置项
    const autoInjectFileContent = chatConfig?.fileSelectConfig?.autoInjectFileContent ?? true;
    const inlineFileMetadata = chatConfig?.fileSelectConfig?.inlineFileMetadata ?? false;

    const globalFiles = chatValue2RuntimePrompt(query).files;
    const { documentQuoteText, userFiles } = await getMultiInput({
      runningUserInfo,
      histories: chatHistories,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
      fileLinks,
      inputFiles: globalFiles,
      autoInjectFileContent,
      usageId
    });

    const concatenateSystemPrompt = [
      toolModel.defaultSystemChatPrompt,
      systemPrompt,
      documentQuoteText
        ? replaceVariable(getDocumentQuotePrompt(version), {
            quote: documentQuoteText
          })
        : ''
    ]
      .filter(Boolean)
      .join('\n\n===---===---===\n\n');

    const messages: ChatItemType[] = (() => {
      const value: ChatItemType[] = [
        ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
        // Add file input prompt to histories
        ...chatHistories.map((item) => {
          if (item.obj === ChatRoleEnum.Human) {
            return {
              ...item,
              value: toolCallMessagesAdapt({
                userInput: item.value,
                skip: autoInjectFileContent, // 自动注入时跳过文件元数据提示
                inlineMode: inlineFileMetadata
              })
            };
          }
          return item;
        }),
        {
          obj: ChatRoleEnum.Human,
          value: toolCallMessagesAdapt({
            skip: autoInjectFileContent, // 自动注入时跳过文件元数据提示
            inlineMode: inlineFileMetadata,
            userInput: runtimePrompt2ChatsValue({
              text: userChatInput,
              files: userFiles
            })
          })
        }
      ];
      if (lastInteractive && isEntry) {
        return value.slice(0, -2);
      }
      return value;
    })();

    // censor model and system key
    if (toolModel.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const {
      toolWorkflowInteractiveResponse,
      dispatchFlowResponse, // tool flow response
      toolCallInputTokens,
      toolCallOutputTokens,
      completeMessages = [], // The actual message sent to AI(just save text)
      assistantResponses = [], // FastGPT system store assistant.value response
      runTimes,
      finish_reason
    } = await (async () => {
      const adaptMessages = chats2GPTMessages({
        messages,
        reserveId: false,
        // Reserve previous tool calls in context
        reserveTool: true
      });
      const requestParams = {
        runtimeNodes,
        runtimeEdges,
        toolNodes,
        toolModel,
        messages: adaptMessages,
        interactiveEntryToolParams: lastInteractive?.toolParams
      };

      return runToolCall({
        ...props,
        ...requestParams,
        maxRunToolTimes: 100
      });
    })();

    const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens: toolCallInputTokens,
      outputTokens: toolCallOutputTokens
    });
    const modelUsage = externalProvider.openaiAccount?.key ? 0 : modelTotalPoints;

    const toolUsages = dispatchFlowResponse.map((item) => item.flowUsages).flat();
    const toolTotalPoints = toolUsages.reduce((sum, item) => sum + item.totalPoints, 0);

    // concat tool usage
    const totalPointsUsage = modelUsage + toolTotalPoints;

    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);
    // Context version with larger limit (env configurable)
    const contextAssistantResponses = filterToolResponseForContext
      ? filterToolResponseForContext(assistantResponses)
      : assistantResponses;
    const toolFlowMemories = dispatchFlowResponse.reduce<Record<string, any>>((acc, item) => {
      const memories = item[DispatchNodeResponseKeyEnum.memories];
      if (memories) {
        Object.assign(acc, memories);
      }
      return acc;
    }, {});

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
      },
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.assistantResponses]: previewAssistantResponses,
      [DispatchNodeResponseKeyEnum.memories]: {
        ...toolFlowMemories,
        __assistant_value_for_save: contextAssistantResponses
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: toolCallInputTokens,
        toolCallOutputTokens: toolCallOutputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(
          GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
          10000,
          useVision
        ),
        toolDetail: dispatchFlowResponse.map((item) => item.flowResponses).flat(),
        mergeSignId: nodeId,
        finishReason: finish_reason
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        // 模型本身的积分消耗
        {
          moduleName: name,
          model: modelName,
          totalPoints: modelUsage,
          inputTokens: toolCallInputTokens,
          outputTokens: toolCallOutputTokens
        },
        // 工具的消耗
        ...toolUsages
      ],
      [DispatchNodeResponseKeyEnum.interactive]: toolWorkflowInteractiveResponse
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

const getMultiInput = async ({
  runningUserInfo,
  histories,
  fileLinks,
  requestOrigin,
  maxFiles,
  customPdfParse,
  inputFiles,
  autoInjectFileContent,
  usageId
}: {
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  histories: ChatItemType[];
  fileLinks?: string[];
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  inputFiles: UserChatItemValueItemType['file'][];
  autoInjectFileContent: boolean;
  usageId?: string;
}) => {
  // Not file quote or auto inject is disabled
  if (!fileLinks || !autoInjectFileContent) {
    return {
      documentQuoteText: '',
      userFiles: inputFiles
    };
  }

  const filesFromHistories = getHistoryFileLinks(histories);
  const urls = [...fileLinks, ...filesFromHistories];

  if (urls.length === 0) {
    return {
      documentQuoteText: '',
      userFiles: []
    };
  }

  // Get files from histories
  const { text } = await getFileContentFromLinks({
    // Concat fileUrlList and filesFromHistories; remove not supported files
    urls,
    requestOrigin,
    maxFiles,
    customPdfParse,
    usageId,
    teamId: runningUserInfo.teamId,
    tmbId: runningUserInfo.tmbId
  });

  return {
    documentQuoteText: text,
    userFiles: fileLinks.map((url) => parseUrlToFileType(url)).filter(Boolean)
  };
};

/*
Tool call， auth add file prompt to question。
Guide the LLM to call tool.
*/
const toolCallMessagesAdapt = ({
  userInput,
  skip,
  inlineMode = false
}: {
  userInput: UserChatItemValueItemType[];
  skip?: boolean;
  inlineMode?: boolean;
}): UserChatItemValueItemType[] => {
  if (skip) return userInput;

  const files = userInput.filter((item) => item.type === 'file');

  if (files.length > 0) {
    const documentFiles = files.filter((file) => file.file?.type === 'file');
    const imageFiles = files.filter((file) => file.file?.type === 'image');

    const filesCount = documentFiles.length;
    const imgCount = imageFiles.length;

    // 内联模式：文件元数据紧贴在消息内容前
    if (inlineMode) {
      const fileMetadataBlock = formatInlineFileMetadata(documentFiles, imageFiles);

      // 查找文本内容
      const textItem = userInput.find((item) => item.type === 'text');
      const textContent = textItem?.text?.content || '';

      if (textContent) {
        // 有文本：在文本前插入文件元数据
        return userInput
          .map((item) => {
            if (item.type === 'text') {
              return {
                ...item,
                text: {
                  content: `${fileMetadataBlock}\n${textContent}`
                }
              };
            }
            // 移除file类型的item（元数据已内联到文本中）
            return null;
          })
          .filter(Boolean) as UserChatItemValueItemType[];
      } else {
        // 无文本：只有文件，创建纯文件元数据消息
        return [
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: fileMetadataBlock
            }
          }
        ];
      }
    } else {
      // 传统模式：统一列在消息末尾
      const fileListInfo = formatTraditionalFileList(documentFiles);

      if (userInput.some((item) => item.type === 'text')) {
        return userInput.map((item) => {
          if (item.type === 'text') {
            const text = item.text?.content || '';
            return {
              ...item,
              text: {
                content:
                  getMultiplePrompt({ fileCount: filesCount, imgCount, question: text }) +
                  fileListInfo
              }
            };
          }
          return item;
        });
      }

      return [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content:
              getMultiplePrompt({ fileCount: filesCount, imgCount, question: '' }) + fileListInfo
          }
        }
      ];
    }
  }

  return userInput;
};
