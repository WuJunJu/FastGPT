# FastGPT 文件上传对接指南

> **适用场景**：外部网站使用 FastGPT 作为后端 AI 服务，需要实现文件上传和对话功能
>
> **文档版本**：v1.0  
> **最后更新**：2025-10-17

---

## 📋 目录

1. [快速开始](#快速开始)
2. [核心概念](#核心概念)
3. [文件上传流程](#文件上传流程)
4. [上下文管理（重点）](#上下文管理重点)
5. [API 调用示例](#api-调用示例)
6. [配置说明](#配置说明)
7. [最佳实践](#最佳实践)
8. [常见问题](#常见问题)

---

## 快速开始

### 前置条件

- 已部署 FastGPT 服务
- 获取应用 API Key（带 `appId` 的 API Key）
- FastGPT 版本 >= 4.9.2

### 基础配置

在 FastGPT 应用设置中启用文件上传功能：

```typescript
// 推荐配置（适合外部上下文管理场景）
{
  fileSelectConfig: {
    canSelectFile: true,           // 允许上传文档
    canSelectImg: true,             // 允许上传图片
    maxFiles: 10,                   // 最大文件数量
    autoInjectFileContent: false,   // ⚠️ 关闭自动注入（重要）
    inlineFileMetadata: true        // ✅ 开启内联元数据（推荐）
  }
}
```

**配置说明**：
- `autoInjectFileContent: false` - AI 不会自动读取文件，而是主动调用工具（节省 token）
- `inlineFileMetadata: true` - 文件信息显示在对应消息旁边（保持时序关系）

---

## 核心概念

### 1. fileId vs 完整 URL

| 项目 | fileId | 完整 URL |
|------|--------|----------|
| **长度** | 24 字符 | 300+ 字符 |
| **Token消耗** | ~6 tokens | ~60 tokens |
| **适用场景** | 会话中的文件引用 | 外部文件、第一次上传 |
| **示例** | `6753f63fd6e15a77765ca448` | `https://fastgpt.com/api/.../file.pdf?token=eyJ...` |

**关键点**：使用 `fileId` 可以节省 **90% 的 token**！

### 2. 上下文管理模式

#### 模式 A：FastGPT 托管（默认）
- 使用 `chatId` 持久化对话
- FastGPT 自动管理历史记录
- 适合：简单对话场景

#### 模式 B：外部托管（推荐）
- **您的网站**管理对话历史
- 每次请求携带完整 `messages` 数组
- FastGPT 视为"新对话"，但文件引用不会混乱
- 适合：复杂业务逻辑、多端同步

**本文档重点介绍模式 B**

---

## 文件上传流程

### 完整流程图

```
┌─────────────┐
│  1. 用户选择  │  用户在您的网站上选择文件
│     文件      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  2. 上传到   │  POST /api/common/file/upload
│   FastGPT   │  返回: { fileId, previewUrl }
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  3. 保存到   │  存储在您的数据库中
│   您的数据库  │  关联到对话记录
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  4. 发起对话 │  POST /api/v1/chat/completions
│             │  messages 中包含文件信息
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  5. AI 处理  │  AI 看到文件 fileId
│             │  决定是否需要读取
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  6. 工具调用 │  AI 调用 readFiles 工具
│   (可选)     │  使用 fileId 读取内容
└─────────────┘
```

### 步骤 1: 上传文件到 FastGPT

```typescript
// 前端代码示例
async function uploadFileToFastGPT(file: File, appId: string): Promise<{
  fileId: string;
  previewUrl: string;
  fileName: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucketName', 'chat');
  formData.append('data', JSON.stringify({ 
    appId: appId  // 您的应用 ID
  }));

  const response = await fetch('https://your-fastgpt.com/api/common/file/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${YOUR_API_KEY}`  // API Key
    },
    body: formData
  });

  const result = await response.json();
  
  // 返回结果示例：
  // {
  //   fileId: "6753f63fd6e15a77765ca448",
  //   previewUrl: "https://.../file.pdf?token=eyJ..."
  // }
  
  return {
    fileId: extractFileIdFromUrl(result.previewUrl),  // 从 URL 提取 fileId
    previewUrl: result.previewUrl,
    fileName: file.name
  };
}

// 工具函数：从 previewUrl 提取 fileId
function extractFileIdFromUrl(url: string): string {
  const tokenMatch = url.match(/[?&]token=([^&]+)/);
  if (!tokenMatch) return '';
  
  const token = tokenMatch[1];
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.fileId || '';
}
```

### 步骤 2: 保存到您的数据库

```typescript
// 数据库结构示例（您的网站）
interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  files?: Array<{
    fileId: string;      // ⚠️ 重点：保存 fileId
    fileName: string;
    previewUrl: string;  // 完整 URL（用于预览/下载）
    uploadedAt: Date;
  }>;
  createdAt: Date;
}

// 保存用户消息
await db.messages.create({
  conversationId: '...',
  role: 'user',
  content: '分析这个合同',
  files: [{
    fileId: '6753f63fd6e15a77765ca448',
    fileName: '合同A.pdf',
    previewUrl: 'https://.../合同A.pdf?token=eyJ...',
    uploadedAt: new Date()
  }]
});
```

---

## 上下文管理（重点）

### 为什么需要特殊处理？

**核心问题**：您的网站自行管理对话历史，每次调用 FastGPT 都不使用 `chatId`，FastGPT 会认为这是"新对话"。

**解决方案**：使用 `fileId` 而不是位置索引，因为 `fileId` 在整个会话中是**唯一且稳定**的。

### 构造 messages 数组的正确方式

```typescript
interface FastGPTMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'file_url' | 'image_url';
    text?: string;
    name?: string;
    url?: string;
  }>;
}

// ✅ 正确示例：构造包含文件的对话历史
async function buildMessagesForFastGPT(
  conversationId: string
): Promise<FastGPTMessage[]> {
  // 1. 从您的数据库获取完整对话历史
  const dbMessages = await db.messages.find({ 
    conversationId 
  }).sort({ createdAt: 1 });

  // 2. 转换为 FastGPT 格式
  const messages: FastGPTMessage[] = [];

  for (const msg of dbMessages) {
    if (msg.role === 'user') {
      const content: any[] = [];

      // 2.1 添加文本内容
      if (msg.content) {
        content.push({
          type: 'text',
          text: msg.content
        });
      }

      // 2.2 添加文件（使用完整 URL）
      if (msg.files && msg.files.length > 0) {
        for (const file of msg.files) {
          content.push({
            type: 'file_url',
            name: file.fileName,
            url: file.previewUrl  // ⚠️ 发送完整 URL，AI 会自动提取 fileId
          });
        }
      }

      messages.push({
        role: 'user',
        content: content
      });
    } else if (msg.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: msg.content
      });
    }
  }

  return messages;
}
```

### FastGPT 如何处理文件？

```
您发送的 messages:
┌────────────────────────────────────────┐
│ User: [text, file_url(完整URL)]       │  ← 您发送完整 URL
└────────────────────────────────────────┘
                 │
                 ▼
        FastGPT 内部处理：
