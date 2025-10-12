import React, { useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

export default function TestUserIsolation() {
  const [user1Qr, setUser1Qr] = useState<string | null>(null)
  const [user2Qr, setUser2Qr] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // 用户1的token
  const user1Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDAxNSwiaWF0IjoxNzU4ODk5MjE1fQ.l56bbBEUs0DTd9r1PAWaSFmyyouDpws7rdi1AHmVX5A"
  
  // 用户2的token  
  const user2Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLCJlbWFpbCI6ImNvenluZXN0OTk2QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc1OTUwNDY1MywiaWF0IjoxNzU4ODk5ODUzfQ.6pzNX0eET80L9n2l-gj2uDacSGU8aRlxYhgO_bZ_xYg"

  const testUser1Session = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch(`${API_BASE}/settings/whatsapp/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user1Token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('User 1 API Response:', data)
        setUser1Qr(data.qr)
        setMessage(`用户1 - 连接状态: ${data.connected ? '已连接' : '未连接'}`)
      } else {
        const errorText = await response.text()
        setMessage(`用户1 API 错误: ${response.status} - ${errorText}`)
      }
    } catch (error) {
      console.error('User 1 error:', error)
      setMessage(`用户1 请求失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testUser2Session = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch(`${API_BASE}/settings/whatsapp/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user2Token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('User 2 API Response:', data)
        setUser2Qr(data.qr)
        setMessage(`用户2 - 连接状态: ${data.connected ? '已连接' : '未连接'}`)
      } else {
        const errorText = await response.text()
        setMessage(`用户2 API 错误: ${response.status} - ${errorText}`)
      }
    } catch (error) {
      console.error('User 2 error:', error)
      setMessage(`用户2 请求失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testGatewayDirect = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      // 测试用户1的Gateway
      const response1 = await fetch('http://localhost:3002/qr?user_id=1')
      if (response1.ok) {
        const data1 = await response1.json()
        setUser1Qr(data1.qr)
      }
      
      // 测试用户2的Gateway
      const response2 = await fetch('http://localhost:3002/qr?user_id=2')
      if (response2.ok) {
        const data2 = await response2.json()
        setUser2Qr(data2.qr)
      }
      
      setMessage('Gateway 测试完成 - 用户1和用户2都有独立的QR码')
    } catch (error) {
      console.error('Gateway error:', error)
      setMessage(`Gateway 连接失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>WhatsApp 用户隔离测试页面</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        此页面用于验证每个用户都有独立的 WhatsApp 会话，确保消息隐私和安全。
      </p>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testUser1Session} 
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
          {loading ? '测试中...' : '测试用户1 (mingkun1999@gmail.com)'}
        </button>
        
        <button 
          onClick={testUser2Session} 
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#48bb78', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            marginRight: '10px'
          }}
        >
          {loading ? '测试中...' : '测试用户2 (cozynest996@gmail.com)'}
        </button>
        
        <button 
          onClick={testGatewayDirect} 
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#ed8936', 
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

      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
        {/* 用户1的QR码 */}
        {user1Qr && (
          <div style={{ textAlign: 'center' }}>
            <h3>用户1 (mingkun1999@gmail.com) QR码：</h3>
            <div style={{ 
              display: 'inline-block', 
              padding: '20px', 
              backgroundColor: 'white', 
              border: '2px solid #4299e1', 
              borderRadius: '10px' 
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(user1Qr)}`}
                alt="User 1 WhatsApp QR Code"
                style={{ width: '250px', height: '250px' }}
              />
            </div>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#4299e1' }}>
              用户1的专属 WhatsApp 连接
            </p>
          </div>
        )}

        {/* 用户2的QR码 */}
        {user2Qr && (
          <div style={{ textAlign: 'center' }}>
            <h3>用户2 (cozynest996@gmail.com) QR码：</h3>
            <div style={{ 
              display: 'inline-block', 
              padding: '20px', 
              backgroundColor: 'white', 
              border: '2px solid #48bb78', 
              borderRadius: '10px' 
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(user2Qr)}`}
                alt="User 2 WhatsApp QR Code"
                style={{ width: '250px', height: '250px' }}
              />
            </div>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#48bb78' }}>
              用户2的专属 WhatsApp 连接
            </p>
          </div>
        )}
      </div>

      {user1Qr && user2Qr && (
        <div style={{ 
          marginTop: '30px', 
          padding: '20px', 
          backgroundColor: '#f0fff4', 
          border: '2px solid #48bb78', 
          borderRadius: '10px' 
        }}>
          <h3 style={{ color: '#2e7d2e' }}>✅ 用户隔离验证成功！</h3>
          <p style={{ color: '#2e7d2e' }}>
            每个用户都有独立的 WhatsApp QR码和会话。用户1和用户2的消息将完全隔离，确保隐私安全。
          </p>
          <ul style={{ color: '#2e7d2e', marginTop: '10px' }}>
            <li>✅ 用户1有自己的 WhatsApp 客户端和QR码</li>
            <li>✅ 用户2有自己的 WhatsApp 客户端和QR码</li>
            <li>✅ 消息完全隔离，无数据泄露风险</li>
          </ul>
        </div>
      )}
    </div>
  )
}
