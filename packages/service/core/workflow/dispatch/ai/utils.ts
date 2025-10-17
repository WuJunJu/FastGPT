import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

/**
 * 从文件URL中提取fileId
 * @param url 文件URL（包含JWT token）
 * @returns fileId（24位十六进制字符串）
 */
export function extractFileIdFromUrl(url: string): string {
  try {
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (!tokenMatch) {
      console.log('[extractFileIdFromUrl] No token found in URL:', url.substring(0, 100));
      return '';
    }

    const token = tokenMatch[1];
    // 解码JWT payload（base64）
    const payload = JSON.parse(atob(token.split('.')[1]));
    const fileId = payload.fileId || '';
    console.log('[extractFileIdFromUrl] Extracted fileId:', fileId, 'from token');
    return fileId;
  } catch (error) {
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
    const fileId = extractFileIdFromUrl(file.url);
    parts.push(`[📎 File: ${file.name} (fileId: "${fileId}")]`);
  } else if (documentFiles.length > 1) {
    parts.push(`[📎 ${documentFiles.length} Files attached:`);
    documentFiles.forEach((item, index) => {
      const file = item.file!;
      const fileId = extractFileIdFromUrl(file.url);
      parts.push(`  ${index + 1}. ${file.name} (fileId: "${fileId}")`);
    });
    parts.push(']');
  }

  // 图片文件（简化显示）
  if (imageFiles.length > 0) {
    parts.push(`[🖼️ ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} attached]`);
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
      const fileId = extractFileIdFromUrl(file.url);
      return `- fileId: "${fileId}", name: "${file.name || 'Unnamed'}"`;
    })
    .join('\n');

  return `\n\nAvailable files (use fileId to reference):\n${fileList}`;
}
