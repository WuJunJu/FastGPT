import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

/**
 * 开发模式调试日志（生产环境不输出）
 */
const devLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

/**
 * 从文件URL中提取fileId
 * @param url 文件URL（包含JWT token）
 * @returns fileId（24位十六进制字符串）
 */
export function extractFileIdFromUrl(url: string): string {
  try {
    // 优先从 token payload 解析
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (tokenMatch) {
      const token = tokenMatch[1];
      const payload = JSON.parse(atob(token.split('.')[1]));
      const fileIdFromToken = payload.fileId || '';
      if (isValidFileId(fileIdFromToken)) {
        devLog('[extractFileIdFromUrl] Extracted fileId from token:', fileIdFromToken);
        return fileIdFromToken;
      }
    }

    // 其次尝试 query 参数
    const urlObj = new URL(url, 'http://localhost');
    const fileIdFromQuery = urlObj.searchParams.get('fileId') || urlObj.searchParams.get('id');
    if (fileIdFromQuery && isValidFileId(fileIdFromQuery)) {
      devLog('[extractFileIdFromUrl] Extracted fileId from query:', fileIdFromQuery);
      return fileIdFromQuery;
    }

    // 再尝试路径中提取 24 位 hex（兼容 chat/<fileId>-filename.ext）
    const pathMatches = [...urlObj.pathname.matchAll(/[a-f0-9]{24}/gi)];
    if (pathMatches.length > 0) {
      // 某些路径包含多个 24 位 hex，通常文件 ID 在后一个位置，取最后一个更稳妥
      const lastMatch = pathMatches[pathMatches.length - 1][0];
      if (isValidFileId(lastMatch)) {
        devLog('[extractFileIdFromUrl] Extracted fileId from path:', lastMatch);
        return lastMatch;
      }
    }

    devLog('[extractFileIdFromUrl] No valid fileId found in URL:', url.substring(0, 100));
    return '';
  } catch (error) {
    // 错误日志保留，生产环境也需要
    console.error('[extractFileIdFromUrl] Error extracting fileId:', error);
    return '';
  }
}

/**
 * 验证是否为合法的fileId
 * @param id 待验证的字符串
 * @returns 是否为合法fileId（24位十六进制）
 */
export function isValidFileId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

/**
 * 检查文件token是否过期
 * @param url 文件URL
 * @returns 是否过期
 */
export function checkFileTokenExpired(url: string): boolean {
  try {
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (!tokenMatch) return false;

    const token = tokenMatch[1];
    const payload = JSON.parse(atob(token.split('.')[1]));

    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      return now > payload.exp;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 获取文件标识，优先 fileId，其次 key，再次 URL 路径
 */
const getFileIdentifier = (file: NonNullable<UserChatItemValueItemType['file']>): string => {
  const idFromUrl = extractFileIdFromUrl(file.url);
  if (idFromUrl) return idFromUrl;
  if (file.key) return file.key;

  try {
    const urlObj = new URL(file.url, 'http://localhost');
    const path = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
    return path || '';
  } catch {
    return '';
  }
};

/**
 * 格式化内联文件元数据（紧凑格式）
 * @param documentFiles 文档文件列表
 * @param imageFiles 图片文件列表
 * @returns 格式化后的字符串
 */
export function formatInlineFileMetadata(
  documentFiles: UserChatItemValueItemType[],
  imageFiles: UserChatItemValueItemType[]
): string {
  const parts: string[] = [];

  // 文档文件
  if (documentFiles.length === 1) {
    const file = documentFiles[0].file!;
    const fileId = getFileIdentifier(file);
    const fileName = file.name || 'Unnamed';
    parts.push(`[File: ${fileName} (fileId: "${fileId}")]`);
  } else if (documentFiles.length > 1) {
    parts.push(`[${documentFiles.length} Files attached:`);
    documentFiles.forEach((item, index) => {
      const file = item.file!;
      const fileId = getFileIdentifier(file);
      const fileName = file.name || 'Unnamed';
      parts.push(`  ${index + 1}. ${fileName} (fileId: "${fileId}")`);
    });
    parts.push(']');
  }

  // 图片文件
  if (imageFiles.length === 1) {
    const file = imageFiles[0].file!;
    const fileId = getFileIdentifier(file);
    const fileName = file.name || 'Unnamed';
    parts.push(`[Image: ${fileName} (fileId: "${fileId}")]`);
  } else if (imageFiles.length > 1) {
    parts.push(`[${imageFiles.length} Images attached:`);
    imageFiles.forEach((item, index) => {
      const file = item.file!;
      const fileId = getFileIdentifier(file);
      const fileName = file.name || 'Unnamed';
      parts.push(`  ${index + 1}. ${fileName} (fileId: "${fileId}")`);
    });
    parts.push(']');
  }

  return parts.join('\n');
}

/**
 * 格式化传统模式的文件列表信息
 * @param documentFiles 文档文件列表
 * @returns 格式化后的字符串
 */
export function formatTraditionalFileList(documentFiles: UserChatItemValueItemType[]): string {
  if (documentFiles.length === 0) return '';

  const fileList = documentFiles
    .map((item) => {
      const file = item.file!;
      const fileId = getFileIdentifier(file);
      return `- fileId: "${fileId}", name: "${file.name || 'Unnamed'}"`;
    })
    .join('\n');

  return `\n\nAvailable files (use fileId to reference):\n${fileList}`;
}
