import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  MarkerType,
  ConnectionMode,
  Panel,
  Handle,
  Position,
} from 'reactflow'
// 样式已在 _app.tsx 中全局导入
import NodeConfig from './NodeConfig'
import TriggerSelector from './TriggerSelector'
import api from '../utils/api'
import { useRouter } from 'next/router'
import MessageEventService from '../services/MessageEventService'
import NodeSelector from './NodeSelector'

// 基础节点样式
const nodeBaseStyle = {
  padding: '16px',
  borderRadius: '6px',
  minWidth: '200px',
  backgroundColor: 'white',
  border: '1px solid #e2e8f0',
  color: '#2d3748',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  fontFamily: 'system-ui, -apple-system, sans-serif'
}

// 节点状态样式
const getStatusStyle = (isActive: boolean, isSelected: boolean) => ({
  position: 'absolute' as const,
  top: '-6px',
  left: '-6px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  border: '2px solid white',
  backgroundColor: isActive ? '#48bb78' : isSelected ? '#4299e1' : '#a0aec0',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  transition: 'all 0.2s ease'
})

// 导入节点组件
import {
  TriggerNode,
  TimeTriggerNode,
  StatusTriggerNode,
  AINode,
  HandoffNode,
  UpdateDBNode,
  ConditionNode,
  GuardNode,
  DelayNode,
  SendMessageNode,
  TemplateNode,
  CustomAPINode
} from './WorkflowNodes'

// 导入节点配置
import { nodeConfigs } from './NodeConfigs'

// nodeTypes is memoized inside the component to keep stable reference across renders

// 默认边样式
const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#64748b', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#64748b',
  },
}

interface WorkflowEditorProps {
  workflow?: any
  onSave?: (workflow: any) => void
  onClose?: () => void
}

/**
 * WorkflowEditor
 *
 * 组件职责:
 * - 提供图形化的工作流编辑器（基于 React Flow），允许添加/配置节点和连线。
 * - 支持自动保存（autoSave）、手动保存（保存草稿）与发布（发布工作流）。
 * - 在保存前清理不可序列化字段（cleanForSend），避免将 UI/函数/React 元素发送给后端。
 * - 提供本地测试执行入口（startTest / testNode），用于模拟节点运行并可视化执行状态。
 * - 依赖 `frontend/utils/api.ts` 进行 API 调用，并要求前端存有有效的 auth token。
 */
