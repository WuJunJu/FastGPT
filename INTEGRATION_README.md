# FastGPT 文件上传功能 - 文档导航

本仓库包含多份与文件上传功能相关的文档，请根据您的角色选择合适的文档。

---

## 📚 文档列表

### 1. API_INTEGRATION_GUIDE.md ⭐ **推荐：API 开发者**

**适用对象**：
- 使用 FastGPT API 开发应用的前端/后端工程师
- 不需要（也无权）修改 FastGPT 配置的开发者
- 通过 API 调用 FastGPT 服务的第三方应用

**包含内容**：
- ✅ 文件上传 API 调用方法
- ✅ 对话 API（带文件）使用示例
- ✅ 外部上下文管理方案
- ✅ 完整的前后端代码示例
- ✅ 常见问题解答

**不包含**：
- ❌ FastGPT 内部配置
- ❌ 源码修改建议
- ❌ 系统参数设置

---

### 2. INTEGRATION_GUIDE_FULL.md - 完整指南

**适用对象**：
- FastGPT 部署和运维人员
- 需要深入了解整个系统的技术负责人
- 既开发应用又维护 FastGPT 的团队

**包含内容**：
- ✅ API 调用方法
- ✅ FastGPT 系统配置说明
- ✅ 工作流节点配置
- ✅ 文件元数据显示模式配置
- ✅ 内部实现原理

**额外内容**：
- 系统配置项详解（`autoInjectFileContent`、`inlineFileMetadata`）
- 工作流节点使用说明
- FastGPT 内部机制

---

### 3. FILE_EXPIRATION_CONFIG.md - 文件过期配置

**适用对象**：
- FastGPT 管理员
- 需要配置文件存储策略的运维人员

**包含内容**：
- ✅ 文件过期机制详解（两层：存储 + Token）
- ✅ 环境变量配置指南
- ✅ Token 有效期修改方法
- ✅ Token 刷新实现方案
- ✅ 不同场景的推荐配置

---

## 🎯 快速选择指南

### 我是 API 对接开发者

**您需要**：[API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)

这份文档专为您准备，只包含 API 调用相关的内容，不涉及 FastGPT 内部配置。

### 我是 FastGPT 管理员

**您需要**：
1. [FILE_EXPIRATION_CONFIG.md](./FILE_EXPIRATION_CONFIG.md) - 配置文件过期策略
2. [INTEGRATION_GUIDE_FULL.md](./INTEGRATION_GUIDE_FULL.md) - 了解完整功能

### 我既开发应用又管理 FastGPT

**您需要**：
1. 先看 [API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md) - 学习 API 调用
2. 再看 [INTEGRATION_GUIDE_FULL.md](./INTEGRATION_GUIDE_FULL.md) - 了解系统配置
3. 最后看 [FILE_EXPIRATION_CONFIG.md](./FILE_EXPIRATION_CONFIG.md) - 配置文件策略

---

## 📖 文档关系图

```
┌─────────────────────────────────────────┐
│        FastGPT 文件上传功能              │
└─────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │                   │
  ┌─────▼──────┐      ┌────▼─────┐
  │ API 开发者  │      │ 管理员    │
  └─────┬──────┘      └────┬─────┘
        │                   │
        │              ┌────▼──────────────────┐
        │              │ FILE_EXPIRATION       │
        │              │ _CONFIG.md            │
        │              └───────────────────────┘
        │                   │
  ┌─────▼──────────────┐   │
  │ API_INTEGRATION    │   │
  │ _GUIDE.md          │◄──┤
  └────────────────────┘   │
        │                   │
        └─────────┬─────────┘
                  │
        ┌─────────▼──────────────┐
        │ INTEGRATION_GUIDE      │
        │ _FULL.md               │
        │ (完整指南)              │
        └────────────────────────┘
```

---

## 🔄 版本历史

- **v2.0** (2025-10-17): 拆分为 API 文档和完整指南
- **v1.0** (2025-10-17): 初始版本（已重命名为 FULL 版）

---

## 💡 建议

### 给 API 开发团队负责人

建议您：
1. 将 `API_INTEGRATION_GUIDE.md` 分享给您的开发团队
2. 联系 FastGPT 管理员确认以下配置：
   - 文件大小限制
   - 支持的文件类型
   - 文件过期时间
   - API 调用频率限制

### 给 FastGPT 管理员

建议您：
1. 先阅读 `FILE_EXPIRATION_CONFIG.md` 配置文件策略
2. 根据需求决定是否修改：
   - `CHAT_FILE_EXPIRE_TIME` 环境变量（文件物理删除）
   - `previewExpireMinutes` 代码配置（Token 有效期）
3. 将 API Key 和配置信息提供给开发团队

---

## 📞 需要帮助？

- **API 使用问题**: 查看 `API_INTEGRATION_GUIDE.md` 的"常见问题"章节
- **配置问题**: 查看 `FILE_EXPIRATION_CONFIG.md` 的"故障排查"章节
- **功能请求**: 提交 GitHub Issue

---

**文档维护**: 请保持这三份文档的同步更新。当 API 或配置发生变化时，记得更新相应文档。

