import React, { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface ProductServiceItem {
  id: string
  name: string
  description: string
  price?: number
  imageUrl?: string
  category: string
}

export default function ProductServiceList() {
  const { t, language } = useLanguage()
  const [items, setItems] = useState<ProductServiceItem[]>([
    {
      id: 'p1',
      name: language === 'zh' ? 'CRM 基础版' : 'CRM Basic Plan',
      description: language === 'zh' ? '包含核心客户管理和自动化功能。' : 'Includes core customer management and automation features.',
      price: 99,
      category: language === 'zh' ? '订阅计划' : 'Subscription Plan',
      imageUrl: 'https://via.placeholder.com/150/4299e1/FFFFFF?text=Basic',
    },
    {
      id: 'p2',
      name: language === 'zh' ? 'AI 智能助理' : 'AI Smart Assistant',
      description: language === 'zh' ? '基于 AI 的智能客服和自动回复。' : 'AI-powered smart customer service and auto-reply.',
      price: 49,
      category: language === 'zh' ? '附加服务' : 'Add-on Service',
      imageUrl: 'https://via.placeholder.com/150/48bb78/FFFFFF?text=AI',
    },
  ])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const categories = Array.from(new Set(items.map(item => item.category))) // 获取所有分类
  categories.unshift(language === 'zh' ? '全部' : 'All') // 添加 '全部' 选项

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleAddItem = () => {
    // TODO: 实现添加产品/服务的逻辑
    alert(language === 'zh' ? '添加产品/服务功能待实现' : 'Add Product/Service feature not implemented yet')
  }

  const handleEditItem = (id: string) => {
    // TODO: 实现编辑产品/服务的逻辑
    alert(`${language === 'zh' ? '编辑产品/服务' : 'Edit Product/Service'} ${id} ${language === 'zh' ? '功能待实现' : 'feature not implemented yet'}`)
  }

  const handleDeleteItem = (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此产品/服务吗？' : 'Are you sure you want to delete this product/service?')) {
      setItems(items.filter((item) => item.id !== id))
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

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={language === 'zh' ? '搜索产品或服务...' : 'Search products or services...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box',
          }}
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
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
        {filteredItems.length > 0 ? (
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
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '15px 20px' }}>
                <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '5px' }}>{item.name}</h3>
                <p style={{ fontSize: '14px', color: '#718096', marginBottom: '10px' }}>{item.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  {item.price && (
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#38a169' }}>
                      ${item.price}
                    </span>
                  )}
                  <span style={{ backgroundColor: '#ebf8ff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#2b6cb0' }}>
                    {item.category}
                  </span>
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
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '16px' }}>
            {language === 'zh' ? '🔍 暂无产品或服务' : '🔍 No products or services found'}
          </div>
        )}
      </div>
    </div>
  )
}
