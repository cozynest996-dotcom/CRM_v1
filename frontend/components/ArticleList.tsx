import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import KnowledgeBaseFormModal from './KnowledgeBaseFormModal'
import { useAuth } from '../hooks/useAuth'

interface KnowledgeBaseItem {
  id: string
  name: string
  description?: string
  content: string
  tags: string[]
  category: string
  is_active: boolean
}

export default function ArticleList() {
  const { t, language } = useLanguage()
  const [articles, setArticles] = useState<KnowledgeBaseItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentEditingItem, setCurrentEditingItem] = useState<KnowledgeBaseItem | undefined>(undefined)
  const { token } = useAuth()

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

  const fetchArticles = async () => {
    setLoading(true)
    setError(null)
    if (!token) {
      setError(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge-base?category=article&is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error(language === 'zh' ? '无法获取文章数据。' : 'Failed to fetch article data.')
      }
      const data: KnowledgeBaseItem[] = await response.json()
      setArticles(data)
    } catch (err: any) {
      setError(err.message || (language === 'zh' ? '加载文章失败。' : 'Failed to load articles.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles()
  }, [language])

  const filteredArticles = articles.filter(
    (article) =>
      article.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleAddArticle = () => {
    setCurrentEditingItem(undefined)
    setIsModalOpen(true)
  }

  const handleEditArticle = (id: string) => {
    const itemToEdit = articles.find(article => article.id === id)
    if (itemToEdit) {
      setCurrentEditingItem(itemToEdit)
      setIsModalOpen(true)
    }
  }

  interface KnowledgeBaseCreateUpdate {
    name: string
    description?: string
    content: string
    tags: string[]
    category: string
    is_active: boolean
  }

  const handleSaveItem = async (item: KnowledgeBaseCreateUpdate) => {
    if (!token) {
      alert(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
      return
    }

    setLoading(true)
    try {
      let response
      if (currentEditingItem) {
        response = await fetch(`${API_BASE_URL}/api/knowledge-base/${currentEditingItem.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(item),
        })
      } else {
        response = await fetch(`${API_BASE_URL}/api/knowledge-base/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(item),
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || (language === 'zh' ? '保存文章失败。' : 'Failed to save article.'))
      }

      alert(language === 'zh' ? '文章保存成功！' : 'Article saved successfully!')
      setIsModalOpen(false)
      fetchArticles() // Refresh the list
    } catch (err: any) {
      console.error("Error saving article:", err)
      alert(err.message || (language === 'zh' ? '保存文章失败。' : 'Failed to save article.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteArticle = async (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此文章吗？' : 'Are you sure you want to delete this article?')) {
      if (!token) {
        alert(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
        return
      }
 
      try {
        const response = await fetch(`${API_BASE_URL}/api/knowledge-base/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
 
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || (language === 'zh' ? '删除文章失败。' : 'Failed to delete article.'))
        }
 
        alert(language === 'zh' ? '文章删除成功！' : 'Article deleted successfully!')
        fetchArticles() // Refresh the list after deletion
      } catch (err: any) {
        console.error("Error deleting article:", err)
        alert(err.message || (language === 'zh' ? '删除文章失败。' : 'Failed to delete article.'))
      }
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

      <KnowledgeBaseFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        initialData={currentEditingItem}
        category="article"
      />
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={language === 'zh' ? '搜索文章标题、描述、内容或标签...' : 'Search article titles, descriptions, content or tags...'}
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '16px' }}>
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#fc8181', fontSize: '16px' }}>
            {error}
          </div>
        ) : filteredArticles.length > 0 ? (
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
                <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '5px' }}>{article.name}</h3>
                {article.description && <p style={{ fontSize: '14px', color: '#718096', marginBottom: '10px' }}>{article.description}</p>}
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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            backgroundColor: '#f8fafc',
            border: '1px dashed #cbd5e0',
            borderRadius: '8px',
            padding: '20px',
            color: '#718096',
            fontSize: '16px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '48px', marginBottom: '10px' }}>📚</span>
            <p style={{ margin: '0 0 10px 0' }}>{language === 'zh' ? '暂无文章或文档，点击上方按钮新建第一篇文章。' : 'No articles or documents yet. Click the button above to create your first article.'} </p>
            <button
              onClick={handleAddArticle}
              style={{
                padding: '8px 15px',
                backgroundColor: '#4299e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              + {language === 'zh' ? '新建文章' : 'New Article'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
