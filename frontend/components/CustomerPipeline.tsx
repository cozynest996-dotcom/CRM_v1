import React, { useState, useEffect, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'

// 定义所有可能的客户字段及其用户友好的标签
const ALL_CUSTOMER_FIELDS = [
  { key: 'name', label: '姓名' },
  { key: 'phone', label: '电话' },
  { key: 'email', label: '邮箱' },
  { key: 'budget', label: '预算' }, // Note: budget_min/max combined for display
  { key: 'preferred_location', label: '偏好地点' },
  { key: 'last_message', label: '最后消息' },
  // 可以根据需要添加更多自定义字段
]

// 数据类型定义
interface CustomerStage {
  id: number
  name: string
  description: string
  color: string
  order_index: number
  is_default: boolean
  customer_count: number
  card_display_fields: string[] // Add this field
  created_at: string
  updated_at: string
}

interface PipelineCustomer {
  id: string
  name: string
  phone: string
  email?: string
  budget_min?: number
  budget_max?: number
  preferred_location?: string
  last_message?: string
  last_timestamp?: string
  unread_count: number
  photo_url?: string
  stage_id?: number
  updated_at: string
}

interface PipelineData {
  stages: CustomerStage[]
  customers_by_stage: { [stageId: string]: PipelineCustomer[] }
}

interface CustomerPipelineProps {
  onCustomerMove?: (customerId: string, targetStageId: number) => void
  onStageCreate?: (stageName: string) => void
  onStageUpdate?: (stageId: number, data: any) => void
  onStageDelete?: (stageId: number) => void
}

const CustomerCard = ({ customer, index, stageCardDisplayFields }: { customer: PipelineCustomer; index: number; stageCardDisplayFields: string[] }) => {
  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return '预算未知'
    if (min && max) return `RM ${min.toLocaleString()}-${max.toLocaleString()}`
    if (min) return `RM ${min.toLocaleString()}+`
    if (max) return `< RM ${max.toLocaleString()}`
    return '预算未知'
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  return (
    <Draggable draggableId={customer.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            marginBottom: '8px',
            padding: '12px',
            backgroundColor: snapshot.isDragging ? '#f7fafc' : 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: snapshot.isDragging ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
            cursor: 'grab',
            transition: 'all 0.2s ease',
            transform: snapshot.isDragging ? 'rotate(5deg)' : 'none',
            zIndex: snapshot.isDragging ? 9999 : 'auto', // Ensure card is on top when dragging
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* 头像 */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: customer.photo_url ? 'transparent' : '#4299e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
              flexShrink: 0,
              backgroundImage: customer.photo_url ? `url(${customer.photo_url})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
              {!customer.photo_url && (customer.name || customer.phone).charAt(0).toUpperCase()}
            </div>

            {/* 客户信息 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {stageCardDisplayFields.includes("name") && (
                <div style={{
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#2d3748',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {customer.name || customer.phone}
                </div>
              )}

              {stageCardDisplayFields.includes("phone") && (
                <div style={{
                  fontSize: '12px',
                  color: '#718096',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  📱 {customer.phone}
                  {customer.unread_count > 0 && (
                    <span style={{
                      backgroundColor: '#e53e3e',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}>
                      {customer.unread_count}
                    </span>
                  )}
                </div>
              )}

              {stageCardDisplayFields.includes("email") && customer.email && (
                <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>
                  📧 {customer.email}
                </div>
              )}

              {stageCardDisplayFields.includes("budget") && (customer.budget_min || customer.budget_max) && (
                <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '4px' }}>
                  💰 {formatBudget(customer.budget_min, customer.budget_max)}
                </div>
              )}

              {stageCardDisplayFields.includes("preferred_location") && customer.preferred_location && (
                <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '4px' }}>
                  📍 {customer.preferred_location}
                </div>
              )}

              {stageCardDisplayFields.includes("last_message") && customer.last_message && (
                <div style={{
                  fontSize: '11px',
                  color: '#a0aec0',
                  fontStyle: 'italic',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '200px'
                }}>
                  "{customer.last_message}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}

interface StageColumnProps {
  stage: CustomerStage
  customers: PipelineCustomer[]
  onStageUpdate?: (stageId: number, data: any) => void
  onStageDelete?: (stageId: number) => void
}

const StageColumn = ({ 
  stage, 
  customers, 
  onStageUpdate, 
  onStageDelete 
}: StageColumnProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [stageName, setStageName] = useState(stage.name)

  const handleSaveEdit = () => {
    if (stageName !== stage.name) {
      onStageUpdate?.(stage.id, { name: stageName })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setStageName(stage.name)
      setIsEditing(false)
    }
  }

  return (
    <div style={{
      width: '280px',
      backgroundColor: '#f7fafc',
      borderRadius: '12px',
      padding: '16px',
      margin: '0 8px',
      border: '2px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: 'calc(100vh - 200px)', // Give it a max height, adjust as needed
    }}>
      {/* 阶段标题 */}
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          {isEditing ? (
            <input
              type="text"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                backgroundColor: 'white',
                border: '2px solid #4299e1',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '16px',
                fontWeight: '600',
                flex: 1
              }}
            />
          ) : (
            <h3 
              style={{ 
                margin: 0, 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#2d3748',
                cursor: 'pointer',
                flex: 1,
                padding: '4px 0'
              }}
              onClick={() => setIsEditing(true)}
            >
              {stage.name}
            </h3>
          )}
          
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            <button
              onClick={() => setIsEditing(true)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                color: '#718096'
              }}
              title="编辑阶段"
            >
              ✏️
            </button>
            <button
              onClick={() => onStageDelete?.(stage.id)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                color: '#e53e3e'
              }}
              title="删除阶段"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* 阶段统计 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: stage.color
          }} />
          <span style={{ fontSize: '14px', color: '#718096' }}>
            {customers.length} 个客户
          </span>
          {stage.is_default && (
            <span style={{
              backgroundColor: '#4299e1',
              color: 'white',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              默认
            </span>
          )}
        </div>

        {stage.description && (
          <p style={{ 
            fontSize: '12px', 
            color: '#a0aec0',
            margin: '8px 0 0 0',
            fontStyle: 'italic'
          }}>
            {stage.description}
          </p>
        )}
      </div>

      {/* 客户列表 */}
      <Droppable droppableId={stage.id.toString()}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              minHeight: '200px',
              backgroundColor: snapshot.isDraggingOver ? '#e2e8f0' : 'transparent',
              borderRadius: '8px',
              padding: '8px',
              transition: 'background-color 0.2s ease',
              overflowY: 'auto', // Allow vertical scrolling if content overflows
            }}
          >
            {customers.map((customer, index) => (
              <CustomerCard key={customer.id} customer={customer} index={index} stageCardDisplayFields={stage.card_display_fields} />
            ))}
            {provided.placeholder}
            
            {customers.length === 0 && (
              <div style={{
                textAlign: 'center',
                color: '#a0aec0',
                fontSize: '14px',
                padding: '40px 20px',
                fontStyle: 'italic',
                flex: 1, // Allow this to grow
              }}>
                暂无客户
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}

export default function CustomerPipeline({ 
  onCustomerMove,
  onStageCreate,
  onStageUpdate,
  onStageDelete
}: CustomerPipelineProps) {
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newStageName, setNewStageName] = useState('')
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [newStageCardDisplayFields, setNewStageCardDisplayFields] = useState<string[]>(['name', 'phone', 'email'])

  // 加载 pipeline 数据
  const loadPipelineData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/pipeline/`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load pipeline data')
      }
      
      const data = await response.json()
      setPipelineData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPipelineData()
  }, [loadPipelineData])

  // 处理客户拖拽
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !pipelineData) return
    
    const { source, destination, draggableId } = result
    
    // 如果拖到同一位置，不做任何操作
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return
    }

    const sourceStageId = source.droppableId
    const destStageId = destination.droppableId
    const customerId = draggableId

    try {
      // 调用 API 移动客户
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/pipeline/move-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          customer_id: customerId,
          target_stage_id: parseInt(destStageId)
        })
      })

      if (!response.ok) {
        throw new Error('Failed to move customer')
      }

      // 本地更新状态
      const newCustomersByStage = { ...pipelineData.customers_by_stage }
      
      // 从源阶段移除客户
      const sourceCustomers = [...newCustomersByStage[sourceStageId]]
      const [movedCustomer] = sourceCustomers.splice(source.index, 1)
      newCustomersByStage[sourceStageId] = sourceCustomers

      // 添加到目标阶段
      const destCustomers = [...(newCustomersByStage[destStageId] || [])]
      destCustomers.splice(destination.index, 0, { ...movedCustomer, stage_id: parseInt(destStageId) })
      newCustomersByStage[destStageId] = destCustomers

      setPipelineData({
        ...pipelineData,
        customers_by_stage: newCustomersByStage
      })

      onCustomerMove?.(customerId, parseInt(destStageId))
    } catch (err) {
      console.error('Failed to move customer:', err)
      // 可以添加错误提示
    }
  }

  // 创建新阶段
  const handleCreateStage = async () => {
    if (!newStageName.trim()) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/pipeline/stages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          name: newStageName,
          description: '',
          color: '#3B82F6',
          order_index: pipelineData?.stages.length || 0,
          card_display_fields: newStageCardDisplayFields,
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create stage')
      }

      const newStage = await response.json()
      
      if (pipelineData) {
        setPipelineData({
          ...pipelineData,
          stages: [...pipelineData.stages, newStage],
          customers_by_stage: {
            ...pipelineData.customers_by_stage,
            [newStage.id]: []
          }
        })
      }

      setNewStageName('')
      setShowNewStageForm(false)
      setNewStageCardDisplayFields(['name', 'phone', 'email']) // Reset to default
      onStageCreate?.(newStageName)
    } catch (err) {
      console.error('Failed to create stage:', err)
    }
  }

  // 删除阶段
  const handleDeleteStage = async (stageId: number) => {
    if (!confirm('确定要删除这个阶段吗？此操作不可撤销。')) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/pipeline/stages/${stageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete stage')
      }

      if (pipelineData) {
        const newStages = pipelineData.stages.filter(stage => stage.id !== stageId)
        const newCustomersByStage = { ...pipelineData.customers_by_stage }
        delete newCustomersByStage[stageId.toString()]

        setPipelineData({
          stages: newStages,
          customers_by_stage: newCustomersByStage
        })
      }

      onStageDelete?.(stageId)
    } catch (err) {
      console.error('Failed to delete stage:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        fontSize: '16px',
        color: '#718096'
      }}>
        加载中...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        fontSize: '16px',
        color: '#e53e3e'
      }}>
        错误: {error}
      </div>
    )
  }

  if (!pipelineData) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        fontSize: '16px',
        color: '#718096'
      }}>
        暂无数据
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 70px)', backgroundColor: '#f8fafc', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#2d3748' }}>
          客户管道
        </h1>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          {!showNewStageForm ? (
            <button
              onClick={() => setShowNewStageForm(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4299e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              + 添加阶段
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="阶段名称"
                autoFocus
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateStage()
                  if (e.key === 'Escape') {
                    setShowNewStageForm(false)
                    setNewStageName('')
                  }
                }}
              />
              
              <button
                onClick={handleCreateStage}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#48bb78',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                保存
              </button>
              <button
                onClick={() => {
                  setShowNewStageForm(false)
                  setNewStageName('')
                }}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                取消
              </button>
            </div>
          )}
          
          <button
            onClick={loadPipelineData}
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
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 选择显示字段模态框 */}
      {/* This modal is no longer needed as field selection is removed */}

      {/* Pipeline 看板 */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ 
          display: 'flex', 
          overflowX: 'auto', // Keep horizontal scroll for stages
          flex: 1, // Allow it to take up remaining vertical space
          paddingBottom: '20px',
          gap: '0'
        }}>
          {pipelineData.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              customers={pipelineData.customers_by_stage[stage.id.toString()] || []}
              onStageUpdate={onStageUpdate}
              onStageDelete={handleDeleteStage}
            />
          ))}
          
          {/* 无阶段客户 */}
          {pipelineData.customers_by_stage['null']?.length > 0 && (
            <StageColumn
              stage={{
                id: 0,
                name: '未分配',
                description: '尚未分配到具体阶段的客户',
                color: '#a0aec0',
                order_index: 999,
                is_default: false,
                customer_count: pipelineData.customers_by_stage['null'].length,
                created_at: '',
                updated_at: '',
                card_display_fields: [] // Assuming no specific fields for 'null' stage
              }}
              customers={pipelineData.customers_by_stage['null']}
              onStageUpdate={onStageUpdate}
              onStageDelete={() => {}}
            />
          )}
        </div>
      </DragDropContext>
    </div>
  )
}
