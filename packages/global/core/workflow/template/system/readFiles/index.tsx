import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { Output_Template_Error_Message } from '../../output';

export const ReadFilesNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.readFiles,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.readFiles,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/readFiles',
  name: i18nT('app:workflow.read_files'),
  intro: i18nT('app:workflow.read_files_tip'),
  showStatus: true,
  version: '4.9.2',
  isTool: true,
  courseUrl: '/docs/introduction/guide/course/fileinput/',
  inputs: [
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: i18nT('app:workflow.file_id_or_url'),
      toolDescription:
        'List of fileIds or URLs to read. Use fileId (24-character hex string) for files uploaded in this conversation, or full URL for external files. Example: ["6753f63fd6e15a77765ca448", "6753f640d6e15a77765ca449"]',
      required: true,
      value: []
    },
    {
      key: NodeInputKeyEnum.enableDocParse,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      valueType: WorkflowIOValueTypeEnum.boolean,
      label: i18nT('app:workflow.read_files_doc_switch') || 'Enable doc parsing',
      value: true
    },
    {
      key: NodeInputKeyEnum.enableImageParse,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      valueType: WorkflowIOValueTypeEnum.boolean,
      label: i18nT('app:workflow.read_files_image_switch') || 'Enable image parsing',
      value: false
    },
    {
      key: NodeInputKeyEnum.imageModel,
      renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('app:workflow.read_files_image_model') || 'Vision model for images',
      description:
        i18nT('app:workflow.read_files_image_model_desc') ||
        'Select a multimodal model to describe images.',
      required: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('app:workflow.read_files_result'),
      description: i18nT('app:workflow.read_files_result_desc'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.rawResponse,
      key: NodeOutputKeyEnum.rawResponse,
      label: i18nT('workflow:raw_response'),
      description: i18nT('workflow:tool_raw_response_description'),
      valueType: WorkflowIOValueTypeEnum.arrayObject,
      type: FlowNodeOutputTypeEnum.static
    },
    Output_Template_Error_Message
  ]
};
