import React, { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface ArticleItem {
  id: string
  title: string
  summary: string
  author: string
  publishDate: string
  tags: string[]
}

export default function ArticleList() {
  const { t, language } = useLanguage()
  const [articles, setArticles] = useState<ArticleItem[]>([
    {
      id: 'a1',
      title: language === 'zh' ? 'AI 节点配置指南' : 'AI Node Configuration Guide',
      summary: language === 'zh' ? '详细介绍如何配置和使用 AI 节点以实现智能回复。' : 'Detailed guide on configuring and using AI nodes for smart replies.',
      author: 'Admin',
      publishDate: '2023-10-26',
      tags: [language === 'zh' ? 'AI' : 'AI', language === 'zh' ? '指南' : 'Guide'],
    },
    {
      id: 'a2',
      title: language === 'zh' ? '工作流自动化最佳实践' : 'Workflow Automation Best Practices',
      summary: language === 'zh' ? '分享构建高效自动化工作流的技巧和建议。' : 'Tips and recommendations for building efficient automation workflows.',
      author: 'Admin',
      publishDate: '2023-11-15',
      tags: [language === 'zh' ? '自动化' : 'Automation', language === 'zh' ? '最佳实践' : 'Best Practice'],
    },
  ])
  const [searchTerm, setSearchTerm] = useState('')

  const filteredArticles = articles.filter(
    (article) =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleAddArticle = () => {
    // TODO: 实现添加文章的逻辑，例如跳转到富文本编辑器页面
    alert(language === 'zh' ? '添加文章功能待实现' : 'Add Article feature not implemented yet')
  }

  const handleEditArticle = (id: string) => {
    // TODO: 实现编辑文章的逻辑
    alert(`${language === 'zh' ? '编辑文章' : 'Edit Article'} ${id} ${language === 'zh' ? '功能待实现' : 'feature not implemented yet'}`)
  }

  const handleDeleteArticle = (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此文章吗？' : 'Are you sure you want to delete this article?')) {
      setArticles(articles.filter((article) => article.id !== id))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', color: '#2d3748', margin: 0 }}>
          {language === 'zh' ? '文章与文档' : 'Articles & Documents'}
        </h2>
        <button
          onClick={handleAddArticle}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4299e1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          + {language === 'zh' ? '新建文章' : 'New Article'}
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={language === 'zh' ? '搜索文章标题、摘要或标签...' : 'Search article titles, summaries or tags...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {filteredArticles.length > 0 ? (
          filteredArticles.map((article) => (
            <div
              key={article.id}
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ padding: '15px 20px' }}>
                <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '5px' }}>{article.title}</h3>
                <p style={{ fontSize: '14px', color: '#718096', marginBottom: '10px' }}>{article.summary}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#a0aec0' }}>
                    {language === 'zh' ? '作者:' : 'Author:'} {article.author}
                  </span>
                  <span style={{ fontSize: '12px', color: '#a0aec0' }}>
                    {language === 'zh' ? '发布日期:' : 'Published:'} {article.publishDate}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        backgroundColor: '#e2e8f0',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#4a5568',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleEditArticle(article.id)}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: '#63b3ed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {language === 'zh' ? '编辑' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDeleteArticle(article.id)}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: '#fc8181',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {language === 'zh' ? '删除' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '16px' }}>
            {language === 'zh' ? '🔍 暂无文章或文档' : '🔍 No articles or documents found'}
          </div>
        )}
      </div>
    </div>
  )
}
