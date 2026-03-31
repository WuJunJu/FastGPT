import { describe, expect, it } from 'vitest';
import { GPTMessages2Chats, chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  formatInlineFileMetadata,
  formatTraditionalFileList
} from '@fastgpt/service/core/workflow/dispatch/ai/utils';

describe('FastGPT file upload context', () => {
  it('preserves fileId when adapting file_url messages', () => {
    const chats = GPTMessages2Chats({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            {
              type: 'file_url',
              name: 'report.pdf',
              url: 'https://fastgpt.local/file?token=abc',
              key: 'chat/user-1/chat-1/report.pdf',
              fileId: '507f1f77bcf86cd799439011'
            }
          ]
        }
      ]
    });

    expect(chats[0]?.value[0]?.file).toMatchObject({
      name: 'report.pdf',
      key: 'chat/user-1/chat-1/report.pdf',
      fileId: '507f1f77bcf86cd799439011'
    });

    const messages = chats2GPTMessages({
      messages: chats,
      reserveId: false
    });
    expect(messages[0]).toMatchObject({
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: [
        {
          type: 'file_url',
          name: 'report.pdf',
          key: 'chat/user-1/chat-1/report.pdf',
          fileId: '507f1f77bcf86cd799439011'
        }
      ]
    });
  });

  it('prefers fileId when formatting file metadata for model context', () => {
    const fileItem = {
      type: 'file',
      file: {
        type: ChatFileTypeEnum.file,
        name: 'report.pdf',
        url: 'https://hivechat.local/api/storage/download?key=uploads/chat/user-1/report.pdf',
        key: 'chat/user-1/chat-1/report.pdf',
        fileId: '507f1f77bcf86cd799439012'
      }
    } as const;

    expect(formatInlineFileMetadata([fileItem as any], [])).toContain('507f1f77bcf86cd799439012');
    expect(formatTraditionalFileList([fileItem as any])).toContain('507f1f77bcf86cd799439012');
  });
});
