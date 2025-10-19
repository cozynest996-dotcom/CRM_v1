import speech_recognition as sr
import os
import tempfile
from pydub import AudioSegment

async def transcribe_audio(audio_path: str, audio_type: str) -> str:
    """
    使用 Google Web Speech API 将音频文件转录为文本。

    Args:
        audio_path (str): 音频文件的路径。
        audio_type (str): 音频文件的 MIME 类型 (例如: 'audio/ogg', 'audio/wav')。

    Returns:
        str: 转录的文本，如果失败则返回 None。
    """
    r = sr.Recognizer()
    converted_audio_path = None
    
    try:
        # 如果是 OGG 或其他非 WAV 格式，先转换为 WAV
        if audio_type and not audio_type.endswith('wav'):
            print(f"🔄 转换音频格式从 {audio_type} 到 WAV...")
            
            # 使用 pydub 转换音频格式
            if 'ogg' in audio_type.lower():
                audio_segment = AudioSegment.from_ogg(audio_path)
            elif 'mp3' in audio_type.lower():
                audio_segment = AudioSegment.from_mp3(audio_path)
            elif 'mp4' in audio_type.lower() or 'm4a' in audio_type.lower():
                audio_segment = AudioSegment.from_file(audio_path, format="mp4")
            else:
                # 尝试自动检测格式
                audio_segment = AudioSegment.from_file(audio_path)
            
            # 创建临时 WAV 文件
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
                converted_audio_path = temp_wav.name
                audio_segment.export(converted_audio_path, format="wav")
                print(f"✅ 音频已转换为 WAV: {converted_audio_path}")
            
            # 使用转换后的文件进行识别
            final_audio_path = converted_audio_path
        else:
            final_audio_path = audio_path
        
        # 使用 SpeechRecognition 进行转录
        with sr.AudioFile(final_audio_path) as source:
            print(f"🔍 音频文件信息: 采样率={source.SAMPLE_RATE}, 采样宽度={source.SAMPLE_WIDTH}")
            # 调整环境噪音
            r.adjust_for_ambient_noise(source, duration=0.5)
            audio = r.record(source)  # 读取整个音频文件
            print(f"🔍 录制的音频数据长度: {len(audio.frame_data)} 字节")
        
        # 使用 Google Web Speech API 进行转录
        # 方案1: 首先尝试自动语言检测
        try:
            print("🔄 尝试自动语言检测...")
            text = r.recognize_google(audio)  # 不指定语言，让 Google 自动检测
            if text.strip():
                print(f"✅ 自动语言检测成功: {text}")
                return text.strip()
        except sr.UnknownValueError:
            print("⚠️ 自动语言检测失败，尝试指定语言...")
        except sr.RequestError as e:
            print(f"❌ 自动检测 API 请求失败: {e}")
        
        # 方案2: 如果自动检测失败，按优先级尝试特定语言
        languages_to_try = ["zh-CN", "en-US", "zh-TW", "ja-JP", "ko-KR"]  # 扩展支持更多语言
        
        for lang in languages_to_try:
            try:
                print(f"🔄 尝试使用 {lang} 进行语音识别...")
                text = r.recognize_google(audio, language=lang)
                if text.strip():  # 如果获得了非空结果
                    print(f"✅ 音频转录成功 ({lang}): {text}")
                    return text.strip()
                else:
                    print(f"⚠️ 识别结果为空 ({lang})")
            except sr.UnknownValueError:
                print(f"⚠️ Google API 无法识别音频内容 ({lang}) - 可能是音频质量问题或无语音内容")
                continue  # 尝试下一种语言
            except sr.RequestError as e:
                print(f"❌ Google API 请求失败 ({lang}): {e}")
                continue
        
        print("❌ 所有语言识别都失败了")
        return None
        
    except Exception as e:
        print(f"❌ 语音转文本过程中发生错误: {e}")
        return None
    finally:
        # 清理转换后的临时文件
        if converted_audio_path and os.path.exists(converted_audio_path):
            try:
                os.remove(converted_audio_path)
                print(f"🗑️ 临时转换文件已删除: {converted_audio_path}")
            except Exception as e:
                print(f"⚠️ 删除临时文件失败: {e}")
