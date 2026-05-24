import { describe, expect, it } from 'vitest';
import { getPluginRuntimeVariables } from '@fastgpt/service/core/workflow/dispatch/plugin/run';

describe('getPluginRuntimeVariables', () => {
  it('keeps HiveChat sandbox context when a workflow tool runs as a child workflow', () => {
    const runtimeVariables = getPluginRuntimeVariables({
      pluginId: 'child-plugin',
      externalWorkflowVariables: {
        externalKey: 'external-value',
        SandboxContextToken: 'stale-external-token'
      },
      parentVariables: {
        userId: 'user-1',
        appId: 'parent-app',
        chatId: 'chat-1',
        responseChatItemId: 'response-1',
        histories: [],
        cTime: '2026-05-24 12:00',
        SandboxContextToken: 'hivechat-token',
        SandboxChatId: 'chat-1',
        SandboxSessionId: 'hc-chat-1',
        normalUserVariable: 'not-forwarded'
      }
    });

    expect(runtimeVariables).toMatchObject({
      externalKey: 'external-value',
      userId: 'user-1',
      appId: 'child-plugin',
      chatId: 'chat-1',
      responseChatItemId: 'response-1',
      cTime: '2026-05-24 12:00',
      SandboxContextToken: 'hivechat-token',
      SandboxChatId: 'chat-1',
      SandboxSessionId: 'hc-chat-1'
    });
    expect(runtimeVariables.normalUserVariable).toBeUndefined();
  });
});
