import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import Sidebar from '../components/Sidebar'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
const WHATSAPP_GATEWAY_URL = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL ?? 'http://localhost:3002'

const fetcher = async (url: string, options?: RequestInit) => {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`)
    }
    return await res.json()
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    throw error
  }
}

// 接口定义
interface IntegrationSettings {
  openai_api_key: string
  google_sheets_client_id: string
  google_sheets_client_secret: string
  google_sheets_redirect_uri: string
  google_sheets_access_token?: string
  google_user_email?: string
  google_user_name?: string
  google_user_picture?: string
}

interface WhatsAppStatus {
  ready: boolean
  need_qr: boolean
  qr?: string | null
}

// OpenAI设置组件
function OpenAISettings({ 
  settings, 
  onUpdate, 
  isLoading, 
  setIsLoading, 
  setMessage,
  token
}: {
  settings: IntegrationSettings | undefined
  onUpdate: () => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  setMessage: (message: string) => void
  token: string | null
}) {
  const [openaiKey, setOpenaiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleSaveOpenAI = async () => {
    if (!openaiKey.trim()) {
      setMessage('请输入有效的 OpenAI API Key')
      return
    }

    if (!openaiKey.startsWith('sk-')) {
      setMessage('OpenAI API Key 应该以 "sk-" 开头')
      return
    }

    if (!token) {
      setMessage('用戶未認證，請重新登錄')
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE}/settings/openai`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ api_key: openaiKey })
      })

      if (response.ok) {
        setMessage('OpenAI API Key 保存成功')
        setOpenaiKey('')
        onUpdate() // 刷新设置数据
      } else {
        const error = await response.json()
        setMessage(error.detail || '保存失败，请重试')
      }
    } catch (error) {
      console.error('OpenAI save error:', error)
      setMessage('保存时发生错误，请检查网络连接')
    } finally {
      setIsLoading(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleTestAPI = async () => {
    // 檢查是否有 API Key 設置
    // 如果 API Key 包含省略號 (...) 或以 sk- 開頭，說明已經設置
    if (!settings?.openai_api_key || 
        settings.openai_api_key === '未設置' || 
        settings.openai_api_key === '' ||
        (!settings.openai_api_key.includes('...') && !settings.openai_api_key.startsWith('sk-'))) {
      setMessage('请先保存有效的 API Key')
      return
    }

    if (!token) {
      setMessage('用戶未認證，請重新登錄')
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE}/settings/openai/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        setMessage('API 测试成功！连接正常')
      } else {
        const error = await response.json()
        setMessage(error.detail || 'API 测试失败')
      }
    } catch (error) {
      console.error('OpenAI test error:', error)
      setMessage('测试时发生错误')
    } finally {
      setIsLoading(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div>
      {/* 当前状态 */}
      <div style={{ marginBottom: '20px' }}>
        {settings?.openai_api_key && !settings.openai_api_key.includes('未设置') ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#f0fff4',
            borderRadius: '8px',
            border: '1px solid #68d391'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#2e7d2e', fontSize: '16px', marginRight: '8px' }}>✅</span>
              <span style={{ color: '#2e7d2e', fontWeight: '500' }}>OpenAI API 已配置</span>
            </div>
            <div style={{ fontSize: '14px', color: '#4a5568', marginBottom: '12px' }}>
              当前 API Key: <code style={{ 
                backgroundColor: '#e2e8f0', 
                padding: '2px 6px', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '13px'
              }}>
                {/* 只顯示前8個字符和後4個字符，中間用省略號 */}
                {settings.openai_api_key.length > 12 
                  ? `${settings.openai_api_key.substring(0, 8)}...${settings.openai_api_key.substring(settings.openai_api_key.length - 4)}`
                  : settings.openai_api_key
                }
              </code>
            </div>
            <button
              onClick={handleTestAPI}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4299e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                marginRight: '8px',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? '测试中...' : '测试连接'}
            </button>
          </div>
        ) : (
          <div style={{
            padding: '16px',
            backgroundColor: '#fef5e7',
            borderRadius: '8px',
            border: '1px solid #f6ad55'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: '#c05621', fontSize: '16px', marginRight: '8px' }}>⚠️</span>
              <span style={{ color: '#c05621', fontWeight: '500' }}>OpenAI API 未配置</span>
            </div>
            <div style={{ fontSize: '14px', color: '#4a5568' }}>
              请设置 OpenAI API Key 以启用 AI 自动回复功能
            </div>
          </div>
        )}
      </div>

      {/* API Key 输入 */}
      <div style={{ marginBottom: '20px', maxWidth: '600px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '500',
          color: '#2d3748'
        }}>
          OpenAI API Key
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="输入您的 OpenAI API Key (sk-...)"
            style={{
              width: '400px',
              maxWidth: '100%',
              padding: '12px 50px 12px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'monospace',
              backgroundColor: '#f8fafc'
            }}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: '#718096',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#edf2f7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {showKey ? '🙈' : '👁️'}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#718096', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>获取 API Key:</span>
          <a 
            href="https://platform.openai.com/api-keys" 
            target="_blank" 
            style={{ 
              color: '#4299e1',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none'
            }}
          >
            OpenAI Platform
            <span style={{ fontSize: '14px' }}>↗</span>
          </a>
        </div>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSaveOpenAI}
        disabled={isLoading || !openaiKey.trim()}
        style={{
          padding: '12px 24px',
          backgroundColor: '#48bb78',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: (isLoading || !openaiKey.trim()) ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: '500',
          opacity: (isLoading || !openaiKey.trim()) ? 0.6 : 1
        }}
      >
        {isLoading ? '保存中...' : '保存 API Key'}
      </button>

      {/* 功能说明 */}
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#718096' }}>
        <h4 style={{ color: '#2d3748', marginBottom: '8px' }}>🚀 AI 功能特性:</h4>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>智能客服自动回复</li>
          <li>聊天内容情感分析</li>
          <li>客户意图识别</li>
          <li>多语言翻译支持</li>
        </ul>
      </div>
    </div>
  )
}