┌────────────────────────────────────────┐
│ 1. 从 URL 提取 fileId                  │
│ 2. 构建 fileId → URL 映射表            │
│ 3. 转换为 AI 友好格式                  │
└────────────────────────────────────────┘
                 │
                 ▼
        AI 看到的内容：
┌────────────────────────────────────────┐
│ User: [📎 File: 合同A.pdf             │
│        (fileId: "6753f63f...")]        │  ← AI 看到简短的 fileId
│ 分析这个合同                           │
└────────────────────────────────────────┘
```

### 跨轮对话的文件引用

```typescript
// 示例：多轮对话中引用文件
const conversation = [
  // 第 1 轮：上传文件 A
  {
    role: 'user',
    content: [
      { type: 'text', text: '分析这个合同' },
      { 
        type: 'file_url', 
        name: '合同A.pdf',
        url: 'https://.../合同A.pdf?token=eyJ...'  // fileId: abc123
      }
    ]
  },
  {
    role: 'assistant',
    content: '合同 A 的主要风险点包括...'
  },
  
  // 第 2 轮：上传文件 B，AI 可能引用文件 A
  {
    role: 'user',
    content: [
      { type: 'text', text: '对比合同 A 和这个新合同' },
      { 
        type: 'file_url', 
        name: '合同B.pdf',
        url: 'https://.../合同B.pdf?token=eyJ...'  // fileId: def456
      }
    ]
  },
  {
    role: 'assistant',
    content: '对比分析：[AI 可能调用工具读取两个文件]'
    // AI 内部可能调用：readFiles(["abc123", "def456"])
  }
];
```

**关键点**：
- ✅ FastGPT 会自动从所有历史消息中提取 `fileId`
- ✅ AI 可以引用任何历史文件（只要 token 未过期）
- ✅ 不依赖 `chatId`，完全支持外部上下文管理

---

## API 调用示例

### 完整对话示例（带文件）

```typescript
// 完整的对话流程
async function chatWithFile(
  conversationId: string,
  userMessage: string,
  file?: File
) {
  // 1. 如果有文件，先上传
  let fileInfo = null;
  if (file) {
    fileInfo = await uploadFileToFastGPT(file, YOUR_APP_ID);
    
    // 保存到数据库
    await db.messages.create({
      conversationId,
      role: 'user',
      content: userMessage,
      files: [{
        fileId: fileInfo.fileId,
        fileName: fileInfo.fileName,
        previewUrl: fileInfo.previewUrl,
        uploadedAt: new Date()
      }]
    });
  } else {
    // 没有文件，只保存文本
    await db.messages.create({
      conversationId,
      role: 'user',
      content: userMessage
    });
  }

  // 2. 构造完整的消息历史
  const messages = await buildMessagesForFastGPT(conversationId);

  // 3. 调用 FastGPT API
  const response = await fetch('https://your-fastgpt.com/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${YOUR_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // ⚠️ 不传 chatId，让 FastGPT 视为新对话
      messages: messages,
      stream: false,
      detail: false
    })
  });

  const result = await response.json();

  // 4. 保存 AI 回复
  await db.messages.create({
    conversationId,
    role: 'assistant',
    content: result.choices[0].message.content
  });

  return result;
}
```

### 处理 AI 工具调用（文件读取）

```typescript
// FastGPT 返回的响应可能包含工具调用
interface FastGPTResponse {
  choices: [{
    message: {
      role: 'assistant';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;  // 例如 "readFiles"
          arguments: string;  // JSON 字符串
        };
      }>;
    };
  }];
}

