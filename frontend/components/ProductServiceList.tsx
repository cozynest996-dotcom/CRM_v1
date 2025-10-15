import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import KnowledgeBaseFormModal from './KnowledgeBaseFormModal'
import { useAuth } from '../hooks/useAuth'

interface KnowledgeBaseItem {
  id: string
  name: string
  description?: string
  content: string
  category: string
  tags: string[]
  is_active: boolean
}

export default function ProductServiceList() {
  const { t, language } = useLanguage()
  const [items, setItems] = useState<KnowledgeBaseItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentEditingItem, setCurrentEditingItem] = useState<KnowledgeBaseItem | undefined>(undefined)
  const { token } = useAuth()

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

  const fetchProductServices = async () => {
    setLoading(true)
    setError(null)
    if (!token) {
      setError(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge-base?category=product_service&is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error(language === 'zh' ? '无法获取产品与服务数据。' : 'Failed to fetch product and service data.')
      }
      const data: KnowledgeBaseItem[] = await response.json()
      setItems(data)
    } catch (err: any) {
      setError(err.message || (language === 'zh' ? '加载产品与服务失败。' : 'Failed to load products and services.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProductServices()
  }, [language])

  const categories = Array.from(new Set(items.map(item => item.category))).filter(Boolean)
  categories.unshift(language === 'zh' ? '全部' : 'All') // 添加 '全部' 选项

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) || // Allow searching by short description if exists
      item.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleAddItem = () => {
    setCurrentEditingItem(undefined)
    setIsModalOpen(true)
  }

  const handleEditItem = (id: string) => {
    const itemToEdit = items.find(item => item.id === id)
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
        throw new Error(errorData.detail || (language === 'zh' ? '保存产品/服务失败。' : 'Failed to save product/service.'))
      }

      alert(language === 'zh' ? '产品/服务保存成功！' : 'Product/Service saved successfully!')
      setIsModalOpen(false)
      fetchProductServices() // Refresh the list
    } catch (err: any) {
      console.error("Error saving product/service:", err)
      alert(err.message || (language === 'zh' ? '保存产品/服务失败。' : 'Failed to save product/service.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteItem = async (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此产品/服务吗？' : 'Are you sure you want to delete this product/service?')) {
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
          throw new Error(errorData.detail || (language === 'zh' ? '删除产品/服务失败。' : 'Failed to delete product/service.'))
        }
 
        alert(language === 'zh' ? '产品/服务删除成功！' : 'Product/Service deleted successfully!')
        fetchProductServices() // Refresh the list after deletion
      } catch (err: any) {
        console.error("Error deleting product/service:", err)
        alert(err.message || (language === 'zh' ? '删除产品/服务失败。' : 'Failed to delete product/service.'))
      }
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', color: '#2d3748', margin: 0 }}>
          {language === 'zh' ? '产品与服务' : 'Products & Services'}
        </h2>
        <button
          onClick={handleAddItem}
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
          + {language === 'zh' ? '新增产品/服务' : 'Add Item'}
        </button>
      </div>

      <KnowledgeBaseFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        initialData={currentEditingItem}
        category="product_service"
      />
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={language === 'zh' ? '搜索产品或服务...' : 'Search products or services...'}
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
        <label htmlFor="productServiceCategory" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
          {language === 'zh' ? '筛选分类' : 'Filter by Category'}
        </label>
        <select
          id="productServiceCategory"
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '16px' }}>
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#fc8181', fontSize: '16px' }}>
            {error}
          </div>
        ) : filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ padding: '15px 20px' }}>
                <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '5px' }}>{item.name}</h3>
                {item.description && <p style={{ fontSize: '14px', color: '#718096', marginBottom: '5px' }}>{item.description}</p>}
                <p style={{ fontSize: '14px', color: '#718096', marginBottom: '10px' }}>{item.content}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <span style={{ backgroundColor: '#ebf8ff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#2b6cb0' }}>
                    {item.category}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {item.tags.map((tag) => (
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
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleEditItem(item.id)}
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
                    onClick={() => handleDeleteItem(item.id)}
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
            <span style={{ fontSize: '48px', marginBottom: '10px' }}>📦</span>
            <p style={{ margin: '0 0 10px 0' }}>{language === 'zh' ? '暂无产品或服务，点击上方按钮新增第一个项目。' : 'No products or services yet. Click the button above to add your first item.'} </p>
            <button
              onClick={handleAddItem}
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
              + {language === 'zh' ? '新增产品/服务' : 'Add Item'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
