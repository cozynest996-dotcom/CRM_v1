import express from "express";
import bodyParser from "body-parser";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";

const { Client, LocalAuth } = pkg;
const app = express();
app.use(bodyParser.json());

// JWT 密鑰 - 必須與後端一致
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// ✅ 添加 CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Manage multiple LocalAuth instances per user
const clients = {}; // map of userId -> { client, ready, qr, needQR }
// Track which users we've already logged authentication for to avoid spammy logs
const authLogSeen = new Set();

// 🔐 身份驗證中間件
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user_id = decoded.user_id;
    req.user_email = decoded.email;
    // Only log the authenticated user once to avoid repeated logs (use string key)
    const authKey = String(req.user_id);
    if (!authLogSeen.has(authKey)) {
      console.log(`🔐 Authenticated user ${req.user_id} (${req.user_email})`);
      authLogSeen.add(authKey);
    }
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// 📁 獲取用戶專屬的 LocalAuth 路徑
function getUserAuthPath(userId) {
  const userSessionsDir = path.join(process.cwd(), 'user_sessions');
  if (!fs.existsSync(userSessionsDir)) {
    fs.mkdirSync(userSessionsDir, { recursive: true, mode: 0o755 });
  }
  const userDir = path.join(userSessionsDir, `user_${userId}_auth`);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true, mode: 0o755 });
  }
  return userDir;
}

// 🧹 清理用戶會話
async function cleanupUserSession(userId) {
  console.log(`🧹 Cleaning up session for user ${userId}`);
  
  // 1. 銷毀 client
  const userState = clients[userId];
  if (userState?.client) {
    try {
      await userState.client.logout();
      await userState.client.destroy();
      console.log(`✅ Client destroyed for user ${userId}`);
    } catch (err) {
      console.warn(`⚠️ Error destroying client for user ${userId}:`, err.message);
    }
  }
  
  // 2. 刪除 LocalAuth 目錄
  const authPath = getUserAuthPath(userId);
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log(`🗑️ Removed auth directory for user ${userId}`);
    }
  } catch (err) {
    console.warn(`⚠️ Error removing auth directory for user ${userId}:`, err.message);
  }
  
  // 3. 清除記憶體狀態
  delete clients[userId];
  // stop repeated auth log for this user
  try { authLogSeen.delete(String(userId)); } catch (e) {}
  
  // 4. 通知後端
  try {
    await fetch('http://backend:8000/settings/whatsapp/session/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, qr: null, connected: false })
    });
  } catch (err) {
    console.warn(`⚠️ Failed to update backend for user ${userId}:`, err.message);
  }
}

