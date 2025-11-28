# FastGPT AI Image Proxy Middleware

该服务用于从上游下载 AI 绘画图片并转存到 FastGPT 插件对象存储（MinIO/S3），同时保持与主站 `/api/system/plugin/**` 代理规则兼容。

## 功能

- `POST /v1/image/proxy/upload`：接收图片地址，拉取二进制后写入 `S3_PLUGIN_BUCKET` 中的 `imgs/middleware/...` 路径，并返回可直接在主站访问的代理 URL（例如 `/api/system/plugin/middleware/ai-draw/{teamId}/{yyyy}/{mm}/{dd}/{file}`）。
- `GET /imgs/{...}`：从对象存储读取图片并流式返回，供主站的 `/api/system/plugin/**` 代理调用。
- `GET /health`：健康检查。

## 环境变量

| 名称 | 说明 | 默认值 |
| --- | --- | --- |
| `S3_ENDPOINT` | MinIO/S3 Endpoint | `localhost` |
| `S3_PORT` | MinIO/S3 端口（可选） | `9000` |
| `S3_USE_SSL` | 是否使用 HTTPS | `false` |
| `S3_ACCESS_KEY` | Access Key | `minioadmin` |
| `S3_SECRET_KEY` | Secret Key | `minioadmin` |
| `S3_PLUGIN_BUCKET` | 存储桶名称 | `fastgpt-plugin` |
| `AI_IMAGE_BASE_FOLDER` | 图片在 `imgs/` 下的子目录，默认为 `middleware/ai-draw` | `middleware/ai-draw` |
| `AI_IMAGE_FETCH_TIMEOUT` | 下载上游图片的超时时间（秒） | `20` |
| `AI_IMAGE_MAX_SIZE` | 允许的图片最大体积（字节） | `20 * 1024 * 1024` |
| `AI_IMAGE_BEARER_TOKEN` | 可选的 Bearer Token，配置后请求头需携带 `Authorization: Bearer <token>` | `未配置` |
| `AI_IMAGE_PUBLIC_BASE_URL` | 返回完整图片 URL 时使用的前缀（例如 `https://your-domain.com`） | `未配置，仅返回相对路径` |

## 启动

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Docker 部署

```bash
docker build -t fastgpt-ai-image-proxy .
docker run -d --name fastgpt-ai-image-proxy \
  -e S3_ENDPOINT=fastgpt-minio \
  -e S3_PORT=9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin \
  -e S3_PLUGIN_BUCKET=fastgpt-plugin \
  -e AI_IMAGE_PUBLIC_BASE_URL=https://fastgpt.example.com \
  -e AI_IMAGE_BEARER_TOKEN=your_bearer_token \
  -p 8000:8000 fastgpt-ai-image-proxy
```

或使用随附的 `docker-compose.yml`：

```bash
docker-compose up -d
```

在主站 `.env.local` 中配置（保持官方插件不变的情况下）：

```
PLUGIN_BASE_URL=http://fastgpt-plugin:3000
PLUGIN_TOKEN=<官方插件 Token>
IMAGE_PROXY_BASE_URL=http://<middleware-host>:8000
IMAGE_PROXY_BEARER_TOKEN=<与服务一致的 Bearer Token>
```

这样 `/api/system/plugin/middleware/...` 路径会自动转发至该服务，其余请求仍然走官方插件。

## 请求示例

```bash
curl -X POST http://localhost:8000/v1/image/proxy/upload \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your_bearer_token' \
  -d '{
        "image_url": "https://example.com/sample.png",
        "team_id": "team123"
      }'
```

成功后响应类似：

```json
{
  "url": "https://fastgpt.example.com/api/system/plugin/middleware/ai-draw/team123/2024/05/08/20241220123045-ab12cd.png",
  "relativeUrl": "/api/system/plugin/middleware/ai-draw/team123/2024/05/08/20241220123045-ab12cd.png",
  "object": "imgs/middleware/ai-draw/team123/2024/05/08/3f6a0f....png",
  "contentType": "image/png",
  "size": 345612
}
```

使用返回的 `url` 可直接在 FastGPT 主站访问图片；如果 `team_id` 为空，则会落入 `public` 目录。
