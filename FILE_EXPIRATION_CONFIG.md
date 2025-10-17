# FastGPT 文件过期配置指南

> 如何配置文件永不过期以及 Token 访问控制

---

## 📖 理解两层过期机制

FastGPT 的文件系统有**两个独立的过期控制**：

### 1. 文件物理删除（存储层）

| 项目 | 说明 |
|------|------|
| **控制变量** | 环境变量 `CHAT_FILE_EXPIRE_TIME` |
| **默认值** | `7` 天 |
| **作用** | 定时任务删除 GridFS/S3 中超过指定天数的文件 |
| **永不删除** | 设置为 `0` |
| **位置** | `docker-compose.yml` 或 `.env` 文件 |

### 2. Token 访问控制（安全层）

| 项目 | 说明 |
|------|------|
| **控制变量** | 代码中的 `previewExpireMinutes` |
| **默认值** | `7 * 24 * 60` 分钟（7天） |
| **作用** | JWT token 过期后，即使文件存在也无法通过 URL 访问 |
| **延长有效期** | 修改源码中的 `previewExpireMinutes` |
| **位置** | `packages/global/common/file/constants.ts` |

---

## ⚠️ 关键问题

### Q: 如果只设置 `CHAT_FILE_EXPIRE_TIME=0`（文件永不删除），用户还能访问文件吗？

**A: 不能！** 即使文件物理存在，Token 过期后 `previewUrl` 也会返回 `401 Unauthorized`。

```
示例场景：
┌────────────────────────────────────┐
│ 上传文件时                          │
│   previewUrl: /api/.../file.pdf?   │
│   token=eyJhbGc...                  │
│   (Token 有效期 7 天)               │
└────────────────────────────────────┘
          ⬇️ 8 天后
┌────────────────────────────────────┐
│ 使用相同的 previewUrl 访问          │
│   结果: ❌ 401 Unauthorized         │
│   原因: Token 过期                  │
│   文件: ✅ 仍然存在于存储中          │
└────────────────────────────────────┘
```

### Q: Token 过期后，AI 还能读取文件吗？

**A: 不能！** AI 调用 `readFiles` 工具时会收到错误：
```
--- File Access Errors ---
File expired: "合同A.pdf" (fileId: 6753f63f...). Please re-upload the file.
--- End of Errors ---
```

---

## 🔧 完整配置方案

### 方案 A：文件永不过期 + Token 长期有效（推荐）

适用场景：
- ✅ 需要长期保存文件（如合同、档案）
- ✅ 用户可能在很久之后引用文件
- ✅ 不在乎存储成本

#### 步骤 1: 设置文件永不删除

编辑 `docker-compose.yml` 或 `.env`：

```yaml
# docker-compose.yml
environment:
  CHAT_FILE_EXPIRE_TIME: 0  # 永不删除
```

或

```bash
# .env
CHAT_FILE_EXPIRE_TIME=0
```

#### 步骤 2: 延长 Token 有效期

编辑 `packages/global/common/file/constants.ts`：

```typescript
export const bucketNameMap = {
  [BucketNameEnum.chat]: {
    label: i18nT('file:bucket_chat'),
    previewExpireMinutes: 365 * 24 * 60  // 1 年
    // 或更长：
    // previewExpireMinutes: 10 * 365 * 24 * 60  // 10 年
  }
};
```

**时间对照表**：

| 天数 | 计算公式 | 分钟数 |
|------|---------|-------|
| 7 天（默认） | `7 * 24 * 60` | 10,080 |
| 30 天 | `30 * 24 * 60` | 43,200 |
| 90 天 | `90 * 24 * 60` | 129,600 |
| 365 天（1 年） | `365 * 24 * 60` | 525,600 |
| 3650 天（10 年） | `3650 * 24 * 60` | 5,256,000 |

#### 步骤 3: 重新构建和部署

```bash
# 重新构建镜像
docker-compose build

# 重启服务
docker-compose restart
```

---

### 方案 B：自动刷新 Token（高级）

如果您不想修改源码，可以在应用层面实现 Token 刷新：

#### 在数据库中存储必要信息

```typescript
interface StoredFile {
  fileId: string;        // 24位hex
  fileName: string;
  bucketName: string;    // 'chat'
  teamId: string;        // 团队ID
  uid: string;           // 用户ID
  uploadedAt: Date;
}
```

#### 实现 Token 刷新函数

```typescript
import jwt from 'jsonwebtoken';

/**
 * 重新生成文件访问 Token
 */
async function refreshFileToken(file: StoredFile): Promise<string> {
  const FILE_TOKEN_KEY = process.env.FILE_TOKEN_KEY;
  const expireMinutes = 365 * 24 * 60;  // 1 年
  const expiredTime = Math.floor(
    Date.now() / 1000 + expireMinutes * 60
  );

  const token = jwt.sign(
    {
      bucketName: file.bucketName,
      teamId: file.teamId,
      uid: file.uid,
      fileId: file.fileId,
      exp: expiredTime
    },
    FILE_TOKEN_KEY
  );

  return token;
}

/**
 * 获取有效的 previewUrl（自动刷新 Token）
 */
async function getValidPreviewUrl(file: StoredFile): Promise<string> {
  const newToken = await refreshFileToken(file);
  const baseUrl = 'https://your-fastgpt.com/api/common/file/read';
  return `${baseUrl}/${encodeURIComponent(file.fileName)}?token=${newToken}`;
}

// 使用示例
const file = await db.files.findOne({ fileId: '6753f63f...' });
const validUrl = await getValidPreviewUrl(file);

// 现在这个 URL 可以访问了（有效期 1 年）
```

