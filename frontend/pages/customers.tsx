import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import CustomerPipeline from '../components/CustomerPipeline'
import CustomerList from '../components/CustomerList'

export default function CustomersPage() {
  const [view, setView] = useState<'list' | 'pipeline'>('list')
  // 处理客户移动到不同阶段
  const handleCustomerMove = (customerId: string, targetStageId: number) => {
    console.log(`Moving customer ${customerId} to stage ${targetStageId}`)
  }

  // 处理创建新阶段
  const handleStageCreate = (stageName: string) => {
    console.log(`Creating new stage: ${stageName}`)
  }

  // 处理更新阶段
  const handleStageUpdate = (stageId: number, data: any) => {
    console.log(`Updating stage ${stageId}:`, data)
  }

  // 处理删除阶段
  const handleStageDelete = (stageId: number) => {
    console.log(`Deleting stage ${stageId}`)
  }

  return (
    <>
      <style>{`
        .view-tab-button {
          padding: 10px 20px;
          border: none;
          background: transparent;
          color: #6b7280;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s ease;
          position: relative;
          white-space: nowrap;
        }
        .view-tab-button:hover {
          background: #f3f4f6;
          color: #374151;
        }
        .view-tab-button.active {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3), 0 2px 4px -1px rgba(59, 130, 246, 0.2);
        }
        .view-tab-button.active:hover {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.4), 0 2px 4px -1px rgba(59, 130, 246, 0.3);
        }
        .header-action-button {
          padding: 10px 16px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s ease;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .header-action-button:hover {
          background: #f9fafb;
          border-color: #d1d5db;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .header-action-button.primary {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border-color: #10b981;
        }
        .header-action-button.primary:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          border-color: #059669;
          box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
        }
        .header-search-input {
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s ease;
          min-width: 200px;
          background: #f9fafb;
        }
        .header-search-input:focus {
          outline: none;
          border-color: #3b82f6;
          background: white;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .header-search-input::placeholder {
          color: #9ca3af;
        }
      `}</style>
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
        <Sidebar currentPage="/customers" />
        
        {/* 主内容区域 */}
        <div style={{ 
          marginLeft: '70px', 
          flex: 1,
          transition: 'margin-left 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* 顶部工具栏 - 支持横向滚动 */}
          <div style={{ 
            background: 'white', 
            borderBottom: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            overflowX: 'auto',
            overflowY: 'hidden',
            flexShrink: 0
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '16px 20px',
              minWidth: 'fit-content',
              gap: 20
            }}>
              {/* Left Section - Title */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
                <div style={{ 
                  fontSize: 20, 
                  fontWeight: 700, 
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span style={{ fontSize: 24 }}>👥</span>
                  客户管理
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                  查看、筛选并管理客户
                </div>
              </div>
              
              {/* Center Section - View Toggle Buttons */}
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                padding: '4px',
                background: '#f3f4f6',
                borderRadius: 10,
                minWidth: 'fit-content'
              }}>
                <button 
                  onClick={() => setView('list')} 
                  className={`view-tab-button ${view === 'list' ? 'active' : ''}`}
                >
                  📋 客户列表
                </button>
                <button 
                  onClick={() => setView('pipeline')} 
                  className={`view-tab-button ${view === 'pipeline' ? 'active' : ''}`}
                >
                  🔄 客户管道
                </button>
              </div>

              {/* Right Section - Empty for balance */}
              <div style={{ minWidth: 120 }}></div>
            </div>
          </div>

          {/* 主内容: 可滚动区域 */}
          <div style={{ 
            flex: 1,
            overflow: 'auto',
            background: '#f9fafb'
          }}>
            {view === 'list' ? (
              <CustomerList />
            ) : (
              <div style={{ padding: 12 }}>
                <CustomerPipeline
                  onCustomerMove={handleCustomerMove}
                  onStageCreate={handleStageCreate}
                  onStageUpdate={handleStageUpdate}
                  onStageDelete={handleStageDelete}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
