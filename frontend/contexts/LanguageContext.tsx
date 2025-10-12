import React, { createContext, useContext, useState, useEffect } from 'react'

// 语言类型定义
export type Language = 'en' | 'zh'

// 语言上下文类型
interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

// 翻译字典
const translations = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.chat': 'Chat',
    'nav.customers': 'Customers',
    'nav.automation': 'Automation',
    'nav.analytics': 'Analytics',
    'nav.profile': 'Profile',
    'nav.settings': 'Settings',

    // Dashboard
    'dashboard.title': 'Dashboard - Welcome back',
    'dashboard.subtitle': 'Your CRM Control Center',
    'dashboard.startChat': 'Start Chat',
    'dashboard.upgrade': 'Upgrade Plan',
    'dashboard.logout': 'Logout',
    'dashboard.viewProfile': 'View Profile',

    // Chat
    'chat.title': 'Customer Chat',
    'chat.inputPlaceholder': 'Type your message...',
    'chat.send': 'Send',
    'chat.connecting': 'Connecting...',
    'chat.connected': 'Connected',
    'chat.disconnected': 'Disconnected',

    // Settings
    'settings.title': 'System Settings',
    'settings.whatsapp': 'WhatsApp Integration',
    'settings.whatsapp.status': 'Connection Status',
    'settings.whatsapp.connected': 'Connected',
    'settings.whatsapp.disconnected': 'Disconnected',
    'settings.whatsapp.connecting': 'Connecting',
    'settings.whatsapp.scanQR': 'Scan QR Code to Login',
    'settings.openai': 'OpenAI Configuration',
    'settings.openai.configured': 'OpenAI API Configured',
    'settings.openai.notConfigured': 'OpenAI API Not Configured',
    'settings.openai.apiKey': 'OpenAI API Key',
    'settings.openai.save': 'Save API Key',
    'settings.openai.test': 'Test Connection',
    'settings.google': 'Google Sheets Integration',
    'settings.google.login': 'Login with Google',
    'settings.google.disconnect': 'Disconnect',

    // Automation
    'automation.title': 'Automation',
    'automation.subtitle': 'Streamline your customer interactions with powerful automation workflows',
    'automation.workflows': 'My Workflows',
    'automation.templates': 'Templates',
    'automation.analytics': 'Analytics',
    'automation.createWorkflow': 'Create Workflow',
    'automation.active': 'active',
    'automation.paused': 'paused',

    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.confirm': 'Confirm',
    
    // Language
    'language.en': 'English',
    'language.zh': '中文',
    'language.switch': 'Switch Language'
  },
  zh: {
    // Navigation  
    'nav.dashboard': '仪表盘',
    'nav.chat': '聊天',
    'nav.customers': '客户管理',
    'nav.automation': '自动化',
    'nav.analytics': '数据分析',
    'nav.profile': '个人资料',
    'nav.settings': '设置',

    // Dashboard
    'dashboard.title': '仪表盘 - 欢迎回来',
    'dashboard.subtitle': '您的CRM控制中心',
    'dashboard.startChat': '开始聊天',
    'dashboard.upgrade': '升级套餐',
    'dashboard.logout': '退出登录',
    'dashboard.viewProfile': '查看资料',

    // Chat
    'chat.title': '客户聊天',
    'chat.inputPlaceholder': '输入您的消息...',
    'chat.send': '发送',
    'chat.connecting': '连接中...',
    'chat.connected': '已连接',
    'chat.disconnected': '已断开',

    // Settings
    'settings.title': '系统设置',
    'settings.whatsapp': 'WhatsApp 集成',
    'settings.whatsapp.status': '连接状态',
    'settings.whatsapp.connected': '已连接',
    'settings.whatsapp.disconnected': '未连接',
    'settings.whatsapp.connecting': '连接中',
    'settings.whatsapp.scanQR': '扫描二维码登录',
    'settings.openai': 'OpenAI 配置',
    'settings.openai.configured': 'OpenAI API 已配置',
    'settings.openai.notConfigured': 'OpenAI API 未配置',
    'settings.openai.apiKey': 'OpenAI API 密钥',
    'settings.openai.save': '保存 API 密钥',
    'settings.openai.test': '测试连接',
    'settings.google': 'Google Sheets 集成',
    'settings.google.login': '使用 Google 登录',
    'settings.google.disconnect': '断开连接',

    // Automation
    'automation.title': '自动化',
    'automation.subtitle': '通过强大的自动化工作流程简化客户互动',
    'automation.workflows': '我的工作流',
    'automation.templates': '模板',
    'automation.analytics': '分析',
    'automation.createWorkflow': '创建工作流',
    'automation.active': '活跃',
    'automation.paused': '暂停',

    // Common
    'common.loading': '加载中...',
    'common.save': '保存',
    'common.cancel': '取消',
    'common.edit': '编辑',
    'common.delete': '删除',
    'common.success': '成功',
    'common.error': '错误',
    'common.confirm': '确认',
    
    // Language
    'language.en': 'English',
    'language.zh': '中文',
    'language.switch': '切换语言'
  }
}

// 创建上下文
const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

// 语言提供者组件
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')

  // 从localStorage读取语言设置
  useEffect(() => {
    const savedLanguage = localStorage.getItem('crm-language') as Language
    if (savedLanguage && ['en', 'zh'].includes(savedLanguage)) {
      setLanguage(savedLanguage)
    }
  }, [])

  // 保存语言设置到localStorage
  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('crm-language', lang)
  }

  // 翻译函数
  const t = (key: string): string => {
    const keys = key.split('.')
    let value: any = translations[language]
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k]
      } else {
        return key // 如果找不到翻译，返回key本身
      }
    }
    
    return typeof value === 'string' ? value : key
  }

  const value: LanguageContextType = {
    language,
    setLanguage: handleSetLanguage,
    t
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

// 使用语言上下文的Hook
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
