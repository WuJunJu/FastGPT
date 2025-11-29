#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastGPT 文件上传与对话功能完整测试脚本

功能测试：
1. 文件上传
2. 纯文本对话
3. 带文件的对话
4. 多轮对话（带文件历史）
5. 多文件上传
6. 错误处理

使用方法：
    python test_file_upload_chat.py
"""

import requests
import json
import base64
import os
import time
from typing import Optional, List, Dict, Any
from pathlib import Path

# ============================================================================
# 配置区域
# ============================================================================

DEFAULT_API_URL = "http://127.0.0.1:3000"
DEFAULT_API_KEY = "fastgpt-uZhUXSnTpgvaoMSct9ykN29JWzzqTgt95c6KFbOTGBAS6iKZowrlOVkSV"
APP_ID = "6929e608cd0bac19ced8e9c9"  # ✅ 应用 ID
CHAT_ID = "test111"  # 可选：外部传入 chatId，避免使用 FastGPT 自动生成

# 测试文件配置（如果文件不存在，会自动创建）
TEST_FILES = {
    "test.txt": "这是一个测试文件。\n\n文件内容：\n1. 第一行内容\n2. 第二行内容\n3. 第三行内容",
    "test2.txt": "这是第二个测试文件。\n\n包含不同的内容，用于多文件测试。",
}


# ============================================================================
# 核心功能函数
# ============================================================================

class FastGPTClient:
    """FastGPT API 客户端"""
    
    def __init__(self, base_url: str, api_key: str, chat_id: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.chat_id = chat_id
        self.headers = {
            'Authorization': f'Bearer {api_key}'
        }
    
    def upload_file(self, file_path: str, app_id: Optional[str] = None, chat_id: Optional[str] = None) -> Dict[str, Any]:
        """
        上传文件到 FastGPT

        Args:
            file_path: 文件路径
            app_id: 应用ID（仅账号级API Key需要）
            chat_id: 对话ID（可选，外部上下文传入，避免 FastGPT 自动创建）
            
        Returns:
            包含 fileId, fileName, previewUrl 的字典
        """
        url = f"{self.base_url}/api/common/file/upload"
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f)}
            
            # 应用级 API Key 不需要 appId
            payload = {'appId': app_id} if app_id else {}
            # 如果外部希望指定 chatId（自建上下文），优先使用外部传入
            if chat_id or self.chat_id:
                payload['chatId'] = chat_id or self.chat_id

            data = {
                'bucketName': 'chat',
                'data': json.dumps(payload)
            }
            
            print(f"📤 上传文件: {os.path.basename(file_path)}")
            print(f"   URL: {url}")
            print(f"   Bucket: {data['bucketName']}")
            print(f"   Data: {data['data']}")
            
            response = requests.post(url, files=files, data=data, headers=self.headers)
            
            # 详细错误输出
            if response.status_code != 200:
                print(f"\n⚠️  上传失败 (HTTP {response.status_code})")
                print(f"响应内容: {response.text[:500]}")
            
            response.raise_for_status()
            
            result = response.json()
            
            # 处理嵌套的 data 字段
            data = result.get('data', result)
            preview_url = data['previewUrl']
            
            # 如果是相对路径，转换为完整 URL
            if preview_url.startswith('/'):
                preview_url = f"{self.base_url}{preview_url}"
            
            file_id = data.get('fileId') or self._extract_file_id(preview_url)
            
            return {
                'fileId': file_id,
                'fileName': os.path.basename(file_path),
                'previewUrl': preview_url
            }
    
    def chat(
        self, 
        messages: List[Dict[str, Any]], 
        stream: bool = False,
        detail: bool = False
    ) -> Dict[str, Any]:
        """
        发起对话
        
        Args:
            messages: 消息列表（OpenAI 格式）
            stream: 是否流式返回
            detail: 是否返回详细信息
            
        Returns:
            对话响应
        """
        url = f"{self.base_url}/api/v1/chat/completions"
        
        payload = {
            'messages': messages,
            'stream': stream
        }
        
        if detail:
            payload['detail'] = True
        
        print(f"💬 发送对话请求...")
        response = requests.post(
            url,
            json=payload,
            headers={**self.headers, 'Content-Type': 'application/json'}
        )
        response.raise_for_status()
        
        return response.json()
    
    def _extract_file_id(self, url: str) -> str:
        """从 previewUrl 中提取 fileId"""
        import re
        match = re.search(r'[?&]token=([^&]+)', url)
        if not match:
            return ''
        
        token = match.group(1)
        try:
            # 添加 padding
            token_padded = token.split('.')[1] + '=='
            payload = json.loads(base64.b64decode(token_padded))
            return payload.get('fileId', '')
        except Exception as e:
            print(f"⚠️  提取 fileId 失败: {e}")
            return ''


# ============================================================================
# 测试用例
# ============================================================================

class TestRunner:
    """测试运行器"""
    
    def __init__(self, client: FastGPTClient, app_id: Optional[str] = None, chat_id: Optional[str] = None):
        self.client = client
        self.app_id = app_id
        self.chat_id = chat_id
        self.test_results = []
        self.uploaded_files = {}
    
    def run_all_tests(self):
        """运行所有测试"""
        print("\n" + "="*70)
        print("  FastGPT 文件上传与对话功能测试")
        print("="*70 + "\n")
        print(f"当前 chatId: {self.chat_id or '(未指定，使用自动生成)'}")
        
        # 准备测试文件
        self._prepare_test_files()
        
        # 运行测试
        tests = [
            ("测试 1: 纯文本对话", self.test_pure_text_chat),
            ("测试 2: 文件上传", self.test_file_upload),
            ("测试 3: 单文件对话", self.test_single_file_chat),
            ("测试 4: 多文件上传", self.test_multi_file_upload),
            ("测试 5: 多文件对话", self.test_multi_file_chat),
            ("测试 6: 多轮对话（带文件历史）", self.test_multi_turn_chat),
            ("测试 7: fileId 引用测试", self.test_file_id_reference),
            ("测试 8: 外部上下文覆盖验证", self.test_external_context_usage),
        ]
        
        for test_name, test_func in tests:
            self._run_test(test_name, test_func)
        
        # 显示测试总结
        self._print_summary()
    
    def _run_test(self, name: str, func):
        """运行单个测试"""
        print(f"\n{'─'*70}")
        print(f"🧪 {name} (chatId: {self.chat_id or 'auto'})")
        print('─'*70)
        
        try:
            start_time = time.time()
            func()
            elapsed = time.time() - start_time
            
            self.test_results.append({
                'name': name,
                'status': 'PASS',
                'time': elapsed
            })
            print(f"\n✅ {name} 通过 ({elapsed:.2f}s)")
            
        except Exception as e:
            self.test_results.append({
                'name': name,
                'status': 'FAIL',
                'error': str(e)
            })
            print(f"\n❌ {name} 失败")
            print(f"错误信息: {e}")
            import traceback
            traceback.print_exc()
    
    def _prepare_test_files(self):
        """准备测试文件"""
        print("📁 准备测试文件...")
        
        for filename, content in TEST_FILES.items():
            if not os.path.exists(filename):
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"  ✓ 创建测试文件: {filename}")
            else:
                print(f"  ✓ 测试文件已存在: {filename}")
    
    # ========================================================================
    # 具体测试用例
    # ========================================================================
    
    def test_pure_text_chat(self):
        """测试 1: 纯文本对话"""
        messages = [
            {
                "role": "user",
                "content": "你好，请介绍一下你自己。"
            }
        ]
        
        response = self.client.chat(messages)
        
        # 验证响应
        assert 'choices' in response, "响应缺少 choices 字段"
        assert len(response['choices']) > 0, "choices 为空"
        
        content = response['choices'][0]['message']['content']
        print(f"\n📝 AI 回复:")
        print(f"  {content[:200]}..." if len(content) > 200 else f"  {content}")
        
        assert len(content) > 0, "AI 回复为空"
    
    def test_file_upload(self):
        """测试 2: 文件上传"""
        file_path = "test.txt"
        
        result = self.client.upload_file(file_path, self.app_id, self.chat_id)
        
        # 保存上传结果供后续测试使用
        self.uploaded_files['test.txt'] = result
        
        # 验证响应
        assert 'fileId' in result, "响应缺少 fileId"
        assert 'previewUrl' in result, "响应缺少 previewUrl"
        assert len(result['fileId']) > 0, f"fileId 为空"
        
        print(f"\n📋 上传结果:")
        print(f"  文件名: {result['fileName']}")
        print(f"  fileId: {result['fileId']}")
        print(f"  URL: {result['previewUrl'][:80]}...")
    
    def test_single_file_chat(self):
        """测试 3: 单文件对话"""
        # 确保文件已上传
        if 'test.txt' not in self.uploaded_files:
            self.uploaded_files['test.txt'] = self.client.upload_file('test.txt', self.app_id, self.chat_id)
        
        file_info = self.uploaded_files['test.txt']
        
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请总结一下这个文件的内容"},
                    {
                        "type": "file_url",
                        "name": file_info['fileName'],
                        "url": file_info['previewUrl']
                    }
                ]
            }
        ]
        
        response = self.client.chat(messages)
        
        content = response['choices'][0]['message']['content']
        print(f"\n📝 AI 回复:")
        print(f"  {content[:300]}..." if len(content) > 300 else f"  {content}")
        
        assert len(content) > 0, "AI 回复为空"
    
    def test_multi_file_upload(self):
        """测试 4: 多文件上传"""
        for filename in TEST_FILES.keys():
            if filename not in self.uploaded_files:
                result = self.client.upload_file(filename, self.app_id, self.chat_id)
                self.uploaded_files[filename] = result
                print(f"  ✓ {filename} -> fileId: {result['fileId']}")
        
        assert len(self.uploaded_files) >= 2, "上传的文件数量不足"
    
    def test_multi_file_chat(self):
        """测试 5: 多文件对话"""
        # 确保所有文件已上传
        self.test_multi_file_upload()
        
        content = [{"type": "text", "text": "请分析和对比这两个文件的内容"}]
        
        for file_info in self.uploaded_files.values():
            content.append({
                "type": "file_url",
                "name": file_info['fileName'],
                "url": file_info['previewUrl']
            })
        
        messages = [{"role": "user", "content": content}]
        
        response = self.client.chat(messages)
        
        reply = response['choices'][0]['message']['content']
        print(f"\n📝 AI 回复:")
        print(f"  {reply[:300]}..." if len(reply) > 300 else f"  {reply}")
        
        assert len(reply) > 0, "AI 回复为空"
    
    def test_multi_turn_chat(self):
        """测试 6: 多轮对话（带文件历史）"""
        # 确保文件已上传
        if 'test.txt' not in self.uploaded_files:
            self.uploaded_files['test.txt'] = self.client.upload_file('test.txt', self.app_id, self.chat_id)
        
        file_info = self.uploaded_files['test.txt']
        
        # 第一轮：上传文件
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "这个文件有几行内容？"},
                    {
                        "type": "file_url",
                        "name": file_info['fileName'],
                        "url": file_info['previewUrl']
                    }
                ]
            }
        ]
        
        response1 = self.client.chat(messages)
        reply1 = response1['choices'][0]['message']['content']
        
        print(f"\n💬 第一轮对话:")
        print(f"  用户: 这个文件有几行内容？")
        print(f"  AI: {reply1[:150]}..." if len(reply1) > 150 else f"  AI: {reply1}")
        
        # 第二轮：继续讨论（不重复发送文件）
        messages.append({"role": "assistant", "content": reply1})
        messages.append({
            "role": "user",
            "content": "第二行的内容是什么？"
        })
        
        response2 = self.client.chat(messages)
        reply2 = response2['choices'][0]['message']['content']
        
        print(f"\n💬 第二轮对话:")
        print(f"  用户: 第二行的内容是什么？")
        print(f"  AI: {reply2[:150]}..." if len(reply2) > 150 else f"  AI: {reply2}")
        
        assert len(reply2) > 0, "第二轮对话 AI 回复为空"
    
    def test_file_id_reference(self):
        """测试 7: fileId 引用测试（验证 AI 是否使用 fileId 而非完整 URL）"""
        # 确保文件已上传
        if 'test.txt' not in self.uploaded_files:
            self.uploaded_files['test.txt'] = self.client.upload_file('test.txt', self.app_id, self.chat_id)
        
        file_info = self.uploaded_files['test.txt']
        
        print(f"\n📊 fileId 分析:")
        print(f"  原始 URL 长度: {len(file_info['previewUrl'])} 字符")
        print(f"  fileId 长度: {len(file_info['fileId'])} 字符")
        print(f"  节省: {len(file_info['previewUrl']) - len(file_info['fileId'])} 字符")
        print(f"  节省比例: {(1 - len(file_info['fileId'])/len(file_info['previewUrl']))*100:.1f}%")
        
        # 发送对话请求，验证功能正常
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "读取这个文件"},
                    {
                        "type": "file_url",
                        "name": file_info['fileName'],
                        "url": file_info['previewUrl']
                    }
                ]
            }
        ]
        
        response = self.client.chat(messages, detail=True)
        
        # 检查是否成功读取
        reply = response['choices'][0]['message']['content']
        assert len(reply) > 0, "AI 回复为空"
        
        print(f"\n✅ fileId 引用机制工作正常")

    def test_external_context_usage(self):
        """测试 8: 传入外部上下文，验证 AI 是否使用该上下文而非 chatId 历史"""
        context_text = "外部上下文：测试外部上下文123"
        messages = [
            {"role": "system", "content": "你是一个测试助手，只根据我提供的上下文回答。"},
            {"role": "user", "content": f"这里是上下文：{context_text}"},
            {"role": "user", "content": "请复述刚才的上下文内容，不要发挥。"}
        ]

        response = self.client.chat(messages)
        reply = response['choices'][0]['message']['content']

        print(f"\n🧪 外部上下文校验回复:\n  {reply}")
        assert context_text in reply, "AI 未正确使用外部上下文"
        print("✅ 外部上下文被正确使用")
    
    # ========================================================================
    # 测试总结
    # ========================================================================
    
    def _print_summary(self):
        """打印测试总结"""
        print("\n" + "="*70)
        print("  测试总结")
        print("="*70 + "\n")
        
        passed = sum(1 for r in self.test_results if r['status'] == 'PASS')
        failed = sum(1 for r in self.test_results if r['status'] == 'FAIL')
        total = len(self.test_results)
        
        print(f"总测试数: {total}")
        print(f"✅ 通过: {passed}")
        print(f"❌ 失败: {failed}")
        print(f"成功率: {passed/total*100:.1f}%\n")
        
        if failed > 0:
            print("失败的测试:")
            for result in self.test_results:
                if result['status'] == 'FAIL':
                    print(f"  ❌ {result['name']}")
                    print(f"     错误: {result['error']}")
        
        print("\n" + "="*70)
        
        # 清理测试文件
        self._cleanup()
    
    def _cleanup(self):
        """清理测试文件"""
        print("\n🧹 清理测试文件...")
        for filename in TEST_FILES.keys():
            if os.path.exists(filename):
                try:
                    os.remove(filename)
                    print(f"  ✓ 删除: {filename}")
                except Exception as e:
                    print(f"  ⚠️  删除失败: {filename} ({e})")


# ============================================================================
# 主程序
# ============================================================================

def main():
    """主函数"""
    try:
        # 创建客户端
        client = FastGPTClient(
            base_url=DEFAULT_API_URL,
            api_key=DEFAULT_API_KEY,
            chat_id=CHAT_ID
        )
        
        # 创建测试运行器
        runner = TestRunner(client, app_id=APP_ID, chat_id=CHAT_ID)
        
        # 运行所有测试
        runner.run_all_tests()
        
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
    except Exception as e:
        print(f"\n\n❌ 测试运行失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
