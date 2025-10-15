import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import KnowledgeBaseFormModal from './KnowledgeBaseFormModal' // Import the new modal component
import { useAuth } from '../hooks/useAuth'

interface KnowledgeBaseItem {
  id: string
  name: string // 对应 FAQ 的问题
  description?: string // 对应 FAQ 的额外描述，或者为空
  content: string // 对应 FAQ 的答案
  tags: string[]
  category: string
  is_active: boolean
}

export default function FAQList() {
  const { t, language } = useLanguage()
  const [faqs, setFaqs] = useState<KnowledgeBaseItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all') // 新增状态
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false) // State to control modal visibility
  const [currentEditingItem, setCurrentEditingItem] = useState<KnowledgeBaseItem | undefined>(undefined) // State to hold item being edited
  const { token } = useAuth()

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

  const fetchFaqs = async () => {
    setLoading(true)
    setError(null)
    if (!token) {
      setError(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge-base?category=faq&is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error(language === 'zh' ? '无法获取 FAQ 数据。' : 'Failed to fetch FAQ data.')
      }
      const data: KnowledgeBaseItem[] = await response.json()
      setFaqs(data)
    } catch (err: any) {
      setError(err.message || (language === 'zh' ? '加载 FAQ 失败。' : 'Failed to load FAQs.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Update authToken from localStorage whenever this effect runs
    // const token = localStorage.getItem('token')
    // setAuthToken(token)
    fetchFaqs()
  }, [language]) // Empty dependency array means this runs once on mount

  // useEffect(() => {
  //   if (authToken) { // Only fetch if authToken is available
  //     fetchFaqs()
  //   }
  // }, [language, authToken]) // Depend on language and authToken

  const categories = Array.from(new Set(faqs.map(faq => faq.category))).filter(Boolean)
  categories.unshift(language === 'zh' ? '全部' : 'All') // 添加 '全部' 选项

  const filteredFaqs = faqs.filter(
    (faq) => {
      const matchesSearch =
        faq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesCategory = 
        selectedCategory === 'all' || faq.category === selectedCategory
      
      return matchesSearch && matchesCategory
    }
  )

  const handleAddFAQ = () => {
    setCurrentEditingItem(undefined) // Clear any previous editing data
    setIsModalOpen(true)
  }

  const handleEditFAQ = (id: string) => {
    const itemToEdit = faqs.find(faq => faq.id === id)
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
        // Update existing item
        response = await fetch(`${API_BASE_URL}/api/knowledge-base/${currentEditingItem.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(item),
        })
      } else {
        // Create new item
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
        throw new Error(errorData.detail || (language === 'zh' ? '保存知识库条目失败。' : 'Failed to save knowledge base item.'))
      }

      alert(language === 'zh' ? '知识库条目保存成功！' : 'Knowledge base item saved successfully!')
      setIsModalOpen(false)
      fetchFaqs() // Refresh the list
    } catch (err: any) {
      console.error("Error saving knowledge base item:", err)
      alert(err.message || (language === 'zh' ? '保存知识库条目失败。' : 'Failed to save knowledge base item.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFAQ = async (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此 FAQ 吗？' : 'Are you sure you want to delete this FAQ?')) {
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
          throw new Error(errorData.detail || (language === 'zh' ? '删除 FAQ 失败。' : 'Failed to delete FAQ.'))
        }
 
        alert(language === 'zh' ? 'FAQ 删除成功！' : 'FAQ deleted successfully!')
        fetchFaqs() // Refresh the list after deletion
      } catch (err: any) {
        console.error("Error deleting FAQ:", err)
        alert(err.message || (language === 'zh' ? '删除 FAQ 失败。' : 'Failed to delete FAQ.'))
      }
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', color: '#2d3748', margin: 0 }}>
          {language === 'zh' ? '常见问题 (FAQ)' : 'FAQs'}
        </h2>
        <button
          onClick={handleAddFAQ}
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
          + {language === 'zh' ? '新增 FAQ' : 'Add FAQ'}
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={language === 'zh' ? '搜索问题、答案或标签...' : 'Search questions, answers or tags...'}
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

      {/* 分类筛选 */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="faqCategory" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
          {language === 'zh' ? '筛选分类' : 'Filter by Category'}
        </label>
        <select
          id="faqCategory"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '16px',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          {categories.map((category) => (
            <option key={category} value={category === (language === 'zh' ? '全部' : 'All') ? 'all' : category}>
              {category}
            </option>
          ))}
        </select>
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
        ) : filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq) => (
            <div
              key={faq.id}
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
              }}
            >
              <div
                onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                style={{
                  padding: '15px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: '600',
                  color: '#2d3748',
                  borderBottom: expandedFAQ === faq.id ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <span>{faq.name}</span>
                <span>{expandedFAQ === faq.id ? '▲' : '▼'}</span>
              </div>
              {expandedFAQ === faq.id && (
                <div style={{ padding: '15px 20px', color: '#4a5568' }}>
                  <p style={{ marginBottom: '10px' }}>{faq.content}</p>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                    {faq.tags.map((tag) => (
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
                      onClick={() => handleEditFAQ(faq.id)}
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
                      onClick={() => handleDeleteFAQ(faq.id)}
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
              )}
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
            <span style={{ fontSize: '48px', marginBottom: '10px' }}>💡</span>
            <p style={{ margin: '0 0 10px 0' }}>{language === 'zh' ? '暂无常见问题，点击上方按钮新增第一个 FAQ。' : 'No FAQs yet. Click the button above to add your first FAQ.'} </p>
            <button
              onClick={handleAddFAQ}
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
              + {language === 'zh' ? '新增 FAQ' : 'Add FAQ'}
            </button>
          </div>
        )}
      </div>
 
      <KnowledgeBaseFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        initialData={currentEditingItem}
        category="faq"
      />
    </div>
  )
}