function initClientForUser(userId) {
  if (clients[userId]) return clients[userId];

  const maxAttempts = 3;
  const attemptDelayMs = 2000;

  const createClientState = () => {
    // For Docker/Linux environment
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

    console.log(`ℹ️ User ${userId}: Current platform: ${process.platform}`);
    console.log(`ℹ️ User ${userId}: PUPPETEER_EXECUTABLE_PATH env: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    console.log(`ℹ️ User ${userId}: Using Puppeteer executablePath: ${executablePath}`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `user_${userId}`,
        dataPath: getUserAuthPath(userId)
      }),
      puppeteer: {
        executablePath: executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-default-apps',
          '--disable-infobars',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--run-all-compositor-stages-before-draw',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-ipc-flooding-protection',
          '--enable-features=NetworkService,NetworkServiceLogging',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      }
    });

    const state = { client, ready: false, qr: null, needQR: false };

    // wire up handlers (same as before)
    client.on("ready", () => {
      console.log(`✅ WhatsApp Client ready for user ${userId}`);
      state.ready = true;
      state.needQR = false;
      state.qr = null;
      (async () => {
        try {
          await fetch('http://backend:8000/settings/whatsapp/session/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, qr: null, connected: true })
          });
        } catch (err) {
          console.warn('Failed to push connected state to backend:', err && err.message ? err.message : err);
        }
      })();
    });

    client.on("qr", (qr) => {
      console.log(`🔄 QR Code received for user ${userId}`);
      state.qr = qr;
      state.needQR = true;
      state.ready = false;
      (async () => {
        try {
          await fetch('http://backend:8000/settings/whatsapp/session/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, qr: qr, connected: false })
          });
        } catch (err) {
          console.warn('Failed to push qr to backend:', err && err.message ? err.message : err);
        }
      })();
    });

    client.on("disconnected", (reason) => {
      console.log(`❌ WhatsApp Client disconnected for user ${userId}:`, reason);
      state.ready = false;
      state.needQR = true;
      state.qr = null; // 明确设置为 null
      (async () => {
        try {
          await fetch('http://backend:8000/settings/whatsapp/session/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, qr: null, connected: false })
          });
        } catch (err) {
          console.warn('Failed to push disconnected state to backend:', err && err.message ? err.message : err);
        }
      })();
    });

    client.on("auth_failure", (message) => {
      console.log(`❌ Authentication failed for user ${userId}:`, message);
      state.ready = false;
      state.needQR = true;
      state.qr = null; // 明确设置为 null
      (async () => {
        try {
          await fetch('http://backend:8000/settings/whatsapp/session/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, qr: null, connected: false })
          });
        } catch (err) {
          console.warn('Failed to push auth failure to backend:', err && err.message ? err.message : err);
        }
      })();
    });

    // message / message_ack handlers remain the same as earlier
    client.on("message", async (msg) => {
      // 检查是否是群组聊天
      if (msg.from.endsWith('@g.us')) {
        console.log(`🚫 忽略群组消息来自: ${msg.from}`);
        return; // 忽略群组消息
      }
      
      // 静默忽略无用的消息类型
      const ignoredSenders = [
        'status@c.us',           // WhatsApp Status
        'status@broadcast',      // Status 广播
        'broadcast',             // 广播消息
        'announcement',          // 公告消息
      ];
      
      // 检查是否应该忽略此消息
      const shouldIgnore = ignoredSenders.some(sender => 
        msg.from === sender || msg.from.includes(sender)
      );
      
      if (shouldIgnore) {
        return; // 静默忽略，不产生任何日志
      }
      
      let messageContent = msg.body;
      let mediaBase64 = null;
      let mediaType = null;

      // 调试：打印消息类型和媒体信息
      console.log(`🔍 User ${userId} 消息调试信息:`, {
        hasMedia: msg.hasMedia,
        type: msg.type,
        body: msg.body,
        isVoice: msg.type === 'voice',
        isAudio: msg.type === 'audio',
        isPtt: msg.type === 'ptt'
      });

      // 检查是否是语音消息 (包括 PTT - Push-to-Talk)
      if (msg.hasMedia && (msg.type === 'voice' || msg.type === 'audio' || msg.type === 'ptt')) {
        try {
          console.log(`🎤 User ${userId} 收到语音消息，正在下载媒体...`);
          const media = await msg.downloadMedia();
          if (media && media.data) {
            mediaBase64 = media.data; // media.data 是 Base64 字符串
            mediaType = media.mimetype;
            console.log(`✅ User ${userId} 语音消息下载成功，类型: ${mediaType}, 大小: ${mediaBase64.length} 字节`);
            // 对于语音消息，将 content 设置为提示用户转录中
            messageContent = "🎤 [语音消息，正在转录...]";
          }
        } catch (mediaError) {
          console.error(`❌ User ${userId} 下载语音消息失败:`, mediaError);
          messageContent = "❌ [语音消息下载失败]";
        }
      }
      // existing message handler body
      const startTime = Date.now();
      console.log(`📩 ${startTime} - User ${userId} 收到WhatsApp消息:`, {
        from: msg.from,
        content: messageContent,
        messageId: msg.id.id,
        timestamp: msg.timestamp,
        mediaType: mediaType ? mediaType : "none", // 添加媒体类型日志
        mediaSize: mediaBase64 ? mediaBase64.length : 0 // 添加媒体大小日志
      });
      try {
        const contact = await msg.getContact();
        const name = contact.name || contact.pushname || "Unknown";
        console.log(`👤 User ${userId} 联系人信息:`, { name, phone: msg.from });
        
        // 获取聊天历史
        let chatHistory = [];
        try {
          const chat = await msg.getChat();
          if (chat && typeof chat.fetchMessages === 'function') {
            // 获取最近20条消息（包括当前消息）
            const messages = await chat.fetchMessages({ limit: 20 });
            
            // 格式化聊天历史，排除当前消息
            chatHistory = messages
              .filter(m => m.id.id !== msg.id.id) // 排除当前消息
              .reverse() // 最早的消息在前
              .map(m => ({
                content: m.body,
                direction: m.fromMe ? "outbound" : "inbound",
                timestamp: new Date(m.timestamp * 1000).toISOString()
              }));
            
            console.log(`📚 User ${userId} 获取到 ${chatHistory.length} 条聊天历史`);
          }
        } catch (historyError) {
          console.error(`⚠️ User ${userId} 获取聊天历史失败:`, historyError);
          chatHistory = []; // 失败时使用空数组
        }
        
        const inboxPayload = {
          phone: msg.from.replace("@c.us", ""),
          content: messageContent, // 使用处理后的 content
          name: name,
          user_id: userId,
          chat_history: chatHistory, // 新增聊天历史字段
          media_base64: mediaBase64, // 新增媒体Base64数据
          media_type: mediaType // 新增媒体类型
        };
        console.log("📤 推送消息到后端:", {
          ...inboxPayload,
          chat_history: `${chatHistory.length} messages`, // 简化日志输出
          media_base64: mediaBase64 ? `[Base64 Data, length: ${mediaBase64.length}]` : "none" // 简化日志输出
        });
        fetch("http://backend:8000/api/messages/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inboxPayload)
        })
        .then(async response => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
          }
          return response.json();
        })
        .then(data => {
          console.log(`✅ User ${userId} 成功推送到后端:`, data);
          fetch("http://backend:8000/api/messages/events/stream", {
            method: "GET",
            headers: { "Accept": "text/event-stream" }
          }).catch(err => console.error("❌ SSE 连接失败:", err));
        })
        .catch(async err => {
          console.error(`❌ User ${userId} 推送到后端失败:`, err);
          try {
            console.log(`🔄 User ${userId} 尝试重新推送...`);
            const retryResponse = await fetch("http://backend:8000/api/messages/inbox", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(inboxPayload)
            });
            if (!retryResponse.ok) {
              const errorText = await retryResponse.text();
              throw new Error(`Retry failed! status: ${retryResponse.status}, body: ${errorText}`);
            }
            const data = await retryResponse.json();
            console.log(`✅ User ${userId} 重试成功:`, data);
          } catch (retryErr) {
            console.error(`❌ User ${userId} 重试失败:`, retryErr);
          }
        });
        (async () => {
          try {
            const photoUrl = await client.getProfilePicUrl(msg.from);
            if (photoUrl) {
              await fetch("http://backend:8000/api/customers/photo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phone: msg.from.replace("@c.us", ""),
                  photo_url: photoUrl,
                  user_id: userId
                })
              });
              console.log(`✅ User ${userId} 头像已更新`);
            }
            // 立即标记消息已读（无延迟）
            try {
              if (typeof msg.markSeen === 'function') {
                await msg.markSeen();
                console.log(`✅ User ${userId} 消息已标记已读`);
              }
            } catch (err) {
              console.error(`❌ User ${userId} 标记消息已读失败:`, err);
            }
          } catch (err) {
            console.error(`❌ User ${userId} Error in background tasks:`, err);
          }
        })();
      } catch (err) {
        console.error(`❌ User ${userId} Error processing message:`, err);
      }
    });

    client.on("message_ack", async (msg, ack) => {
      console.log(`📱 User ${userId} WhatsApp消息状态更新: ${msg.id.id} → ${ack}`);
      const ackPayload = {
        message_id: msg.id.id,
        ack: ack,
        to: msg.to || msg.from,
        user_id: userId
      };
      fetch("http://backend:8000/api/messages/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ackPayload)
      }).catch(err => console.error(`❌ User ${userId} Failed to push ack:`, err));
    });

    return state;
  };

  // attempt initialization with retry
  (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔄 initClientForUser user ${userId} attempt ${attempt}/${maxAttempts}`);
      // 只在第一次尝试失败后才清理会话，保留现有会话以实现自动重连
      if (attempt > 1) {
        try {
          const authPath = getUserAuthPath(userId);
          if (fs.existsSync(authPath)) {
            console.log(`🗑️ 第${attempt}次尝试：清理会话目录以重新开始`);
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Removed auth directory for user ${userId} after failed attempt`);
          }
        } catch (e) {
          console.warn('⚠️ Failed to clean auth directory:', e && e.message ? e.message : e);
        }
      } else {
        console.log(`🔄 第${attempt}次尝试：保留现有会话以实现自动重连`);
      }

      const state = createClientState();
      // expose the in-progress state immediately so other requests (eg /qr)
      // can observe qr updates while initialization is in progress
      clients[userId] = state;
      const client = state.client;

      // helper to wait for ready or error
      const readyPromise = new Promise((resolve, reject) => {
        const onReady = () => {
          console.log(`⏱️ WhatsApp Client ready event received for user ${userId} at ${new Date().toISOString()}`);
          cleanupListeners(); 
          resolve(true); 
        };
        const onAuthFail = (msg) => { cleanupListeners(); reject(new Error('auth_failure:' + msg)); };
        const onDisconnected = (reason) => { cleanupListeners(); reject(new Error('disconnected:' + reason)); };
        const onError = (err) => { cleanupListeners(); reject(err); };
        const timeout = setTimeout(() => { cleanupListeners(); reject(new Error('init timeout')); }, 600000); // 延长超时到 10 分钟 (600000ms)

        function cleanupListeners() {
          clearTimeout(timeout);
          client.off('ready', onReady);
          client.off('auth_failure', onAuthFail);
          client.off('disconnected', onDisconnected);
          client.off('error', onError);
        }

        client.on('ready', onReady);
        client.on('auth_failure', onAuthFail);
        client.on('disconnected', onDisconnected);
        client.on('error', onError);
      });

      try {
        client.initialize();
        await readyPromise;
        // succeeded
        clients[userId] = state;
        console.log(`🎉 initClientForUser user ${userId} succeeded on attempt ${attempt}`);
        return;
      } catch (err) {
        console.warn(`⚠️ initClientForUser user ${userId} attempt ${attempt} failed:`, err && err.message ? err.message : err);
        try { await client.destroy(); } catch (e) {}
        // try to clear locks again
        try {
          const authPath = getUserAuthPath(userId);
          if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Removed auth directory to recover: ${authPath}`);
          }
        } catch (e) { /* ignore */ }
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, attemptDelayMs));
      }
    }

    console.error(`❌ initClientForUser user ${userId} failed after ${maxAttempts} attempts`);
  })();

  // return the current client state (may be being initialized)
  return clients[userId];
}

