import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import {
  type CheckChatFileKeys,
  type DelChatFileByPrefixParams,
  ChatFileUploadSchema,
  DelChatFileByPrefixSchema
} from './type';
import { addHours, differenceInHours } from 'date-fns';
import { S3Buckets } from '../../constants';
import path from 'path';
import { getFileS3Key } from '../../utils';
import { addLog } from '../../../system/log';
import { jwtSignS3ObjectKey } from '../../utils';
import { randomBytes } from 'crypto';

export class S3ChatSource {
  private bucket: S3PrivateBucket;
  private static instance: S3ChatSource;

  constructor() {
    this.bucket = new S3PrivateBucket();
  }

  static getInstance() {
    return (this.instance ??= new S3ChatSource());
  }

  static parseChatUrl(url: string | URL) {
    try {
      const parseUrl = new URL(url);
      const pathname = decodeURIComponent(parseUrl.pathname);
      // 非 S3 key
      if (!pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`)) {
        return {
          filename: '',
          extension: '',
          imageParsePrefix: ''
        };
      }

      const filename = pathname.split('/').pop() || 'file';
      const extension = path.extname(filename);

      return {
        filename,
        extension: extension.replace('.', ''),
        imageParsePrefix: `${pathname.replace(`/${S3Buckets.private}/`, '').replace(extension, '')}-parsed`
      };
    } catch (error) {
      return {
        filename: '',
        extension: '',
        imageParsePrefix: ''
      };
    }
  }

  // 获取文件流
  getChatFileStream(key: string) {
    return this.bucket.getObject(key);
  }

  // 获取文件状态
  getChatFileStat(key: string) {
    return this.bucket.statObject(key);
  }

  // 获取文件元数据
  async getFileMetadata(key: string) {
    const stat = await this.getChatFileStat(key);
    if (!stat)
      return { filename: '', extension: '', contentLength: 0, contentType: '', fileId: undefined };

    const contentLength = stat.size;
    const filename: string = decodeURIComponent(stat.metaData['origin-filename']);
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = stat.metaData['content-type'];
    const fileId = stat.metaData['file-id'];
    return {
      filename,
      extension,
      contentType,
      contentLength,
      fileId
    };
  }

  async createGetChatFileURL(params: {
    key: string;
    fileId?: string;
    expiredHours?: number;
    external: boolean;
  }) {
    const { key, fileId, expiredHours = 1 } = params; // 默认一个小时
    let filename: string | undefined;
    let targetFileId: string | undefined = fileId;

    try {
      const metadata = await this.getFileMetadata(key);
      filename = metadata.filename || undefined;
      targetFileId = targetFileId || metadata.fileId;
    } catch (error) {
      // 忽略获取元数据失败，使用默认文件名
      addLog.warn('Failed to get chat file metadata for presign', { key, error });
    }

    const expiredTime = addHours(new Date(), expiredHours);
    const baseUrl = jwtSignS3ObjectKey(
      key,
      expiredTime,
      targetFileId ? { fileId: targetFileId } : undefined
    );
    const search = new URLSearchParams();
    if (filename) search.set('filename', filename);
    if (targetFileId) search.set('fileId', targetFileId);

    return search.size ? `${baseUrl}?${search.toString()}` : baseUrl;
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const { appId, chatId, uId, filename, expiredTime } = ChatFileUploadSchema.parse(params);
    const { fileKey } = getFileS3Key.chat({ appId, chatId, uId, filename });
    const fileId = randomBytes(12).toString('hex');
    return await this.bucket
      .createPostPresignedUrl(
        { rawKey: fileKey, filename, metadata: { 'file-id': fileId } },
        { expiredHours: expiredTime ? differenceInHours(new Date(), expiredTime) : 24 }
      )
      .then((res) => ({
        ...res,
        fileId
      }));
  }

  deleteChatFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { appId, chatId, uId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');
    return this.bucket.addDeleteJob({ prefix });
  }

  deleteChatFileByKey(key: string) {
    return this.bucket.addDeleteJob({ key });
  }
}

export function getS3ChatSource() {
  return S3ChatSource.getInstance();
}
