import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../hooks/useAuth'

interface SidebarProps {
  currentPage?: string
}

export default function Sidebar({ currentPage = '' }: SidebarProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const router = useRouter()
  const { t, language, setLanguage } = useLanguage()

  const { user, loading } = useAuth()

  const navItems = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 13H11V3H3V13ZM3 21H11V15H3V21ZM13 21H21V11H13V21ZM13 3V9H21V3H13Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '仪表盘' : 'Dashboard',
      href: '/dashboard',
      id: 'dashboard'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
          <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '对话管理' : 'Chat',
      href: '/chat',
      id: 'chat'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" fill="currentColor"/>
          <path d="M19.5 14.5L20.5 17.5L23.5 18.5L20.5 19.5L19.5 22.5L18.5 19.5L15.5 18.5L18.5 17.5L19.5 14.5Z" fill="currentColor"/>
          <path d="M4.5 7.5L5.5 10.5L8.5 11.5L5.5 12.5L4.5 15.5L3.5 12.5L0.5 11.5L3.5 10.5L4.5 7.5Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '自动化' : 'Automation',
      href: '/automation',
      id: 'automation'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 4C18.2 4 20 5.8 20 8C20 10.2 18.2 12 16 12C13.8 12 12 10.2 12 8C12 5.8 13.8 4 16 4ZM8 4C10.2 4 12 5.8 12 8C12 10.2 10.2 12 8 12C5.8 12 4 10.2 4 8C4 5.8 5.8 4 8 4ZM12 14C15.3 14 18 16.7 18 20V22H6V20C6 16.7 8.7 14 12 14Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '客户管理' : 'Customers',
      href: '/customers',
      id: 'customers'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14C15.3 14 18 16.7 18 20V22H6V20C6 16.7 8.7 14 12 14Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '团队与角色' : 'Team & Roles',
      href: '/team-roles',
      id: 'team-roles'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 11.08 6.16 12.87 7.76 14.18C8.94 15.13 10.33 15.91 12 16.5C13.67 15.91 15.06 15.13 16.24 14.18C17.84 12.87 19 11.08 19 9C19 5.13 15.87 2 12 2ZM12 18C10.75 18 9.57 17.65 8.5 17.06L7 19L12 22L17 19L15.5 17.06C14.43 17.65 13.25 18 12 18Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? 'AI 提示词库' : 'AI Prompt Library',
      href: '/ai-prompt-library',
      id: 'ai-prompt-library'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor"/>
          <path d="M7 10L12 7L17 10V17H7V10Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '知识库' : 'Knowledge Base',
      href: '/knowledge-base',
      id: 'knowledge-base'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      label: language === 'zh' ? '媒体管理' : 'Media Management',
      href: '/media-management',
      id: 'media-management'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 4H4C2.89 4 2 4.89 2 6V18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V6C22 4.89 21.11 4 20 4ZM20 18H4V8H20V18ZM20 6H4V6.5L12 11.5L20 6.5V6Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '订阅与账单' : 'Subscription / Billing',
      href: '/subscription-billing',
      id: 'subscription-billing'
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor"/>
          <path d="M7 10L12 7L17 10V17H7V10Z" fill="currentColor"/>
        </svg>
      ),
      label: language === 'zh' ? '报告' : 'Reports',
      href: '/reports',
      id: 'reports'
    },
  ]

  const bottomNavItems = [
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
        </svg>
      ), 
      label: language === 'zh' ? '个人资料' : 'Profile', 
      href: '/profile', 
      id: 'profile' 
    },
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
        </svg>
      ), 
      label: language === 'zh' ? '设置' : 'Settings', 
      href: '/settings', 
      id: 'settings' 
    },
  ]

  const isCurrentPage = (href: string) => {
    if (href === '/' && currentPage === '') return true
    return currentPage === href
  }

  // Dashboard 应该在主要功能页面时保持高亮
  const isDashboardActive = () => {
    // Dashboard页面或主页时激活
    return currentPage === '/dashboard' || currentPage === '' || currentPage === '/'
  }

  const handleNavClick = (href: string) => {
    router.push(href)
  }

  const publicNavItems = [
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
        </svg>
      ), 
      label: language === 'zh' ? '登录' : 'Login', 
      href: '/login', 
      id: 'login' 
    }
  ]

  const itemsToRender = user ? navItems : publicNavItems

  return (
    <div 
      style={{
        width: '70px',
        backgroundColor: '#2c3e50',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        zIndex: 1000,
        transition: 'width 0.3s ease',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.width = '200px'
        const labels = e.currentTarget.querySelectorAll('.nav-label')
        labels.forEach((label: any) => label.style.opacity = '1')
        setSidebarExpanded(true)
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.width = '70px'
        const labels = e.currentTarget.querySelectorAll('.nav-label')
        labels.forEach((label: any) => label.style.opacity = '0')
        setSidebarExpanded(false)
      }}
    >
      {/* Logo区域 */}
      <div 
        style={{
          width: '40px',
          height: '40px',
          background: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '40px', // 增加 Logo 下方的间距
          flexShrink: 0,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(20, 30, 48, 0.5)',
          transition: 'all 0.3s ease'
        }}
        onClick={() => router.push('/')}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(20, 30, 48, 0.7)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 30, 48, 0.5)'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21" 
                stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M21 12C21 7.03 16.97 3 12 3" 
                stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7"/>
          <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5" fill="rgba(255,255,255,0.1)"/>
          <circle cx="12" cy="12" r="2" fill="white"/>
          <circle cx="6" cy="6" r="1" fill="white" opacity="0.6"/>
          <circle cx="18" cy="6" r="1" fill="white" opacity="0.6"/>
          <circle cx="18" cy="18" r="1" fill="white" opacity="0.6"/>
        </svg>
      </div>

      {/* 主导航项目 */}
      <div style={{ flex: 1, width: '100%' }}>
        {navItems.map((item) => (
          <div 
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 15px',
              color: isCurrentPage(item.href) ? '#ecf0f1' : '#bdc3c7',
              backgroundColor: isCurrentPage(item.href) ? '#34495e' : 'transparent',
              marginBottom: '8px',
              borderRadius: '8px',
              margin: '0 10px 8px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!isCurrentPage(item.href)) {
                e.currentTarget.style.backgroundColor = '#34495e'
              }
            }}
            onMouseLeave={(e) => {
              if (!isCurrentPage(item.href)) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
            onClick={() => handleNavClick(item.href)}
          >
            <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </div>
            <span 
              className="nav-label"
              style={{ 
                marginLeft: '15px', 
                opacity: 0, 
                transition: 'opacity 0.3s ease',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* 底部导航 */}
      <div style={{ width: '100%', marginTop: 'auto', paddingBottom: '20px' }}>
        {bottomNavItems.map((item) => (
          <div 
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 15px',
              color: isCurrentPage(item.href) ? '#ecf0f1' : '#bdc3c7',
              backgroundColor: isCurrentPage(item.href) ? '#34495e' : 'transparent',
              borderRadius: '8px',
              margin: '0 10px 8px 10px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!isCurrentPage(item.href)) {
                e.currentTarget.style.backgroundColor = '#34495e'
              }
            }}
            onMouseLeave={(e) => {
              if (!isCurrentPage(item.href)) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
            onClick={() => handleNavClick(item.href)}
          >
            <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </div>
            <span 
              className="nav-label"
              style={{ 
                marginLeft: '15px', 
                opacity: 0, 
                transition: 'opacity 0.3s ease',
                whiteSpace: 'nowrap',
                fontSize: '14px'
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* 语言切换按钮 */}
      <div style={{ 
        width: '100%', 
        padding: '10px',
        borderTop: '1px solid #34495e'
      }}>
        <button
          onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: 'transparent',
            border: '1px solid #34495e',
            borderRadius: '6px',
            color: '#bdc3c7',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#34495e'
            e.currentTarget.style.color = '#ecf0f1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#bdc3c7'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.87 15.07L10.33 12.56L10.36 12.53C12.1 10.59 13.34 8.36 14.07 6H17V4H10V2H8V4H1V6H12.17C11.5 7.92 10.44 9.75 9 11.35C8.07 10.32 7.3 9.19 6.69 8H4.69C5.42 9.63 6.42 11.17 7.67 12.56L2.58 17.58L4 19L9 14L12.11 17.11L12.87 15.07ZM18.5 10H16.5L12 22H14L15.12 19H19.87L21 22H23L18.5 10ZM15.88 17L17.5 12.67L19.12 17H15.88Z" fill="currentColor"/>
          </svg>
          <span style={{ fontSize: sidebarExpanded ? '12px' : '0', opacity: sidebarExpanded ? 1 : 0, transition: 'all 0.3s ease' }}>
            {language === 'en' ? '中文' : 'EN'}
          </span>
        </button>
      </div>
    </div>
  )
}
