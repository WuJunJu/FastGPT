#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastGPT API 诊断工具

用于检测 API Key 权限和服务状态
"""

import requests
import json

DEFAULT_API_URL = "http://192.168.2.46:3000"
DEFAULT_API_KEY = "fastgpt-rASRhNvn9TGrbMuR3nZs3GmmDO0J92G9x4UA2YC3EqvbfC8Iyt4Eyk"

def diagnose():
    print("="*70)
    print("  FastGPT API 诊断工具")
    print("="*70 + "\n")
    
    print(f"API URL: {DEFAULT_API_URL}")
    print(f"API Key: {DEFAULT_API_KEY[:20]}...\n")
    
    headers = {'Authorization': f'Bearer {DEFAULT_API_KEY}'}
    
    # 测试 1: 对话 API
    print("="*70)
    print("测试 1: 对话 API")
    print("="*70)
    try:
        response = requests.post(
            f"{DEFAULT_API_URL}/api/v1/chat/completions",
            json={
                'messages': [{'role': 'user', 'content': '你好'}],
                'stream': False
            },
            headers={**headers, 'Content-Type': 'application/json'},
            timeout=10
        )
        
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ 对话 API 可用")
            result = response.json()
            if 'choices' in result:
                print(f"AI 回复: {result['choices'][0]['message']['content'][:100]}...")
        else:
            print(f"❌ 对话 API 失败")
            print(f"响应: {response.text[:200]}")
    except Exception as e:
        print(f"❌ 请求失败: {e}")
    
    # 测试 2: 文件上传 API（不传文件，看错误信息）
    print("\n" + "="*70)
    print("测试 2: 文件上传 API（空请求测试）")
    print("="*70)
    try:
        response = requests.post(
            f"{DEFAULT_API_URL}/api/common/file/upload",
            data={'bucketName': 'chat', 'data': json.dumps({})},
            headers=headers,
            timeout=10
        )
        
        print(f"状态码: {response.status_code}")
        print(f"响应内容:")
        print(response.text[:500])
        
        if response.status_code == 400:
            print("\n💡 返回 400 是正常的（因为没有传文件）")
            print("✅ 文件上传 API 端点存在且可访问")
        elif response.status_code == 401:
            print("\n❌ API Key 无效或没有权限")
        elif response.status_code == 500:
            print("\n❌ 服务器内部错误")
            print("可能原因：")
            print("  1. 文件上传功能未启用")
            print("  2. 缺少必要的环境变量配置")
            print("  3. 存储服务（GridFS/S3）未正确配置")
        
    except Exception as e:
        print(f"❌ 请求失败: {e}")
    
    # 测试 3: 文件上传 API（传真实文件）
    print("\n" + "="*70)
    print("测试 3: 文件上传 API（真实文件测试）")
    print("="*70)
    
    # 创建测试文件
    test_file_content = "测试文件内容\nTest content"
    test_file_name = "test_diagnose.txt"
    
    with open(test_file_name, 'w', encoding='utf-8') as f:
        f.write(test_file_content)
    
    try:
        with open(test_file_name, 'rb') as f:
            files = {'file': (test_file_name, f)}
            data = {
                'bucketName': 'chat',
                'data': json.dumps({})
            }
            
            response = requests.post(
                f"{DEFAULT_API_URL}/api/common/file/upload",
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )
            
            print(f"状态码: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ 文件上传成功！")
                result = response.json()
                print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
            else:
                print(f"❌ 文件上传失败")
                print(f"响应内容:")
                print(response.text[:1000])
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        import os
        if os.path.exists(test_file_name):
            os.remove(test_file_name)
            print(f"\n已清理测试文件: {test_file_name}")
    
    # 总结
    print("\n" + "="*70)
    print("诊断总结")
    print("="*70)
    print("""
如果文件上传失败，请联系 FastGPT 管理员检查：

1. 文件上传功能是否已启用
   - 在应用设置中检查「文件选择」配置
   
2. 存储配置是否正确
   - GridFS (MongoDB): 默认配置
   - S3 兼容存储: 需要配置环境变量
   
3. API Key 权限
   - 确认 API Key 有文件上传权限
   - 尝试使用应用级 API Key
   
4. 环境变量
   - MONGO_URI: MongoDB 连接地址
   - FILE_TOKEN_KEY: 文件 Token 签名密钥
    """)

if __name__ == '__main__':
    diagnose()

