import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'

interface WhatsAppAutoConnectOptions {
  autoStart?: boolean
  retryCount?: number
  retryDelay?: number
}

export function useWhatsAppAutoConnect(options: WhatsAppAutoConnectOptions = {}) {
  const { user, token } = useAuth()
  const { autoStart = true, retryCount = 3, retryDelay = 5000 } = options
  
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !token || !autoStart) return

    const initializeWhatsApp = async () => {
      setIsConnecting(true)
      setConnectionStatus('connecting')
      setError(null)

      try {
        console.log('🔄 自動初始化 WhatsApp 連接...')
        
        // 檢查 WhatsApp Gateway 狀態
        const statusResponse = await fetch('http://localhost:3002/status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (statusResponse.ok) {
          const status = await statusResponse.json()
          console.log('📊 WhatsApp 狀態:', status)
          
          if (status.ready) {
            setConnectionStatus('connected')
            console.log('✅ WhatsApp 已連接')
          } else if (status.need_qr) {
            console.log('🔲 需要掃描 QR 碼，請前往設置頁面')
            setConnectionStatus('error')
            setError('需要掃描 QR 碼')
          } else {
            console.log('⏳ WhatsApp 正在初始化...')
            // 等待一段時間後重新檢查
            setTimeout(() => {
              if (connectionStatus === 'connecting') {
                initializeWhatsApp()
              }
            }, retryDelay)
          }
        } else {
          throw new Error(`Gateway 狀態檢查失敗: ${statusResponse.status}`)
        }
      } catch (err) {
        console.error('❌ WhatsApp 自動連接失敗:', err)
        setConnectionStatus('error')
        setError(err instanceof Error ? err.message : '連接失敗')
      } finally {
        setIsConnecting(false)
      }
    }

    // 延遲一秒後開始初始化，確保用戶登錄完成
    const timer = setTimeout(() => {
      initializeWhatsApp()
    }, 1000)

    return () => clearTimeout(timer)
  }, [user, token, autoStart])

  const forceReconnect = () => {
    if (user && token) {
      setConnectionStatus('connecting')
      setError(null)
      setIsConnecting(true)
      
      // 重新觸發連接邏輯
      setTimeout(() => {
        setIsConnecting(false)
      }, 1000)
    }
  }

  return {
    isConnecting,
    connectionStatus,
    error,
    forceReconnect
  }
}
