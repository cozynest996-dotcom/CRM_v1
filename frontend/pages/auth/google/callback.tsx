import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

// const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000' // 不再需要

export default function GoogleCallback() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // if (error) {
        //   setStatus('error')
        //   setMessage(`授权失败: ${error}`)
        //   return
        // }
        // if (!code) {
        //   setStatus('error')
        //   setMessage('未收到授权码')
        //   return
        // }

        const { token, error, tab } = router.query

        if (error) {
          setStatus('error')
          setMessage(`Google 授权失败: ${error}`)
          // 根据 tab 参数重定向，如果存在
          if (tab) {
            setTimeout(() => {
              router.push(`/settings?tab=${tab}&error=${error}`)
            }, 3000)
          } else {
            // 如果没有 tab，则重定向回登录页
            setTimeout(() => {
              router.push('/login')
            }, 3000)
          }
          return
        }

        if (token) {
          localStorage.setItem('auth_token', token as string)
          setStatus('success')
          setMessage('登录成功，正在跳转到仪表盘...')
          setTimeout(() => {
            router.push('/dashboard') // 重定向到您的仪表盘页面
          }, 1500)
        } else {
          setStatus('error')
          setMessage('未收到认证令牌')
          setTimeout(() => {
            router.push('/login')
          }, 3000)
        }


        // // 发送授权码到后端 (不再需要)
        // const response = await fetch(`${API_BASE}/settings/google-sheets/callback`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ code: code as string })
        // })

        // if (response.ok) {
        //   const data = await response.json()
        //   setStatus('success')
        //   setMessage('Google Sheets 授权成功！')
        //   
        //   // 3秒后跳转到设置页面
        //   setTimeout(() => {
        //     router.push('/settings?tab=google-sheets')
        //   }, 3000)
        // } else {
        //   const errorData = await response.json()
        //   setStatus('error')
        //   setMessage(errorData.detail || '授权处理失败')
        // }
      } catch (error) {
        console.error('Callback handling error:', error)
        setStatus('error')
        setMessage('处理授权时发生错误')
      }
    }

    if (router.isReady) {
      handleCallback()
    }
  }, [router.isReady, router.query])

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '48px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px'
      }}>
        {status === 'loading' && (
          <div>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              border: '3px solid #e0e0e0',
              borderTop: '3px solid #2196f3',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px'
            }} />
            <h2 style={{ color: '#333', marginBottom: '16px' }}>处理授权中...</h2>
            <p style={{ color: '#666' }}>请稍候，正在处理 Google Sheets 授权</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{ 
              fontSize: '48px', 
              color: '#4caf50', 
              marginBottom: '24px' 
            }}>
              ✅
            </div>
            <h2 style={{ color: '#333', marginBottom: '16px' }}>授权成功！</h2>
            <p style={{ color: '#666', marginBottom: '24px' }}>{message}</p>
            <p style={{ color: '#999', fontSize: '14px' }}>
              3秒后自动跳转到设置页面...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ 
              fontSize: '48px', 
              color: '#f44336', 
              marginBottom: '24px' 
            }}>
              ❌
            </div>
            <h2 style={{ color: '#333', marginBottom: '16px' }}>授权失败</h2>
            <p style={{ color: '#666', marginBottom: '24px' }}>{message}</p>
            <button
              onClick={() => router.push('/settings?tab=google-sheets')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              返回设置页面
            </button>
          </div>
        )}
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
