# FastGPT API 对接指南 - 文件上传功能

> **适用对象**：使用 FastGPT API 开发对话应用的前端/后端开发者
>
> **文档版本**：v2.0  
> **最后更新**：2025-10-17

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 概述](#api-概述)
3. [文件上传 API](#文件上传-api)
4. [对话 API（带文件）](#对话-api带文件)
5. [外部上下文管理](#外部上下文管理)
6. [完整代码示例](#完整代码示例)
7. [常见问题](#常见问题)

---

## 快速开始

### 前置条件

- ✅ 已有 FastGPT 服务地址（如 `https://your-fastgpt.com`）
- ✅ 已获取 API Key（联系 FastGPT 管理员）
  - **应用级 API Key**（推荐）：已绑定应用，不需要传 `appId`
  - **账号级 API Key**：需要手动传 `appId` 参数
- ✅ FastGPT 管理员已启用文件上传功能

### 核心流程

```
用户操作 → 上传文件 → 保存到您的数据库 → 发起对话（带文件 URL）→ 获取 AI 响应
```

---

## API 概述

### 需要调用的 API

| API | 用途 | 频率 |
|-----|------|------|
| `POST /api/common/file/upload` | 上传文件到 FastGPT | 用户上传时 |
| `POST /api/v1/chat/completions` | 发起对话（OpenAI 兼容） | 每次对话 |

### 认证方式

所有 API 都使用 Bearer Token 认证：

```http
Authorization: Bearer YOUR_API_KEY
```

### API Key 类型说明 ⚠️

FastGPT 支持两种类型的 API Key：

#### 1. 应用级 API Key（推荐） ✅

**特点**：
- 创建时已绑定到特定应用
- API Key 本身包含 `appId` 信息
- **上传文件时不需要传 `appId` 参数**

**如何获取**：
- FastGPT 管理员在应用设置 → API 访问中创建
- 格式通常是：`fastgpt-xxx...`

**使用方式**：
```typescript
// ✅ 不需要传 appId
formData.append('bucketName', 'chat');
formData.append('data', JSON.stringify({}));  // data 可以为空对象
```

#### 2. 账号级 API Key

**特点**：
- 与账号关联，不绑定特定应用
- 可以操作账号下的所有应用
- **上传文件时必须传 `appId` 参数**

**使用方式**：
```typescript
// ⚠️ 必须传 appId
formData.append('bucketName', 'chat');
formData.append('data', JSON.stringify({ appId: 'your-app-id' }));
```

**如何获取 appId**：
- 联系 FastGPT 管理员获取
- 或从应用 URL 中获取（如 `/app/detail/64d8xxxx...`）

---

**本文档的代码示例将同时支持两种方式。**

---

## 文件上传 API

### 端点

```
POST /api/common/file/upload
```

### 请求格式

```http
POST /api/common/file/upload HTTP/1.1
Host: your-fastgpt.com
Authorization: Bearer YOUR_API_KEY
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="合同.pdf"
Content-Type: application/pdf

<binary data>
------WebKitFormBoundary
Content-Disposition: form-data; name="bucketName"

chat
------WebKitFormBoundary
Content-Disposition: form-data; name="data"

{"appId":"your-app-id"}
------WebKitFormBoundary--
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | ✅ | 文件对象 |
| `bucketName` | String | ✅ | 固定值：`"chat"` |
| `data` | JSON String | ✅ | `{}` 或 `{"appId":"your-app-id"}` |
| `data.appId` | String | ⚠️ | **仅账号级 API Key 需要** |

### 响应格式

```json
{
  "fileId": "6753f63fd6e15a77765ca448",
  "previewUrl": "https://fastgpt.com/api/common/file/read/合同.pdf?token=eyJhbGc..."
}
```

### 响应说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `fileId` | 文件唯一标识（24位十六进制） | `"6753f63fd6e15a77765ca448"` |
| `previewUrl` | 文件访问 URL（含 Token） | `"https://.../file.pdf?token=eyJ..."` |

### 代码示例

#### JavaScript/TypeScript

```typescript
async function uploadFile(
  file: File, 
  apiKey: string, 
  appId?: string  // ⚠️ 可选参数：应用级 API Key 不需要
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucketName', 'chat');
  
  // 如果使用账号级 API Key，需要传 appId
  if (appId) {
    formData.append('data', JSON.stringify({ appId }));
  } else {
    formData.append('data', JSON.stringify({}));
  }

  const response = await fetch('https://your-fastgpt.com/api/common/file/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    fileId: extractFileIdFromUrl(result.previewUrl),
    fileName: file.name,
    previewUrl: result.previewUrl
  };
}

// 从 previewUrl 提取 fileId
function extractFileIdFromUrl(url: string): string {
  const tokenMatch = url.match(/[?&]token=([^&]+)/);
  if (!tokenMatch) return '';
  
  const token = tokenMatch[1];
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.fileId || '';
}
```

#### Python

```python
import requests
import json
import base64
from typing import Optional

def upload_file(
    file_path: str, 
    api_key: str, 
    app_id: Optional[str] = None  # ⚠️ 可选参数
) -> dict:
    url = "https://your-fastgpt.com/api/common/file/upload"
    
    with open(file_path, 'rb') as f:
        files = {'file': f}
        # 如果使用账号级 API Key，需要传 appId
        data = {
            'bucketName': 'chat',
            'data': json.dumps({'appId': app_id} if app_id else {})
        }
        headers = {'Authorization': f'Bearer {api_key}'}
        
        response = requests.post(url, files=files, data=data, headers=headers)
        response.raise_for_status()
        
        result = response.json()
        return {
            'fileId': extract_file_id(result['previewUrl']),
            'fileName': file_path.split('/')[-1],
            'previewUrl': result['previewUrl']
        }

def extract_file_id(url: str) -> str:
    import re
    match = re.search(r'[?&]token=([^&]+)', url)
    if not match:
        return ''
    
    token = match.group(1)
    payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
    return payload.get('fileId', '')
```

---

## 对话 API（带文件）

### 端点

```
POST /api/v1/chat/completions
```

### 请求格式（OpenAI 兼容）

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "分析这个合同"
        },
        {
          "type": "file_url",
          "name": "合同A.pdf",
          "url": "https://fastgpt.com/api/common/file/read/合同A.pdf?token=eyJ..."
        }
      ]
    }
  ],
  "stream": false
}
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | Array | ✅ | 对话消息数组 |
| `messages[].role` | String | ✅ | `"user"` 或 `"assistant"` |
| `messages[].content` | String/Array | ✅ | 消息内容 |
| `stream` | Boolean | ❌ | 是否流式返回（默认 `false`） |

### content 格式（带文件）

```typescript
// 纯文本
content: "你好"

// 文本 + 文件
content: [
  { type: "text", text: "分析这个文件" },
  { type: "file_url", name: "文件.pdf", url: "https://..." }
]

// 多个文件
content: [
  { type: "text", text: "对比这两个文件" },
  { type: "file_url", name: "文件1.pdf", url: "https://..." },
  { type: "file_url", name: "文件2.pdf", url: "https://..." }
]
```

### 响应格式

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "根据合同内容分析..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

### 代码示例

```typescript
async function chatWithFile(
  message: string,
  fileUrl: string,
  fileName: string,
  apiKey: string
) {
  const response = await fetch('https://your-fastgpt.com/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: message },
            { type: 'file_url', name: fileName, url: fileUrl }
          ]
        }
      ],
      stream: false
    })
  });

  const result = await response.json();
  return result.choices[0].message.content;
}
```

---

## 外部上下文管理

### 核心概念

如果您在自己的网站管理对话历史（不使用 FastGPT 的 `chatId`），需要：

1. ✅ 在您的数据库中保存完整对话
2. ✅ 每次调用 API 时发送完整的 `messages` 数组
3. ✅ 包含历史消息和当前消息

### 为什么使用 fileId？

FastGPT 内部使用 `fileId`（24位）而不是完整 URL（300+字符）：

| 项目 | fileId | 完整 URL |
|------|--------|----------|
| **长度** | 24 字符 | 300+ 字符 |
| **Token消耗** | ~6 tokens | ~60 tokens |
| **节省** | - | 90% ⬇️ |

**关键点**：您发送完整 URL，FastGPT 内部会自动提取 fileId 优化处理。

### 数据库设计建议

```typescript
// 您的数据库结构
interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  files?: MessageFile[];
  createdAt: Date;
}

