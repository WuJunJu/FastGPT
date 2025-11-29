import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import busboy from 'busboy';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { jwtSignS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { addYears } from 'date-fns';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '200mb'
  }
};

type UploadFields = Record<string, string | string[]>;
type ParsedFile = { filename: string; buffer: Buffer; filepath?: string };

const parseForm = (req: ApiRequestProps): Promise<{ fields: UploadFields; file?: ParsedFile }> => {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const fields: UploadFields = {};
    let file: ParsedFile | undefined;

    bb.on('field', (name: string, val: string) => {
      if (fields[name]) {
        const exist = fields[name];
        fields[name] = Array.isArray(exist) ? [...exist, val] : [exist as string, val];
      } else {
        fields[name] = val;
      }
    });

    bb.on('file', (_name: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
      const chunks: Buffer[] = [];
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('end', () => {
        file = {
          filename: info.filename,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));

    req.pipe(bb);
  });
};

async function handler(req: ApiRequestProps) {
  if (req.method !== 'POST') {
    return Promise.reject('Method not allowed');
  }

  const { fields, file } = await parseForm(req);
  if (!file || !file.filename || !file.buffer?.length) {
    return Promise.reject('File is empty');
  }

  const bucketName = (fields.bucketName as string) || 'chat';
  if (bucketName !== 'chat') {
    return Promise.reject('Only chat bucket is supported');
  }

  const parsedData = (() => {
    try {
      const dataField = fields.data;
      if (Array.isArray(dataField)) return JSON.parse(dataField[0] || '{}');
      return dataField ? JSON.parse(dataField as string) : {};
    } catch (err) {
      return {};
    }
  })() as { appId?: string; chatId?: string };

  const appId = parsedData.appId;
  if (!appId) {
    return Promise.reject('appId is required');
  }
  const chatId = parsedData.chatId || getNanoid(24);

  // 鉴权：兼容账号/应用级 API Key
  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId
  });

  const filename = file.filename;
  const fileId = crypto.randomBytes(12).toString('hex');
  const { url: postURL, fields: presignFields } = await getS3ChatSource().createUploadChatFileURL({
    appId,
    chatId,
    filename,
    uId: uid
  });

  const formData = new FormData();
  Object.entries(presignFields).forEach(([k, v]) => formData.set(k, v));
  formData.set('file', new Blob([file.buffer]), filename);

  const uploadRes = await fetch(postURL, {
    method: 'POST',
    body: formData
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    return Promise.reject(`Upload to storage failed: ${uploadRes.status} ${text}`);
  }

  // 清理临时文件
  if (file.filepath) {
    await fs.unlink(file.filepath).catch(() => {});
  }

  const previewUrl = `${jwtSignS3ObjectKey(presignFields.key, addYears(new Date(), 100), {
    fileId
  })}?${new URLSearchParams({
    filename,
    fileId
  }).toString()}`;

  return {
    fileId, // 短 ID，供文档解析/工具调用
    fileKey: presignFields.key, // 兼容需要 S3 原始 key 的场景
    chatId,
    fileName: filename,
    previewUrl
  };
}

export default NextAPI(handler);
