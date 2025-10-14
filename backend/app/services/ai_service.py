"""
AI Service - 集成 OpenAI 进行智能分析和回复生成
"""

import json
import re
from openai import OpenAI
import logging
from typing import Dict, Any, Optional, List, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

class AIService:
    """AI 服务类"""
    
    def __init__(self, db_session=None, user_id=None):
        """
        初始化 AI 服務
        
        Args:
            db_session: 數據庫會話，用於從數據庫獲取 API Key
            user_id: 用戶ID，用於獲取用戶特定的 API Key
        """
        self.db_session = db_session
        self.user_id = user_id
        self.api_key = None
        
        # 優先從數據庫獲取用戶的 API Key
        if db_session and user_id:
            self.api_key = self._get_user_api_key()
        
        # 如果沒有用戶 API Key，使用配置文件中的全局 API Key
        if not self.api_key:
            self.api_key = settings.OPENAI_API_KEY
            
        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("No OpenAI API key available - neither user-specific nor global key found")
    
    def _get_user_api_key(self) -> Optional[str]:
        """從數據庫獲取用戶的 OpenAI API Key"""
        try:
            from app.services.settings import SettingsService
            settings_service = SettingsService(self.db_session)
            return settings_service.get_openai_key_for_user(self.user_id)
        except Exception as e:
            logger.error(f"Failed to get user API key: {e}")
            return None
    
    def _parse_media_identifiers(self, text: str) -> Tuple[str, List[str], List[str]]:
        """
        解析文本中的媒体标识符
        
        Args:
            text: 包含媒体标识符的文本
            
        Returns:
            Tuple[str, List[str], List[str]]: (清理后的文本, 媒体文件UUID列表, 文件夹名称列表)
        """
        media_uuids = []
        folder_names = []
        
        # 匹配 [[MEDIA:UUID]] 格式
        media_pattern = r'\[\[MEDIA:([a-f0-9\-]{36})\]\]'
        media_matches = re.findall(media_pattern, text)
        media_uuids.extend(media_matches)
        
        # 匹配 [[FOLDER:folder_name]] 格式
        folder_pattern = r'\[\[FOLDER:([^\]]+)\]\]'
        folder_matches = re.findall(folder_pattern, text)
        folder_names.extend(folder_matches)
        
        # 从文本中移除所有媒体标识符
        cleaned_text = re.sub(media_pattern, '', text)
        cleaned_text = re.sub(folder_pattern, '', cleaned_text)
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()  # 清理多余空格
        
        return cleaned_text, media_uuids, folder_names
    
    async def _get_media_urls_from_db(self, media_uuids: List[str], folder_names: List[str]) -> List[str]:
        """
        从数据库获取媒体文件的URL
        
        Args:
            media_uuids: 媒体文件UUID列表
            folder_names: 文件夹名称列表
            
        Returns:
            List[str]: 媒体文件URL列表
        """
        if not self.db_session or not self.user_id:
            return []
        
        try:
            from app.db.models import MediaFile
            from app.services import supabase as supabase_service
            
            media_urls = []
            
            # 获取单个媒体文件
            if media_uuids:
                media_files = self.db_session.query(MediaFile).filter(
                    MediaFile.id.in_(media_uuids),
                    MediaFile.user_id == self.user_id
                ).all()
                
                for media_file in media_files:
                    # 只处理图片文件，跳过视频和其他不支持的文件类型
                    if media_file.file_type and media_file.file_type.startswith("image/"):
                        # 生成签名URL
                        relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                        signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                        if signed_url:
                            media_urls.append(signed_url)
                    else:
                        logger.info(f"Skipping non-image file for AI analysis: {media_file.filename} (type: {media_file.file_type})")
            
            # 获取文件夹中的所有媒体文件
            if folder_names:
                for folder_name in folder_names:
                    folder_media = self.db_session.query(MediaFile).filter(
                        MediaFile.user_id == self.user_id,
                        MediaFile.folder == folder_name,
                        MediaFile.filename != ".keep"  # 排除.keep文件
                    ).all()
                    
                    for media_file in folder_media:
                        # 只处理图片文件，跳过视频和其他不支持的文件类型
                        if media_file.file_type and media_file.file_type.startswith("image/"):
                            relative_path = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
                            signed_url = await supabase_service.get_signed_url_for_file(relative_path)
                            if signed_url:
                                media_urls.append(signed_url)
                        else:
                            logger.info(f"Skipping non-image file for AI analysis: {media_file.filename} (type: {media_file.file_type})")
            
            return media_urls
            
        except Exception as e:
            logger.error(f"Failed to get media URLs from database: {e}")
            return []
    
    async def generate_combined_response(
        self, 
        system_prompt: str,
        user_prompt: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.2,
        max_tokens: int = 900,
        media_settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        生成组合响应（分析 + 回复）
        返回格式: {"analyze": {...}, "reply": {...}, "meta": {...}}
        """
        
        try:
            if not self.client:
                raise ValueError("OpenAI client not initialized - no API key available")
            
            # 解析系统提示和用户提示中的媒体标识符
            cleaned_system_prompt, sys_media_uuids, sys_folder_names = self._parse_media_identifiers(system_prompt)
            cleaned_user_prompt, user_media_uuids, user_folder_names = self._parse_media_identifiers(user_prompt)
            
            # 合并所有媒体标识符
            all_media_uuids = sys_media_uuids + user_media_uuids
            all_folder_names = sys_folder_names + user_folder_names
            
            # LLM 不需要下载媒体文件，只需要解析标识符并输出到 JSON
            # 媒体文件的实际处理由 SendWhatsAppMessageProcessor 负责
            
            # 构建消息内容（纯文本，不包含媒体）
            messages = [
                {"role": "system", "content": cleaned_system_prompt},
                {"role": "user", "content": cleaned_user_prompt}
            ]
                
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            content = response.choices[0].message.content.strip()
            
            # 尝试解析 JSON 响应
            try:
                result = json.loads(content)
                
                # 验证必要的键是否存在
                if not all(key in result for key in ["analyze", "reply", "meta"]):
                    raise ValueError("Missing required keys in AI response")
                
                # 验证 analyze 部分
                analyze = result["analyze"]
                if not all(key in analyze for key in ["updates", "uncertain", "confidence"]):
                    analyze.setdefault("updates", {})
                    analyze.setdefault("uncertain", [])
                    analyze.setdefault("confidence", 0.0)
                    analyze.setdefault("reason", "Auto-generated")
                
                # 验证 reply 部分
                reply = result["reply"]
                if "reply_text" not in reply:
                    reply["reply_text"] = "Hi! We received your message and will follow up shortly."
                reply.setdefault("followup_questions", [])
                reply.setdefault("suggested_tags", [])
                reply.setdefault("media_uuids", all_media_uuids)
                reply.setdefault("folder_names", all_folder_names)
                reply.setdefault("media_urls", [])  # 空列表，实际URL由SendWhatsAppMessageProcessor生成
                reply.setdefault("media_settings", media_settings or {})
                
                # 验证 meta 部分
                meta = result["meta"]
                meta.setdefault("used_profile", "provisional")
                meta.setdefault("separator", "|||")
                meta.setdefault("safe_to_send_before_db_update", False)
                # 确保 handoff 字段存在并设置默认值
                meta.setdefault("handoff", {"triggered": False, "reason": None, "confidence": 0.0})
                
                # 如果 analyze.confidence 缺失或为 0.0，尝试让模型对已生成回复进行置信度估计
                try:
                    analyze_conf = result.get("analyze", {}).get("confidence")
                    if analyze_conf is None or analyze_conf == 0.0:
                        reply_text = result.get("reply", {}).get("reply_text", "")
                        if reply_text:
                            try:
                                est = await self._estimate_confidence(reply_text, system_prompt, user_prompt, model)
                                # 仅在估计成功且为数字时替换
                                if isinstance(est, (int, float)):
                                    result["analyze"]["confidence"] = float(est)
                                    # 将 handoff confidence 也写入 meta.handoff if exists
                                    if isinstance(result.get("meta"), dict):
                                        if "handoff" in result["meta"] and isinstance(result["meta"]["handoff"], dict):
                                            result["meta"]["handoff"]["confidence"] = float(est)
                                else:
                                    logger.debug("Estimated confidence is not numeric, keeping original value")
                            except Exception as est_err:
                                logger.debug(f"Confidence estimation failed: {est_err}")
                except Exception:
                    # 保证不会因为估计失败而中断主流程
                    pass

                return result
                
            except json.JSONDecodeError as e:
                logger.info(f"AI returned plain text response, attempting to repair JSON")
                logger.info(f"Raw response: {content}")

                # First attempt: try the built-in JSON repair helper
                try:
                    repaired = await self.repair_json_response(content, max_attempts=1)
                except Exception as repair_err:
                    logger.warning(f"JSON repair helper failed: {repair_err}")
                    repaired = None

                if repaired and isinstance(repaired, dict) and all(k in repaired for k in ["analyze", "reply", "meta"]):
                    # ensure analyze.reply meta defaults
                    analyze = repaired.get("analyze", {})
                    analyze.setdefault("updates", {})
                    analyze.setdefault("uncertain", [])
                    analyze.setdefault("confidence", 0.0)
                    analyze.setdefault("reason", "Repaired from plain text")

                    reply = repaired.get("reply", {})
                    reply.setdefault("reply_text", content.strip())
                    reply.setdefault("followup_questions", [])
                    reply.setdefault("suggested_tags", [])
                    reply.setdefault("media_uuids", all_media_uuids)
                    reply.setdefault("folder_names", all_folder_names)
                    reply.setdefault("media_urls", [])
                    reply.setdefault("media_settings", media_settings or {})

                    meta = repaired.get("meta", {})
                    meta.setdefault("used_profile", "repaired_json")
                    meta.setdefault("separator", "|||")
                    meta.setdefault("safe_to_send_before_db_update", True)
                    # 确保 handoff 字段存在并设置默认值
                    meta.setdefault("handoff", {"triggered": False, "reason": None, "confidence": 0.0})

                    repaired["analyze"] = analyze
                    repaired["reply"] = reply
                    repaired["meta"] = meta

                    return repaired

                # Second attempt: ask the model again with a strict JSON-only instruction to convert the previous reply
                try:
                    strict_repair_prompt = (
                        "You must return only valid JSON matching the schema: {\n  \"analyze\": {\"updates\": {}, \"uncertain\": [], \"reason\": \"\", \"confidence\": 0.0},\n  \"reply\": {\"reply_text\": \"\", \"followup_questions\": [], \"suggested_tags\": []},\n  \"meta\": {\"used_profile\": \"provisional\", \"separator\": \"|||\", \"safe_to_send_before_db_update\": false}\n}\nNow convert the following plain text into that JSON (do not output any extra text):\n\n" + content
                    )
                    response2 = self.client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": "You are a JSON-only converter. Return only valid JSON."},
                            {"role": "user", "content": strict_repair_prompt}
                        ],
                        temperature=0.0,
                        max_tokens=900
                    )
                    content2 = response2.choices[0].message.content.strip()
                    try:
                        result2 = json.loads(content2)
                        # validate keys
                        if all(k in result2 for k in ["analyze", "reply", "meta"]):
                            analyze = result2.get("analyze", {})
                            analyze.setdefault("updates", {})
                            analyze.setdefault("uncertain", [])
                            analyze.setdefault("confidence", 0.0)
                            analyze.setdefault("reason", "Repaired via strict JSON request")

                            reply = result2.get("reply", {})
                            reply.setdefault("reply_text", content.strip())
                            reply.setdefault("followup_questions", [])
                            reply.setdefault("suggested_tags", [])
                            reply.setdefault("media_uuids", all_media_uuids)
                            reply.setdefault("folder_names", all_folder_names)
                            reply.setdefault("media_urls", [])
                            reply.setdefault("media_settings", media_settings or {})

                            meta = result2.get("meta", {})
                            meta.setdefault("used_profile", "strict_repair")
                            meta.setdefault("separator", "|||")
                            meta.setdefault("safe_to_send_before_db_update", True)
                            # 确保 handoff 字段存在并设置默认值
                            meta.setdefault("handoff", {"triggered": False, "reason": None, "confidence": 0.0})

                            result2["analyze"] = analyze
                            result2["reply"] = reply
                            result2["meta"] = meta

                            return result2
                    except json.JSONDecodeError:
                        logger.warning("Strict repair attempt returned non-JSON")
                except Exception as e2:
                    logger.warning(f"Strict repair attempt failed: {e2}")

                # 最终回退：将纯文本包装成结构化响应，但置信度设为 0.0（由 LLM 决定时才会改变）
                return {
                    "analyze": {
                        "updates": {},
                        "uncertain": [],
                        "reason": "AI returned plain text and repair attempts failed",
                        "confidence": 0.0
                    },
                    "reply": {
                        "reply_text": content.strip(),
                        "followup_questions": [],
                        "suggested_tags": [],
                        "media_uuids": all_media_uuids,
                        "folder_names": all_folder_names,
                        "media_urls": [],
                        "media_settings": media_settings or {}
                    },
                    "meta": {
                        "used_profile": "openai_text_response",
                        "separator": "|||",
                        "safe_to_send_before_db_update": True,
                        "handoff": {"triggered": False, "reason": None, "confidence": 0.0}
                    }
                }
                
        except Exception as e:
            logger.error(f"AI service error: {str(e)}")
            # 在异常情况下，我们需要重新解析媒体标识符
            _, error_media_uuids, error_folder_names = self._parse_media_identifiers(system_prompt + " " + user_prompt)
            return self._get_default_response(user_prompt, error_media_uuids, error_folder_names, media_settings)
    
    def _get_default_response(self, user_prompt: str, media_uuids: List[str] = None, folder_names: List[str] = None, media_settings: Dict[str, Any] = None) -> Dict[str, Any]:
        """获取默认响应（当 AI 调用失败时）"""
        return {
            "analyze": {
                "updates": {},
                "uncertain": ["Unable to process due to AI service error"],
                "reason": "AI service temporarily unavailable",
                "confidence": 0.0
            },
            "reply": {
                "reply_text": "Hi! We received your message and will follow up shortly.",
                "followup_questions": [],
                "suggested_tags": [],
                "media_uuids": media_uuids or [],
                "folder_names": folder_names or [],
                "media_urls": [],  # 空列表，实际URL由SendWhatsAppMessageProcessor生成
                "media_settings": media_settings or {}
            },
            "meta": {
                "used_profile": "provisional",
                "separator": "|||",
                "safe_to_send_before_db_update": True,
                "handoff": {"triggered": False, "reason": None, "confidence": 0.0}
            }
        }
    
    async def repair_json_response(self, broken_json: str, max_attempts: int = 1) -> Optional[Dict[str, Any]]:
        """尝试修复损坏的 JSON 响应"""
        if max_attempts <= 0:
            return None
        
        repair_prompt = f"""
The following JSON response is malformed. Please fix it and return only valid JSON:

{broken_json}

The response should have the structure:
{{
  "analyze": {{
    "updates": {{}},
    "uncertain": [],
    "reason": "",
    "confidence": 0.0
  }},
  "reply": {{
    "reply_text": "",
    "followup_questions": [],
    "suggested_tags": []
  }},
  "meta": {{
    "used_profile": "provisional",
    "separator": "|||",
    "safe_to_send_before_db_update": false
  }}
}}
"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a JSON repair assistant. Return only valid JSON."},
                    {"role": "user", "content": repair_prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            content = response.choices[0].message.content.strip()
            return json.loads(content)
            
        except Exception as e:
            logger.error(f"JSON repair failed: {str(e)}")
            return None
    
    async def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """分析消息情感"""
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system", 
                        "content": "Analyze the sentiment of the given text. Respond with JSON: {\"sentiment\": \"positive/negative/neutral\", \"confidence\": 0.0-1.0, \"emotions\": [\"list\", \"of\", \"emotions\"]}"
                    },
                    {"role": "user", "content": text}
                ],
                temperature=0.1,
                max_tokens=200
            )
            
            content = response.choices[0].message.content.strip()
            return json.loads(content)
            
        except Exception as e:
            logger.error(f"Sentiment analysis failed: {str(e)}")
            return {"sentiment": "neutral", "confidence": 0.0, "emotions": []}
    
    async def _estimate_confidence(self, reply_text: str, system_prompt: str, user_prompt: str, model: str = "gpt-4o-mini") -> float:
        """调用模型请求对一段回复的置信度估计，返回 0.0-1.0 之间的浮点数。"""
        try:
            estimate_prompt = (
                "你只需要返回一个数字，表示以下回复的置信度，范围在0.0到1.0之间。不要返回任何解释或多余内容。\n\n"
                "回复内容：\n" + reply_text + "\n\n"
                "请只返回数字（例如：0.85）。"
            )
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a confidence estimator. Return only a number between 0.0 and 1.0."},
                    {"role": "user", "content": estimate_prompt}
                ],
                temperature=0.0,
                max_tokens=10
            )
            content = response.choices[0].message.content.strip()
            # 解析第一个出现的数字
            import re
            m = re.search(r"\d*\.?\d+", content)
            if m:
                val = float(m.group(0))
                # 规范化到 0.0-1.0
                if val > 1.0:
                    val = max(0.0, min(1.0, val / 100.0))
                return max(0.0, min(1.0, val))
        except Exception as e:
            logger.debug(f"Estimate confidence call failed: {e}")
        return 0.0
    
    async def extract_entities(self, text: str) -> Dict[str, Any]:
        """提取实体信息"""
        prompt = """
Extract the following entities from the message:
- Names (person names)
- Locations (places, addresses)
- Dates (any date references)
- Numbers (budget, quantities, etc.)
- Contact info (phone, email)

Return JSON format: {"names": [], "locations": [], "dates": [], "numbers": [], "contact_info": []}
"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text}
                ],
                temperature=0.1,
                max_tokens=300
            )
            
            content = response.choices[0].message.content.strip()
            return json.loads(content)
            
        except Exception as e:
            logger.error(f"Entity extraction failed: {str(e)}")
            return {"names": [], "locations": [], "dates": [], "numbers": [], "contact_info": []}