// 旧的全局客户端事件处理 - 已移除，改用用户特定的客户端

// 延迟逻辑已移至后端工作流节点配置

// 旧的全局消息监听器已移除 - 现在每个用户客户端都有自己的监听器

// ✅ 提供 /send API (需要身份驗證)
app.post("/send", authenticateUser, async (req, res) => {
  const { to, message, backend_message_id, media_url, media_type } = req.body;
  const user_id = req.user_id; // 從 JWT token 獲取，確保隔離
  
  // 参数验证
  if (!to) {
    return res.status(400).json({ error: "Missing required parameter: to" });
  }
  
  // 如果既没有消息也没有媒体，则报错
  if ((!message || message.trim() === '') && !media_url) {
    return res.status(400).json({ error: "Missing required parameters: either message or media_url must be provided" });
  }
  
  // user_id 已從 JWT 獲得，一定存在
  
  // 获取用户特定的客户端
  const userState = clients[user_id];
  if (!userState || !userState.ready) {
    return res.status(400).json({ error: `WhatsApp client for user ${user_id} is not ready` });
  }
  
  const client = userState.client;
  const chatId = `${to}@c.us`;
  const logData = { to, backend_message_id };
  if (message) logData.message_length = message.length;
  if (media_url) logData.media_url = media_url;
  if (media_type) logData.media_type = media_type;
  console.log(`📤 ${Date.now()} - User ${user_id} 收到发送请求:`, logData);

  // 立即返回202，后续异步处理
  res.status(202).json({ status: "accepted", message: "Message queued for sending" });

  // 异步处理发送流程
  (async () => {
    try {
      // 1. 获取会话
      console.log(`💬 ${Date.now()} - User ${user_id} 获取会话信息...`);
      const chat = await client.getChatById(chatId);
      
      // 2. 检查未读消息并标记已读（无延迟）
      if (chat && typeof chat.sendSeen === 'function') {
        const unreadCount = typeof chat.unreadCount === 'number' ? chat.unreadCount : null;
        if (unreadCount && unreadCount > 0) {
          console.log(`📖 User ${user_id} 会话有 ${unreadCount} 条未读，立即标记已读`);
          await chat.sendSeen();
          console.log(`✅ ${Date.now()} - User ${user_id} 已标记会话已读`);
        }
      }

      // 3. 发送消息
      let sent;
      if (media_url && media_type) {
        console.log(`📩 ${Date.now()} - User ${user_id} 开始发送媒体消息...`);
        console.log(`📎 媒体URL: ${media_url}`);
        console.log(`📎 媒体类型: ${media_type}`);
        try {
          // 导入 MessageMedia
          const { MessageMedia } = pkg;
          
          console.log(`🔄 正在从URL创建媒体对象...`);
          console.log(`🔗 URL 验证: ${media_url}`);
          
          // 验证 URL 格式
          if (!media_url || !media_url.startsWith('http')) {
            throw new Error(`无效的媒体URL: ${media_url}`);
          }
          
          // 从 URL 创建媒体对象
          const media = await MessageMedia.fromUrl(media_url);
          
          console.log(`✅ 媒体对象创建成功:`, {
            mimetype: media.mimetype,
            filename: media.filename,
            data_length: media.data ? media.data.length : 0
          });
          
          // 发送媒体消息，message 作为 caption
          if (message && message.trim()) {
            console.log(`📝 发送媒体附带文本: ${message}`);
            sent = await client.sendMessage(chatId, media, { caption: message });
          } else {
            console.log(`📷 发送纯媒体消息`);
            sent = await client.sendMessage(chatId, media);
          }
          
          console.log(`✅ ${Date.now()} - User ${user_id} 媒体消息发送成功`);
        } catch (mediaError) {
          console.error(`❌ ${Date.now()} - User ${user_id} 媒体发送失败:`, {
            error: mediaError.message,
            stack: mediaError.stack,
            media_url: media_url,
            media_type: media_type,
            error_name: mediaError.name,
            error_code: mediaError.code
          });
          
          // 如果媒体发送失败，回退到发送文本消息（如果有的话）
          if (message && message.trim()) {
            console.log(`📩 ${Date.now()} - User ${user_id} 回退到文本消息...`);
            sent = await client.sendMessage(chatId, message);
          } else {
            throw new Error(`媒体发送失败且无文本消息可回退: ${mediaError.message}`);
          }
        }
      } else {
        console.log(`📩 ${Date.now()} - User ${user_id} 开始发送文本消息...`);
        sent = await client.sendMessage(chatId, message);
      }
      
      const whatsappId = sent && sent.id ? (sent.id._serialized || sent.id.id || sent.id) : null;
      
      if (!whatsappId) {
        throw new Error("Failed to get WhatsApp message ID");
      }

      console.log(`✅ ${Date.now()} - User ${user_id} 消息发送成功:`, { whatsapp_id: whatsappId });

      // 4. 更新消息ID映射
      if (backend_message_id) {
        console.log(`🔄 ${Date.now()} - User ${user_id} 更新消息ID映射...`);
        for (let i = 0; i < 3; i++) {
          try {
            const mapResponse = await fetch("http://backend:8000/api/messages/map", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ backend_id: backend_message_id, whatsapp_id: whatsappId }),
            });

            if (mapResponse.ok) {
              console.log(`✅ ${Date.now()} - User ${user_id} 消息ID映射更新成功`);
              break;
            } else {
              console.warn(`⚠️ User ${user_id} 第${i + 1}次更新消息ID映射失败:`, mapResponse.status);
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (err) {
            console.error(`❌ User ${user_id} 第${i + 1}次更新消息ID映射出错:`, err.message);
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // 5. 如果之前标记了已读，发送webhook通知
      if (backend_message_id) {
        try {
          await fetch("http://backend:8000/api/messages/webhooks/whatsapp/seen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              backend_message_id,
              whatsapp_id: whatsappId,
              delay_ms: 0, // 移除 seenDelay
              to,
              user_id: user_id  // 🔑 包含用户ID
            })
          });
          console.log(`✅ ${Date.now()} - User ${user_id} Seen webhook 已发送`);
        } catch (err) {
          console.error(`❌ User ${user_id} Failed to send seen webhook:`, err.message);
        }
      }

      const endTime = Date.now();
      const startTime = Date.now() - 1000; // 简化，实际应该从开始记录
      console.log(`✨ ${endTime} - User ${user_id} 发送流程完成`);
    } catch (err) {
      console.error(`❌ ${Date.now()} - User ${user_id} 发送流程失败:`, err.message);
    }
  })();
});

