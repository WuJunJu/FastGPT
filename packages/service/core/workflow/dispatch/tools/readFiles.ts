import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding, parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { readRawContentByFileBuffer } from '../../../../common/file/read/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../common/system/log';
import { addRawTextBuffer, getRawTextBuffer } from '../../../../common/buffer/rawText/controller';
import { addMinutes } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress } from '../../../../common/system/utils';
import { extractFileIdFromUrl, isValidFileId, checkFileTokenExpired } from '../ai/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

/**
 * 开发模式调试日志（生产环境不输出）
 */
const devLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

const formatResponseObject = ({
  filename,
  url,
  content
}: {
  filename: string;
  url: string;
  content: string;
}) => ({
  filename,
  url,
  text: `File: ${filename}
<Content>
${content}
</Content>`,
  nodeResponsePreviewText: `File: ${filename}
<Content>
${content.slice(0, 100)}${content.length > 100 ? '......' : ''}
</Content>`
});

export const dispatchReadFiles = async (props: Props): Promise<Response> => {
  const {
    requestOrigin,
    runningUserInfo: { teamId, tmbId },
    histories,
    chatConfig,
    query,
    node: { version },
    params: { fileUrlList = [] },
    usageId
  } = props;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const customPdfParse = chatConfig?.fileSelectConfig?.customPdfParse || false;

  // Get files from histories
  const filesFromHistories = version !== '489' ? [] : getHistoryFileLinks(histories);

  try {
    // === 构建fileId映射表 ===
    const fileIdMap = new Map<string, { url: string; name: string }>();

    // 从当前query中提取文件（使用正确的解析方法）
    if (query) {
      const { files: currentFiles } = chatValue2RuntimePrompt(query);
      devLog('[ReadFiles] Current query files count:', currentFiles?.length || 0);
      currentFiles?.forEach((file) => {
        if (file && file.url) {
          const fileId = extractFileIdFromUrl(file.url);
          devLog('[ReadFiles] Extracted fileId from current query:', fileId, 'name:', file.name);
          if (fileId) {
            fileIdMap.set(fileId, {
              url: file.url,
              name: file.name || 'Unnamed'
            });
          }
        }
      });
    }

    // 从历史记录中提取文件
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.Human && item.value) {
        item.value.forEach((valueItem) => {
          if (valueItem.type === 'file' && valueItem.file?.type === 'file') {
            const fileId = extractFileIdFromUrl(valueItem.file.url);
            if (fileId) {
              devLog(
                '[ReadFiles] Extracted fileId from history:',
                fileId,
                'name:',
                valueItem.file.name
              );
              fileIdMap.set(fileId, {
                url: valueItem.file.url,
                name: valueItem.file.name || 'Unnamed'
              });
            }
          }
        });
      }
    });

    devLog('[ReadFiles] Total fileIds in map:', fileIdMap.size);
    devLog('[ReadFiles] All fileIds:', Array.from(fileIdMap.keys()));

    // === 解析fileUrlList，将fileId转换为URL ===
    const resolvedUrls: string[] = [];
    const fileErrors: string[] = [];

    devLog('[ReadFiles] Received fileUrlList:', fileUrlList);

    for (const item of fileUrlList) {
      // 检查是否为fileId（24位十六进制）
      if (isValidFileId(item)) {
        devLog('[ReadFiles] Valid fileId detected:', item);
        const fileInfo = fileIdMap.get(item);
        if (fileInfo) {
          devLog('[ReadFiles] Found file in map:', fileInfo.name);
          // 检查文件是否过期
          if (checkFileTokenExpired(fileInfo.url)) {
            devLog('[ReadFiles] File is expired:', item);
            fileErrors.push(
              `File expired: "${fileInfo.name}" (fileId: ${item}). Please re-upload the file.`
            );
          } else {
            devLog('[ReadFiles] File is valid, adding to resolvedUrls');
            resolvedUrls.push(fileInfo.url);
          }
        } else {
          devLog('[ReadFiles] File NOT found in map for fileId:', item);
          fileErrors.push(`File not found: fileId "${item}". It may not be in this conversation.`);
        }
      } else {
        devLog('[ReadFiles] Not a valid fileId, treating as URL:', item);
        // 向后兼容：当作完整URL处理
        resolvedUrls.push(item);
      }
    }

    devLog('[ReadFiles] Resolved URLs count:', resolvedUrls.length);
    devLog('[ReadFiles] File errors count:', fileErrors.length);

    const { text, readFilesResult } = await getFileContentFromLinks({
      // Concat fileUrlList and filesFromHistories; remove not supported files
      urls: [...resolvedUrls, ...filesFromHistories],
      requestOrigin,
      maxFiles,
      teamId,
      tmbId,
      customPdfParse,
      usageId
    });

    // 如果有文件错误，附加到输出文本
    const errorText =
      fileErrors.length > 0
        ? `\n\n--- File Access Errors ---\n${fileErrors.join('\n')}\n--- End of Errors ---`
        : '';

    return {
      data: {
        [NodeOutputKeyEnum.text]: text + errorText
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        readFiles: readFilesResult.map((item) => ({
          name: item?.filename || '',
          url: item?.url || ''
        })),
        readFilesResult: readFilesResult
          .map((item) => item?.nodeResponsePreviewText ?? '')
          .join('\n******\n')
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        fileContent: text + errorText
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

export const getHistoryFileLinks = (histories: ChatItemType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.filter((value) => value.type === 'file');
      }
      return false;
    })
    .map((item) => {
      const value = item.value as UserChatItemValueItemType[];
      const files = value
        .map((item) => {
          return item.file?.url;
        })
        .filter(Boolean) as string[];
      return files;
    })
    .flat();
};