interface MessageFile {
  fileId: string;        // FastGPT 的 fileId
  fileName: string;
  previewUrl: string;    // 完整 URL
  uploadedAt: Date;
}
```

### 构造 messages 数组

```typescript
async function buildMessages(conversationId: string): Promise<any[]> {
  // 1. 从您的数据库获取历史消息
  const dbMessages = await db.messages.find({
    conversationId
  }).sort({ createdAt: 'asc' });

  // 2. 转换为 FastGPT 格式
  return dbMessages.map(msg => {
    if (msg.role === 'user') {
      const content: any[] = [];
      
      // 添加文本
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      
      // 添加文件（使用完整 URL）
      if (msg.files) {
        msg.files.forEach(file => {
          content.push({
            type: 'file_url',
            name: file.fileName,
            url: file.previewUrl  // ← 发送完整 URL
          });
        });
      }
      
      return { role: 'user', content };
    } else {
      return { role: 'assistant', content: msg.content };
    }
  });
}
```

### 跨轮对话示例

```typescript
// 第 1 轮：上传文件 A
const messages1 = [
  {
    role: 'user',
    content: [
      { type: 'text', text: '分析这个合同' },
      { type: 'file_url', name: '合同A.pdf', url: 'https://...?token=...' }
    ]
  }
];
const response1 = await chat(messages1);

