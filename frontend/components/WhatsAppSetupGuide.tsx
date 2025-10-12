import React from 'react'
import { useRouter } from 'next/router'

interface WhatsAppSetupGuideProps {
  onDismiss: () => void
  isFirstTime?: boolean
}

export default function WhatsAppSetupGuide({ onDismiss, isFirstTime = false }: WhatsAppSetupGuideProps) {
  const router = useRouter()

  const handleGoToSettings = () => {
    router.push('/settings')
    onDismiss()
  }

  const handleSkip = () => {
    onDismiss()
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            color: '#2d3748',
            marginBottom: '8px' 
          }}>
            {isFirstTime ? '歡迎使用 CRM Automation！' : 'WhatsApp 連接設置'}
          </h2>
          <p style={{ color: '#718096', fontSize: '16px', lineHeight: '1.5' }}>
            {isFirstTime 
              ? '讓我們設置您的 WhatsApp 連接，開始自動化客戶溝通'
              : '需要掃描 QR 碼以連接您的 WhatsApp 賬號'
            }
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{
            backgroundColor: '#f7fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px'
          }}>
            <h3 style={{ 
              fontSize: '16px', 
              fontWeight: '600', 
              color: '#2d3748',
              marginBottom: '12px' 
            }}>
              設置步驟：
            </h3>
            <ol style={{ 
              margin: 0, 
              paddingLeft: '20px',
              color: '#4a5568',
              lineHeight: '1.6'
            }}>
              <li>點擊「前往設置」按鈕</li>
              <li>在設置頁面找到 WhatsApp 集成區域</li>
              <li>使用手機掃描顯示的 QR 碼</li>
              <li>完成後即可開始接收和發送消息</li>
            </ol>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleSkip}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              color: '#4a5568',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            稍後設置
          </button>
          <button
            onClick={handleGoToSettings}
            style={{
              padding: '10px 24px',
              backgroundColor: '#3182ce',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            前往設置
          </button>
        </div>

        {!isFirstTime && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#fef5e7',
            border: '1px solid #f6e05e',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#744210'
          }}>
            💡 提示：完成 WhatsApp 連接後，系統將自動處理客戶消息並觸發工作流
          </div>
        )}
      </div>
    </div>
  )
}
