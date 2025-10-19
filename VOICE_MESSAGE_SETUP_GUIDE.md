# WhatsApp 语音消息自动回复设置指南

## 概述

本指南介绍如何设置和测试 WhatsApp 语音消息的自动转录和 LLM 回复功能。

## 架构流程

```
WhatsApp 语音消息 → WhatsApp Gateway → Backend API → 语音转文本 → LLM 处理 → 自动回复
```

## 已完成的功能模块

### 1. WhatsApp Gateway (`whatsapp_gateway/index.js`)
- ✅ 检测传入的语音消息 (`msg.type === 'voice'` 或 `msg.type === 'audio'`)
- ✅ 下载语音文件并转换为 Base64 编码
- ✅ 将媒体数据发送到后端 API

### 2. 后端 API (`backend/app/routers/messages.py`)
- ✅ 接收包含语音数据的消息
- ✅ 解码 Base64 数据并保存为临时文件
- ✅ 调用语音转文本服务
- ✅ 将转录结果保存到数据库
- ✅ 触发工作流处理转录文本

### 3. 语音转文本服务 (`backend/app/services/speech_to_text.py`)
- ✅ 支持多种音频格式 (OGG, MP3, WAV, MP4)
- ✅ 自动格式转换 (使用 pydub)
- ✅ 多语言支持 (中文、英文、繁体中文)
- ✅ 环境噪音调整
- ✅ 错误处理和资源清理

### 4. 数据库模型
- ✅ 添加 `media_type` 字段到 messages 表
- ✅ 添加 `transcription` 字段到 messages 表
- ✅ 更新 Pydantic schemas
- ✅ 创建数据库迁移文件

### 5. LLM 集成
- ✅ 转录文本自动传递给现有的工作流引擎
- ✅ AI 服务处理转录内容并生成回复

## 部署步骤

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

新增的依赖包括：
- `SpeechRecognition` - 语音识别库
- `pydub` - 音频格式转换库

### 2. 运行数据库迁移

```bash
cd backend
python -m alembic upgrade head
```

### 3. 系统依赖

对于音频处理，您可能需要安装系统级依赖：

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
下载并安装 FFmpeg，确保它在系统 PATH 中。

### 4. 启动服务

```bash
# 启动后端
cd backend
python run.py

# 启动 WhatsApp Gateway
cd whatsapp_gateway
npm start
```

## 测试步骤

### 1. 基础功能测试

```bash
cd backend
python test_speech_to_text.py
```

### 2. 端到端测试

1. 确保 WhatsApp Gateway 已连接并显示 QR 码
2. 用手机扫描 QR 码连接 WhatsApp
3. 向连接的 WhatsApp 号码发送语音消息
4. 检查后端日志，确认：
   - 语音消息被检测到
   - 音频文件被下载和转换
   - 语音转文本成功
   - LLM 处理转录文本
   - 自动回复发送

### 3. 日志监控

关键日志信息：
- `🎤 检测到语音消息` - Gateway 检测到语音
- `💾 临时语音文件已保存` - 音频文件保存成功
- `🔄 转换音频格式` - 音频格式转换
- `✅ 音频转录成功` - 语音转文本成功
- `🤖 AI節點開始執行` - LLM 开始处理

## 配置选项

### 语音识别语言

在 `backend/app/services/speech_to_text.py` 中修改：

```python
languages_to_try = ["zh-CN", "en-US", "zh-TW"]  # 可以调整语言优先级
```

### 音频质量设置

可以在 `speech_to_text.py` 中调整：

```python
r.adjust_for_ambient_noise(source, duration=0.5)  # 噪音调整时间
```

## 故障排除

### 常见问题

1. **语音转录失败**
   - 检查网络连接（需要访问 Google Speech API）
   - 确认音频文件格式支持
   - 检查音频质量和长度

2. **音频格式转换失败**
   - 确认 FFmpeg 已正确安装
   - 检查 pydub 依赖是否正确安装

3. **临时文件清理问题**
   - 检查磁盘空间
   - 确认临时目录权限

### 调试模式

在 `backend/app/routers/messages.py` 中，所有语音处理步骤都有详细的日志输出，可以通过查看控制台日志来诊断问题。

## 性能优化建议

1. **异步处理**: 语音转文本可能耗时较长，考虑将其移到后台任务队列
2. **缓存机制**: 对相同的语音消息可以缓存转录结果
3. **音频预处理**: 可以添加音频降噪和增强功能
4. **多语言检测**: 可以添加自动语言检测功能

## 安全考虑

1. **临时文件**: 确保语音文件在处理后被完全删除
2. **API 密钥**: 保护 Google Speech API 密钥
3. **用户隐私**: 考虑是否需要存储转录文本，以及数据保留政策

## 下一步扩展

1. **支持更多语音服务**: OpenAI Whisper, Azure Speech, AWS Transcribe
2. **实时转录**: 支持流式语音转录
3. **语音情感分析**: 分析语音中的情感信息
4. **多轮对话**: 支持语音对话的上下文理解
