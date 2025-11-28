import asyncio
import mimetypes
import os
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException, Path, Request
from fastapi.responses import JSONResponse, StreamingResponse
from minio import Minio
from minio.error import S3Error
from pydantic import BaseModel, HttpUrl

class Settings(BaseModel):
  s3_endpoint: str
  s3_port: Optional[int]
  s3_use_ssl: bool = False
  s3_access_key: str
  s3_secret_key: str
  s3_bucket: str
  base_folder: str = 'middleware/ai-draw'
  timeout_seconds: int = 20
  bearer_token: Optional[str] = None
  public_base_url: Optional[str] = None

  @property
  def minio_kwargs(self) -> dict:
    return {
      'endpoint': self.s3_endpoint if self.s3_port is None else f'{self.s3_endpoint}:{self.s3_port}',
      'access_key': self.s3_access_key,
      'secret_key': self.s3_secret_key,
      'secure': self.s3_use_ssl
    }


def load_settings() -> Settings:
  port_env = os.getenv('S3_PORT')
  return Settings(
    s3_endpoint=os.getenv('S3_ENDPOINT', 'localhost'),
    s3_port=int(port_env) if port_env else None,
    s3_use_ssl=os.getenv('S3_USE_SSL', 'false').lower() == 'true',
    s3_access_key=os.getenv('S3_ACCESS_KEY', 'minioadmin'),
    s3_secret_key=os.getenv('S3_SECRET_KEY', 'minioadmin'),
    s3_bucket=os.getenv('S3_PLUGIN_BUCKET', 'fastgpt-plugin'),
    base_folder=os.getenv('AI_IMAGE_BASE_FOLDER', 'middleware/ai-draw'),
    timeout_seconds=int(os.getenv('AI_IMAGE_FETCH_TIMEOUT', '20')),
    bearer_token=os.getenv('AI_IMAGE_BEARER_TOKEN'),
    public_base_url=os.getenv('AI_IMAGE_PUBLIC_BASE_URL')
  )


settings = load_settings()
minio_client = Minio(**settings.minio_kwargs)
app = FastAPI(title='FastGPT AI Image Middleware', version='1.0.0')

ALLOWED_CONTENT_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp'
}

MAX_IMAGE_BYTES = int(os.getenv('AI_IMAGE_MAX_SIZE', str(20 * 1024 * 1024)))


class ProxyRequest(BaseModel):
  image_url: HttpUrl
  team_id: Optional[str] = None
  filename: Optional[str] = None
  folder: Optional[str] = None


async def ensure_bucket() -> None:
  exists = await asyncio.get_running_loop().run_in_executor(None, minio_client.bucket_exists, settings.s3_bucket)
  if not exists:
    await asyncio.get_running_loop().run_in_executor(None, minio_client.make_bucket, settings.s3_bucket)


def verify_bearer_token(request: Request) -> None:
  if not settings.bearer_token:
    return
  auth_header = request.headers.get('authorization')
  if not auth_header:
    raise HTTPException(status_code=401, detail='缺少 Authorization 头')
  scheme, _, token = auth_header.partition(' ')
  if scheme.lower() != 'bearer' or not token:
    raise HTTPException(status_code=401, detail='Authorization 头格式错误，需使用 Bearer Token')
  if token != settings.bearer_token:
    raise HTTPException(status_code=403, detail='Bearer Token 不匹配')


def detect_extension(content_type: Optional[str], url: str, override: Optional[str]) -> str:
  if override:
    clean = override.lower().strip().lstrip('.')
    return f'.{clean}'

  if content_type and content_type.lower() in ALLOWED_CONTENT_TYPES:
    return ALLOWED_CONTENT_TYPES[content_type.lower()]

  guess = mimetypes.guess_extension(content_type or '') if content_type else None
  if guess:
    return guess

  guess_from_url = mimetypes.guess_extension(mimetypes.guess_type(url)[0] or '')
  if guess_from_url:
    return guess_from_url

  return '.png'


