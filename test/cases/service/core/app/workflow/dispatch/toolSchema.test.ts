import { describe, expect, it } from 'vitest';
import {
  getToolParamDescription,
  isVisibleToolParamInput
} from '@fastgpt/service/core/workflow/dispatch/ai/tool/schema';

describe('tool schema helpers', () => {
  it('includes description-only tool inputs in the model schema', () => {
    expect(
      isVisibleToolParamInput({
        description: 'Shell argv list',
        toolDescription: ''
      } as any)
    ).toBe(true);
  });

  it('prefers toolDescription when both descriptions are present', () => {
    expect(
      getToolParamDescription({
        description: 'fallback description',
        toolDescription: 'preferred description'
      } as any)
    ).toBe('preferred description');
  });

  it('falls back to description and then empty string', () => {
    expect(
      getToolParamDescription({
        description: 'fallback description',
        toolDescription: ''
      } as any)
    ).toBe('fallback description');

    expect(
      getToolParamDescription({
        description: '',
        toolDescription: ''
      } as any)
    ).toBe('');
  });
});
