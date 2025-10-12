import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // 检查URL中是否有token参数（来自Google OAuth回调）
    const { token } = router.query
    
    if (token && typeof token === 'string') {
      // 保存token到localStorage
      localStorage.setItem('auth_token', token)
      console.log('Token saved from OAuth callback')
      
      // 清除URL中的token参数并重定向到dashboard
      router.replace('/dashboard')
    } else {
      // 正常重定向到Dashboard
      router.replace('/dashboard')
    }
  }, [router])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '40px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          animation: 'spin 1s linear infinite'
        }}>
          <svg 
            width="30" 
            height="30" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" 
              fill="white"
            />
            <circle cx="8" cy="10" r="1.5" fill="white"/>
            <circle cx="12" cy="10" r="1.5" fill="white"/>
            <circle cx="16" cy="10" r="1.5" fill="white"/>
          </svg>
        </div>
        
        <h2 style={{
          fontSize: '24px',
          color: '#2d3748',
          marginBottom: '12px'
        }}>
          正在加载...
        </h2>
        
        <p style={{
          color: '#718096',
          fontSize: '16px'
        }}>
          正在跳转到Dashboard
        </p>
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