def build_object_name(team_id: Optional[str], folder: Optional[str], filename: Optional[str], extension: str) -> tuple[str, str]:
  now = datetime.now(timezone.utc)
  sub_folder = folder.strip('/') if folder else settings.base_folder
  team_folder = team_id.strip('/') if team_id else 'public'
  final_folder = sub_folder if sub_folder.startswith('middleware/') else f'middleware/{sub_folder}'
  date_path = now.strftime('%Y/%m/%d')

  if filename:
    name = filename.strip()
  else:
    timestamp = now.strftime('%Y%m%d%H%M%S')
    name = f'{timestamp}-{uuid4().hex[:6]}'
  name = name.replace('/', '_').replace('\\', '_')
  if not name.endswith(extension):
    name = f'{name}{extension}'

  object_path = f'imgs/{final_folder}/{team_folder}/{date_path}/{name}'
  api_path = f'/api/system/plugin/{final_folder}/{team_folder}/{date_path}/{name}'
  return object_path, api_path


async def download_image(url: str, timeout: int) -> tuple[bytes, str]:
  async with httpx.AsyncClient(timeout=timeout) as client:
    try:
      response = await client.get(url)
      response.raise_for_status()
    except httpx.HTTPError as e:
      raise HTTPException(status_code=400, detail=f'下载图片失败: {e}') from e

  content_type = response.headers.get('content-type', '').split(';')[0].lower()
  if content_type and not content_type.startswith('image/'):
    raise HTTPException(status_code=400, detail=f'不支持的内容类型: {content_type}')

  if len(response.content) > MAX_IMAGE_BYTES:
    raise HTTPException(status_code=400, detail='图片体积超出限制')

  return response.content, content_type


async def put_object(object_name: str, data: bytes, content_type: str) -> None:
  def _upload() -> None:
    data_stream = BytesIO(data)
    try:
      minio_client.put_object(
        settings.s3_bucket,
        object_name,
        data_stream,
        length=len(data),
        content_type=content_type or 'application/octet-stream'
      )
    except S3Error as e:
      raise HTTPException(status_code=500, detail=f'上传对象失败: {e}') from e

  await asyncio.get_running_loop().run_in_executor(None, _upload)


@app.on_event('startup')
async def startup_event() -> None:
  await ensure_bucket()


@app.post('/v1/image/proxy/upload')
async def proxy_image(body: ProxyRequest, _: None = Depends(verify_bearer_token)) -> JSONResponse:
  image_bytes, content_type = await download_image(body.image_url, settings.timeout_seconds)
  extension = detect_extension(content_type, body.image_url, None)

  object_name, api_path = build_object_name(
    team_id=body.team_id,
    folder=body.folder,
    filename=body.filename,
    extension=extension
  )

  await put_object(object_name, image_bytes, content_type or 'application/octet-stream')

  if settings.public_base_url:
    base = settings.public_base_url.rstrip('/')
    full_url = f'{base}{api_path}'
  else:
    full_url = api_path

  return JSONResponse(
    {
      'url': full_url,
      'relativeUrl': api_path,
      'object': object_name,
      'contentType': content_type,
      'size': len(image_bytes)
    }
  )


@app.get('/imgs/{file_path:path}')
async def get_image(request: Request, file_path: str = Path(...)):
  object_name = f'imgs/{file_path}'
  try:
    stat = await asyncio.get_running_loop().run_in_executor(None, minio_client.stat_object, settings.s3_bucket, object_name)
    obj = await asyncio.get_running_loop().run_in_executor(
      None, minio_client.get_object, settings.s3_bucket, object_name
    )
  except S3Error as e:
    raise HTTPException(status_code=404, detail=f'图片不存在: {e}') from e

  media_type = stat.content_type or 'application/octet-stream'
  headers = {'Content-Length': str(stat.size)}

  async def stream():
    try:
      while True:
        data = await asyncio.get_running_loop().run_in_executor(None, obj.read, 64 * 1024)
        if not data:
          break
        yield data
    finally:
      await asyncio.get_running_loop().run_in_executor(None, obj.close)

  # 如果客户端支持 HEAD 请求
  if request.method.upper() == 'HEAD':
    await asyncio.get_running_loop().run_in_executor(None, obj.close)
    return StreamingResponse(content=iter(()), media_type=media_type, headers=headers)

  return StreamingResponse(stream(), media_type=media_type, headers=headers)


@app.get('/health')
async def health() -> dict:
  return {'status': 'ok'}
