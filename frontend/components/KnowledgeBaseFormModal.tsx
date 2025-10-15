import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface KnowledgeBaseFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (item: KnowledgeBaseCreateUpdate) => void
  initialData?: KnowledgeBaseItem // For editing existing items
  category: string // The category of the knowledge base item (e.g., 'faq', 'product_service', 'article')
}

interface KnowledgeBaseItem {
  id?: string
  name: string
  description?: string
  content: string
  tags: string[]
  category: string
  is_active: boolean
}

interface KnowledgeBaseCreateUpdate {
  name: string
  description?: string
  content: string
  tags: string[]
  category: string
  is_active: boolean
}

export default function KnowledgeBaseFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  category,
}: KnowledgeBaseFormModalProps) {
  const { t, language } = useLanguage()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name)
      setDescription(initialData.description || '')
      setContent(initialData.content)
      setTags(initialData.tags || [])
      setIsActive(initialData.is_active)
    } else if (isOpen && !initialData) {
      // Reset form when opening for new item
      setName('')
      setDescription('')
      setContent('')
      setTags([])
      setTagInput('')
      setIsActive(true)
    }
  }, [isOpen, initialData])

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleSubmit = () => {
    if (!name.trim() || !content.trim()) {
      alert(language === 'zh' ? '名称和内容是必填项。' : 'Name and content are required.')
      return
    }

    const itemToSave: KnowledgeBaseCreateUpdate = {
      name: name.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      tags: tags,
      category: category,
      is_active: isActive,
    }
    onSave(itemToSave)
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '10px',
          boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
          {initialData
            ? language === 'zh'
              ? '编辑知识库条目'
              : 'Edit Knowledge Base Item'
            : language === 'zh'
            ? '新增知识库条目'
            : 'Add New Knowledge Base Item'}
        </h2>

        <div>
          <label htmlFor="itemName" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
            {language === 'zh' ? '名称/标题' : 'Name/Title'} <span style={{ color: 'red' }}>*</span>
          </label>
          <input
            type="text"
            id="itemName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 15px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder={language === 'zh' ? '输入名称或标题' : 'Enter name or title'}
          />
        </div>

        <div>
          <label htmlFor="itemDescription" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
            {language === 'zh' ? '描述/摘要 (可选)' : 'Description/Summary (Optional)'}
          </label>
          <textarea
            id="itemDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '10px 15px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder={language === 'zh' ? '输入描述或摘要' : 'Enter description or summary'}
          ></textarea>
        </div>

        <div>
          <label htmlFor="itemContent" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
            {language === 'zh' ? '内容' : 'Content'} <span style={{ color: 'red' }}>*</span>
          </label>
          <textarea
            id="itemContent"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            style={{
              width: '100%',
              padding: '10px 15px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder={language === 'zh' ? '输入详细内容' : 'Enter detailed content'}
          ></textarea>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
            {language === 'zh' ? '标签' : 'Tags'}
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: '#e2e8f0',
                  padding: '5px 10px',
                  borderRadius: '5px',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#c53030',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              style={{
                flex: 1,
                padding: '10px 15px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '16px',
              }}
              placeholder={language === 'zh' ? '输入标签并按 Enter' : 'Enter tag and press Enter'}
            />
            <button
              onClick={handleAddTag}
              style={{
                padding: '10px 15px',
                backgroundColor: '#4299e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              {language === 'zh' ? '添加' : 'Add'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
          <label htmlFor="isActive" style={{ fontSize: '16px', color: '#4a5568' }}>
            {language === 'zh' ? '激活' : 'Active'}
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#e2e8f0',
              color: '#4a5568',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4299e1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
