import axios from 'axios';
import { POST } from '@/web/common/api/request';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { type AxiosProgressEvent } from 'axios';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

export const postS3UploadFile = (
  postURL: string,
  form: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) =>
  axios.post(postURL, form, {
    timeout: 600000,
    // 让浏览器/axios 自动设置带 boundary 的 Content-Type，否则可能导致上传失败或触发不必要的预检
    onUploadProgress,
    withCredentials: false
  });

export type UploadChatFileByApiResponse = {
  fileId: string;
  fileKey: string;
  chatId: string;
  fileName: string;
  previewUrl: string;
};

export const uploadChatFileByApi = async (params: {
  file: File;
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
}) => {
  const formData = new FormData();
  formData.set('bucketName', 'chat');
  formData.set(
    'data',
    JSON.stringify({
      appId: params.appId,
      chatId: params.chatId,
      outLinkAuthData: params.outLinkAuthData
    })
  );
  formData.set('file', params.file);

  const res = await axios.post(getWebReqUrl('/api/common/file/upload'), formData, {
    timeout: 600000,
    onUploadProgress: params.onUploadProgress
  });

  return (res.data?.data ?? res.data) as UploadChatFileByApiResponse;
};

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignAvatarPostUrl', params);
};

export const getUploadChatFilePresignedUrl = (params: {
  filename: string;
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/chat/presignChatFilePostUrl', params);
};

export const getPresignedChatFileGetUrl = (params: {
  key: string;
  appId: string;
  fileId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  return POST<string>('/core/chat/presignChatFileGetUrl', params);
};

export const getUploadDatasetFilePresignedUrl = (params: {
  filename: string;
  datasetId: string;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/dataset/presignDatasetFilePostUrl', params);
};

export const getUploadTempFilePresignedUrl = (params: { filename: string }) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignTempFilePostUrl', params);
};