// 第 2 轮：上传文件 B，AI 可以引用文件 A
const messages2 = [
  // 包含第 1 轮的完整历史
  messages1[0],
  { role: 'assistant', content: response1 },
  // 当前消息
  {
    role: 'user',
    content: [
      { type: 'text', text: '对比合同 A 和这个新合同' },
      { type: 'file_url', name: '合同B.pdf', url: 'https://...?token=...' }
    ]
  }
];
const response2 = await chat(messages2);
```

**重点**：FastGPT 会自动从所有历史消息中提取 fileId，AI 可以引用任何历史文件。

---

## 完整代码示例

### React + TypeScript 完整实现

```typescript
import React, { useState } from 'react';

// 配置
const FASTGPT_API_URL = 'https://your-fastgpt.com';
const FASTGPT_API_KEY = 'your-api-key';
const APP_ID = undefined;  // ⚠️ 应用级 API Key 不需要，账号级 API Key 必须填写

// 类型定义
interface FileInfo {
  fileId: string;
  fileName: string;
  previewUrl: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  files?: FileInfo[];
}

// 工具函数
function extractFileIdFromUrl(url: string): string {
  const tokenMatch = url.match(/[?&]token=([^&]+)/);
  if (!tokenMatch) return '';
  const token = tokenMatch[1];
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.fileId || '';
}

// 上传文件
async function uploadFile(file: File): Promise<FileInfo> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucketName', 'chat');
  formData.append('data', JSON.stringify(APP_ID ? { appId: APP_ID } : {}));

  const response = await fetch(`${FASTGPT_API_URL}/api/common/file/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FASTGPT_API_KEY}` },
    body: formData
  });

  if (!response.ok) throw new Error('Upload failed');
  
  const result = await response.json();
  return {
    fileId: extractFileIdFromUrl(result.previewUrl),
    fileName: file.name,
    previewUrl: result.previewUrl
  };
}

