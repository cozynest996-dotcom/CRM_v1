import type { AppProps } from 'next/app'
import { LanguageProvider } from '../contexts/LanguageContext'
import { AuthProvider, useAuth } from '../hooks/useAuth'
import 'reactflow/dist/style.css'
import '../styles/globals.css'
import { useRouter } from 'next/router'
import React from 'react'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  // public paths that do not require auth
  const publicPaths = ['/login', '/auth', '/auth/google/callback']

  React.useEffect(() => {
    if (!loading && !user) {
      const path = router.pathname
      if (!publicPaths.some(p => path.startsWith(p))) {
        router.replace('/login')
      }
    }
  }, [loading, user, router])

  if (loading) return null // or a spinner
  return <>{children}</>
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AuthGuard>
          <Component {...pageProps} />
        </AuthGuard>
      </LanguageProvider>
    </AuthProvider>
  )
}
