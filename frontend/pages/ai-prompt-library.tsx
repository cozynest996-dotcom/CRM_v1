import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import { useLanguage } from '../contexts/LanguageContext'
import api from '../utils/api'
import PromptFormModal, { Prompt } from '../components/PromptFormModal' // 导入 PromptFormModal 和 Prompt 接口

export default function AIPromptLibrary() {
  const { language } = useLanguage()
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showSaveNotification, setShowSaveNotification] = useState<string | null>(null)

  // 加载提示词库
  const fetchPrompts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/prompt-library')
      setPrompts(response || [])
    } catch (error) {
      console.error('Error fetching prompts:', error)
      setPrompts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrompts()
  }, [])

  // 创建新提示词
  const createPrompt = async (promptData: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await api.post('/api/prompt-library', promptData)
      await fetchPrompts() // 重新加载列表
      setShowCreateForm(false)
      setShowSaveNotification('提示词创建成功')
      setTimeout(() => setShowSaveNotification(null), 3000)
    } catch (error) {
      console.error('Error creating prompt:', error)
      alert('创建提示词失败')
    }
  }

  // 更新提示词
  const updatePrompt = async (id: string, promptData: Partial<Prompt>) => {
    try {
      await api.put(`/api/prompt-library/${id}`, promptData)
      await fetchPrompts() // 重新加载列表
      setEditingPrompt(null)
      setShowSaveNotification('提示词更新成功')
      setTimeout(() => setShowSaveNotification(null), 3000)
    } catch (error) {
      console.error('Error updating prompt:', error)
      alert('更新提示词失败')
    }
  }

  // 删除提示词
  const deletePrompt = async (id: string) => {
    if (!confirm('确定要删除这个提示词吗？')) return
    
    try {
      await api.delete(`/api/prompt-library/${id}`)
      await fetchPrompts() // 重新加载列表
    } catch (error) {
      console.error('Error deleting prompt:', error)
      alert('删除提示词失败')
    }
  }

  // 过滤提示词
  const filteredPrompts = prompts.filter(prompt =>
    prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <Sidebar currentPage="/ai-prompt-library" />
      
      {/* 主内容区域 */}
      <div style={{ 
        marginLeft: '70px', 
        flex: 1,
        transition: 'margin-left 0.3s ease',
        overflow: 'auto'
      }}>
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* 页面标题 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '30px',
          padding: '20px 0',
          borderBottom: '2px solid #f0f0f0'
        }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '600', color: '#2d3748' }}>
            {language === 'zh' ? 'AI 提示词库' : 'AI Prompt Library'}
          </h1>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}
          >
            + 新建提示词
          </button>
        </div>

        {/* 搜索框 */}
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder={language === 'zh' ? '搜索提示词...' : 'Search prompts...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              fontSize: '14px',
              background: 'rgba(255, 255, 255, 0.8)',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#667eea'
              e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        {/* 提示词列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            加载中...
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            {searchTerm ? '没有找到匹配的提示词' : '暂无提示词，点击上方按钮创建第一个提示词'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
            {filteredPrompts.map((prompt) => (
              <div
                key={prompt.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '20px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)'
                }}
              >
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#2d3748' }}>
                    {prompt.name}
                  </h3>
                  {prompt.description && (
                    <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: '1.5' }}>
                      {prompt.description}
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#667eea', marginBottom: '4px' }}>
                      System Prompt:
                    </div>
                    <div style={{
                      background: '#f8f9fa',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#495057',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {prompt.system_prompt.length > 100 
                        ? `${prompt.system_prompt.substring(0, 100)}...` 
                        : prompt.system_prompt || '(空)'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#667eea', marginBottom: '4px' }}>
                      User Prompt:
                    </div>
                    <div style={{
                      background: '#f8f9fa',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#495057',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {prompt.user_prompt.length > 100 
                        ? `${prompt.user_prompt.substring(0, 100)}...` 
                        : prompt.user_prompt || '(空)'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setEditingPrompt(prompt)}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => deletePrompt(prompt.id)}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreateForm || editingPrompt) && (
        <PromptFormModal
          prompt={editingPrompt}
          onSave={editingPrompt ? 
            (data) => updatePrompt(editingPrompt.id, data) : 
            (data) => createPrompt(data)
          }
          onCancel={() => {
            setShowCreateForm(false)
            setEditingPrompt(null)
          }}
        />
      )}

      {/* 保存通知 */}
      {showSaveNotification && (
        <div style={{
          position: 'fixed',
          right: 20,
          bottom: 24,
          background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(2,6,23,0.2)',
          zIndex: 4000
        }}>
          {showSaveNotification}
        </div>
      )}
      </div>
    </div>
  )
}