// 发起对话
async function sendMessage(messages: any[]) {
  const response = await fetch(`${FASTGPT_API_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FASTGPT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages,
      stream: false
    })
  });

  if (!response.ok) throw new Error('Chat failed');
  
  const result = await response.json();
  return result.choices[0].message.content;
}

// 主组件
function ChatComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() && !file) return;

    setLoading(true);
    try {
      // 1. 上传文件（如果有）
      let fileInfo: FileInfo | undefined;
      if (file) {
        fileInfo = await uploadFile(file);
      }

      // 2. 添加用户消息
      const userMessage: Message = {
        role: 'user',
        content: input,
        files: fileInfo ? [fileInfo] : undefined
      };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      // 3. 构造 API 消息
      const apiMessages = newMessages.map(msg => {
        if (msg.role === 'user') {
          const content: any[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          if (msg.files) {
            msg.files.forEach(f => {
              content.push({
                type: 'file_url',
                name: f.fileName,
                url: f.previewUrl
              });
            });
          }
          return { role: 'user', content };
        }
        return { role: 'assistant', content: msg.content };
      });

      // 4. 调用 API
      const aiResponse = await sendMessage(apiMessages);

      // 5. 添加 AI 回复
      setMessages([...newMessages, {
        role: 'assistant',
        content: aiResponse
      }]);

      // 6. 清空输入
      setInput('');
      setFile(null);
    } catch (error) {
      console.error('Error:', error);
      alert('发送失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.files?.map(f => (
              <div key={f.fileId} className="file-tag">
                📎 {f.fileName}
              </div>
            ))}
            <p>{msg.content}</p>
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div className="input-area">
        {file && (
          <div className="file-preview">
            📎 {file.name}
            <button onClick={() => setFile(null)}>×</button>
          </div>
        )}
        
        <input
          type="file"
          id="file"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="输入消息..."
        />
        
        <button onClick={() => document.getElementById('file')?.click()}>
          📎
        </button>
        
        <button onClick={handleSend} disabled={loading}>
          {loading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}

export default ChatComponent;
```

### Node.js 后端示例

```javascript
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const FASTGPT_API_URL = 'https://your-fastgpt.com';
const FASTGPT_API_KEY = 'your-api-key';

// 上传文件到 FastGPT
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);
    formData.append('bucketName', 'chat');
    // 如果前端传了 appId，则使用；否则传空对象（适用于应用级 API Key）
    formData.append('data', JSON.stringify(req.body.appId ? { appId: req.body.appId } : {}));

    const response = await axios.post(
      `${FASTGPT_API_URL}/api/common/file/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${FASTGPT_API_KEY}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 发起对话
app.post('/api/chat', express.json(), async (req, res) => {
  try {
    const response = await axios.post(
      `${FASTGPT_API_URL}/api/v1/chat/completions`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${FASTGPT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

---

## 常见问题

### Q1: 如何判断我的 API Key 是应用级还是账号级？

**A**: 有几种方法：

#### 方法 1：询问 FastGPT 管理员
最简单直接的方式，管理员在创建 API Key 时知道类型。

#### 方法 2：测试上传（推荐）
```typescript
// 尝试不传 appId 上传
const formData = new FormData();
formData.append('file', file);
formData.append('bucketName', 'chat');
formData.append('data', JSON.stringify({}));

const response = await fetch('/api/common/file/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData
});

if (response.ok) {
  console.log('✅ 应用级 API Key');
} else {
  const error = await response.json();
  if (error.message?.includes('appId')) {
    console.log('⚠️ 账号级 API Key，需要传 appId');
  }
}
```

#### 方法 3：查看 API Key 创建位置
- **应用级**：在「应用设置 → API 访问」中创建，绑定到特定应用
- **账号级**：在「账号设置 → API 密钥」中创建，可访问所有应用

#### 推荐做法
在您的代码中提供配置选项：
```typescript
const config = {
  apiKey: 'your-api-key',
  appId: 'your-app-id',  // 可选：账号级 API Key 需要填写
};
```

### Q2: 文件过期后怎么办？

**A**: 文件的过期策略由 FastGPT 管理员配置，作为 API 开发者：

1. **检测过期**：计算文件上传时间，提前提示用户
2. **重新上传**：提示用户重新上传文件
3. **错误处理**：AI 返回文件过期错误时，引导用户重新上传

```typescript
function checkIfFileExpired(uploadedAt: Date, expirationDays: number) {
  const expiresAt = new Date(uploadedAt.getTime() + expirationDays * 24 * 60 * 60 * 1000);
  return Date.now() > expiresAt.getTime();
}

// 使用
if (checkIfFileExpired(file.uploadedAt, 7)) {
  alert('文件已过期，请重新上传');
}
```

### Q3: 支持哪些文件类型？

**A**: 取决于 FastGPT 管理员的配置，通常支持：

- **文档**: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), TXT
- **图片**: JPG, PNG, GIF, WebP
- **文件大小**: 通常 < 100MB（文档），< 10MB（图片）

建议在上传前检查：

```typescript
function validateFile(file: File) {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('不支持的文件类型');
  }

  if (file.size > 100 * 1024 * 1024) {
    throw new Error('文件过大（最大 100MB）');
  }
}
```

### Q4: 如何知道 AI 是否读取了文件？

**A**: 从 API 响应中无法直接判断，但您可以：

1. **查看响应内容**：如果 AI 的回复包含文件内容相关的信息，说明读取了
2. **使用 `detail: true`**：某些 FastGPT 配置可能返回工具调用详情

### Q5: 是否可以上传多个文件？

**A**: 可以！在 `content` 数组中添加多个 `file_url`：

```typescript
content: [
  { type: 'text', text: '对比这些文件' },
  { type: 'file_url', name: '文件1.pdf', url: 'https://...' },
  { type: 'file_url', name: '文件2.pdf', url: 'https://...' },
  { type: 'file_url', name: '文件3.pdf', url: 'https://...' }
]
```

最大数量由 FastGPT 管理员配置（通常 5-20 个）。

### Q6: 文件 URL 可以是外部链接吗？

**A**: 可以，但建议上传到 FastGPT：

- ✅ **上传到 FastGPT**：速度快，稳定，支持所有功能
- ⚠️ **外部 URL**：需要公网可访问，可能被防火墙拦截

### Q7: 如何实现文件预览/下载？

**A**: 直接使用 `previewUrl`：

```typescript
// 预览/下载
<a href={file.previewUrl} target="_blank" download>
  下载 {file.fileName}
</a>

// 或在新窗口打开
window.open(file.previewUrl, '_blank');
```

### Q8: API 调用失败如何处理？

**A**: 常见错误码：

| 状态码 | 原因 | 解决方案 |
|-------|------|---------|
| 401 | API Key 无效 | 检查 Authorization header |
| 413 | 文件过大 | 减小文件大小或联系管理员 |
| 429 | 请求过于频繁 | 实现请求限流 |
| 500 | 服务器错误 | 稍后重试 |

```typescript
async function handleApiError(error: any) {
  if (error.response) {
    switch (error.response.status) {
      case 401:
        return 'API Key 无效，请联系管理员';
      case 413:
        return '文件过大，请上传小于 100MB 的文件';
      case 429:
        return '请求过于频繁，请稍后再试';
      default:
        return `服务器错误（${error.response.status}）`;
    }
  }
  return '网络错误，请检查连接';
}
```

---

## 总结

### 核心步骤

1. ✅ 调用 `/api/common/file/upload` 上传文件
2. ✅ 保存 `fileId` 和 `previewUrl` 到您的数据库
3. ✅ 调用 `/api/v1/chat/completions` 时在 `content` 中包含文件
4. ✅ 每次发送完整的 `messages` 历史（外部上下文管理）

### 关键点

- 🔑 使用完整 URL 发送，FastGPT 内部会优化
- 💾 在您的数据库中保存文件信息
- 📜 每次发送完整对话历史
- ⚠️ 处理文件过期情况

### 进一步优化

- 实现文件上传进度显示
- 添加文件类型校验
- 实现断点续传（大文件）
- 缓存历史消息减少数据库查询

---

**祝您对接顺利！** 🎉

如有问题，请联系 FastGPT 管理员或查看官方文档。

