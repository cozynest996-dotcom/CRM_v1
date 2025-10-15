import React, { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useFloating, offset, flip, shift, autoUpdate, useClick, useDismiss, useRole, useInteractions } from '@floating-ui/react'

interface KnowledgeBaseItem {
  id: string
  name: string
  description?: string
  category: string
  tags: string[]
}

interface KnowledgeBaseSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (knowledgeBaseId: string) => void
  anchorEl: HTMLElement | null
}

export default function KnowledgeBaseSelector({ isOpen, onClose, onSelect, anchorEl }: KnowledgeBaseSelectorProps) {
  const { t, language } = useLanguage()
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: onClose,
    middleware: [offset(10), flip(), shift()],
    whileElementsMounted: autoUpdate,
    placement: 'bottom-start',
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context)

  const { getFloatingProps } = useInteractions([click, dismiss, role])

  const fetchKnowledgeBases = async () => {
    setLoading(true)
    setError(null)
    const jwtToken = localStorage.getItem('token')
    if (!jwtToken) {
      setError(language === 'zh' ? '用户未认证，请重新登录。' : 'User not authenticated, please log in again.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge-base?is_active=true`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      })
      if (!response.ok) {
        throw new Error(language === 'zh' ? '无法获取知识库数据。' : 'Failed to fetch knowledge base data.')
      }
      const data: KnowledgeBaseItem[] = await response.json()
      setKnowledgeBases(data)
    } catch (err: any) {
      console.error('Error fetching knowledge bases:', err)
      setError(err.message || (language === 'zh' ? '加载知识库失败。' : 'Failed to load knowledge bases.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchKnowledgeBases()
    }
  }, [isOpen])

  useEffect(() => {
    if (anchorEl) {
      refs.setReference(anchorEl)
    }
  }, [anchorEl, refs])

  const categories = Array.from(new Set(knowledgeBases.map(kb => kb.category))).filter(Boolean)
  categories.unshift(language === 'zh' ? '全部' : 'All')

  const filteredKnowledgeBases = knowledgeBases.filter(
    (kb) => {
      const matchesSearch =
        kb.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (kb.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        kb.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesCategory = 
        selectedCategory === 'all' || kb.category === selectedCategory
      
      return matchesSearch && matchesCategory
    }
  )

  const handleSelectKnowledgeBase = (id: string) => {
    onSelect(id)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        zIndex: 1001, // Ensure it's above other modals if necessary
        width: '350px', // Smaller width
        maxHeight: '400px', // Max height
        overflowY: 'auto',
        backgroundColor: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: '15px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
      {...getFloatingProps()}
    >
      <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#2d3748', margin: '0 0 10px 0' }}>
        {language === 'zh' ? '选择知识库' : 'Select Knowledge Base'}
      </h3>

      <input
        type="text"
        placeholder={language === 'zh' ? '搜索知识库...' : 'Search knowledge bases...'}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          fontSize: '14px',
          boxSizing: 'border-box',
        }}
      />

      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          fontSize: '14px',
          backgroundColor: 'white',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        {categories.map((category) => (
          <option key={category} value={category === (language === 'zh' ? '全部' : 'All') ? 'all' : category}>
            {category}
          </option>
        ))}
      </select>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#718096', fontSize: '14px' }}>
          {language === 'zh' ? '加载中...' : 'Loading...'}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#fc8181', fontSize: '14px' }}>
          {error}
        </div>
      ) : filteredKnowledgeBases.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredKnowledgeBases.map((kb) => (
            <button
              key={kb.id}
              onClick={() => handleSelectKnowledgeBase(kb.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#2d3748',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#edf2f7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            >
              <strong>{kb.name}</strong>
              {kb.description && (
                <p style={{ fontSize: '12px', color: '#718096', margin: '4px 0 0 0' }}>
                  {kb.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                {kb.tags.map(tag => (
                  <span key={tag} style={{ fontSize: '10px', backgroundColor: '#e2e8f0', borderRadius: '3px', padding: '2px 5px', color: '#4a5568' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: '#718096', fontSize: '14px' }}>
          {language === 'zh' ? '未找到知識庫。' : 'No knowledge bases found.'}
        </div>
      )}
    </div>
  )
}
