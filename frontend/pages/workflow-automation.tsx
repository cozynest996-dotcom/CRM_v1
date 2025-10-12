import React, { useState } from 'react'
import Head from 'next/head'
import WorkflowEditor from '../components/WorkflowEditor'
import CustomerPipeline from '../components/CustomerPipeline'
import CustomerList from '../components/CustomerList'

type ViewMode = 'pipeline' | 'workflow' | 'split'

/**
 * WorkflowAutomation 页面
 *
 * 职责:
 * - 提供工作流管理总览（管道 / 工作流 / 分屏视图）并集成 WorkflowEditor 组件。
 * - 提供初始化阶段与创建 MVP 模板等快捷操作。
 *
 * 注意: 本页示例中 fetch 请求使用 localStorage.getItem('token') 获取 token，而 `WorkflowEditor` 使用 'auth_token'。
 * 为避免认证失败，建议统一使用 `auth_token` 作为前端存取 JWT 的 key。
 */
export default function WorkflowAutomation() {
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false)

  const handleSaveWorkflow = async (workflow: any) => {
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: workflow.name || '新工作流',
          description: workflow.description || '自动生成的工作流',
          nodes: workflow.nodes,
          edges: workflow.edges,
          is_active: false
        })
      })

      if (response.ok) {
        alert('工作流保存成功！')
        setShowWorkflowEditor(false)
      } else {
        alert('保存失败，请重试')
      }
    } catch (error) {
      console.error('Failed to save workflow:', error)
      alert('保存失败，请重试')
    }
  }

  const handleCreateMVPWorkflow = async () => {
    try {
      const response = await fetch('/api/workflows/create-mvp-template', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        alert(`MVP 模板工作流创建成功！工作流 ID: ${result.workflow_id}`)
      } else {
        alert('创建失败，请重试')
      }
    } catch (error) {
      console.error('Failed to create MVP workflow:', error)
      alert('创建失败，请重试')
    }
  }

  const handleInitializeStages = async () => {
    try {
      const response = await fetch('/api/pipeline/initialize-default-stages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        alert('默认阶段初始化成功！')
        window.location.reload() // 刷新页面以显示新阶段
      } else {
        const errorData = await response.json()
        alert(errorData.detail || '初始化失败')
      }
    } catch (error) {
      console.error('Failed to initialize stages:', error)
      alert('初始化失败，请重试')
    }
  }

  return (
    <>
      <Head>
        <title>工作流自动化 - CRM 系统</title>
        <meta name="description" content="客户管道和工作流自动化管理" />
      </Head>

      {showWorkflowEditor ? (
        <WorkflowEditor
          onSave={handleSaveWorkflow}
          onClose={() => setShowWorkflowEditor(false)}
        />
      ) : (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* 顶部导航栏 */}
          <div style={{
            backgroundColor: '#1a202c',
            color: 'white',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                🚀 CRM 自动化系统
              </h1>
              
              {/* 视图模式切换 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setViewMode('pipeline')}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: viewMode === 'pipeline' ? '#4299e1' : 'transparent',
                    color: 'white',
                    border: '1px solid #4299e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  客户管道
                </button>
                <button
                  onClick={() => setViewMode('workflow')}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: viewMode === 'workflow' ? '#4299e1' : 'transparent',
                    color: 'white',
                    border: '1px solid #4299e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  工作流
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: viewMode === 'split' ? '#4299e1' : 'transparent',
                    color: 'white',
                    border: '1px solid #4299e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  分屏视图
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleInitializeStages}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#805ad5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                🏗️ 初始化默认阶段
              </button>
              
              <button
                onClick={handleCreateMVPWorkflow}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#38b2ac',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                🤖 创建 MVP 工作流
              </button>

              <button
                onClick={() => setShowWorkflowEditor(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#48bb78',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                ⚡ 工作流编辑器
              </button>

              <button
                onClick={() => window.location.href = '/chat'}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#25d366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                💬 返回聊天
              </button>
            </div>
          </div>

          {/* 主内容区域 */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* 顶部子菜单: 客户列表 | 客户管道 */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setViewMode('pipeline')} className={`toolbar-button ${viewMode === 'pipeline' ? 'primary' : ''}`}>客户管道</button>
                <button onClick={() => setViewMode('workflow')} className={`toolbar-button ${viewMode === 'workflow' ? 'primary' : ''}`}>工作流</button>
                <button onClick={() => setViewMode('split')} className={`toolbar-button ${viewMode === 'split' ? 'primary' : ''}`}>分屏</button>
              </div>
            </div>

            {viewMode === 'pipeline' && (
              <div style={{ width: '100%' }}>
                <CustomerPipeline />
              </div>
            )}

            {viewMode === 'workflow' && (
              <div style={{ width: '100%' }}>
                <WorkflowEditor
                  onSave={handleSaveWorkflow}
                  onClose={() => setViewMode('split')}
                />
              </div>
            )}

            {viewMode === 'split' && (
              <>
                {/* 左侧：客户列表（新） */}
                <div style={{ 
                  width: '50%', 
                  borderRight: '2px solid #e2e8f0',
                  overflow: 'hidden'
                }}>
                  <CustomerList />
                </div>

                {/* 右侧：工作流概览 */}
                <div style={{ 
                  width: '50%', 
                  backgroundColor: '#f8fafc',
                  padding: '20px',
                  overflow: 'auto'
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h2 style={{ 
                      margin: '0 0 16px 0', 
                      fontSize: '20px', 
                      fontWeight: '600', 
                      color: '#2d3748' 
                    }}>
                      工作流管理
                    </h2>
                    
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px',
                      marginBottom: '20px'
                    }}>
                      <button
                        onClick={() => setShowWorkflowEditor(true)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#4299e1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        ⚡ 打开工作流编辑器
                      </button>
                      
                      <button
                        onClick={handleCreateMVPWorkflow}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#805ad5',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        🚀 创建 MVP 模板
                      </button>
                    </div>
                  </div>

                  {/* 功能介绍卡片 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}>
                      <h3 style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: '#2d3748',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        🎯 客户管道功能
                      </h3>
                      <ul style={{ 
                        margin: 0, 
                        paddingLeft: '20px',
                        color: '#4a5568',
                        fontSize: '14px',
                        lineHeight: '1.6'
                      }}>
                        <li>拖拽客户在不同阶段间移动</li>
                        <li>自定义客户阶段和颜色</li>
                        <li>实时显示每个阶段的客户数量</li>
                        <li>客户详细信息卡片展示</li>
                        <li>支持批量操作和筛选</li>
                      </ul>
                    </div>

                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}>
                      <h3 style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: '#2d3748',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        ⚡ 工作流自动化
                      </h3>
                      <ul style={{ 
                        margin: 0, 
                        paddingLeft: '20px',
                        color: '#4a5568',
                        fontSize: '14px',
                        lineHeight: '1.6'
                      }}>
                        <li>消息触发自动回复</li>
                        <li>AI 智能分析客户意图</li>
                        <li>自动更新客户信息</li>
                        <li>工作时间控制和延迟发送</li>
                        <li>合规检查和模板回复</li>
                      </ul>
                    </div>

                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}>
                      <h3 style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: '#2d3748',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        🤖 MVP 架构节点
                      </h3>
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                        fontSize: '12px'
                      }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#667eea', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          📱 消息触发
                        </span>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#9f7aea', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          🤖 AI分析
                        </span>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#38b2ac', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          💾 更新DB
                        </span>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#f6ad55', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          ⏰ 延迟控制
                        </span>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#25d366', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          💬 发送消息
                        </span>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: '#e53e3e', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          🛡️ 合规检查
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
