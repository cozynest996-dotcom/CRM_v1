import React from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface KnowledgeBaseNavigationProps {
  currentView: 'faq' | 'products' | 'articles' | 'customObjects' | 'integrations'
  onViewChange: (view: 'faq' | 'products' | 'articles' | 'customObjects' | 'integrations') => void
}

export default function KnowledgeBaseNavigation({
  currentView,
  onViewChange,
}: KnowledgeBaseNavigationProps) {
  const { t, language } = useLanguage()

  const navItems = [
    {
      id: 'faq',
      label: language === 'zh' ? '常见问题 (FAQ)' : 'FAQs',
      icon: '❓',
    },
    {
      id: 'products',
      label: language === 'zh' ? '产品与服务' : 'Products & Services',
      icon: '📦',
    },
    {
      id: 'articles',
      label: language === 'zh' ? '文章与文档' : 'Articles & Documents',
      icon: '📄',
    },
    {
      id: 'customObjects',
      label: language === 'zh' ? '自定义对象' : 'Custom Objects',
      icon: '🧱',
    },
    {
      id: 'integrations',
      label: language === 'zh' ? '集成与导入' : 'Integrations & Import',
      icon: '⚙️',
    },
  ]

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)', padding: '20px' }}>
      <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
        {language === 'zh' ? '知识库导航' : 'Knowledge Base Navigation'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id as 'faq' | 'products' | 'articles' | 'customObjects' | 'integrations')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 15px',
              borderRadius: '6px',
              backgroundColor: currentView === item.id ? '#ebf8ff' : 'transparent',
              color: currentView === item.id ? '#2b6cb0' : '#4a5568',
              fontWeight: currentView === item.id ? '600' : 'normal',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
              boxShadow: currentView === item.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (currentView !== item.id) {
                e.currentTarget.style.backgroundColor = '#f7fafc'
              }
            }}
            onMouseLeave={(e) => {
              if (currentView !== item.id) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            <span style={{ fontSize: '18px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
