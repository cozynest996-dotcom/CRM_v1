import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import MessageNotifications from '../components/MessageNotifications'
import WorkflowService from '../services/WorkflowService'
import MessageEventService, { WhatsAppMessage } from '../services/MessageEventService'
import { useWhatsAppAutoConnect } from '../hooks/useWhatsAppAutoConnect'
import WhatsAppSetupGuide from '../components/WhatsAppSetupGuide'
import { useAuth } from '../hooks/useAuth'
import { formatRelativeTime, formatFullDateTime } from '../utils/dateFormat'

interface AutomationStats {
  total_executions: number
  successful_executions: number
  failed_executions: number
  success_rate: number
  avg_execution_time_ms?: number
  executions_today: number
}

interface AutomationLog {
  id: number
  workflow_id: number
  workflow_name: string
  status: string
  triggered_by: string
  started_at: string
  completed_at?: string
  duration_ms?: number
  error_message?: string
  trigger_data?: any
}

export default function DashboardPage() {
  const { user, token } = useAuth()
  const [activeWorkflows, setActiveWorkflows] = useState<any[]>([])
  const [recentExecutions, setRecentExecutions] = useState<any[]>([])
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([])
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null)
  const [stats, setStats] = useState({
    totalMessages: 0,
    activeWorkflows: 0,
    successRate: 0,
    automatedResponses: 0
  })

  // 🚀 自動連接 WhatsApp
  const { isConnecting, connectionStatus, error } = useWhatsAppAutoConnect()
  const [showSetupGuide, setShowSetupGuide] = useState(false)

  // 檢查是否需要顯示設置引導
  useEffect(() => {
    if (connectionStatus === 'error' && error?.includes('QR')) {
      // 檢查是否是首次用戶（可以根據 localStorage 判斷）
      const hasShownGuide = localStorage.getItem('whatsapp_setup_guide_shown')
      if (!hasShownGuide) {
        setShowSetupGuide(true)
        localStorage.setItem('whatsapp_setup_guide_shown', 'true')
      }
    }
  }, [connectionStatus, error])

  // 獲取自動化統計數據
  const fetchAutomationStats = async () => {
    if (!token) return
    
    try {
      const response = await fetch('http://localhost:8000/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAutomationStats(data.automation_stats)
      }
    } catch (error) {
      console.error('Failed to fetch automation stats:', error)
    }
  }

  // 獲取自動化日誌
  const fetchAutomationLogs = async () => {
    if (!token) return
    
    try {
      const response = await fetch('http://localhost:8000/api/dashboard/automation/logs?limit=10', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const logs = await response.json()
        setAutomationLogs(logs)
      }
    } catch (error) {
      console.error('Failed to fetch automation logs:', error)
    }
  }

  useEffect(() => {
    const workflowService = WorkflowService.getInstance()
    const messageService = MessageEventService.getInstance()

    // 加载活动的工作流
    const loadActiveWorkflows = async () => {
      const workflows = workflowService.getActiveWorkflows()
      setActiveWorkflows(workflows)
      setStats(prev => ({ ...prev, activeWorkflows: workflows.length }))
    }

    // 加载最近的执行记录
    const loadRecentExecutions = () => {
      const executions = workflowService.getRecentExecutions()
      setRecentExecutions(executions)
    }

    // 订阅新消息
    const unsubscribeMessage = messageService.onNewMessage((message: WhatsAppMessage) => {
      setStats(prev => ({
        ...prev,
        totalMessages: prev.totalMessages + 1
      }))
      loadRecentExecutions()
    })

    // 订阅工作流触发
    const unsubscribeWorkflow = messageService.onTriggerWorkflow(async (message: WhatsAppMessage) => {
      const workflows = workflowService.getActiveWorkflows()
      for (const workflow of workflows) {
        try {
          await workflowService.executeWorkflow(workflow.id, message)
          setStats(prev => ({
            ...prev,
            automatedResponses: prev.automatedResponses + 1
          }))
        } catch (error) {
          console.error('Workflow execution failed:', error)
        }
      }
      loadRecentExecutions()
    })

    loadActiveWorkflows()
    loadRecentExecutions()
    
    // 獲取自動化數據
    fetchAutomationStats()
    fetchAutomationLogs()

    return () => {
      unsubscribeMessage()
      unsubscribeWorkflow()
    }
  }, [token])

  // 自動刷新自動化數據
  useEffect(() => {
    if (!token) return
    
    const interval = setInterval(() => {
      fetchAutomationStats()
      fetchAutomationLogs()
    }, 30000) // 每30秒刷新一次
    
    return () => clearInterval(interval)
  }, [token])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f7fafc' }}>
      <Sidebar currentPage="/dashboard" />
      
      <div style={{ flex: 1, marginLeft: '70px', padding: '30px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* 标题 */}
          <div style={{ marginBottom: '30px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
              📊 Dashboard
            </h1>
            <p style={{ color: '#718096', marginTop: '8px', fontSize: '16px' }}>
              实时监控和自动化状态
            </p>
          </div>

          {/* WhatsApp 連接狀態 */}
          {(isConnecting || connectionStatus === 'error') && (
            <div style={{
              backgroundColor: connectionStatus === 'error' ? '#fed7d7' : '#bee3f8',
              border: `1px solid ${connectionStatus === 'error' ? '#fc8181' : '#63b3ed'}`,
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {isConnecting ? (
                <>
                  <div>🔄</div>
                  <div>
                    <strong>正在連接 WhatsApp...</strong>
                    <div style={{ fontSize: '14px', color: '#4a5568' }}>
                      系統正在自動初始化您的 WhatsApp 連接
                    </div>
                  </div>
                </>
              ) : connectionStatus === 'error' ? (
                <>
                  <div>⚠️</div>
                  <div>
                    <strong>WhatsApp 連接需要設置</strong>
                    <div style={{ fontSize: '14px', color: '#4a5568' }}>
                      {error || '請前往設置頁面掃描 QR 碼完成連接'}
                    </div>
                  </div>
                  <a 
                    href="/settings" 
                    style={{
                      marginLeft: 'auto',
                      padding: '8px 16px',
                      backgroundColor: '#3182ce',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    前往設置
                  </a>
                </>
              ) : null}
            </div>
          )}

          {/* 统计卡片 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            <StatCard
              title="今日執行"
              value={automationStats?.executions_today || 0}
              icon="📅"
              color="#4299e1"
              subtitle="今天觸發的工作流"
            />
            <StatCard
              title="總執行次數"
              value={automationStats?.total_executions || 0}
              icon="⚡"
              color="#48bb78"
              subtitle="累計執行次數"
            />
            <StatCard
              title="成功率"
              value={`${automationStats?.success_rate || 0}%`}
              icon="✅"
              color="#38a169"
              subtitle={`${automationStats?.successful_executions || 0}/${automationStats?.total_executions || 0} 成功`}
            />
            <StatCard
              title="平均響應時間"
              value={automationStats?.avg_execution_time_ms ? `${Math.round(automationStats.avg_execution_time_ms)}ms` : 'N/A'}
              icon="⚡"
              color="#805ad5"
              subtitle="自動化處理速度"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
            {/* 自動化執行日誌 */}
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', color: '#2d3748', margin: 0 }}>
                  🤖 自動化執行日誌
                </h2>
                <button 
                  onClick={() => { fetchAutomationLogs(); fetchAutomationStats(); }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f7fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🔄 刷新
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {automationLogs.length > 0 ? automationLogs.map((log) => (
                  <div key={log.id} style={{
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: log.status === 'completed' ? '#f0fff4' : 
                                   log.status === 'failed' ? '#fef2f2' : '#f8fafc'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 500, color: '#2d3748', fontSize: '14px' }}>
                        {log.workflow_name}
                      </span>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: log.status === 'completed' ? '#c6f6d5' : 
                                       log.status === 'failed' ? '#fed7d7' : '#e2e8f0',
                        color: log.status === 'completed' ? '#2f855a' : 
                               log.status === 'failed' ? '#c53030' : '#4a5568',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 500
                      }}>
                        {log.status === 'completed' ? '✅ 成功' : 
                         log.status === 'failed' ? '❌ 失敗' : '⏳ 執行中'}
                      </span>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>
                      觸發方式: {log.triggered_by === 'message' ? '📱 消息觸發' : log.triggered_by}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a0aec0' }}>
                      <span>{formatFullDateTime(log.started_at)}</span>
                      {log.duration_ms && (
                        <span>{log.duration_ms}ms</span>
                      )}
                    </div>
                    
                    {log.error_message && (
                      <div style={{
                        marginTop: '6px',
                        padding: '6px',
                        backgroundColor: '#fed7d7',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#c53030'
                      }}>
                        錯誤: {log.error_message}
                      </div>
                    )}
                    
                    {log.trigger_data?.phone && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#718096' }}>
                        來源: {log.trigger_data.name || 'Unknown'} ({log.trigger_data.phone})
                      </div>
                    )}
                  </div>
                )) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px', 
                    color: '#718096',
                    fontSize: '14px' 
                  }}>
                    🔍 暫無自動化執行記錄
                  </div>
                )}
              </div>
            </div>

            {/* 消息通知 */}
            <MessageNotifications />
          </div>
        </div>
      </div>

      {/* WhatsApp 設置引導 */}
      {showSetupGuide && (
        <WhatsAppSetupGuide 
          onDismiss={() => setShowSetupGuide(false)}
          isFirstTime={true}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color, subtitle }: { 
  title: string, 
  value: number | string, 
  icon: string, 
  color: string,
  subtitle?: string 
}) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '24px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: `${color}10`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px'
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', color: '#718096' }}>{title}</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>{value}</div>
          {subtitle && (
            <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '2px' }}>{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  )
}