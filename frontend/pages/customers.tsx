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
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <Sidebar currentPage="/customers" />
      
      {/* 主内容区域 */}
      <div style={{ 
        marginLeft: '70px', 
        flex: 1,
        transition: 'margin-left 0.3s ease'
      }}>
        {/* 顶部工具栏 - 保持原始尺寸，不改变布局宽度 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'white', borderBottom: '1px solid #eef2f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#243447' }}>客户管理</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>在此查看、筛选并管理客户</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
              <button onClick={() => setView('list')} className={`toolbar-button ${view === 'list' ? 'primary' : ''}`} style={{ padding: '6px 10px' }}>客户列表</button>
              <button onClick={() => setView('pipeline')} className={`toolbar-button ${view === 'pipeline' ? 'primary' : ''}`} style={{ padding: '6px 10px' }}>客户管道</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              placeholder="搜索姓名 / 电话 / 邮箱"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e6eef6', width: 260 }}
            />
            <button className="toolbar-button" style={{ padding: '8px 12px' }}>新建客户</button>
            <button className="toolbar-button" style={{ padding: '8px 12px' }}>导出</button>
          </div>
        </div>

        {/* 主内容: 保持原始 pipeline 全宽展示 */}
        <div style={{ padding: 12 }}>
          {view === 'list' ? (
            <CustomerList />
          ) : (
            <CustomerPipeline
              onCustomerMove={handleCustomerMove}
              onStageCreate={handleStageCreate}
              onStageUpdate={handleStageUpdate}
              onStageDelete={handleStageDelete}
            />
          )}
        </div>
      </div>
    </div>
  )
}