export default function WorkflowEditor({ workflow, onSave, onClose }: WorkflowEditorProps) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.nodes || [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges || [])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [showNodePanel, setShowNodePanel] = useState(false)
  const [showTriggerSelector, setShowTriggerSelector] = useState(false)
  const [showNodeSelector, setShowNodeSelector] = useState(false)
  const [isTestMode, setIsTestMode] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState(workflow?.name || '新工作流')
  const [workflowDescription, setWorkflowDescription] = useState(workflow?.description || '')
  const [isEditMode, setIsEditMode] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [isSaving, setIsSaving] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 清理不可序列化字段（移动到组件作用域，供多个保存点复用）
  const cleanForSend = useCallback((obj: any) => {
    return JSON.parse(JSON.stringify(obj, (k, v) => {
      if (typeof v === 'function') return undefined
      if (v && typeof v === 'object' && v.$$typeof) return undefined // React element
      if (k === 'statusIndicator' || k === 'statusText' || k === 'isActive') return undefined
      return v
    }))
  }, [])

  // 检查认证状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    setIsAuthenticated(!!token)
    
    if (!token) {
      console.warn('用户未登录，工作流保存功能将不可用')
    }
  }, [])

  // 自动保存功能
  const autoSave = useCallback(async () => {
    if (!workflow?.id || isSaving || !workflowName.trim()) {
      if (!workflow?.id) {
        console.log('自動保存跳過：工作流ID未獲取');
      }
      return;
    }
    
    setIsSaving(true);
    try {
      // 🔧 修復：清理 nodes 數據，移除循環引用
      const cleanNodes = nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        // 只保留必要的字段，移除任何可能的 DOM 引用
        ...(node.selected !== undefined && { selected: node.selected }),
        ...(node.dragging !== undefined && { dragging: node.dragging })
      }));

      // 使用组件级别 cleanForSend
      const workflowData = {
        name: workflowName,
        description: workflowDescription,
        nodes: cleanForSend(cleanNodes),
        edges: cleanForSend(edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle }))),
        is_active: workflow.is_active
      };
      
      const response = await api.put(`/api/workflows/${workflow.id}`, workflowData);
      // api utility returns the parsed JSON body directly; some callers expect axios-like { data }
      const workflowId = response?.id || response?.data?.id;
      if (workflowId) {
        console.log('工作流自动保存成功');
      } else {
        throw new Error('自动保存失败：未获取到工作流ID');
      }
    } catch (error) {
      console.error('工作流自动保存失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [workflow?.id, workflowName, workflowDescription, nodes, edges, isSaving, cleanForSend]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 监听变化并触发自动保存
  useEffect(() => {
    if (!workflow?.id || !isEditMode) return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器，延迟2秒后保存
    saveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [workflow?.id, isEditMode, nodes, edges, workflowName, workflowDescription, autoSave])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setShowNodePanel(true)
    // 點擊節點時進入編輯模式，允許配置和移動
    if (!isEditMode) {
      setIsEditMode(true)
    }
  }, [isEditMode])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setShowNodePanel(false)
  }, [])

  const handleAddTrigger = () => {
    setShowTriggerSelector(true)
  }

  const handleTriggerSelect = (type: string, config: any) => {
    // 根据触发器类型设置正确的节点类型
    const nodeTypeMap = {
      'message': 'MessageTrigger',
      'time': 'TimeTrigger', 
      'status': 'StatusTrigger'
    }
    
    const triggerLabels = {
      'message': '消息触发器',
      'time': '时间触发器',
      'status': '状态触发器'
    }
    
    const newNode = {
      id: `trigger_${Date.now()}`,
      type: nodeTypeMap[type] || 'MessageTrigger',
      position: { x: 100, y: 100 },
      data: {
        triggerType: type,
        config,
        label: triggerLabels[type] || `${type} 触发器`,
        description: config.description || '等待触发...'
      }
    }
    setNodes((nds) => [...nds, newNode])
    setShowTriggerSelector(false)
  }

  const addNode = (type: string) => {
    const nodeData: any = {
      id: `${type}_${Date.now()}`,
      type,
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: {}
    }

    switch (type) {
      case 'AI':
        nodeData.data = {
          label: 'AI 处理',
          description: '分析并生成回复',
          model: { name: 'gpt-4', temperature: 0.2, max_tokens: 900 },
          capabilities: { analyze: true, reply: true },
          handoff_threshold: 0.7 // 新增置信度阈值
        }
        break
      case 'UpdateDB':
        nodeData.data = {
          label: '更新数据',
          description: '保存到数据库',
          table: 'customers',
          match_key: 'phone',
          optimistic_lock: true,
          skip_if_equal: true,
          audit_log: true
        }
        break
      case 'GuardrailValidator':
        nodeData.data = {
          label: '合规检查',
          description: '内容合规检查',
          checks: {
            blocked_keywords: [],
            url_whitelist: []
          }
        }
        break
      case 'Delay':
        nodeData.data = {
          label: '延迟',
          description: '自动工作时段',
          policy: {
            mode: 'auto_window',
            work_hours: { start: '09:30', end: '21:30', tz: 'Asia/Kuala_Lumpur' },
            quiet_hours: { start: '22:00', end: '08:00' },
            max_per_day: 3,
            jitter_seconds: [3, 15]
          }
        }
        break
      case 'SendWhatsAppMessage':
        nodeData.data = {
          label: '发送消息',
          description: '发送WhatsApp消息',
          retries: { max: 3, backoff: [2, 5, 15] },
          dedupe: { window_minutes: 2, hash_on: ['to', 'message'] },
          circuit_breaker: { fail_threshold: 10, open_secs: 60 },
          audit_log: true
        }
        break
      case 'Template':
        nodeData.data = {
          label: '模板',
          description: '固定回复模板',
          template_type: 'text', // 'text' 或 'whatsapp'
          template: 'Hi! We received your message and will follow up shortly.',
          template_name: '', // WhatsApp 模板名称
          template_language: 'zh', // 模板语言
          variables: {},
          fallback_template: '抱歉，模板消息发送失败。我们会尽快联系您。'
        }
        break
      case 'Condition':
        nodeData.data = {
          label: '条件判断',
          description: 'Condition 条件节点',
          mode: 'visual',
          logic: "db.customer.stage == 'lead'",
          jsonlogic: ''
        }
        break
      case 'CustomAPI':
        nodeData.data = {
          label: '自定义API',
          description: '调用外部API',
          name: '新API调用',
          method: 'GET',
          url: 'https://api.example.com/data',
          headers: {},
          body: '',
          auth: { type: 'none' },
          timeout: 30,
          retry_count: 0,
          response_mapping: {}
        }
        break
    }

    setNodes((nds) => [...nds, nodeData])
  }

  const startTest = async () => {
    setIsTestMode(true)
    const startNode = nodes.find(node => node.type === 'MessageTrigger')
    if (startNode) {
      await testNode(startNode.id)
    }
  }

  const testNode = async (nodeId: string, context: any = {}) => {
    setActiveNodeId(nodeId)
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return null

    try {
      // 更新节点状态为活动
      setNodes(nds => nds.map(n => 
        n.id === nodeId ? { ...n, data: { ...n.data, isActive: true } } : n
      ))

      // 添加光效动画
      const nodeElement = document.querySelector(`[data-id="${nodeId}"]`)
      if (nodeElement) {
        nodeElement.classList.add('node-executing')
      }

      // 根据节点类型处理数据
      let result = { ...context }
      
      switch (node.type) {
        case 'MessageTrigger':
          if (node.data?.triggerType === 'message') {
            // 等待真实的WhatsApp消息
            result = await new Promise((resolve, reject) => {
              console.log('等待 WhatsApp 消息...')
              const messageService = MessageEventService.getInstance()
              let timeoutId: NodeJS.Timeout
              let unsubscribe: () => void

              const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId)
                if (unsubscribe) unsubscribe()
              }

              // 设置超时
              timeoutId = setTimeout(() => {
                cleanup()
                reject(new Error('等待消息超时'))
              }, 60000) // 增加到60秒

              // 订阅消息
              unsubscribe = messageService.onNewMessage((message) => {
                console.log('收到新消息:', message)
                if (message.type === 'incoming' && message.phone && message.message) {
                  cleanup()
                  resolve({
                    ...result,
                    trigger: {
                      type: 'message',
                      channel: 'whatsapp',
                      phone: message.phone,
                      message: message.message,
                      timestamp: message.timestamp
                    }
                  })
                }
              })

              // 显示等待状态
              setNodes(nds => nds.map(n => 
                n.id === nodeId ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'waiting',
                    statusText: '等待WhatsApp消息...'
                  }
                } : n
              ))
            })

            // 更新节点显示
            setNodes(nds => nds.map(n => 
              n.id === nodeId ? {
                ...n,
                data: { 
                  ...n.data,
                  config: { ...n.data.config, phone: result.trigger.phone },
                  status: 'received',
                  statusText: `收到消息: ${result.trigger.phone}`
                }
              } : n
            ))
          }
          break

        case 'AI':
          // 模拟AI处理
          await new Promise(resolve => setTimeout(resolve, 1500))
          const confidence = Math.random() * 0.4 + 0.6; // 模拟AI置信度在 0.6 到 1.0 之间
          result = {
            ...result,
            ai: {
              analyze: {
                updates: {
                  'Preferred Location': '市中心',
                  'Move-In Date': '2024-01',
                  'Custom:Interest': '高'
                },
                uncertain: ['Budget_Max'],
                reason: '客户提到预算2000-3000，但最高预算不确定',
                confidence: confidence // 添加置信度
              },
              reply: {
                reply_text: '您好！我已经了解到您的预算范围和期望。我们有多个符合您预算的房源，稍后会为您详细介绍。请问您对市中心哪个区域更感兴趣？',
                follow_ups: ['您期望的具体户型是？', '是否需要家具配套？']
              }
            }
          }

          // 根据AI置信度和handoff阈值决定走向
          const handoffThreshold = node.data.handoff_threshold ?? 0.6; // 默认阈值0.6
          const shouldHandoff = confidence <= handoffThreshold;
          
          // 更新节点数据以显示测试结果
          setNodes(nds => nds.map(n => 
            n.id === nodeId ? {
              ...n,
              data: {
                ...n.data,
                status: shouldHandoff ? 'handoff' : 'processed',
                statusText: shouldHandoff ? `置信度低 (${confidence.toFixed(2)})，转人工` : `处理完成 (${confidence.toFixed(2)})`
              }
            } : n
          ));

          // 根据 shouldHandoff 决定走哪个分支
          const nextEdges = edges.filter(edge => edge.source === nodeId);
          if (shouldHandoff) {
            // 走 true 分支 (Handoff)
            const handoffEdge = nextEdges.find(edge => edge.sourceHandle === 'true');
            if (handoffEdge) {
              await testNode(handoffEdge.target, result);
            }
          } else {
            // 走 false 分支 (继续)
            const continueEdge = nextEdges.find(edge => edge.sourceHandle === 'false');
            if (continueEdge) {
              await testNode(continueEdge.target, result);
            }
          }
          break;

        case 'UpdateDB':
          // 模拟数据库更新
          await new Promise(resolve => setTimeout(resolve, 800))
          result = {
            ...result,
            db: {
              table: node.data?.table || 'customers',
              match_key: node.data?.match_key || 'phone',
              updated: true,
              changes: Object.keys(result.ai?.analyze?.updates || {}).length
            }
          }
          break

        case 'GuardrailValidator':
          // 模拟合规检查
          await new Promise(resolve => setTimeout(resolve, 300))
          const text = result.ai?.reply?.reply_text || ''
          const hasBlockedKeywords = node.data.checks?.blocked_keywords?.some((kw: string) => text.includes(kw)) || false
          const hasInvalidUrls = text.match(/https?:\/\/[^\s]+/g)?.some((url: string) => 
            !node.data.checks?.url_whitelist?.some((wl: string) => url.startsWith(wl))
          ) || false
          
          result = {
            ...result,
            guard: {
              passed: !hasBlockedKeywords && !hasInvalidUrls,
              reason: hasBlockedKeywords ? '包含敏感词' : hasInvalidUrls ? '包含未授权URL' : '通过检查',
              details: {
                blocked_keywords: hasBlockedKeywords,
                invalid_urls: hasInvalidUrls
              }
            }
          }
          break

        case 'Delay':
          // 模拟延迟
          const delay = node.data.policy?.mode === 'auto_window'
            ? Math.floor(Math.random() * 12 + 3) // 3-15秒
            : (node.data.policy?.delay_minutes || 1) * 60
          
          await new Promise(resolve => setTimeout(resolve, delay * 1000))
          result = {
            ...result,
            delay: {
              mode: node.data.policy?.mode,
              actual_delay: delay,
              timestamp: new Date().toISOString()
            }
          }
          break

        case 'SendWhatsAppMessage':
          // 模拟消息发送
          await new Promise(resolve => setTimeout(resolve, 1000))
          result = {
            ...result,
            message: {
              sent: true,
              to: result.trigger?.phone,
              text: result.ai?.reply?.reply_text || node.data?.template || '',
              timestamp: new Date().toISOString(),
              message_id: `msg_${Date.now()}`
            }
          }
          break
          
        case 'Template':
          // 应用模板
          if (node.data?.template_type === 'whatsapp') {
            // 发送 WhatsApp 模板消息
            try {
              const response = await api.post('/api/whatsapp/send-template', {
                to: result.trigger?.phone,
                template: node.data?.template_name || '',
                language: node.data?.template_language || 'zh_CN',
                variables: Object.entries(node.data?.variables || {}).reduce((acc: any, [key, path]: [string, any]) => {
                  acc[key] = path.split('.').reduce((obj: any, key: string) => obj?.[key], result)
                  return acc
                }, {})
              })
              
              result = {
                ...result,
                template: {
                  type: 'whatsapp',
                  name: node.data?.template_name || '',
                  status: 'sent',
                  message_id: response.data.message_id
                }
              }
            } catch (error) {
              console.error('发送 WhatsApp 模板消息失败:', error)
              // 使用备用模板
              result = {
                ...result,
                template: {
                  type: 'whatsapp',
                  name: node.data?.template_name || '',
                  status: 'failed',
                  fallback: node.data?.fallback_template || ''
                }
              }
            }
          } else {
            // 普通文本模板
            result = {
              ...result,
              template: {
                type: 'text',
                original: node.data?.template || '',
                rendered: (node.data?.template || '').replace(/\{(\w+)\}/g, (match: string, key: string) => {
                  return result[key] || match
                })
              }
            }
          }
          break
      }

      // 获取下一个节点
      const outgoingEdges = edges.filter(edge => edge.source === nodeId)
      for (const edge of outgoingEdges) {
        await testNode(edge.target, result)
      }

      return result
    } finally {
      // 更新节点状态为非活动
      setNodes(nds => nds.map(n => 
        n.id === nodeId ? { ...n, data: { ...n.data, isActive: false } } : n
      ))
      setActiveNodeId(null)
    }
  }

  const stopTest = () => {
    setIsTestMode(false)
    setActiveNodeId(null)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
       <div style={{
         padding: '15px',
         borderBottom: '1px solid #e2e8f0',
         backgroundColor: 'white',
         display: 'flex',
         flexDirection: window.innerWidth < 1200 ? 'column' : 'row',
         gap: window.innerWidth < 1200 ? '15px' : '0',
         justifyContent: 'space-between',
         alignItems: window.innerWidth < 1200 ? 'stretch' : 'center'
       }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isEditMode ? (
            <>
               <div style={{ 
                display: 'flex',
                flexDirection: windowWidth < 900 ? 'column' : 'row',
                alignItems: windowWidth < 900 ? 'stretch' : 'center',
                gap: '12px',
                marginRight: windowWidth < 1200 ? '0' : '20px',
                width: windowWidth < 900 ? '100%' : 'auto'
              }}>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="工作流名称"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    width: windowWidth < 900 ? '100%' : '200px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
                <input
                  type="text"
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="工作流描述"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    width: windowWidth < 900 ? '100%' : '300px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={handleAddTrigger}
                  className="toolbar-button primary"
                >
                  + 添加触发器
                </button>
                <button
                  onClick={() => setShowNodeSelector(true)}
                  className="toolbar-button"
                >
                  + 添加节点
                </button>
                {!isAuthenticated && (
                  <span style={{ 
                    color: '#f56565', 
                    fontSize: '12px',
                    backgroundColor: '#fed7d7',
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}>
                    未登录，无法保存
                  </span>
                )}
              </div>
            </>
          ) : (
            <div style={{ 
              color: '#718096', 
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>点击"编辑"按钮开始编辑工作流</span>
              {!isTestMode && <span style={{ 
                backgroundColor: '#EDF2F7',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}>提示: 编辑模式下可以拖拽节点和添加连接</span>}
            </div>
          )}
          
          {/* 节点选择器对话框 */}
          {showNodeSelector && (
            <NodeSelector
              onSelect={addNode}
              onClose={() => setShowNodeSelector(false)}
            />
          )}
        </div>

         <div style={{ 
           display: 'flex', 
           gap: '10px',
           flexDirection: windowWidth < 900 ? 'column' : 'row',
           width: windowWidth < 900 ? '100%' : 'auto'
         }}>
          {/* 非编辑模式下只显示编辑和关闭按钮 */}
          {!isEditMode ? (
            <>
              <button
                onClick={() => setIsEditMode(true)}
                className="toolbar-button primary"
              >
                ✏️ 编辑
              </button>
              <button
                onClick={onClose}
                className="toolbar-button"
              >
                关闭
              </button>
            </>
          ) : (
            <>
              {/* 编辑模式下显示所有功能按钮 */}
              <button
                onClick={() => {
                  setIsEditMode(false)
                  setSelectedNode(null)
                  setShowNodePanel(false)
                }}
                className="toolbar-button active"
                style={{
                  backgroundColor: '#e2e8f0',
                  color: '#2d3748',
                  border: '1px solid #cbd5e0'
                }}
              >
                👁️ 退出编辑
              </button>
              {!isTestMode ? (
                <button
                  onClick={startTest}
                  className="toolbar-button success"
                >
                  ▶️ 测试流程
                </button>
              ) : (
                <button
                  onClick={stopTest}
                  className="toolbar-button danger"
                >
                  ⏹️ 停止测试
                </button>
              )}
              <button
                onClick={async () => {
                  if (!isAuthenticated) {
                    alert('请先登录后再保存工作流');
                    router.push('/login');
                    return;
                  }

                  if (!workflowName.trim()) {
                    alert('请输入工作流名称');
                    return;
                  }

                  // 🔧 修復：清理 nodes 數據，移除循環引用
                  const cleanNodes = nodes.map(node => ({
                    id: node.id,
                    type: node.type,
                    position: node.position,
                    data: node.data,
                    // 只保留必要的字段，移除任何可能的 DOM 引用
                    ...(node.selected !== undefined && { selected: node.selected }),
                    ...(node.dragging !== undefined && { dragging: node.dragging })
                  }));

                  const workflowData = {
                    name: workflowName,
                    description: workflowDescription,
                    nodes: cleanForSend(cleanNodes),
                    edges: cleanForSend(edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle }))),
                    is_active: false
                  };
                  
                  try {
                    console.log('保存工作流数据:', workflowData);
                    
                    // 检查认证状态
                    const token = localStorage.getItem('auth_token');
                    console.log('Token 状态:', token ? '存在' : '不存在');
                    
                    let response;
                    if (workflow?.id) {
                      console.log('更新现有工作流:', workflow.id);
                      response = await api.put(`/api/workflows/${workflow.id}`, workflowData);
                    } else {
                      console.log('创建新工作流');
                      response = await api.post('/api/workflows', workflowData);
                    }
                    
                    console.log('API 响应:', response);
                    console.log('API 响应类型:', typeof response);
                    
                    if (response) {
                      console.log('保存成功，调用父组件的保存回调');
                      // 如果有 onSave 回调，调用它而不是直接跳转
                      if (onSave) {
                        onSave(response);
                      } else {
                        // 没有回调则跳转
                        setTimeout(() => {
                          router.push('/automation');
                        }, 100);
                      }
                    } else {
                      throw new Error('保存失败：API 响应为空');
                    }
                  } catch (error: any) {
                    console.error('保存工作流失败:', error);
                    console.error('错误详情:', error?.response?.data);
                    
                    if (error?.message === 'Unauthorized') {
                      alert('登录已过期，请重新登录');
                      router.push('/login');
                      return;
                    }
                    
                    const errorMessage = error?.response?.data?.detail || error?.message || '保存失败，请重试';
                    alert(`保存失败: ${errorMessage}`);
                  }
                }}
                className="toolbar-button"
                disabled={!isAuthenticated}
                style={{ opacity: !isAuthenticated ? 0.5 : 1 }}
              >
                💾 保存草稿
              </button>
              <button
                onClick={async () => {
                  if (!isAuthenticated) {
                    alert('请先登录后再发布工作流');
                    router.push('/login');
                    return;
                  }

                  if (!workflowName.trim()) {
                    alert('请输入工作流名称');
                    return;
                  }

                  if (nodes.length === 0) {
                    alert('请至少添加一个节点');
                    return;
                  }

                  // 清理節點數據，移除循環引用
                  const cleanNodes = nodes.map(node => ({
                    id: node.id,
                    type: node.type,
                    position: node.position,
                    data: node.data,
                    // 只保留必要的字段，移除任何可能的 DOM 引用
                    ...(node.selected !== undefined && { selected: node.selected }),
                    ...(node.dragging !== undefined && { dragging: node.dragging })
                  }));

                  const workflowData = {
                    name: workflowName,
                    description: workflowDescription,
                    nodes: cleanForSend(cleanNodes),
                    edges: cleanForSend(edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle }))),
                    is_active: true
                  };
                  
                  try {
                    console.log('发布工作流数据:', workflowData);
                    
                    let response;
                    if (workflow?.id) {
                      console.log('更新现有工作流为发布状态:', workflow.id);
                      response = await api.put(`/api/workflows/${workflow.id}`, workflowData);
                    } else {
                      console.log('创建并发布新工作流');
                      response = await api.post('/api/workflows', workflowData);
                    }
                    
                    console.log('发布 API 响应:', response);
                    
                    if (response) {
                      console.log('发布成功，调用父组件的保存回调');
                      // 如果有 onSave 回调，调用它而不是直接跳转
                      if (onSave) {
                        onSave(response);
                      } else {
                        // 没有回调则跳转
                        setTimeout(() => {
                          router.push('/automation');
                        }, 100);
                      }
                    } else {
                      throw new Error('发布失败：API 响应为空');
                    }
                  } catch (error: any) {
                    console.error('发布工作流失败:', error);
                    
                    if (error?.message === 'Unauthorized') {
                      alert('登录已过期，请重新登录');
                      router.push('/login');
                      return;
                    }
                    
                    const errorMessage = error?.response?.data?.detail || error?.message || '发布失败，请重试';
                    alert(`发布失败: ${errorMessage}`);
                  }
                }}
                className="toolbar-button primary"
                disabled={!isAuthenticated}
                style={{ opacity: !isAuthenticated ? 0.5 : 1 }}
              >
                🚀 发布工作流
              </button>
              <button
                onClick={() => {
                  setIsEditMode(false);
                  onClose?.();
                }}
                className="toolbar-button"
                style={{ marginLeft: 'auto' }}
              >
                关闭
              </button>
            </>
          )}
        </div>
      </div>

      {/* 工作流画布 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ReactFlow
          style={{ background: 'linear-gradient(180deg, #fbfdff, #ffffff)' }}
          nodes={nodes.map(node => ({
            ...node,
            style: {
              ...node.style,
              animation: node.data.isActive ? 'pulse 1s infinite' : 'none',
              cursor: 'move',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
              },
            },
            // 添加状态指示器
            data: {
              ...node.data,
              statusIndicator: (
                <>
                  {node.data.status && (
                    <div className={`node-status ${node.data.status}`} />
                  )}
                  {node.data.statusText && (
                    <div className="node-status-text">{node.data.statusText}</div>
                  )}
                </>
              )
            }
          }))}
          edges={edges.map(edge => ({
            ...edge,
            className: activeNodeId === edge.source ? 'executing' : '',
            animated: true,
            style: { strokeWidth: 2, stroke: '#64748b' },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#64748b',
            },
          }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={useMemo(() => ({
            MessageTrigger: TriggerNode,
            TimeTrigger: TimeTriggerNode,
            StatusTrigger: StatusTriggerNode,
            AI: AINode,
            Handoff: HandoffNode,
            Condition: ConditionNode,
            UpdateDB: UpdateDBNode,
            GuardrailValidator: GuardNode,
            Delay: DelayNode,
            SendWhatsAppMessage: SendMessageNode,
            Template: TemplateNode,
            CustomAPI: CustomAPINode
          }), [])}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          snapToGrid={true}
          snapGrid={[15, 15]}
          fitView
          deleteKeyCode="Delete"
          multiSelectionKeyCode="Control"
          selectionKeyCode="Shift"
          elevateNodesOnSelect={true}
          nodesDraggable={isEditMode}
          nodesConnectable={isEditMode}
          connectOnClick={isEditMode}
          zoomOnDoubleClick={false}
          panOnDrag={true}
          minZoom={0.3}
          maxZoom={2}
          nodesFocusable={isEditMode}
          elementsSelectable={isEditMode}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          onConnectStart={(event, params) => {
            const sourceNode = nodes.find(n => n.id === params.nodeId)
            if (sourceNode) {
              sourceNode.style = { ...sourceNode.style, zIndex: 1000 }
              setNodes([...nodes])
            }
          }}
          onConnectEnd={(event) => {
            setNodes(nodes.map(node => ({
              ...node,
              style: { ...node.style, zIndex: 0 }
            })))
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          
          {/* 自定义控制按钮面板 */}
          <Panel 
            position="bottom-left" 
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '8px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              margin: '20px',
              zIndex: 1000,
            }}
          >
            <button
              onClick={(event) => {
                event.preventDefault();
                const controls = document.querySelectorAll('.react-flow__controls .react-flow__controls-button') as NodeListOf<HTMLButtonElement>;
                if (controls && controls[0]) controls[0].click();
              }}
              className="control-button"
            >
              +
            </button>
            <button
              onClick={(event) => {
                event.preventDefault();
                const controls = document.querySelectorAll('.react-flow__controls .react-flow__controls-button') as NodeListOf<HTMLButtonElement>;
                if (controls && controls[1]) controls[1].click();
              }}
              className="control-button"
            >
              -
            </button>
            <button
              onClick={(event) => {
                event.preventDefault();
                const controls = document.querySelectorAll('.react-flow__controls .react-flow__controls-button') as NodeListOf<HTMLButtonElement>;
                if (controls && controls[2]) controls[2].click();
              }}
              className="control-button"
            >
              ⟲
            </button>
          </Panel>

          {/* 小地图面板 */}
        {/* <Panel 
          position="bottom-right"
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              padding: '8px',
              width: '160px',
              height: '120px',
              margin: '20px',
              zIndex: 1000,
            }}
          >
            <MiniMap
              style={{
                width: '100%',
                height: '100%',
              }}
              nodeColor={(node) => nodeConfigs[node.type]?.color || '#4299e1'}
              nodeStrokeWidth={1}
              nodeBorderRadius={2}
              nodeStrokeColor="#fff"
              maskColor="rgba(0, 0, 0, 0.2)"
              zoomable
              pannable
              zoomStep={0.5}
              inversePan={true}
              // 节点大小自适应
              // 使用简单的颜色映射替代自定义组件
              nodeColor={(node) => {
                const type = (node as any).type;
                return type && nodeConfigs[type] ? nodeConfigs[type].color : '#4299e1';
              }}
              nodeBorderRadius={2}
              nodeBorderColor="#fff"
            />
          </Panel> */}

          {/* 隐藏的原生控制按钮，用于触发缩放功能 */}
          <Controls style={{ display: 'none' }} />
        </ReactFlow>

        {/* 节点配置面板 */}
        {showNodePanel && selectedNode && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            bottom: '20px',
            width: '400px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <NodeConfig
              node={selectedNode}
              onUpdate={(nodeId, data) => {
                  setNodes((nds) =>
                    nds.map((node) =>
                    node.id === nodeId
                      ? { ...node, data }
                        : node
                    )
                  )
                }}
              onClose={() => setShowNodePanel(false)}
            />
          </div>
        )}

        {/* 触发器选择器 */}
        {showTriggerSelector && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <TriggerSelector
              onSelect={handleTriggerSelect}
              onClose={() => setShowTriggerSelector(false)}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        .toolbar-button {
          padding: 8px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background-color: white;
          color: #4a5568;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .toolbar-button:hover {
          background-color: #f7fafc;
        }

        .toolbar-button.primary {
          background-color: #4299e1;
          color: white;
          border-color: #4299e1;
        }

        .toolbar-button.primary:hover {
          background-color: #3182ce;
        }

        .toolbar-button.success {
          background-color: #48bb78;
          color: white;
          border-color: #48bb78;
        }

        .toolbar-button.success:hover {
          background-color: #38a169;
        }

        .toolbar-button.danger {
          background-color: #f56565;
          color: white;
          border-color: #f56565;
        }

        .toolbar-button.danger:hover {
          background-color: #e53e3e;
        }

        /* React Flow Controls 样式 */
        :global(.react-flow__controls) {
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
          padding: 8px !important;
          background-color: white !important;
          border-radius: 8px !important;
          gap: 8px !important;
        }

        :global(.react-flow__controls-button) {
          background: white !important;
          border-radius: 4px !important;
          border: 1px solid #E2E8F0 !important;
          color: #4A5568 !important;
          padding: 4px !important;
          width: 24px !important;
          height: 24px !important;
          transition: all 0.2s !important;
        }

        :global(.react-flow__controls-button:hover) {
          background: #EDF2F7 !important;
          border-color: #CBD5E0 !important;
        }

        :global(.react-flow__minimap) {
          background-color: white !important;
          border: 1px solid #E2E8F0 !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        }

        /* 控制按钮样式 */
        .control-button {
          width: 28px;
          height: 28px;
          border: 1px solid #E2E8F0;
          background: white;
          color: #4A5568;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .control-button:hover {
          background: #EDF2F7;
          border-color: #CBD5E0;
        }

        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}