// 示例：AI 决定读取文件
const aiResponse = {
  choices: [{
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_123',
        type: 'function',
        function: {
          name: 'readFiles',
          arguments: '{"fileUrlList":["6753f63fd6e15a77765ca448"]}'
        }
      }]
    }
  }]
};

// FastGPT 会自动执行工具调用，无需您额外处理
// 最终返回的 content 就是处理后的结果
```

---

## 配置说明

### FastGPT 应用配置

```typescript
// 在 FastGPT 管理后台配置
{
  chatConfig: {
    fileSelectConfig: {
      // === 基础配置 ===
      canSelectFile: boolean;        // 是否允许上传文档
      canSelectImg: boolean;         // 是否允许上传图片
      maxFiles: number;              // 最大文件数量（建议 5-20）
      customPdfParse?: boolean;      // 是否使用高级 PDF 解析（付费）
      
      // === 新增配置（v4.9.2+）===
      autoInjectFileContent: boolean;   // 是否自动注入文件内容
      inlineFileMetadata: boolean;      // 是否内联显示文件元数据
    }
  }
}
```

### 配置对比

| 配置 | 默认值 | 推荐值（外部上下文） | 说明 |
|------|--------|---------------------|------|
| `autoInjectFileContent` | `true` | `false` | 关闭后 AI 按需读取，节省 token |
| `inlineFileMetadata` | `false` | `true` | 开启后文件信息紧贴消息，更清晰 |

### 环境变量

```bash
# .env 文件
FILE_TOKEN_KEY=your_secret_key       # 文件 token 签名密钥
CHAT_FILE_EXPIRE_TIME=7              # 文件物理删除时间（天，设为 0 则永不删除）
```

⚠️ **重要提示**：`CHAT_FILE_EXPIRE_TIME` 只控制文件物理删除，不影响 Token 访问。详见下方"文件过期处理"。

---

## 最佳实践

### 1. 文件过期处理（重要）⚠️

FastGPT 有**两层过期机制**，它们是**独立**的：

#### 1.1 文件物理删除（存储层）
- **控制**: 环境变量 `CHAT_FILE_EXPIRE_TIME`
- **默认**: 7 天后删除文件
- **永不删除**: 设置为 `0`

#### 1.2 Token 访问控制（安全层）
- **控制**: 代码中的 `previewExpireMinutes`
- **默认**: 7 天（10080 分钟）
- **关键**: 即使文件存在，Token 过期后也无法访问

**核心问题**：如果只设置 `CHAT_FILE_EXPIRE_TIME=0`（文件永不删除），Token 过期后 URL 仍然返回 `401 Unauthorized`！

#### 解决方案 A：延长 Token 有效期（推荐）

修改 `packages/global/common/file/constants.ts`：

```typescript
export const bucketNameMap = {
  [BucketNameEnum.chat]: {
    label: i18nT('file:bucket_chat'),
    previewExpireMinutes: 365 * 24 * 60  // 改为 1 年（默认 7 天）
    // 或更长: 10 * 365 * 24 * 60  // 10 年
  }
};
```

重新构建：
```bash
docker-compose build
docker-compose restart
```

#### 解决方案 B：检测并提示用户

```typescript
// 检查 Token 是否即将过期
async function checkFileExpiration(fileInfo: FileInfo) {
  const uploadedAt = new Date(fileInfo.uploadedAt);
  const tokenExpirationDays = 7;  // 根据您的 previewExpireMinutes 配置
  const expiresAt = new Date(uploadedAt.getTime() + tokenExpirationDays * 24 * 60 * 60 * 1000);
  
  const remainingMs = expiresAt.getTime() - Date.now();
  const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  
  if (remainingDays <= 0) {
    return {
      expired: true,
      message: '文件 Token 已过期，请重新上传'
    };
  } else if (remainingDays <= 1) {
    return {
      expired: false,
      warning: true,
      message: `文件即将过期（还剩 ${remainingDays} 天）`
    };
  }
  
  return { expired: false, warning: false };
}