// ✅ 状态查询 API
app.get("/status", authenticateUser, (req, res) => {
  const userId = req.user_id; // 從 JWT token 獲取，確保隔離
  const state = clients[userId];
  
  // 检查是否有保存的 session 文件
  const authPath = getUserAuthPath(userId);
  const hasSession = fs.existsSync(authPath) && fs.readdirSync(authPath).length > 0;
  
  if (state) {
    return res.json({ 
      ready: state.ready, 
      need_qr: state.needQR, 
      session_active: state.ready,
      has_session: hasSession, // 添加 session 存在标识
      user_id: userId, // 確認回傳正確用戶
      qr: state.qr // 在状态查询中也返回 QR 码，如果存在的话
    });
  }
  
  // 用戶沒有 client：检查是否有保存的 session
  return res.json({
    ready: false,
    need_qr: !hasSession, // 如果有 session 就不需要 QR，如果没有 session 才需要 QR
    session_active: false,
    has_session: hasSession, // 添加 session 存在标识
    user_id: userId,
    qr: null // 明确返回 null，避免前端显示旧的QR
  });
});

// ✅ 获取二维码 API (需要身份驗證)
app.get("/qr", authenticateUser, async (req, res) => { // 将此路由改为 async
  const userId = req.user_id; // 從 JWT token 獲取
  const state = clients[userId];
  
  if (state && state.qr) {
    return res.json({ 
      qr: state.qr, 
      ready: state.ready,
      user_id: userId 
    });
  }
  
  // 如果没有初始化，或者 QR 码为空，则尝试初始化客户端并等待 QR 码
  if (!state || !state.qr) {
    console.log(`🔄 Initializing WhatsApp client for user ${userId} due to /qr request`);
    const initState = await initClientForUser(userId); // 等待初始化完成
    // 返回最新状态，可能是 QR 码或正在初始化消息
    return res.json({ 
      qr: initState.qr || null, 
      ready: initState.ready, 
      user_id: userId,
      message: initState.ready ? 'Already connected' : (initState.qr ? 'QR code available' : 'Initializing client...')
    });
  }
  
  // 状态存在但没有 QR (理论上不会到达这里，因为上面的 if 已经处理了)
  return res.json({ 
    qr: null, 
    ready: state.ready, 
    user_id: userId,
    message: state.ready ? 'Already connected' : 'No QR code available' 
  });
});

