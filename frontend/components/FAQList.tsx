import React, { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface FAQItem {
  id: string
  question: string
  answer: string
  tags: string[]
  category: string // 新增分类属性
}

export default function FAQList() {
  const { t, language } = useLanguage()
  const [faqs, setFaqs] = useState<FAQItem[]>([
    {
      id: '1',
      question: language === 'zh' ? '如何设置自动回复？' : 'How to set up auto-reply?',
      answer: language === 'zh' ? '您可以在自动化设置中创建新的工作流，然后添加自动回复节点。' : 'You can create a new workflow in automation settings and add an auto-reply node.',
      tags: [language === 'zh' ? '自动化' : 'Automation', 'FAQ'],
      category: language === 'zh' ? '自动化设置' : 'Automation Settings',
    },
    {
      id: '2',
      question: language === 'zh' ? '如何查看客户对话历史？' : 'How to view customer chat history?',
      answer: language === 'zh' ? '在对话管理页面，点击客户姓名即可查看完整的对话历史。' : 'In the chat management page, click on the customer\'s name to view the complete chat history.',
      tags: [language === 'zh' ? '对话管理' : 'Chat', '客户'],
      category: language === 'zh' ? '客户管理' : 'Customer Management',
    },
    {
      id: '3',
      question: language === 'zh' ? '如何更新我的个人资料？' : 'How to update my profile?',
      answer: language === 'zh' ? '您可以在个人资料页面修改您的信息。' : 'You can modify your information on the profile page.',
      tags: [language === 'zh' ? '账户' : 'Account'],
      category: language === 'zh' ? '账户设置' : 'Account Settings',
    },
  ])
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all') // 新增状态

  const categories = Array.from(new Set(faqs.map(faq => faq.category))) // 获取所有分类
  categories.unshift(language === 'zh' ? '全部' : 'All') // 添加 '全部' 选项

  const filteredFaqs = faqs.filter(
    (faq) => {
      const matchesSearch =
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesCategory = 
        selectedCategory === 'all' || faq.category === selectedCategory
      
      return matchesSearch && matchesCategory
    }
  )

  const handleAddFAQ = () => {
    // TODO: 实现添加 FAQ 的逻辑，例如弹出一个表单
    alert(language === 'zh' ? '添加 FAQ 功能待实现' : 'Add FAQ feature not implemented yet')
  }

  const handleEditFAQ = (id: string) => {
    // TODO: 实现编辑 FAQ 的逻辑
    alert(`${language === 'zh' ? '编辑 FAQ' : 'Edit FAQ'} ${id} ${language === 'zh' ? '功能待实现' : 'feature not implemented yet'}`)
  }

  const handleDeleteFAQ = (id: string) => {
    if (confirm(language === 'zh' ? '确定要删除此 FAQ 吗？' : 'Are you sure you want to delete this FAQ?')) {
      setFaqs(faqs.filter((faq) => faq.id !== id))
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
        {filteredFaqs.length > 0 ? (
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
                <span>{faq.question}</span>
                <span>{expandedFAQ === faq.id ? '▲' : '▼'}</span>
              </div>
              {expandedFAQ === faq.id && (
                <div style={{ padding: '15px 20px', color: '#4a5568' }}>
                  <p style={{ marginBottom: '10px' }}>{faq.answer}</p>
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
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '16px' }}>
            {language === 'zh' ? '🔍 暂无常见问题' : '🔍 No FAQs found'}
          </div>
        )}
      </div>
    </div>
  )
}