// Telegram settings component (embedded)
function TelegramSettings({ token, onUpdate }: { token: string | null, onUpdate: () => void }) {
  const [apiId, setApiId] = React.useState('')
  const [apiHash, setApiHash] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [code, setCode] = React.useState('')
  const [status, setStatus] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [phoneCodeHash, setPhoneCodeHash] = React.useState<string | null>(null)

  const handleStart = async () => {
    if (!apiId.trim() || !apiHash.trim()) { setStatus('请输入 api_id 和 api_hash'); return }
    if (!token) { setStatus('未认证，请重新登录'); return }
    setLoading(true); setStatus(null)
    try {
      const resp = await fetch(`${API_BASE}/settings/telegram/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ api_id: apiId.trim(), api_hash: apiHash.trim(), phone: phone.trim() || undefined })
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.status === 'code_sent') {
          setPhoneCodeHash(data.phone_code_hash || null)
          setStatus('验证码已发送，请输入验证码')
        } else if (data.status === 'error') {
          // show specific error details if present
          if (data.detail === 'flood_wait') {
            setStatus(`发送太频繁，请等待 ${data.wait_seconds || '一段时间'} 秒后重试`)
          } else if (data.detail === 'phone_banned') {
            setStatus('该手机号已被 Telegram 封禁，请使用其他号码。')
          } else if (data.detail === 'phone_invalid') {
            setStatus('无效的手机号，请检查格式并重试。')
          } else {
            setStatus(data.message || '启动登录失败')
          }
        } else { setStatus('凭据已保存'); onUpdate() }
      } else {
        const err = await resp.json().catch(() => ({}))
        setStatus(err.detail || '启动登录失败')
      }
    } catch (e) {
      console.error(e); setStatus('网络或服务器错误')
    } finally { setLoading(false) }
  }

  const handleVerify = async () => {
    if (!apiId.trim() || !apiHash.trim() || !phone.trim() || !code.trim()) { setStatus('请填写 api_id/api_hash/phone/code'); return }
    if (!token) { setStatus('未认证，请重新登录'); return }
    setLoading(true); setStatus(null)
    try {
      const resp = await fetch(`${API_BASE}/settings/telegram/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ api_id: apiId.trim(), api_hash: apiHash.trim(), phone: phone.trim(), code: code.trim(), phone_code_hash: phoneCodeHash })
      })
      if (resp.ok) { 
        setStatus('登录并保存 session 成功');
        onUpdate();
      } else { 
        const err = await resp.json().catch(() => ({}));
        // 自动处理过期码
        if (err.detail === 'code_expired') {
          setStatus('验证码已过期，正在重新发送新的验证码...')
          // 重新请求发送验证码
          await handleStart()
          setLoading(false)
          return
        }
        setStatus(err.detail || '验证失败')
      }
    } catch (e) { console.error(e); setStatus('网络或服务器错误') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          API ID
          <a href="https://my.telegram.org/auth?to=apps" target="_blank" style={{ marginLeft: 8, fontSize: 12, color: '#4299e1', textDecoration: 'none' }}>
            (如何获取? ↗)
          </a>
        </label>
        <input value={apiId} onChange={(e) => setApiId(e.target.value)} style={{ padding: 8, width: 320 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          API Hash
          <a href="https://my.telegram.org/auth?to=apps" target="_blank" style={{ marginLeft: 8, fontSize: 12, color: '#4299e1', textDecoration: 'none' }}>
            (如何获取? ↗)
          </a>
        </label>
        <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} style={{ padding: 8, width: 320 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>手机号（用于接收验证码，可选）</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8613712345678 或 +12025550178" style={{ padding: 8, width: 320 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={handleStart} disabled={loading} style={{ padding: '8px 12px', background: '#4299e1', color: 'white', border: 'none', borderRadius: 6 }}>{loading ? '处理中...' : '开始登录 / 发送验证码'}</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>验证码</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} style={{ padding: 8, width: 200, marginRight: 8 }} />
        <button onClick={handleVerify} disabled={loading} style={{ padding: '8px 12px', background: '#48bb78', color: 'white', border: 'none', borderRadius: 6 }}>{loading ? '处理中...' : '提交验证码并保存'}</button>
      </div>
      {status && <div style={{ marginTop: 12, color: '#2d3748' }}>{status}</div>}
      
    </div>
  )
}

import { useAuth } from '../hooks/useAuth'

export default function SettingsPage() {
  const { user, token, logout } = useAuth()
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 創建帶有 JWT token 的 fetcher
  const authenticatedFetcher = async (url: string) => {
    if (!token) {
      throw new Error('User not authenticated')
    }
    return fetcher(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  }

  // 集成设置 (需要身份驗證)
  const { data: integrationSettings, mutate: mutateSettings } = useSWR<IntegrationSettings>(
    user && token ? `${API_BASE}/settings/integrations` : null,
    authenticatedFetcher
  )

  // Telegram status
  const { data: telegramStatus, mutate: mutateTelegramStatus } = useSWR(
    user && token ? `${API_BASE}/settings/telegram/status` : null,
    authenticatedFetcher
  )

  // WhatsApp 状态管理 (需要身份驗證)
  const { data: whatsappStatus, mutate: mutateWhatsappStatus } = useSWR<WhatsAppStatus>(
    user && token ? `${WHATSAPP_GATEWAY_URL}/status` : null,
    authenticatedFetcher,
    { refreshInterval: 2000 }
  )

  // WhatsApp QR 码获取 (需要身份驗證)
  const swrConfig = {
    refreshInterval: whatsappStatus?.need_qr ? 2000 : 0,
    revalidateOnFocus: true, // 确保窗口重新聚焦时重新验证
    revalidateOnMount: true, // 确保组件挂载时立即尝试获取最新的 QR
    initialData: { qr: null, ready: false }, // 确保初始数据为空，避免显示旧的QR
    // dedupingInterval: 1000 // 移除，允许更频繁的更新
  };

  const { data: whatsappQR, mutate: mutateWhatsappQR, isValidating: isWhatsappQRLoading } = useSWR<{qr: string | null, ready: boolean}>(
    user && token ? `${WHATSAPP_GATEWAY_URL}/qr` : null,
    authenticatedFetcher,
    swrConfig
  )

  // 合并 WhatsApp 状态和 QR 码
  const combinedWhatsappStatus = whatsappStatus ? {
    ...whatsappStatus,
    qr: whatsappQR?.qr || null
  } : null

  // 添加状态来记录最近一次刷新时间
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  useEffect(() => {
    if (whatsappQR?.qr) {
      setLastRefreshTime(new Date());
    }
  }, [whatsappQR?.qr]);


  const handleWhatsappLogout = async () => {
    try {
      setIsLoading(true)
      if (!token) {
        setMessage('用戶未認證')
        return
      }
      
      const response = await fetch(`${WHATSAPP_GATEWAY_URL}/logout`, { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        mutateWhatsappStatus()
        setMessage('WhatsApp 已断开连接')
      } else {
        let text = ''
        try { text = await response.text() } catch(e) {}
        console.error('WhatsApp logout failed:', response.status, text)
        setMessage('WhatsApp 断开连接失败，请重试')
      }
    } catch (error) {
      console.error('WhatsApp logout error:', error)
      setMessage('断开连接时发生错误')
    } finally {
      setIsLoading(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleRefreshQR = async () => {
    // Debug logs to verify the click handler runs and values
    console.log('handleRefreshQR clicked', { WHATSAPP_GATEWAY_URL, token });
    try {
      setIsLoading(true)
      if (!token) {
        setMessage('用戶未認證')
        console.warn('handleRefreshQR aborted: no token')
        return
      }
      
      // 触发 QR 码生成 - 访问 /qr 端点会自动初始化客户端
      console.log('Fetching QR from', `${WHATSAPP_GATEWAY_URL}/qr`)
      const response = await fetch(`${WHATSAPP_GATEWAY_URL}/qr`, { 
        method: 'GET', 
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      })
      console.log('QR fetch response status:', response.status)
      
      if (response.ok) {
        // attempt to read JSON for debugging
        let data = null
        try { data = await response.json() } catch (e) { console.warn('QR response not JSON', e) }
        console.log('QR fetch response data:', data)
        // 刷新状态
        mutateWhatsappStatus() // 刷新 whatsappStatus，可能触发 whatsappQR 重新获取
        mutateWhatsappQR() // 显式刷新 QR 数据
        setLastRefreshTime(new Date()); // 更新刷新时间
        setMessage('正在重新生成二维码...')
        setTimeout(() => setMessage(''), 3000)
      } else {
        const errorText = await response.text().catch(() => '')
        console.error('QR refresh failed:', response.status, errorText)
        setMessage('刷新二维码失败，请重试')
        setTimeout(() => setMessage(''), 3000)
      }
    } catch (error) {
      console.error('QR refresh error:', error)
      setMessage('刷新时发生错误')
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f5f5f5', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex'
    }}>
      <Sidebar currentPage="/settings" />

      {/* 主内容区域 */}
      <div style={{ 
        marginLeft: '70px', 
        flex: 1,
        transition: 'margin-left 0.3s ease',
        padding: '40px'
      }}>
        {/* 页面标题 */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748', marginBottom: '8px' }}>
            系统设置
          </h1>
          <p style={{ color: '#718096', fontSize: '16px' }}>
            配置您的集成服务和系统参数
          </p>
        </div>

        {/* 状态消息 */}
        {message && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#e6fffa',
            border: '1px solid #38b2ac',
            borderRadius: '8px',
            color: '#2c7a7b',
            marginBottom: '24px'
          }}>
            {message}
          </div>
        )}

        {/* WhatsApp 设置 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#2d3748', marginBottom: '16px' }}>
            💬 WhatsApp 集成
          </h2>

          {combinedWhatsappStatus ? (
            <div>
              {combinedWhatsappStatus.ready ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  backgroundColor: '#f0fff4',
                  borderRadius: '8px',
                  border: '1px solid #68d391'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: '#2e7d2e', fontSize: '20px', marginRight: '12px' }}>✅</span>
                    <div>
                      <div style={{ fontWeight: '500', color: '#2e7d2e' }}>WhatsApp 已连接</div>
                      <div style={{ fontSize: '14px', color: '#4a5568', marginTop: '4px' }}>
                        您的 WhatsApp 账号已成功连接，可以收发消息
                      </div>
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={handleWhatsappLogout}
                      disabled={isLoading}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#e53e3e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? '处理中...' : 'WhatsApp 登出'}
                    </button>
                  </div>
                </div>
              ) : combinedWhatsappStatus.need_qr ? (
                <div style={{
                  padding: '16px',
                  backgroundColor: '#fff5f0',
                  borderRadius: '8px',
                  border: '1px solid #fc8181'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ color: '#c53030', fontSize: '20px', marginRight: '12px' }}>📱</span>
                    <div>
                      <div style={{ fontWeight: '500', color: '#c53030' }}>请扫描二维码登录</div>
                      <div style={{ fontSize: '14px', color: '#4a5568', marginTop: '4px' }}>
                        打开手机 WhatsApp，扫描下方二维码完成登录
                      </div>
                    </div>
                  </div>
                  
                  {/* 主要的 QR 码显示/加载区域 */}
                  {combinedWhatsappStatus.qr ? (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '20px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        width: '240px',
                        height: '240px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6'
                      }}>
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(combinedWhatsappStatus.qr)}`}
                          alt="WhatsApp QR Code" 
                          style={{ 
                            width: '220px', 
                            height: '220px',
                            display: 'block',
                            borderRadius: '4px'
                          }}
                          onError={(e) => {
                            console.error('QR Code image failed to load', e)
                            setMessage('⚠️ QR 码图片加载失败，请检查网络或重试');
                            e.currentTarget.alt = 'QR 码图片加载失败'; 
                          }}
                        />
                      </div>
                      <div style={{ marginTop: '16px', textAlign: 'center' }}>
                        {lastRefreshTime && (
                          <div style={{ fontSize: '12px', color: '#718096', marginBottom: '8px' }}>
                            最近刷新: {lastRefreshTime.toLocaleTimeString()}
                          </div>
                        )}
                        <button
                          onClick={handleRefreshQR}
                          disabled={isLoading || isWhatsappQRLoading}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#4299e1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: (isLoading || isWhatsappQRLoading) ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            opacity: (isLoading || isWhatsappQRLoading) ? 0.6 : 1,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isLoading && !isWhatsappQRLoading) {
                              e.currentTarget.style.backgroundColor = '#3182ce'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isLoading && !isWhatsappQRLoading) {
                              e.currentTarget.style.backgroundColor = '#4299e1'
                            }
                          }}
                        >
                          {(isLoading || isWhatsappQRLoading) ? '刷新中...' : '🔄 刷新二维码'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: '20px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        width: '240px',
                        height: '240px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        textAlign: 'center',
                        color: '#718096',
                        flexDirection: 'column'
                      }}>
                        <div>
                          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📱</div>
                          <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>正在生成二维码</div>
                          <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '16px' }}>请稍候...</div>
                          <button
                            onClick={handleRefreshQR}
                            disabled={isLoading || isWhatsappQRLoading}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#4299e1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: (isLoading || isWhatsappQRLoading) ? 'not-allowed' : 'pointer',
                              fontSize: '14px',
                              opacity: (isLoading || isWhatsappQRLoading) ? 0.6 : 1,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && !isWhatsappQRLoading) {
                                e.currentTarget.style.backgroundColor = '#3182ce'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && !isWhatsappQRLoading) {
                                e.currentTarget.style.backgroundColor = '#4299e1'
                              }
                            }}
                          >
                            {(isLoading || isWhatsappQRLoading) ? '刷新中...' : '🔄 刷新二维码'}
                          </button>
                          {process.env.NODE_ENV === 'development' && (
                            <div style={{ fontSize: '12px', marginTop: '12px', opacity: 0.5 }}>
                              Debug: QR = {combinedWhatsappStatus.qr || 'null'} (isValidating: {String(isWhatsappQRLoading)})
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  backgroundColor: '#fef5e7',
                  borderRadius: '8px',
                  border: '1px solid #f6ad55'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: '2px solid #ed8936',
                      borderTop: '2px solid transparent',
                      animation: 'spin 1s linear infinite',
                      marginRight: '12px'
                    }} />
                    <div>
                      <div style={{ fontWeight: '500', color: '#c05621' }}>正在连接 WhatsApp...</div>
                      <div style={{ fontSize: '14px', color: '#4a5568', marginTop: '4px' }}>
                        请稍候，系统正在建立 WhatsApp 连接
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleRefreshQR}
                    disabled={isLoading || isWhatsappQRLoading}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#4299e1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (isLoading || isWhatsappQRLoading) ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: (isLoading || isWhatsappQRLoading) ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading && !isWhatsappQRLoading) {
                        e.currentTarget.style.backgroundColor = '#3182ce'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading && !isWhatsappQRLoading) {
                        e.currentTarget.style.backgroundColor = '#4299e1'
                      }
                    }}
                  >
                    {(isLoading || isWhatsappQRLoading) ? '刷新中...' : '🔄 重新连接'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#718096', fontStyle: 'italic' }}>
              正在检查 WhatsApp 连接状态...
            </div>
          )}
        </div>


        {/* OpenAI 设置 */}
        <div style={{
           backgroundColor: 'white',
           borderRadius: '12px',
           padding: '24px',
           boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
           marginBottom: '24px'
         }}>
           <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#2d3748', marginBottom: '16px' }}>
             🤖 OpenAI 集成
           </h2>
           
           <OpenAISettings 
             settings={integrationSettings} 
             onUpdate={mutateSettings}
             isLoading={isLoading}
             setIsLoading={setIsLoading}
             setMessage={setMessage}
             token={token}
           />
         </div>

      {/* Telegram 设置 */}
      <div style={{
         backgroundColor: 'white',
         borderRadius: '12px',
         padding: '24px',
         boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
         marginBottom: '24px'
       }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#2d3748', marginBottom: '16px' }}>
          ✳️ Telegram 登录设置
        </h2>
        {telegramStatus && telegramStatus.connected ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            backgroundColor: '#f0fff4',
            borderRadius: '8px',
            border: '1px solid #68d391'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#2e7d2e', fontSize: 20, marginRight: 12 }}>✅</span>
              <div>
                <div style={{ fontWeight: 600, color: '#2e7d2e' }}>{telegramStatus.user?.first_name || telegramStatus.user?.username || 'Telegram 已连接'}</div>
                <div style={{ fontSize: '14px', color: '#4a5568', marginTop: 4 }}>ID: {telegramStatus.user?.id} — 已保存会话，可在服务重启后恢复</div>
              </div>
            </div>
            <div>
              <button
                onClick={async () => {
                  if (!token) return
                  try {
                    setIsLoading(true)
                    const resp = await fetch(`${API_BASE}/settings/telegram/logout`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({})
                    })
                    if (resp.ok) {
                      // ensure SWR revalidation and UI update
                      try { await mutateTelegramStatus() } catch (e) { console.warn('mutateTelegramStatus failed', e) }
                      try { await mutateSettings() } catch (e) { console.warn('mutateSettings failed', e) }
                      setMessage('Telegram 已断开连接')
                      setTimeout(() => setMessage(''), 3000)
                    } else {
                      console.error('Telegram logout failed', resp.status)
                      setMessage('Telegram 登出失败')
                      setTimeout(() => setMessage(''), 3000)
                    }
                  } catch (e) {
                    console.error('Telegram logout error', e)
                    setMessage('登出时发生错误')
                    setTimeout(() => setMessage(''), 3000)
                  } finally {
                    setIsLoading(false)
                  }
                }}
                disabled={isLoading}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1
                }}
              >
                {isLoading ? '处理中...' : 'Telegram 登出'}
              </button>
            </div>
          </div>
        ) : (
          <TelegramSettings key={String(telegramStatus?.connected)} token={token} onUpdate={() => { mutateSettings(); mutateTelegramStatus(); }} />
        )}
      </div>

         {/* 账户设置 - 移到最下面 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#2d3748', marginBottom: '16px' }}>
            👤 账户设置
          </h2>

          <div style={{
            padding: '16px',
            backgroundColor: '#f7fafc',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="User Avatar"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#4299e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '20px'
                }}>
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || '?'}
                </div>
              )}

              <div>
                <div style={{ fontWeight: '500', color: '#2d3748', fontSize: '16px' }}>
                  {user?.name || '未知用户'}
                </div>
                <div style={{ color: '#718096', fontSize: '14px' }}>
                  {user?.email}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#4a5568', fontSize: '14px', marginBottom: '4px' }}>
                  订阅计划: <span style={{ fontWeight: '500' }}>{user?.subscription_plan || '免费版'}</span>
                </div>
                <div style={{ color: '#4a5568', fontSize: '14px' }}>
                  状态: <span style={{ 
                    color: user?.subscription_status === 'active' ? '#48bb78' : '#e53e3e',
                    fontWeight: '500'
                  }}>
                    {user?.subscription_status === 'active' ? '有效' : '已过期'}
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>退出登录</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: '14px', color: '#718096' }}>
            <h4 style={{ color: '#2d3748', marginBottom: '8px' }}>🔐 账户安全提示:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>定期检查账户活动</li>
              <li>保持邮箱和联系方式更新</li>
              <li>不要与他人分享账户信息</li>
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