// 在 UI 中显示提示
const status = checkFileExpiration(file);
if (status.expired) {
  showError('该文件已过期，AI 无法读取。请重新上传。');
} else if (status.warning) {
  showWarning(status.message);
}
```

#### 详细配置指南

请参考项目根目录的 `FILE_EXPIRATION_CONFIG.md` 文档，了解：
- 完整的过期机制说明
- Token 刷新实现方案
- 不同场景的推荐配置
- 故障排查指南

### 2. Token 优化策略

```typescript
// ✅ 好的做法：使用 fileId
const message = {
  role: 'user',
  content: '分析文件 6753f63fd6e15a77765ca448'  // 24 字符
};

// ❌ 不好的做法：使用完整 URL
const message = {
  role: 'user',
  content: '分析文件 https://fastgpt.com/api/common/file/read/%E5%90%88%E5%90%8CA.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // 300+ 字符
};
```

### 3. 错误处理

```typescript
async function handleFileUploadError(error: any) {
  // 常见错误
  if (error.status === 401) {
    return '认证失败，请检查 API Key';
  }
  if (error.status === 413) {
    return '文件过大，请上传小于 100MB 的文件';
  }
  if (error.message?.includes('expired')) {
    return '文件已过期，请重新上传';
  }
  
  return '上传失败，请稍后重试';
}

// AI 返回文件错误时的处理
if (aiResponse.includes('File expired:')) {
  // 提示用户重新上传
  showReuploadDialog(fileId);
}
```

### 4. 数据库设计建议

```sql
-- 对话表
CREATE TABLE conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  INDEX idx_conversation_created (conversation_id, created_at)
);

-- 文件表（关联到消息）
CREATE TABLE message_files (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  file_id VARCHAR(24) NOT NULL,        -- FastGPT 的 fileId（重要）
  file_name VARCHAR(255) NOT NULL,
  preview_url TEXT NOT NULL,           -- 完整的 previewUrl
  uploaded_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,       -- 计算的过期时间
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  INDEX idx_message (message_id),
  INDEX idx_file_id (file_id)          -- 便于查找文件
);
```

### 5. 前端 UI 建议

```typescript
// 文件上传状态显示
<FileUploadComponent>
  {uploading && <ProgressBar value={progress} />}
  {uploaded && (
    <FileCard>
      <Icon type="pdf" />
      <FileName>{fileName}</FileName>
      <FileId>ID: {fileId.substring(0, 8)}...</FileId>  {/* 显示前 8 位 */}
      {isExpired && <Badge color="red">已过期</Badge>}
      <ReuploadButton onClick={() => reupload()} />
    </FileCard>
  )}
