import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import { useLanguage } from '../contexts/LanguageContext'

// 导入知识库子组件
import KnowledgeBaseNavigation from '../components/KnowledgeBaseNavigation'
import FAQList from '../components/FAQList'
import ProductServiceList from '../components/ProductServiceList'
import ArticleList from '../components/ArticleList'
import KnowledgeBaseIntegrationsPage from '../components/KnowledgeBaseIntegrationsPage' // 新增导入
import CustomEntityConfigurationPage from '../components/CustomEntityConfigurationPage' // 新增导入

type KnowledgeBaseView = 'faq' | 'products' | 'articles' | 'customObjects' | 'integrations' // 新增 'customObjects'

export default function KnowledgeBasePage() {
  const { t, language } = useLanguage()
  const [currentView, setCurrentView] = useState<KnowledgeBaseView>('faq')

  const renderContent = () => {
    switch (currentView) {
      case 'faq':
        return <FAQList />
      case 'products':
        return <ProductServiceList />
      case 'articles':
        return <ArticleList />
      case 'customObjects': // 新增视图渲染
        return <CustomEntityConfigurationPage />
      case 'integrations':
        return <KnowledgeBaseIntegrationsPage />
      default:
        return <FAQList />
    }
  }

  return (
    <div style={{ display: 'flex', backgroundColor: '#f7fafc', width: '100%', height: '100vh' }}>
      <Sidebar currentPage="/knowledge-base" />
      
      <div style={{ flex: 1, marginLeft: '70px', padding: '10px 15px', overflow: 'hidden' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* 标题 */}
          <div style={{ marginBottom: '15px', padding: '10px 0' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
              📚 {language === 'zh' ? '知识库' : 'Knowledge Base'}
            </h1>
            <p style={{ color: '#718096', marginTop: '5px', fontSize: '16px' }}>
              {language === 'zh' ? '管理您的常见问题、产品服务和文章' : 'Manage your FAQs, products & services, and articles'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '15px', flex: 1, overflow: 'hidden' }}>
            {/* 左侧导航 */}
            <div style={{ width: '250px', flexShrink: 0, overflowY: 'auto' }}>
              <KnowledgeBaseNavigation 
                currentView={currentView}
                onViewChange={setCurrentView}
              />
            </div>

            {/* 右侧内容展示区 */}
            <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)', padding: '15px', overflow: 'hidden' }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
