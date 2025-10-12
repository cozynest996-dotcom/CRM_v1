import React, { useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

export default function TestWhatsApp() {
  const [qr, setQr] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const testBackendSession = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // 使用硬编码的token进行测试
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDAxNSwiaWF0IjoxNzU4ODk5MjE1fQ.l56bbBEUs0DTd9r1PAWaSFmyyouDpws7rdi1AHmVX5A"
      
      const response = await fetch(`${API_BASE}/settings/whatsapp/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('API Response:', data)
        setQr(data.qr)
        setMessage(`连接状态: ${data.connected ? '已连接' : '未连接'}`)
      } else {
        const errorText = await response.text()
        setMessage(`API 错误: ${response.status} - ${errorText}`)
      }
    } catch (error) {
      console.error('Test error:', error)
      setMessage(`请求失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testGatewayDirect = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch('http://localhost:3002/qr?user_id=1')
      if (response.ok) {
        const data = await response.json()
        console.log('Gateway Response:', data)
        setQr(data.qr)
        setMessage(`Gateway QR 状态: ${data.ready ? '就绪' : '未就绪'}`)
      } else {
        setMessage(`Gateway 错误: ${response.status}`)
      }
    } catch (error) {
      console.error('Gateway error:', error)
      setMessage(`Gateway 连接失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>WhatsApp QR 码测试页面</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testBackendSession} 
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#4299e1', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            marginRight: '10px'
          }}
        >
          {loading ? '测试中...' : '测试后端 API'}
        </button>
        
        <button 
          onClick={testGatewayDirect} 
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#48bb78', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px' 
          }}
        >
          {loading ? '测试中...' : '直接测试 Gateway'}
        </button>
      </div>

      {message && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#f0f8ff', 
          border: '1px solid #4299e1', 
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          {message}
        </div>
      )}

      {qr && (
        <div style={{ textAlign: 'center' }}>
          <h3>生成的 QR 码：</h3>
          <div style={{ 
            display: 'inline-block', 
            padding: '20px', 
            backgroundColor: 'white', 
            border: '1px solid #ddd', 
            borderRadius: '10px' 
          }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`}
              alt="WhatsApp QR Code"
              style={{ width: '300px', height: '300px' }}
            />
          </div>
          <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            使用 WhatsApp 扫描此二维码来连接
          </p>
        </div>
      )}
    </div>
  )
}