// 🔄 软登出 API - 只断开连接，保留会话以便自动重连
app.post("/logout", authenticateUser, async (req, res) => {
  const user_id = req.user_id;
  const force_delete = req.body.force_delete || false; // 可选：强制删除会话

  try {
    console.log(`🔄 User ${user_id} logout requested (force_delete: ${force_delete})`);

    const userState = clients[user_id];
    if (userState?.client) {
      try {
        // 只断开连接，不删除会话文件
        await userState.client.logout();
        await userState.client.destroy();
        console.log(`✅ Client disconnected for user ${user_id}`);
      } catch (err) {
        console.warn(`⚠️ Error disconnecting client for user ${user_id}:`, err.message);
      }
    }

    // 清除内存状态
    delete clients[user_id];
    try { authLogSeen.delete(String(user_id)); } catch (e) {}

    // 只有在强制删除时才删除会话文件
    if (force_delete) {
      const authPath = getUserAuthPath(user_id);
      try {
        if (fs.existsSync(authPath)) {
          fs.rmSync(authPath, { recursive: true, force: true });
          console.log(`🗑️ Force deleted auth directory for user ${user_id}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error removing auth directory for user ${user_id}:`, err.message);
      }
    } else {
      console.log(`💾 保留会话文件以便自动重连 for user ${user_id}`);
    }

    // 通知后端
    try {
      await fetch('http://backend:8000/settings/whatsapp/session/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user_id, qr: null, connected: false })
      });
    } catch (err) {
      console.warn(`⚠️ Failed to update backend for user ${user_id}:`, err.message);
    }

    // 短延迟后自动重新初始化（会尝试使用保存的会话）
    setTimeout(async () => {
      try {
        console.log(`🔄 Auto reinitializing WhatsApp client for user ${user_id}`);
        await initClientForUser(user_id);
      } catch (err) {
        console.warn(`Failed to auto-init client for user ${user_id}:`, err && err.message ? err.message : err);
      }
    }, 1200);

    res.json({
      success: true,
      message: force_delete ? 
        "Logged out and session deleted. Please scan QR code to reconnect." :
        "Logged out but session preserved. Should auto-reconnect if session is valid."
    });

  } catch (error) {
    console.error(`❌ User ${user_id} logout failed:`, error);
    res.status(500).json({
      success: false,
      message: "Logout failed: " + (error && error.message ? error.message : String(error))
    });
  }
});