export const getFileContentFromLinks = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
}) => {
  const parseUrlList = urls
    // Remove invalid urls
    .filter((url) => {
      if (typeof url !== 'string') return false;

      // 检查相对路径
      const validPrefixList = ['/', 'http', 'ws'];
      if (validPrefixList.some((prefix) => url.startsWith(prefix))) {
        return true;
      }

      return false;
    })
    // Just get the document type file
    .filter((url) => parseUrlToFileType(url)?.type === 'file')
    .map((url) => {
      try {
        // Check is system upload file
        if (url.startsWith('/') || (requestOrigin && url.startsWith(requestOrigin))) {
          //  Remove the origin(Make intranet requests directly)
          if (requestOrigin && url.startsWith(requestOrigin)) {
            url = url.replace(requestOrigin, '');
          }
        }

        return url;
      } catch (error) {
        addLog.warn(`Parse url error`, { error });
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, maxFiles);

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url) => {
        // Get from buffer
        const fileBuffer = await getRawTextBuffer(url);
        if (fileBuffer) {
          return formatResponseObject({
            filename: fileBuffer.sourceName || url,
            url,
            content: fileBuffer.text
          });
        }

        try {
          if (isInternalAddress(url)) {
            return Promise.reject('Url is invalid');
          }
          // Get file buffer data
          const response = await axios.get(url, {
            baseURL: serverRequestBaseUrl,
            responseType: 'arraybuffer'
          });

          const buffer = Buffer.from(response.data, 'binary');

          // Get file name
          const filename = (() => {
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
              const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
              const matches = filenameRegex.exec(contentDisposition);
              if (matches != null && matches[1]) {
                return decodeURIComponent(matches[1].replace(/['"]/g, ''));
              }
            }

            return url;
          })();
          // Extension
          const extension = parseFileExtensionFromUrl(filename);

          // Get encoding
          const encoding = (() => {
            const contentType = response.headers['content-type'];
            if (contentType) {
              const charsetRegex = /charset=([^;]*)/;
              const matches = charsetRegex.exec(contentType);
              if (matches != null && matches[1]) {
                return matches[1];
              }
            }

            return detectFileEncoding(buffer);
          })();

          // Read file
          const { rawText } = await readRawContentByFileBuffer({
            extension,
            teamId,
            tmbId,
            buffer,
            encoding,
            customPdfParse,
            getFormatText: true,
            usageId
          });

          // Add to buffer
          addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: rawText,
            expiredTime: addMinutes(new Date(), 20)
          });

          return formatResponseObject({ filename, url, content: rawText });
        } catch (error) {
          return formatResponseObject({
            filename: '',
            url,
            content: getErrText(error, 'Load file error')
          });
        }
      })
      .filter(Boolean)
  );
  const text = readFilesResult.map((item) => item?.text ?? '').join('\n******\n');

  return {
    text,
    readFilesResult
  };
};