#### 在构造消息时动态生成 URL

```typescript
async function buildMessagesForFastGPT(conversationId: string) {
  const dbMessages = await db.messages.find({ conversationId });
  const messages = [];

  for (const msg of dbMessages) {
    if (msg.role === 'user' && msg.files) {
      const content = [];
      
      content.push({ type: 'text', text: msg.content });
      
      // 为每个文件重新生成有效的 URL
      for (const file of msg.files) {
        const validUrl = await getValidPreviewUrl(file);
        content.push({
          type: 'file_url',
          name: file.fileName,
          url: validUrl  // 使用新生成的 URL
        });
      }
      
      messages.push({ role: 'user', content });
    } else {
      messages.push(msg);
    }
  }

  return messages;
}
```

---

### 方案 C：定期清理 + 合理过期（平衡方案）

适用场景：
- ✅ 控制存储成本
- ✅ 大部分对话不会持续很久
- ✅ 重要文件会被用户下载保存

配置：

```yaml
# docker-compose.yml
environment:
  CHAT_FILE_EXPIRE_TIME: 30  # 30 天后删除文件
```

```typescript
// packages/global/common/file/constants.ts
previewExpireMinutes: 30 * 24 * 60  // Token 有效期 30 天
```

---

## 🎯 推荐配置对比

| 场景 | 文件删除 | Token 有效期 | 优点 | 缺点 |
|------|---------|------------|------|------|
| **长期存档** | `0`（永不） | 365天+ | 文件永久可用 | 存储成本高 |
| **日常使用** | `30` 天 | 30天 | 成本合理 | 需定期清理 |
| **临时对话** | `7` 天 | 7天 | 成本最低 | 文件很快失效 |
| **自动刷新** | `0`（永不） | 7天（动态） | 灵活、成本可控 | 需要开发 |

---

## 📝 配置检查清单

### 配置前

- [ ] 评估存储需求（文件大小、数量、保留时长）
- [ ] 确定业务场景（短期对话 vs 长期存档）
- [ ] 检查存储成本预算

### 配置后

- [ ] 验证环境变量已生效（`docker-compose exec fastgpt env | grep EXPIRE`）
- [ ] 测试文件上传和访问
- [ ] 测试 Token 过期时间（可以临时改为 1 分钟测试）
- [ ] 检查定时任务日志（`docker-compose logs -f fastgpt | grep "Remove expired"`）

### 监控建议

```typescript
// 添加到您的应用中
async function checkFileExpiration(file: StoredFile) {
  // 检查文件物理存在
  const fileExists = await checkFileExists(file.fileId);
  
  // 检查 Token 是否过期
  const tokenValid = await checkTokenValid(file.previewUrl);
  
  if (fileExists && !tokenValid) {
    console.warn('⚠️ 文件存在但 Token 已过期:', file.fileName);
    // 可以触发 Token 刷新
  }
  
  return { fileExists, tokenValid };
}
```

---

## 🔍 故障排查

### 问题 1: "文件明明存在，为什么返回 401？"

**原因**: Token 过期了

**解决**:
1. 检查当前 `previewExpireMinutes` 设置
2. 检查文件上传时间，计算是否超过有效期
3. 延长 `previewExpireMinutes` 或实现 Token 刷新

### 问题 2: "设置了 CHAT_FILE_EXPIRE_TIME=0 但文件还是被删了"

**原因**: 可能有多处配置

**检查**:
```bash
# 检查运行中的容器环境变量
docker-compose exec fastgpt env | grep EXPIRE

# 应该显示
CHAT_FILE_EXPIRE_TIME=0
```

### 问题 3: "修改了 previewExpireMinutes 但没有生效"

**原因**: 需要重新构建镜像

**解决**:
```bash
# 重新构建
docker-compose build fastgpt

# 重启服务
docker-compose up -d fastgpt
```

### 问题 4: "历史文件都无法访问了"

**原因**: Token 已过期，需要重新生成

**解决**: 实现方案 B（Token 刷新）或提示用户重新上传

---

## 📊 实际案例

### 案例 1: 合同管理系统

**需求**: 合同可能在签订几年后还需要查看

**配置**:
```yaml
CHAT_FILE_EXPIRE_TIME: 0
```
```typescript
previewExpireMinutes: 10 * 365 * 24 * 60  // 10 年
```

### 案例 2: 客服聊天

**需求**: 大量临时文件，30天后一般不再需要

**配置**:
```yaml
CHAT_FILE_EXPIRE_TIME: 30
```
```typescript
previewExpireMinutes: 30 * 24 * 60  // 30 天
```

### 案例 3: 混合场景（推荐）

**需求**: 
- 普通对话文件 30 天后删除
- 重要文件由用户标记"归档"，永久保存

**实现**:
1. 默认配置 30 天
2. 重要文件单独存储到其他 bucket（如 S3 永久存储）
3. 在数据库中标记文件类型
4. AI 调用时动态生成不同来源的 URL

---

## 🚀 更新日志

- **2025-10-17**: 初始版本，建议将 Token 有效期改为 365 天
- **2025-10-17**: 添加 Token 刷新方案和故障排查指南

---

## 📞 需要帮助？

如果您在配置过程中遇到问题：
1. 检查本文档的"故障排查"部分
2. 查看 FastGPT 官方文档
3. 在 GitHub 提交 Issue

**重要提醒**: 修改 Token 有效期会影响安全性，请根据实际需求谨慎配置。

