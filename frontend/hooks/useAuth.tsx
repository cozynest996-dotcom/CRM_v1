import { useState, useEffect, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/router'

interface User {
  id: number
  email: string
  name: string
  avatar_url: string
  subscription_plan: string
  subscription_status: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // 检查URL中的token参数
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      // 如果URL中有token，保存并使用它
      localStorage.setItem('auth_token', tokenFromUrl);
      setToken(tokenFromUrl);
      fetchUser(tokenFromUrl);
      
      // 清除URL中的token参数
      const newUrl = window.location.pathname + window.location.search.replace(/[?&]token=[^&]+/, '');
      window.history.replaceState({}, '', newUrl);
    } else {
      // 否则尝试从localStorage获取token
      const savedToken = localStorage.getItem('auth_token')
      if (savedToken) {
        setToken(savedToken)
        fetchUser(savedToken)
      } else {
        setLoading(false)
        // 如果当前不是登录相关页面，重定向到登录页，阻止匿名访问私有页面
        const path = window.location.pathname || ''
        if (!path.startsWith('/login') && !path.startsWith('/auth')) {
          router.push('/login')
        }
      }
    }
  }, [])

  const fetchUser = async (authToken: string) => {
    try {
      const response = await fetch('http://localhost:8000/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
      } else {
        // Token无效或过期
        const errorData = await response.json().catch(() => ({}))
        console.error('Auth error:', response.status, errorData)
        
        // 清除无效token
        localStorage.removeItem('auth_token')
        setToken(null)
        setUser(null)
        
        // 如果是401或403，重定向到登录页
        if (response.status === 401 || response.status === 403) {
          router.push('/login')
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      localStorage.removeItem('auth_token')
      setToken(null)
      setUser(null)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const login = (newToken: string) => {
    localStorage.setItem('auth_token', newToken)
    setToken(newToken)
    fetchUser(newToken)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setUser(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