</FileUploadComponent>

// 对话中的文件引用
<MessageBubble role="user">
  <FileAttachment>
    📎 合同A.pdf
    <Tooltip>fileId: 6753f63f...</Tooltip>
  </FileAttachment>
  <MessageText>分析这个合同</MessageText>
</MessageBubble>
```

---

## 常见问题

### Q1: 文件过期后怎么办？

**A**: 文件默认保留 7 天。过期后：
1. AI 调用 `readFiles` 会返回错误：`File expired: "xxx.pdf"`
2. 用户需要重新上传文件
3. 建议在 UI 中提前显示过期提示

```typescript
// 计算剩余时间
function getFileExpirationInfo(uploadedAt: Date) {
  const expiresAt = new Date(uploadedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const remainingMs = expiresAt.getTime() - Date.now();
  const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  
  if (remainingDays <= 0) {
    return { status: 'expired', message: '已过期' };
  } else if (remainingDays <= 1) {
    return { status: 'expiring', message: `还剩 ${remainingDays} 天` };
  } else {
    return { status: 'valid', message: `还剩 ${remainingDays} 天` };
  }
}
```

### Q2: 如何在不使用 chatId 的情况下保证文件引用不混乱？

**A**: FastGPT 的 `fileId` 机制已经解决了这个问题：
- `fileId` 是文件的唯一标识（24 位十六进制）
- FastGPT 会自动从所有历史消息中构建 `fileId → URL` 映射
- AI 使用 `fileId` 引用文件，与 `chatId` 无关
- 只要您在 `messages` 数组中包含完整的文件 URL，FastGPT 就能正确处理

### Q3: autoInjectFileContent 应该选 true 还是 false？

**A**: 取决于您的使用场景：

| 场景 | 推荐值 | 原因 |
|------|--------|------|
| 小文件（< 1MB） | `true` | 自动注入，体验更好 |
| 大文件（> 5MB） | `false` | 按需读取，节省 token 和时间 |
| 多文件同时上传 | `false` | 让 AI 决定读取哪些文件 |
| 外部上下文管理 | `false` | 更灵活，配合 `inlineFileMetadata: true` |

### Q4: 如何调试文件上传问题？

**A**: 开发模式下会输出详细日志：

```bash
# 启动开发模式
NODE_ENV=development npm run dev

# 查看日志
[extractFileIdFromUrl] Extracted fileId: 6753f63f... from token
[ReadFiles] Current query files count: 1
[ReadFiles] Extracted fileId from current query: 6753f63f... name: 合同A.pdf
[ReadFiles] Total fileIds in map: 1
[ReadFiles] Received fileUrlList: ["6753f63fd6e15a77765ca448"]
[ReadFiles] Valid fileId detected: 6753f63fd6e15a77765ca448
[ReadFiles] Found file in map: 合同A.pdf
[ReadFiles] File is valid, adding to resolvedUrls
```

生产环境不会输出这些日志，只保留错误日志。

### Q5: 是否支持引用其他对话中的文件？

**A**: 不支持。原因：
- `fileId` 映射表只包含当前对话的历史消息
- 跨对话引用会导致 `File not found` 错误
- 如需使用其他对话的文件，需要重新上传

### Q6: 文件大小和类型限制？

**A**: 
- **文档**：支持 PDF、Word、Excel、TXT 等（< 100MB）
- **图片**：支持 JPG、PNG、GIF、WebP（< 10MB）
- **视频/音频**：不支持
- 具体限制可在 FastGPT 后台配置

---

## 完整示例代码

### React + TypeScript 完整示例

```typescript
import React, { useState } from 'react';
import axios from 'axios';

// 配置
const FASTGPT_API_URL = 'https://your-fastgpt.com';
const FASTGPT_API_KEY = 'your-api-key';
const APP_ID = 'your-app-id';

// 类型定义
interface FileInfo {
  fileId: string;
  fileName: string;
  previewUrl: string;
  uploadedAt: Date;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  files?: FileInfo[];
}

// 主组件
function ChatWithFile() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 上传文件
  const uploadFile = async (file: File): Promise<FileInfo> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucketName', 'chat');
    formData.append('data', JSON.stringify({ appId: APP_ID }));

    const response = await axios.post(
      `${FASTGPT_API_URL}/api/common/file/upload`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${FASTGPT_API_KEY}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    const previewUrl = response.data.previewUrl;
    const fileId = extractFileIdFromUrl(previewUrl);

    return {
      fileId,
      fileName: file.name,
      previewUrl,
      uploadedAt: new Date()
    };
  };

  // 提取 fileId
  const extractFileIdFromUrl = (url: string): string => {
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (!tokenMatch) return '';
    const token = tokenMatch[1];
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.fileId || '';
  };

  // 构造 FastGPT 消息
  const buildFastGPTMessages = () => {
    return messages.map(msg => {
      if (msg.role === 'user') {
        const content: any[] = [];
        
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        
        if (msg.files) {
          msg.files.forEach(file => {
            content.push({
              type: 'file_url',
              name: file.fileName,
              url: file.previewUrl
            });
          });
        }
        
        return { role: 'user', content };
      } else {
        return { role: 'assistant', content: msg.content };
      }
    });
  };

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() && !file) return;

    setUploading(true);
    
    try {
      // 1. 上传文件（如果有）
      let fileInfo: FileInfo | undefined;
      if (file) {
        fileInfo = await uploadFile(file);
      }

      // 2. 添加用户消息到状态
      const userMessage: Message = {
        role: 'user',
        content: input,
        files: fileInfo ? [fileInfo] : undefined
      };
      
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      // 3. 调用 FastGPT
      const response = await axios.post(
        `${FASTGPT_API_URL}/api/v1/chat/completions`,
        {
          messages: buildFastGPTMessages().concat([
            { 
              role: 'user', 
              content: fileInfo 
                ? [
                    { type: 'text', text: input },
                    { type: 'file_url', name: fileInfo.fileName, url: fileInfo.previewUrl }
                  ]
                : input
            }
          ]),
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${FASTGPT_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // 4. 添加 AI 回复
      const aiMessage: Message = {
        role: 'assistant',
        content: response.data.choices[0].message.content
      };
      
      setMessages([...newMessages, aiMessage]);

      // 5. 重置输入
      setInput('');
      setFile(null);
    } catch (error) {
      console.error('发送失败:', error);
      alert('发送失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* 消息列表 */}
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.files && msg.files.map(file => (
              <div key={file.fileId} className="file-attachment">
                📎 {file.fileName}
                <small>ID: {file.fileId.substring(0, 8)}...</small>
              </div>
            ))}
            <p>{msg.content}</p>
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div className="input-area">
        {file && (
          <div className="selected-file">
            📎 {file.name}
            <button onClick={() => setFile(null)}>×</button>
          </div>
        )}
        
        <input
          type="file"
          id="file-input"
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          accept=".pdf,.doc,.docx,.txt,.jpg,.png"
        />
        
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          disabled={uploading}
        />
        
        <button onClick={() => document.getElementById('file-input')?.click()}>
          📎
        </button>
        
        <button onClick={sendMessage} disabled={uploading}>
          {uploading ? '上传中...' : '发送'}
        </button>
      </div>
    </div>
  );
}

export default ChatWithFile;
```

---

## 总结

### 核心要点

1. ✅ **使用 fileId**：节省 90% token，稳定可靠
2. ✅ **外部上下文管理**：每次发送完整 `messages` 数组，包含文件 URL
3. ✅ **配置建议**：`autoInjectFileContent: false` + `inlineFileMetadata: true`
4. ✅ **数据库设计**：保存 `fileId`、`previewUrl` 和过期时间
5. ✅ **错误处理**：处理文件过期、上传失败等情况

### 技术支持

- **文档**: https://doc.fastgpt.cn
- **GitHub**: https://github.com/labring/FastGPT
- **社区**: FastGPT 微信群/Discord

---

**祝您对接顺利！** 🎉