// 🗑️ 强制删除会话 API - 完全删除会话文件，需要重新扫码
app.post("/reset-session", authenticateUser, async (req, res) => {
  const user_id = req.user_id;

  try {
    console.log(`🗑️ User ${user_id} session reset requested`);

    // 完全清理会话
    await cleanupUserSession(user_id);

    // 短延迟后重新初始化（会需要新的 QR 码）
    setTimeout(async () => {
      try {
        console.log(`🔄 Reinitializing WhatsApp client for user ${user_id} after session reset`);
        await initClientForUser(user_id);
      } catch (err) {
        console.warn(`Failed to init client after reset for user ${user_id}:`, err && err.message ? err.message : err);
      }
    }, 1200);

    res.json({
      success: true,
      message: "Session completely reset. Please scan new QR code to reconnect."
    });

  } catch (error) {
    console.error(`❌ User ${user_id} session reset failed:`, error);
    res.status(500).json({
      success: false,
      message: "Session reset failed: " + (error && error.message ? error.message : String(error))
    });
  }
});

app.listen(3002, () => {
  console.log("🚀 WhatsApp Gateway running at http://localhost:3002");
});

// 优雅重启处理：支持 nodemon/pm2 重启时先销毁所有用户客户端，避免会话丢失或资源泄露
process.once('SIGUSR2', async () => {
  console.log('🔁 SIGUSR2 received — shutting down all WhatsApp clients for restart');
  try {
    const destroyPromises = Object.keys(clients).map(async (userId) => {
      const userState = clients[userId];
      if (userState?.client && typeof userState.client.destroy === 'function') {
        await userState.client.destroy();
        console.log(`✅ User ${userId} WhatsApp client destroyed`);
      }
    });
    
    await Promise.all(destroyPromises);
    console.log('✅ All WhatsApp clients destroyed');
  } catch (err) {
    console.error('❌ Failed to destroy clients before restart:', err);
  } finally {
    process.kill(process.pid, 'SIGUSR2');
  }
});