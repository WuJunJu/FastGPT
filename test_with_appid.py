#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastGPT 文件上传功能测试（需要 appId）

使用前请先获取 appId：
1. 登录 FastGPT 管理后台
2. 进入应用详情页
3. 从 URL 中获取 appId（格式：/app/detail/64d8xxxx...）
4. 将 appId 填入下方配置

或者询问 FastGPT 管理员获取
"""

import requests
import json
import base64
import os

# ============================================================================
# 配置区域 - 请填写 APP_ID
# ============================================================================

DEFAULT_API_URL = "http://192.168.2.46:3000"
DEFAULT_API_KEY = "fastgpt-rASRhNvn9TGrbMuR3nZs3GmmDO0J92G9x4UA2YC3EqvbfC8Iyt4Eyk"
APP_ID = ""  # ⚠️ 必填：请填写您的 appId

# ============================================================================

def test_file_upload_with_appid():
    """测试文件上传功能"""
    
    # 检查配置
    if not APP_ID:
        print("❌ 错误：请先填写 APP_ID")
        print("\n如何获取 APP_ID:")
        print("1. 登录 FastGPT 管理后台")
        print("2. 进入应用详情页")
        print("3. 从 URL 中获取，格式如：/app/detail/64d8xxxx...")
        print("4. 或者询问 FastGPT 管理员")
        return
    
    print("="*70)
    print("  FastGPT 文件上传测试")
    print("="*70)
    print(f"\nAPI URL: {DEFAULT_API_URL}")
    print(f"API Key: {DEFAULT_API_KEY[:20]}...")
    print(f"App ID: {APP_ID}\n")
    
    # 创建测试文件
    test_file = "test_upload.txt"
    test_content = """这是一个测试文件。

文件内容：
1. FastGPT 文件上传测试
2. 测试时间：2025-10-17
3. 功能：文件上传与对话

---结束---"""
    
    with open(test_file, 'w', encoding='utf-8') as f:
        f.write(test_content)
    
    print(f"✓ 创建测试文件: {test_file}\n")
    
    # 测试 1: 上传文件
    print("="*70)
    print("测试 1: 文件上传")
    print("="*70)
    
    try:
        with open(test_file, 'rb') as f:
            files = {'file': (test_file, f)}
            data = {
                'bucketName': 'chat',
                'data': json.dumps({'appId': APP_ID})  # 传递 appId
            }
            headers = {'Authorization': f'Bearer {DEFAULT_API_KEY}'}
            
            print(f"📤 上传文件...")
            response = requests.post(
                f"{DEFAULT_API_URL}/api/common/file/upload",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ 上传成功!")
                print(f"\n响应内容:")
                print(json.dumps(result, indent=2, ensure_ascii=False))
                
                # 提取 fileId
                url = result['previewUrl']
                token_match = url.split('?token=')[1] if '?token=' in url else ''
                if token_match:
                    try:
                        payload = json.loads(base64.b64decode(token_match.split('.')[1] + '=='))
                        file_id = payload.get('fileId', '')
                        print(f"\n提取的 fileId: {file_id}")
                    except:
                        pass
                
                # 测试 2: 带文件的对话
                print("\n" + "="*70)
                print("测试 2: 带文件的对话")
                print("="*70)
                
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "请总结一下这个文件的内容"},
                            {
                                "type": "file_url",
                                "name": test_file,
                                "url": result['previewUrl']
                            }
                        ]
                    }
                ]
                
                print(f"💬 发送对话请求...")
                chat_response = requests.post(
                    f"{DEFAULT_API_URL}/api/v1/chat/completions",
                    json={'messages': messages, 'stream': False},
                    headers={**headers, 'Content-Type': 'application/json'},
                    timeout=60
                )
                
                if chat_response.status_code == 200:
                    chat_result = chat_response.json()
                    reply = chat_result['choices'][0]['message']['content']
                    print(f"✅ 对话成功!")
                    print(f"\n📝 AI 回复:")
                    print(f"{reply}\n")
                else:
                    print(f"❌ 对话失败 (HTTP {chat_response.status_code})")
                    print(chat_response.text[:500])
            
            else:
                print(f"❌ 上传失败 (HTTP {response.status_code})")
                print(f"\n响应内容:")
                print(response.text[:1000])
                
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 清理测试文件
        if os.path.exists(test_file):
            os.remove(test_file)
            print(f"\n🧹 已清理测试文件: {test_file}")
    
    print("\n" + "="*70)
    print("测试完成")
    print("="*70)

if __name__ == '__main__':
    test_file_upload_with_appid()

