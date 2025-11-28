import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { request } from 'http';
import { FastGPTPluginUrl } from '@fastgpt/service/common/system/constants';

const ImageProxyBaseUrl = process.env.IMAGE_PROXY_BASE_URL;
const ImageProxyBearerToken = process.env.IMAGE_PROXY_BEARER_TOKEN;

const normalizeHeaders = (headers: NextApiRequest['headers']): Record<string, string> => {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(',');
    } else {
      normalized[key.toLowerCase()] = value;
    }
  });
  return normalized;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { path = [] } = req.query as any;
    const pathArr: string[] = Array.isArray(path) ? path : [path];

    if (pathArr.length === 0) {
      throw new Error('url is empty');
    }

    const requestPath = `/imgs/${pathArr.join('/')}`;
    const useImageProxy = !!ImageProxyBaseUrl && pathArr[0] === 'middleware';
    const targetBaseUrl = useImageProxy ? ImageProxyBaseUrl : FastGPTPluginUrl;

    if (!targetBaseUrl) {
      throw new Error(
        useImageProxy ? '未配置图片代理服务链接' : `未配置插件服务链接: ${pathArr.join('/')}`
      );
    }

    const parsedUrl = new URL(targetBaseUrl);
    const forwardHeaders = normalizeHeaders(req.headers);
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];
    delete forwardHeaders['transfer-encoding'];
    delete forwardHeaders.rootkey;

    if (useImageProxy) {
      if (ImageProxyBearerToken) {
        forwardHeaders.authorization = `Bearer ${ImageProxyBearerToken}`;
      }
      delete forwardHeaders.authtoken;
    }

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: forwardHeaders
    });
    req.pipe(requestResult);

    requestResult.on('response', (response) => {
      Object.keys(response.headers).forEach((key) => {
        // @ts-ignore
        res.setHeader(key, response.headers[key]);
      });
      response.statusCode && res.writeHead(response.statusCode);
      response.pipe(res);
    });

    requestResult.on('error', (e) => {
      res.send(e);
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
