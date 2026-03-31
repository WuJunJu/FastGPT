import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

type ToolParamInputLike = Pick<FlowNodeInputItemType, 'description' | 'toolDescription'>;

export const isVisibleToolParamInput = (input: ToolParamInputLike) =>
  Boolean(input.toolDescription || input.description);

export const getToolParamDescription = (input: ToolParamInputLike) =>
  input.toolDescription || input.description || '';
