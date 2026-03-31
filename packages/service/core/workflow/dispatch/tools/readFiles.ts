import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding, parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { readS3FileContentByBuffer } from '../../../../common/file/read/utils';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { addLog } from '../../../../common/system/log';
import { addRawTextBuffer, getRawTextBuffer } from '../../../../common/buffer/rawText/controller';
import { addDays, addMinutes } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress } from '../../../../common/system/utils';
import { replaceDatasetQuoteTextWithJWT } from '../../../dataset/utils';
import { getFileS3Key } from '../../../../common/s3/utils';
import { S3ChatSource } from '../../../../common/s3/sources/chat';
import path from 'path';
import { S3Buckets } from '../../../../common/s3/constants';
import { S3Sources } from '../../../../common/s3/type';
import { extractFileIdFromUrl, isValidFileId, checkFileTokenExpired } from '../ai/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { createLLMResponse } from '../../../ai/llm/request';
import { getLLMModel } from '../../../ai/model';
import { getImageBase64 } from '../../../../common/file/image/utils';

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
  [NodeInputKeyEnum.enableDocParse]?: boolean;
  [NodeInputKeyEnum.enableImageParse]?: boolean;
  [NodeInputKeyEnum.imageModel]?: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
  [NodeOutputKeyEnum.rawResponse]: ReturnType<typeof formatResponseObject>[];
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
    params: { fileUrlList = [], enableDocParse = true, enableImageParse = false, imageModel },
    usageId
  } = props;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const customPdfParse = chatConfig?.fileSelectConfig?.customPdfParse || false;

  // Get files from histories
  const filesFromHistories = version !== '489' ? [] : getHistoryFileLinks(histories);

  try {
    // === 构建fileId映射表 ===
    const fileIdMap = new Map<string, { url: string; name: string }>();

    const addFileToMap = ({
      fileId,
      url,
      name,
      extraIds = []
    }: {
      fileId?: string;
      url: string;
      name: string;
      extraIds?: (string | undefined)[];
    }) => {
      const ids = new Set<string>();
      [fileId, ...extraIds].forEach((id) => {
        if (id) {
          ids.add(id);
          ids.add(id.replace(/^\/+/, ''));
          ids.add(id.replace(new RegExp(`^${S3Buckets.private}/`), ''));
        }
      });

      try {
        const urlObj = new URL(url, 'http://localhost');
        const pathname = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));
        if (pathname) {
          ids.add(pathname);
          ids.add(pathname.replace(new RegExp(`^${S3Buckets.private}/`), ''));
        }
      } catch (error) {
        devLog('[ReadFiles] parse url for map failed', error);
      }

      ids.forEach((id) => {
        if (id) {
          fileIdMap.set(id, { url, name });
        }
      });
    };

    // 从当前query中提取文件（使用正确的解析方法）
    if (query) {
      const { files: currentFiles } = chatValue2RuntimePrompt(query);
      devLog('[ReadFiles] Current query files count:', currentFiles?.length || 0);
      currentFiles?.forEach((file) => {
        if (file && file.url) {
          const fileId = extractFileIdFromUrl(file.url);
          devLog('[ReadFiles] Extracted fileId from current query:', fileId, 'name:', file.name);
          if (fileId) {
            addFileToMap({
              fileId,
              url: file.url,
              name: file.name || 'Unnamed',
              extraIds: [file.key, file.fileId]
            });
          } else if (file.key || file.fileId) {
            addFileToMap({
              fileId: file.fileId || file.key,
              url: file.url,
              name: file.name || 'Unnamed',
              extraIds: [file.key, file.fileId]
            });
          }
        }
      });
    }

    // 从历史记录中提取文件
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.Human && item.value) {
        item.value.forEach((valueItem) => {
          if (valueItem.type === 'file' && valueItem.file?.type) {
            const fileId = extractFileIdFromUrl(valueItem.file.url);
            if (fileId) {
              devLog(
                '[ReadFiles] Extracted fileId from history:',
                fileId,
                'name:',
                valueItem.file.name
              );
              addFileToMap({
                fileId,
                url: valueItem.file.url,
                name: valueItem.file.name || 'Unnamed',
                extraIds: [valueItem.file.key, valueItem.file.fileId]
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
      const mapKey = item.replace(/^\/+/, '');
      const fileInfo = fileIdMap.get(mapKey);

      // 检查是否为fileId（24位十六进制）
      if (isValidFileId(item) || fileInfo) {
        devLog('[ReadFiles] Valid fileId detected:', item);
        if (!fileInfo) {
          devLog('[ReadFiles] File NOT found in map for fileId:', item);
          fileErrors.push(`File not found: fileId "${item}". It may not be in this conversation.`);
          continue;
        }

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
        devLog('[ReadFiles] Not a valid fileId, treating as URL:', item);
        // 向后兼容：当作完整URL处理
        resolvedUrls.push(item);
      }
    }

    devLog('[ReadFiles] Resolved URLs count:', resolvedUrls.length);
    devLog('[ReadFiles] File errors count:', fileErrors.length);

    const { text: docText, readFilesResult } = enableDocParse
      ? await getFileContentFromLinks({
          // Concat fileUrlList and filesFromHistories; remove not supported files
          urls: [...resolvedUrls, ...filesFromHistories],
          requestOrigin,
          maxFiles,
          teamId,
          tmbId,
          customPdfParse,
          usageId
        })
      : { text: '', readFilesResult: [] };

    const imageDescriptions = enableImageParse
      ? await getImageDescriptions({
          urls: [...resolvedUrls, ...filesFromHistories],
          requestOrigin,
          teamId,
          tmbId,
          model: imageModel,
          maxImages: maxFiles
        })
      : { text: '', descriptions: [] };

    // 如果有文件错误，附加到输出文本
    const errorText =
      fileErrors.length > 0
        ? `\n\n--- File Access Errors ---\n${fileErrors.join('\n')}\n--- End of Errors ---`
        : '';
    const textWithError = [docText, imageDescriptions.text].filter(Boolean).join('\n******\n');
    const finalText = textWithError + errorText;
    const docTextWithError = docText ? `${docText}${errorText}` : errorText;
    const fileContentText = docTextWithError;

    return {
      data: {
        [NodeOutputKeyEnum.text]: finalText,
        [NodeOutputKeyEnum.rawResponse]: readFilesResult
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
        fileContent: fileContentText,
        imageDescriptions: imageDescriptions.descriptions
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
  const parseUrlList = Array.from(
    new Set(
      urls
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
            const parsedURL = new URL(url, 'http://localhost:3000');
            if (requestOrigin && parsedURL.origin === requestOrigin) {
              url = url.replace(requestOrigin, '');
            }

            return url;
          } catch (error) {
            addLog.warn(`Parse url error`, { error });
            return '';
          }
        })
        .filter(Boolean)
    )
  ).slice(0, maxFiles);

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

          const urlObj = new URL(url, 'http://localhost:3000');
          const isChatExternalUrl = !urlObj.pathname.startsWith(
            `/${S3Buckets.private}/${S3Sources.chat}/`
          );

          // Get file name
          const { filename, extension, imageParsePrefix } = (() => {
            const filenameFromQuery = urlObj.searchParams.get('filename');
            if (filenameFromQuery) {
              const ext = path.extname(filenameFromQuery).replace('.', '');
              return {
                filename: filenameFromQuery,
                extension: ext,
                imageParsePrefix: isChatExternalUrl
                  ? getFileS3Key.temp({ teamId, filename: filenameFromQuery }).fileParsedPrefix
                  : ''
              };
            }

            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
              const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
              const matches = filenameRegex.exec(contentDisposition);
              if (matches != null && matches[1]) {
                const filename = decodeURIComponent(matches[1].replace(/['"]/g, ''));
                return {
                  filename,
                  extension: path.extname(filename).replace('.', ''),
                  imageParsePrefix: `` // TODO: 需要根据是否是聊天对话里面的外部链接来决定
                };
              }
            }

            if (isChatExternalUrl) {
              const filename = urlObj.pathname.split('/').pop() || 'file';
              const extension = path.extname(filename).replace('.', '');
              return {
                filename,
                extension,
                imageParsePrefix: getFileS3Key.temp({ teamId, filename }).fileParsedPrefix
              };
            }

            return S3ChatSource.parseChatUrl(url);
          })();

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

          const { rawText } = await readS3FileContentByBuffer({
            extension,
            teamId,
            tmbId,
            buffer,
            encoding,
            customPdfParse,
            getFormatText: true,
            imageKeyOptions: imageParsePrefix
              ? {
                  prefix: imageParsePrefix,
                  // 聊天对话里面上传的外部链接，解析出来的图片过期时间设置为1天，而且是存储在临时文件夹的
                  expiredTime: isChatExternalUrl ? addDays(new Date(), 1) : undefined
                }
              : undefined,
            usageId
          });

          const replacedText = replaceDatasetQuoteTextWithJWT(rawText, addDays(new Date(), 90));

          // Add to buffer
          addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: replacedText,
            expiredTime: addMinutes(new Date(), 20)
          });

          return formatResponseObject({ filename, url, content: replacedText });
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

const getImageDescriptions = async ({
  urls,
  requestOrigin,
  teamId,
  tmbId,
  model,
  maxImages
}: {
  urls: string[];
  requestOrigin?: string;
  teamId: string;
  tmbId: string;
  model?: string;
  maxImages: number;
}) => {
  const imageUrls = Array.from(
    new Map(
      urls
        .filter((url) => typeof url === 'string')
        .map((url) => {
          try {
            const parsedURL = new URL(url, 'http://localhost:3000');
            if (requestOrigin && parsedURL.origin === requestOrigin) {
              return url.replace(requestOrigin, '');
            }
            return url;
          } catch (error) {
            return url;
          }
        })
        .map((url) => parseUrlToFileType(url))
        .filter((item) => item && item.type === ChatFileTypeEnum.image)
        .map((item) => [item!.url, { url: item!.url, name: item!.name }])
    ).values()
  )
    .slice(0, maxImages)
    .map((item) => ({ url: item.url, name: item.name })) as { url: string; name?: string }[];

  if (!model || imageUrls.length === 0) {
    return {
      descriptions: [],
      text: imageUrls.length === 0 ? '' : 'Image parsing skipped (model not set).'
    };
  }

  const modelConstants = getLLMModel(model);
  if (!modelConstants || !modelConstants.vision) {
    return {
      descriptions: [],
      text: 'Image parsing skipped (model does not support vision).'
    };
  }

  const descriptions: { url: string; description: string; name?: string }[] = [];

  for (const image of imageUrls) {
    try {
      let visionUrl = image.url;
      // Always convert to base64 for vision model to avoid内网/签名URL不可访问的问题
      if (!visionUrl.startsWith('data:image/')) {
        try {
          const absUrl = visionUrl.startsWith('http')
            ? visionUrl
            : `${requestOrigin || ''}${visionUrl}`;
          const { completeBase64 } = await getImageBase64(absUrl);
          visionUrl = completeBase64;
        } catch (error) {
          descriptions.push({
            url: image.url,
            name: image.name,
            description: getErrText(error, 'Image parse error')
          });
          continue;
        }
      }

      const { answerText } = await createLLMResponse({
        body: {
          model: modelConstants.model,
          messages: [
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: visionUrl
                  }
                },
                {
                  type: 'text',
                  text: '请简要描述这张图片的主要内容，使用中文输出。'
                }
              ]
            }
          ],
          stream: false,
          useVision: true,
          requestOrigin
        }
      });

      descriptions.push({
        url: image.url,
        name: image.name,
        description: answerText || ''
      });
    } catch (error) {
      descriptions.push({
        url: image.url,
        name: image.name,
        description: getErrText(error, 'Image parse error')
      });
    }
  }

  const text = descriptions
    .map(
      (item, index) =>
        `Image ${index + 1}${item.name ? `: ${item.name}` : ''}\n<Content>\n${item.description}\n</Content>`
    )
    .join('\n******\n');

  const sanitizedDescriptions = descriptions.map((item) => ({
    name: item.name,
    description: item.description
  }));

  return {
    descriptions: sanitizedDescriptions,
    text
  };
};
