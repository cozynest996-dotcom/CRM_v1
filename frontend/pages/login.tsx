import React, { useState } from 'react'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleGoogleLogin = () => {
    setIsLoading(true)
    // 直接重定向到Google登录，并带上state=login参数
    window.location.href = 'http://localhost:8000/auth/google/login?state=login'
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        {/* Logo区域 */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: 'bold', 
            color: '#1a202c',
            marginBottom: '8px'
          }}>
            CRM Automation
          </h1>
          <p style={{ color: '#718096', fontSize: '16px' }}>
            智能客户管理系统
          </p>
        </div>

        {/* 欢迎信息 */}
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ 
            fontSize: '24px', 
            color: '#2d3748', 
            marginBottom: '12px' 
          }}>
            欢迎登录
          </h2>
          <p style={{ color: '#4a5568', fontSize: '14px' }}>
            使用Google账号快速登录，开始您的智能客户管理之旅
          </p>
        </div>

        {/* Google登录按钮 */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '14px 20px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'background-color 0.2s',
            opacity: isLoading ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = '#3367d6'
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = '#4285f4'
            }
          }}
        >
          {/* Google Icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          
          {isLoading ? '登录中...' : '使用 Google 登录'}
        </button>

        {/* 套餐预览 */}
        <div style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#f7fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ 
            fontSize: '16px', 
            color: '#2d3748', 
            marginBottom: '12px' 
          }}>
            🎁 免费开始使用
          </h3>
          <div style={{ color: '#4a5568', fontSize: '14px', textAlign: 'left' }}>
            <div style={{ marginBottom: '6px' }}>• 50个客户管理</div>
            <div style={{ marginBottom: '6px' }}>• 1000条消息/月</div>
            <div style={{ marginBottom: '6px' }}>• WhatsApp集成</div>
            <div>• 基础数据导出</div>
          </div>
        </div>

        {/* 底部链接 */}
        <div style={{ marginTop: '30px' }}>
          <p style={{ color: '#718096', fontSize: '12px', marginBottom: '8px' }}>
            还没有账户？登录后自动创建免费账户
          </p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <a 
              href="/pricing" 
              style={{ color: '#4299e1', fontSize: '12px', textDecoration: 'none' }}
            >
              查看套餐
            </a>
            <a 
              href="/demo" 
              style={{ color: '#4299e1', fontSize: '12px', textDecoration: 'none' }}
            >
              产品演示
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
