/**
 * NodeConfig
 *
 * 组件职责：
 * - 为工作流编辑器中每个节点提供可视化配置面板（基于 node.data 的本地编辑状态）。
 * - 将本地更改通过 `onUpdate(nodeId, data)` 回传给父组件，以便在画布上保存节点配置。
 * - 提供变量选择器（@变量）以便在 prompt/template 中插入可用变量。
 * - 保持与父组件传入 `node.data` 的同步（useEffect），避免 UI 与数据不一致。
 *
 * 注意事项：
 * - 本组件只负责 UI 层配置，不会直接发起网络请求或修改数据库。
 * - 在将数据发送到后端前，父组件应对 data 做序列化/清理（例如移除 React 元素或函数引用）。
 */
import React, { useState, useEffect } from 'react'
import { Node } from 'reactflow'
import api from '../utils/api'

interface NodeConfigProps {
  node: Node
  onUpdate: (nodeId: string, data: any) => void
  onClose: () => void
}

export default function NodeConfig({ node, onUpdate, onClose }: NodeConfigProps) {
  const [showVariableSelector, setShowVariableSelector] = useState<{show: boolean, position?: string}>({ show: false })
  const [localData, setLocalData] = useState<any>(node.data || {})
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [compiledPromptText, setCompiledPromptText] = useState<string>('')
  const [showHeadersPanel, setShowHeadersPanel] = useState(false)
  const [availableHeaders, setAvailableHeaders] = useState<string[] | null>(null)
  const [loadingHeaders, setLoadingHeaders] = useState(false)
  const [customerStages, setCustomerStages] = useState<any[]>([]) // 新增客户阶段状态

  async function fetchAvailableHeaders() {
    // 如果已有字段且非空，则不用重复请求；如果为空数组则仍尝试重新获取（可能之前未认证或无数据，刷新后可能有变化）
    if (availableHeaders && availableHeaders.length > 0) return
    setLoadingHeaders(true)
    try {
      // 首先尝试读取用户在设置中配置的 customer-list-config（包含列定义）
      try {
        const cfg = await api.get('/settings/customer-list-config')
        // 支持两种返回形式：{ config: { columns: [...] } } 或直接 { columns: [...] }
        const cols = cfg?.config?.columns ?? cfg?.columns
        if (Array.isArray(cols) && cols.length > 0) {
          const keys = cols.map((c: any) => c.key).filter(Boolean)
          // 规范化为带前缀的字段名
          const normalized = keys.map((k: string) => {
            if (k.startsWith('db.customer.') || k.startsWith('custom_fields.')) return k
            if (k.includes('.')) return k
            return `db.customer.${k}`
          })
          setAvailableHeaders(normalized)
          return
        }
      } catch (e) {
        // ignore -> fall back to fields endpoint
      }

      // 回退：读取后端提供的字段列表
      try {
        const data = await api.get('/api/customers/fields')
        console.log('fetched customer fields:', data)
        setAvailableHeaders(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error('failed to fetch customer fields', e)
        setAvailableHeaders([])
      }
    } catch (e) {
      setAvailableHeaders([])
    } finally {
      setLoadingHeaders(false)
    }
  }
  
  // 当 node.data 变化时更新本地状态 (来自父组件的更新)
  useEffect(() => {
    setLocalData(node.data || {})
  }, [node.data])

  // 当打开 Condition 配置时，自动加载阶段列表，便于直接下拉选择阶段名称
  useEffect(() => {
    if (node.type === 'Condition') {
      fetchAvailableHeaders();
      // 只有在节点类型是 Condition 时才尝试加载阶段
      const fetchStages = async () => {
        try {
          const response = await api.get('/api/pipeline/stages');
          setCustomerStages(response || []); // 假设API直接返回 [...] 或者返回 { data: [...] }
        } catch (error) {
          console.error('Error fetching customer stages:', error);
          setCustomerStages([]);
        }
      };
      fetchStages();
    }
  }, [node.type]);
  
  const updateNodeData = (updates: any) => {
    const newData = { ...localData, ...updates }
    setLocalData(newData)
    onUpdate(node.id, newData)
  }

  // 方便渲染：首选 availableHeaders，其次 node.data 提供的可用字段
  const headerList: string[] = availableHeaders ?? ((localData.data && localData.data.availableHeaders) || localData.availableHeaders || [])

  const renderMessageTriggerConfig = () => (
    <>
      <div className="config-field">
        <label>触发渠道</label>
        <select
          value={localData.channel || 'whatsapp'}
          onChange={(e) => updateNodeData({ channel: e.target.value })}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
          <option value="form">表单</option>
          <option value="support">客服台</option>
        </select>
      </div>
      <div className="config-field">
        <label>匹配字段</label>
        <select
          value={localData.match_key || 'phone'}
          onChange={(e) => updateNodeData({ match_key: e.target.value })}
        >
          <option value="phone">手机号</option>
          <option value="email">邮箱</option>
          <option value="customer_id">客户ID</option>
        </select>
      </div>
    </>
  )

  const renderAIConfig = () => (
    <>
      <div className="config-field">
        <label>AI模型</label>
        <select
          value={localData.model?.name || 'gpt-4o-mini'}
          onChange={(e) => updateNodeData({ 
            model: { ...localData.model, name: e.target.value }
          })}
        >
          <option value="gpt-4o-mini">GPT-4 Mini</option>
          <option value="gpt-4">GPT-4</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
        </select>
      </div>

      <div className="config-field">
        <label>System Prompt（系统提示）</label>
        <div>
          <textarea
            value={localData.system_prompt || ''}
            onChange={(e) => updateNodeData({ system_prompt: e.target.value })}
            placeholder="你是一个专业的CRM智能助手，负责理解客户意图并生成结构化JSON。"
            rows={4}
            style={{ width: '100%' }}
          />

          <div className="prompt-actions">
            <button
              className="small-action-button"
              onClick={() => setShowVariableSelector({ show: true, position: 'system_prompt' })}
            >
              @变量
            </button>
          </div>
        </div>
      </div>

      <div className="config-field">
        <label>User Prompt（用户提示模板）</label>
        <div>
          <textarea
            value={localData.user_prompt || ''}
            onChange={(e) => updateNodeData({ user_prompt: e.target.value })}
            placeholder="客户说：{{trigger.content}}。请以固定JSON格式输出分析结果。"
            rows={5}
            style={{ width: '100%' }}
          />

          <div className="prompt-actions">
            <button
              className="small-action-button"
              onClick={() => setShowVariableSelector({ show: true, position: 'user_prompt' })}
            >
              @变量
            </button>
          </div>
        </div>
      </div>

      <div className="config-field">
        <label>温度 (0-1)</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={localData.model?.temperature || 0.7}
          onChange={(e) => updateNodeData({
            model: {
              ...localData.model,
              temperature: parseFloat(e.target.value)
            }
          })}
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          较低值更保守，较高值更创造性
        </div>
      </div>

      <div className="config-field">
        <label>最大令牌数</label>
        <input
          type="number"
          min="1"
          max="4000"
          value={localData.model?.max_tokens || 800}
          onChange={(e) => updateNodeData({
            model: {
              ...localData.model,
              max_tokens: parseInt(e.target.value)
            }
          })}
        />
      </div>

      <div className="config-field">
        <label>Handoff 置信度阈值 (0-1)</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={localData.handoff_threshold ?? 0.6}
          onChange={(e) => updateNodeData({ handoff_threshold: parseFloat(e.target.value) })}
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          当 AI 的 `confidence` 低于此阈值时，自动触发 Handoff 分支
        </div>
      </div>

      <div className="config-field">
        <button
          onClick={() => {
            const compiled = compilePromptForPreview()
            setCompiledPromptText(compiled)
            setShowPromptPreview(true)
          }}
          className="small-action-button primary"
        >
          预览完整 Prompt
        </button>
      </div>

      <div className="config-field">
        <label>AI 节点行为</label>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={localData.enableUpdateInfo ?? false}
                onChange={(e) => updateNodeData({ enableUpdateInfo: e.target.checked })}
              />
              <span className="slider" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 600 }}>允许更新客户信息</div>
              <div style={{ fontSize: 12, color: '#666' }}>开启时可选择客户表头让 LLM 更新</div>
            </div>

            <div style={{ width: 24 }} />

            <label className="switch">
              <input
                type="checkbox"
                checked={localData.enableAutoReply ?? false}
                onChange={(e) => updateNodeData({ enableAutoReply: e.target.checked })}
              />
              <span className="slider" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 600 }}>自动回复</div>
              <div style={{ fontSize: 12, color: '#666' }}>开启时 LLM 会生成回复文本</div>
            </div>
          </div>

          { (localData.enableUpdateInfo ?? false) ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>可选更新的表头</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="small-action-button"
                  onClick={() => {
                    // 打开面板时动态加载字段（从用户配置或 /customers/fields）
                    setShowHeadersPanel(v => {
                      const next = !v
                      if (next) fetchAvailableHeaders()
                      return next
                    })
                  }}
                  style={{ padding: '8px 10px' }}
                >
                  {showHeadersPanel ? '隐藏表头选择' : '选择表头'}
                </button>
                <div style={{ color: '#666', fontSize: 13 }}>
                  已选: {(localData.selectedHeaders || []).join(', ') || '无'}
                </div>
              </div>

            {showHeadersPanel && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: 'linear-gradient(180deg, #fff, #fbfdff)', boxShadow: '0 6px 18px rgba(11,37,69,0.03)' }}>
                {loadingHeaders ? (
                  <div style={{ color: '#666' }}>加载字段中...</div>
                ) : headerList.length === 0 ? (
                  <div style={{ color: '#666' }}>
                    未找到可用字段。请确认已登录并且客户数据存在。<button onClick={() => { fetchAvailableHeaders() }} style={{ marginLeft: 8 }}>刷新</button>
                  </div>
                ) : (
                  headerList.map((h: string) => {
                    const selected = (localData.selectedHeaders || []).includes(h)
                    return (
                      <label key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 8, marginBottom: 8 }}>
                        <label className="switch" style={{ marginRight: 6 }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              const prev = localData.selectedHeaders || []
                              let next = [...prev]
                              if (!selected) next.push(h)
                              else next = next.filter((x: string) => x !== h)
                              updateNodeData({ selectedHeaders: next })
                            }}
                          />
                          <span className="slider" />
                        </label>
                        <span style={{ fontSize: 13 }}>{h}</span>
                      </label>
                    )
                  })
                )}
              </div>
            )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#777', marginTop: 16 }}>开启 "允许更新客户信息" 后可选择要允许 LLM 更新的表头。</div>
          )}

          {/* 必填字段输入已移除（由 LLM 输出和工作流逻辑控制） */}

          <div style={{ display: 'flex', gap: 8 }}>
            {/* 备份模型与重试次数已移除 */}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* JSON 修复与保存原始响应选项已移除 */}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* 执行成功/失败路由选项已移除 */}
          </div>
        </div>
      </div>

      <div className="config-field">
        <label>Handoff 配置</label>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label className="switch">
            <input
              type="checkbox"
              checked={localData.enableHandoff ?? false}
              onChange={(e) => updateNodeData({ enableHandoff: e.target.checked })} />
            <span className="slider" />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 600 }}>开启 Handoff</div>
            <div style={{ fontSize: 12, color: '#666' }}>当 AI 置信度低时自动转人工</div>
          </div>
        </div>

        { localData.enableHandoff && (
          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Handoff 置信度阈值 (0-1)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={localData.handoff_threshold ?? 0.6}
              onChange={(e) => updateNodeData({ handoff_threshold: parseFloat(e.target.value) })} />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              当 AI 的 `confidence` 低于此阈值时，自动触发 Handoff 分支
            </div>
          </div>
        )}
      </div>
    </>
  )

  const renderHandoffConfig = () => (
    <>
      <div className="config-field">
        <label>Handoff 模式</label>
        <select
          value={localData.mode || localData.data?.mode || 'hybrid'}
          onChange={(e) => updateNodeData({ mode: e.target.value })}
        >
          <option value="human">人工 (直接创建工单)</option>
          <option value="ai">AI (仅 AI 处理)</option>
          <option value="hybrid">Hybrid (AI 首先尝试，失败或不确定则转人工)</option>
        </select>
      </div>

      <div className="config-field">
        <label>AI 模型（当包含 AI 时）</label>
        <select
          value={localData.ai_model || localData.data?.ai_model || 'gpt-4o-mini'}
          onChange={(e) => updateNodeData({ ai_model: e.target.value })}
        >
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4">gpt-4</option>
          <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        </select>
      </div>

      <div className="config-field">
        <label>AI 尝试超时 (秒)</label>
        <input
          type="number"
          min={1}
          value={localData.ai_timeout_seconds ?? localData.data?.ai_timeout_seconds ?? 8}
          onChange={(e) => updateNodeData({ ai_timeout_seconds: parseInt(e.target.value) })}
        />
      </div>

      <div className="config-field">
        <label>AI 置信度阈值 (0-1)</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={localData.confidence_threshold ?? localData.data?.confidence_threshold ?? 0.75}
          onChange={(e) => updateNodeData({ confidence_threshold: parseFloat(e.target.value) })}
        />
      </div>

      <div className="config-field">
        <label>人工队列 / 团队</label>
        <input
          type="text"
          value={localData.human_team || localData.data?.human_team || 'support'}
          onChange={(e) => updateNodeData({ human_team: e.target.value })}
          placeholder="例如: support"
        />
      </div>

      <div className="config-field">
        <label>自动分配给在线 Agent</label>
        <input
          type="checkbox"
          checked={localData.auto_assign ?? localData.data?.auto_assign ?? true}
          onChange={(e) => updateNodeData({ auto_assign: e.target.checked })}
        />
      </div>

      <div className="config-field">
        <label>允许 Agent 再次 handoff (re-handoff)</label>
        <input
          type="checkbox"
          checked={localData.allow_rehandoff ?? localData.data?.allow_rehandoff ?? true}
          onChange={(e) => updateNodeData({ allow_rehandoff: e.target.checked })}
        />
      </div>

      <div className="config-field">
        <label>最大升级次数 (escalations)</label>
        <input
          type="number"
          min={0}
          value={localData.max_escalations ?? localData.data?.max_escalations ?? 3}
          onChange={(e) => updateNodeData({ max_escalations: parseInt(e.target.value) })}
        />
      </div>

      <div className="config-field">
        <label>等待人工响应超时 (秒)</label>
        <input
          type="number"
          min={30}
          value={localData.timeout_seconds ?? localData.data?.timeout_seconds ?? 1800}
          onChange={(e) => updateNodeData({ timeout_seconds: parseInt(e.target.value) })}
        />
      </div>

      <div className="config-field">
        <label>超时或未处理时回退节点 ID (可选)</label>
        <input
          type="text"
          value={localData.fallback_node || localData.data?.fallback_node || ''}
          onChange={(e) => updateNodeData({ fallback_node: e.target.value })}
          placeholder="例如: n_fallback"
        />
      </div>

      <div className="config-field">
        <label>初始给 Agent 的消息模板</label>
        <textarea
          value={localData.initial_message_template || localData.data?.initial_message_template || '{{trigger.content}}'}
          onChange={(e) => updateNodeData({ initial_message_template: e.target.value })}
          rows={3}
        />
      </div>

      <div className="config-field">
        <label>Agent 必须接手确认 (require_ack)</label>
        <input
          type="checkbox"
          checked={localData.require_ack ?? localData.data?.require_ack ?? true}
          onChange={(e) => updateNodeData({ require_ack: e.target.checked })}
        />
      </div>
    </>
  )

  const renderUpdateDBConfig = () => (
    <>
      <div className="config-field">
        <label>表名</label>
        <select
          value={localData.table || 'customers'}
          onChange={(e) => updateNodeData({ table: e.target.value })}
        >
          <option value="customers">客户表</option>
          <option value="messages">消息表</option>
          <option value="tasks">任务表</option>
        </select>
      </div>
      <div className="config-field">
        <label>匹配字段</label>
        <select
          value={localData.match_key || 'phone'}
          onChange={(e) => updateNodeData({ match_key: e.target.value })}
        >
          <option value="phone">手机号</option>
          <option value="email">邮箱</option>
          <option value="id">ID</option>
        </select>
      </div>
      <div className="config-field">
        <label>乐观锁</label>
        <input
          type="checkbox"
          checked={localData.optimistic_lock}
          onChange={(e) => updateNodeData({ optimistic_lock: e.target.checked })}
        />
      </div>
    </>
  )

  const renderDelayConfig = () => (
    <>
      <div className="config-field">
        <label>延迟模式</label>
        <select
          value={localData.policy?.mode || 'auto_window'}
          onChange={(e) => updateNodeData({ 
            policy: { ...localData.policy, mode: e.target.value }
          })}
        >
          <option value="auto_window">自动工作时段</option>
          <option value="relative">相对延迟</option>
          <option value="absolute">绝对时间</option>
        </select>
      </div>
      {localData.policy?.mode === 'auto_window' && (
        <>
          <div className="config-field">
            <label>工作开始时间</label>
            <input
              type="time"
              value={localData.policy?.work_hours?.start || '09:00'}
              onChange={(e) => updateNodeData({
                policy: {
                  ...localData.policy,
                  work_hours: {
                    ...localData.policy.work_hours,
                    start: e.target.value
                  }
                }
              })}
            />
          </div>
          <div className="config-field">
            <label>工作结束时间</label>
            <input
              type="time"
              value={localData.policy?.work_hours?.end || '21:00'}
              onChange={(e) => updateNodeData({
                policy: {
                  ...localData.policy,
                  work_hours: {
                    ...localData.policy.work_hours,
                    end: e.target.value
                  }
                }
              })}
            />
          </div>
        </>
      )}
      {localData.policy?.mode === 'relative' && (
        <div className="config-field">
          <label>延迟时间(分钟)</label>
          <input
            type="number"
            min="1"
            value={localData.policy?.delay_minutes || 5}
            onChange={(e) => updateNodeData({
              policy: {
                ...localData.policy,
                delay_minutes: parseInt(e.target.value)
              }
            })}
          />
        </div>
      )}
    </>
  )

  const renderSendMessageConfig = () => (
    <>
      <div className="config-field">
        <label>发送渠道</label>
        <select
          value={localData.channel || 'whatsapp'}
          onChange={(e) => updateNodeData({ channel: e.target.value, send_mode: '' })} // 重置 send_mode
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>

      <div className="config-field">
        <label>发送模式</label>
        <select
          value={localData.send_mode || 'trigger_number'}
          onChange={(e) => updateNodeData({ send_mode: e.target.value })}
        >
          <option value="trigger_number">原触发号码发送</option>
          {localData.channel === 'whatsapp' && (
            <option value="specified_number">指定号码 (WhatsApp)</option>
          )}
          {localData.channel === 'telegram' && (
            <option value="telegram_chat_id">Telegram Chat ID</option>
          )}
        </select>
      </div>

      {(localData.send_mode === 'specified_number' && localData.channel === 'whatsapp') && (
        <div className="config-field">
          <label>指定 WhatsApp 号码</label>
          <input
            type="text"
            value={localData.to_number || ''}
            onChange={(e) => updateNodeData({ to_number: e.target.value })}
            placeholder="例如: +85212345678"
          />
        </div>
      )}

      {(localData.send_mode === 'telegram_chat_id' && localData.channel === 'telegram') && (
        <div className="config-field">
          <label>Telegram Chat ID</label>
          <input
            type="text"
            value={localData.telegram_chat_id || ''}
            onChange={(e) => updateNodeData({ telegram_chat_id: e.target.value })}
            placeholder="例如: 123456789 (私聊) 或 @channel_name (频道)"
          />
          <label style={{marginTop: '10px'}}>Telegram Bot API Token</label>
          <input
            type="text"
            value={localData.telegram_bot_token || ''}
            onChange={(e) => updateNodeData({ telegram_bot_token: e.target.value })}
            placeholder="填写您的 Telegram Bot API Token"
          />
        </div>
      )}

      <div className="config-field">
        <label>发送前延迟 (秒)</label>
        <input
          type="number"
          min="0"
          value={localData.delay_seconds || 0}
          onChange={(e) => updateNodeData({ delay_seconds: parseInt(e.target.value) })}
          placeholder="0 表示不延迟"
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          消息发送前等待的秒数，可用于模拟"已读"或根据文字长度自动延迟。
        </div>
      </div>

      <div className="config-field">
        <label>最大重试次数</label>
        <input
          type="number"
          min="0"
          max="5"
          value={localData.retries?.max || 3}
          onChange={(e) => updateNodeData({
            retries: { max: parseInt(e.target.value) }
          })}
        />
      </div>
      <div className="config-field">
        <label>重试间隔(秒)</label>
        <input
          type="number"
          min="30"
          value={localData.retries?.interval || 60}
          onChange={(e) => updateNodeData({
            retries: {
              ...localData.retries,
              interval: parseInt(e.target.value)
            }
          })}
        />
      </div>
      <div className="config-field">
        <label>消息模板</label>
        <textarea
          value={localData.template || ''}
          onChange={(e) => updateNodeData({ template: e.target.value })}
          placeholder="使用 {ai.reply.reply_text} 引用AI回复"
          rows={4}
        />
      </div>
    </>
  )

  const renderGuardrailConfig = () => (
    <>
      <div className="config-field">
        <label>敏感词列表</label>
        <textarea
          value={localData.checks?.blocked_keywords?.join('\n') || ''}
          onChange={(e) => updateNodeData({
            checks: {
              ...localData.checks,
              blocked_keywords: e.target.value.split('\n').filter(Boolean)
            }
          })}
          placeholder="每行一个敏感词"
          rows={4}
        />
      </div>
      <div className="config-field">
        <label>URL白名单</label>
        <textarea
          value={localData.checks?.url_whitelist?.join('\n') || ''}
          onChange={(e) => updateNodeData({
            checks: {
              ...localData.checks,
              url_whitelist: e.target.value.split('\n').filter(Boolean)
            }
          })}
          placeholder="每行一个URL"
          rows={4}
        />
      </div>
    </>
  )

  const renderTemplateConfig = () => (
    <>
      <div className="config-field">
        <label>模板类型</label>
        <select
          value={localData.template_type || 'text'}
          onChange={(e) => updateNodeData({ template_type: e.target.value })}
        >
          <option value="text">普通文本</option>
          <option value="whatsapp">WhatsApp模板</option>
        </select>
      </div>

      {localData.template_type === 'whatsapp' && (
        <>
          <div className="config-field">
            <label>模板名称</label>
            <input
              type="text"
              value={localData.template_name || ''}
              onChange={(e) => updateNodeData({ template_name: e.target.value })}
              placeholder="例如: greeting_message"
            />
          </div>
          <div className="config-field">
            <label>模板语言</label>
            <select
              value={localData.template_language || 'zh_CN'}
              onChange={(e) => updateNodeData({ template_language: e.target.value })}
            >
              <option value="zh_CN">中文</option>
              <option value="en_US">英文</option>
              <option value="ms_MY">马来文</option>
            </select>
          </div>
          <div className="config-field">
            <label>模板变量</label>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
              点击 "+" 添加变量，或者手动输入
            </div>
            
            {/* 变量列表 */}
            <div style={{ marginBottom: '8px' }}>
              {Object.entries(localData.variables || {}).map(([key, value], index) => (
                <div key={index} className="variable-item">
                  <span className="variable-number">
                    {key}
                  </span>
                  <input
                    type="text"
                    value={String(value || '')}
                    onChange={(e) => {
                      const newVariables = { ...localData.variables };
                      newVariables[key] = e.target.value;
                      updateNodeData({ variables: newVariables });
                    }}
                    className="variable-input"
                    placeholder="选择变量或输入文本"
                  />
                  <button
                    onClick={() => setShowVariableSelector({ show: true, position: key })}
                    className="variable-button select"
                  >
                    @
                  </button>
                  <button
                    onClick={() => {
                      const newVariables = { ...localData.variables };
                      delete newVariables[key];
                      updateNodeData({ variables: newVariables });
                    }}
                    className="variable-button delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* 添加变量按钮 */}
            <button
              onClick={() => {
                const variables = localData.variables || {};
                const nextKey = String(Object.keys(variables).length + 1);
                updateNodeData({ 
                  variables: {
                    ...variables,
                    [nextKey]: ''
                  }
                });
              }}
              className="add-variable-button"
            >
              + 添加变量
            </button>
          </div>
        </>
      )}

      <div className="config-field">
        <label>备用消息模板</label>
        <div>
          <textarea
            value={localData.fallback_template || ''}
            onChange={(e) => updateNodeData({ fallback_template: e.target.value })}
            placeholder={`您好 {{trigger.name}}！感谢您的咨询。`}
            rows={3}
            style={{ width: '100%' }}
          />

          <div className="prompt-actions">
            <button
              className="small-action-button"
              onClick={() => setShowVariableSelector({ show: true, position: 'fallback' })}
            >
              @变量
            </button>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          支持变量: {`{{trigger.name}}`}, {`{{trigger.phone}}`}, {`{{db.customer.name}}`}等，点击 "@变量" 选择
        </div>
      </div>
    </>
  )

  const renderConfigFields = () => {
    switch (node.type) {
      case 'MessageTrigger':
        return renderMessageTriggerConfig()
      case 'AI':
        return renderAIConfig()
      case 'Handoff':
        return renderHandoffConfig()
      case 'Template':
        return renderTemplateConfig()
      case 'UpdateDB':
        return renderUpdateDBConfig()
      case 'Delay':
        return renderDelayConfig()
      case 'SendWhatsAppMessage':
        return renderSendMessageConfig()
      case 'GuardrailValidator':
        return renderGuardrailConfig()
      case 'Condition':
        return renderConditionConfig()
      default:
        return null
    }
  }

  const renderConditionConfig = () => {
    const conditions = localData.conditions || []
    const logicOperator = localData.logicOperator || 'AND'

    const addCondition = () => {
      const newConditions = [...conditions, {
        id: Date.now().toString(),
        field: '',
        operator: '==',
        value: '',
        fieldType: 'text'
      }]
      updateNodeData({ conditions: newConditions })
    }

    const removeCondition = (id: string) => {
      const newConditions = conditions.filter((c: any) => c.id !== id)
      updateNodeData({ conditions: newConditions })
    }

    const updateCondition = (id: string, updates: any) => {
      const newConditions = conditions.map((c: any) => 
        c.id === id ? { ...c, ...updates } : c
      )
      updateNodeData({ conditions: newConditions })
    }

    const getFieldType = (field: string) => {
      if (!field) return 'text'
      if (field.includes('custom_fields.')) return 'custom'
      if (['budget_min', 'budget_max', 'unread_count', 'user_id', 'stage_id'].includes(field.split('.').pop() || '')) return 'number'
      if (['move_in_date', 'updated_at', 'last_timestamp', 'last_follow_up_time'].includes(field.split('.').pop() || '')) return 'date'
      return 'text'
    }

    const getOperatorsForType = (fieldType: string) => {
      switch (fieldType) {
        case 'number':
          return [
            { value: '==', label: '等於 (==)' },
            { value: '!=', label: '不等於 (!=)' },
            { value: '>', label: '大於 (>)' },
            { value: '>=', label: '大於等於 (>=)' },
            { value: '<', label: '小於 (<)' },
            { value: '<=', label: '小於等於 (<=)' },
            { value: 'between', label: '介於...之間' }
          ]
        case 'date':
          return [
            { value: '==', label: '等於' },
            { value: '!=', label: '不等於' },
            { value: '>', label: '晚於' },
            { value: '>=', label: '晚於等於' },
            { value: '<', label: '早於' },
            { value: '<=', label: '早於等於' },
            { value: 'days_ago', label: 'N天前' },
            { value: 'days_from_now', label: 'N天後' }
          ]
        default: // text, custom
          return [
            { value: '==', label: '等於 (==)' },
            { value: '!=', label: '不等於 (!=)' },
            { value: 'contains', label: '包含' },
            { value: 'starts_with', label: '開頭是' },
            { value: 'ends_with', label: '結尾是' },
            { value: 'is_empty', label: '為空' },
            { value: 'is_not_empty', label: '不為空' }
          ]
      }
    }

    return (
      <>
        <div className="config-field">
          <label>条件模式</label>
          <select
            value={localData.mode || 'visual'}
            onChange={(e) => updateNodeData({ mode: e.target.value })}
          >
            <option value="visual">可视化条件构建器 (推荐)</option>
            <option value="jsonlogic">JSONLogic (高级)</option>
          </select>
        </div>

        {(localData.mode || 'visual') === 'visual' ? (
          <>
              <div className="config-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <label>条件规则</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={addCondition}
                      className="small-action-button primary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      + 添加条件
                    </button>
                  </div>
                </div>

              {conditions.length === 0 ? (
                <div style={{ 
                  padding: 20, 
                  textAlign: 'center', 
                  color: '#666', 
                  border: '2px dashed #ddd', 
                  borderRadius: 8,
                  background: '#f9f9f9'
                }}>
                  点击"添加条件"开始配置条件规则
                </div>
              ) : (
                <>
                  {conditions.length > 1 && (
                    <div className="config-field">
                      <label>条件关系</label>
                      <select
                        value={logicOperator}
                        onChange={(e) => updateNodeData({ logicOperator: e.target.value })}
                        style={{ width: 'auto' }}
                      >
                        <option value="AND">AND (所有条件都必须满足)</option>
                        <option value="OR">OR (任一条件满足即可)</option>
                      </select>
                    </div>
                  )}

                  <div className="conditions-list">
                    {conditions.map((condition: any, index: number) => {
                      const fieldType = getFieldType(condition.field)
                      const operators = getOperatorsForType(fieldType)
                      
                      return (
                        <div key={condition.id} className="condition-item">
                          {index > 0 && (
                            <div className="logic-operator">
                              {logicOperator}
                            </div>
                          )}
                          
                          <div className="condition-controls">
                            {/* 字段选择 */}
                            <div className="condition-field">
                              <label>字段</label>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <select
                                  value={condition.field}
                                  onChange={(e) => {
                                    const field = e.target.value
                                    const fieldType = getFieldType(field)
                                    updateCondition(condition.id, { 
                                      field, 
                                      fieldType,
                                      operator: getOperatorsForType(fieldType)[0]?.value || '==',
                                      value: '' // 重置值
                                    })
                                  }}
                                  style={{ flex: 1 }}
                                >
                                  <option value="">选择字段...</option>
                                  {Array.isArray(headerList) && headerList.length > 0 ? (
                                    (() => {
                                      const configuredDb = headerList.filter(h => h.startsWith('db.customer.'))
                                        .filter(h => !['db.customer.budget_min','db.customer.budget_max','db.customer.preferred_location'].includes(h))
                                      const customFields = headerList.filter(h => h.startsWith('custom_fields.'))
                                      const baseDbFields = [
                                        'db.customer.id','db.customer.name','db.customer.phone','db.customer.email','db.customer.status',
                                        'db.customer.stage_id','db.customer.unread_count','db.customer.move_in_date','db.customer.updated_at',
                                        'db.customer.last_timestamp','db.customer.last_follow_up_time','db.customer.photo_url','db.customer.last_message','db.customer.user_id'
                                      ]
                                      const dbFieldsSet = new Set([...baseDbFields, ...configuredDb])
                                      const dbFields = Array.from(dbFieldsSet)
                                      return (
                                        <>
                                          {dbFields.length > 0 && (
                                            <optgroup label="数据库字段">
                                              {dbFields.map(h => (
                                                <option key={h} value={h}>{h.replace('db.customer.','')}</option>
                                              ))}
                                            </optgroup>
                                          )}
                                          {customFields.length > 0 && (
                                            <optgroup label="自定义字段">
                                              {customFields.map(h => (
                                                <option key={h} value={h}>{h.replace('custom_fields.','')}</option>
                                              ))}
                                            </optgroup>
                                          )}
                                        </>
                                      )
                                    })()
                                  ) : (
                                    <>
                                      <option value="db.customer.name">name</option>
                                      <option value="db.customer.phone">phone</option>
                                      <option value="db.customer.email">email</option>
                                      <option value="db.customer.status">status</option>
                                      <option value="db.customer.stage_id">stage_id</option>
                                      <option value="db.customer.unread_count">unread_count</option>
                                      <option value="db.customer.move_in_date">move_in_date</option>
                                      <option value="db.customer.updated_at">updated_at</option>
                                      <option value="db.customer.last_timestamp">last_timestamp</option>
                                    </>
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowHeadersPanel(true)
                                    fetchAvailableHeaders()
                                  }}
                                  className="small-action-button"
                                  style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                                >
                                  刷新字段
                                </button>
                              </div>
                            </div>

                            {/* 操作符选择 */}
                            <div className="condition-operator">
                              <label>条件</label>
                              <select
                                value={condition.operator}
                                onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                              >
                                {operators.map(op => (
                                  <option key={op.value} value={op.value}>{op.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* 值输入 */}
                            {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                              <div className="condition-value">
                                <label>值</label>
                                {condition.field === 'db.customer.stage_id' ? (
                                  <select
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                    style={{ flex: 1 }}
                                  >
                                    <option value="">选择阶段...</option>
                                    {customerStages.map((stage: any) => (
                                      <option key={stage.id} value={stage.id}>
                                        {stage.name} {stage.description ? `(${stage.description})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : condition.operator === 'between' ? (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                      type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                      value={condition.value?.split(',')[0] || ''}
                                      onChange={(e) => {
                                        const parts = condition.value?.split(',') || ['', '']
                                        parts[0] = e.target.value
                                        updateCondition(condition.id, { value: parts.join(',') })
                                      }}
                                      placeholder="最小值"
                                      style={{ flex: 1 }}
                                    />
                                    <span>到</span>
                                    <input
                                      type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                      value={condition.value?.split(',')[1] || ''}
                                      onChange={(e) => {
                                        const parts = condition.value?.split(',') || ['', '']
                                        parts[1] = e.target.value
                                        updateCondition(condition.id, { value: parts.join(',') })
                                      }}
                                      placeholder="最大值"
                                      style={{ flex: 1 }}
                                    />
                                  </div>
                                ) : condition.operator === 'days_ago' || condition.operator === 'days_from_now' ? (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                      type="number"
                                      value={condition.value || ''}
                                      onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                      placeholder="天数"
                                      min="0"
                                      style={{ flex: 1 }}
                                    />
                                    <span>天</span>
                                  </div>
                                ) : (
                                  <input
                                    type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                    placeholder={fieldType === 'number' ? '输入数字' : fieldType === 'date' ? '选择日期' : '输入文本'}
                                  />
                                )}
                              </div>
                            )}

                            {/* 删除按钮 */}
                            <div className="condition-actions">
                              <button
                                type="button"
                                onClick={() => removeCondition(condition.id)}
                                className="small-action-button"
                                style={{ 
                                  background: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
                                  color: 'white',
                                  fontSize: '12px',
                                  padding: '6px 10px'
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="config-field">
            <label>JSONLogic 表达式</label>
            <textarea
              value={localData.jsonlogic || ''}
              onChange={(e) => updateNodeData({ jsonlogic: e.target.value })}
              placeholder='{"or": [{"==": [{"var": "db.customer.status"}, "active"]}, {">": [{"var": "custom_fields.预算"}, 800]}]}'
              rows={6}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>高级用户可直接编辑 JSONLogic 表达式</div>
          </div>
        )}

        <div className="config-field">
          <label>回退分支 (错误/空值时)</label>
          <select
            value={localData.fallback_output || 'false'}
            onChange={(e) => updateNodeData({ fallback_output: e.target.value })}
          >
      <option value="false">false — 当条件评估出错时视为不成立（更安全）</option>
      <option value="true">true — 当条件评估出错时视为成立（继续执行 true 分支）</option>
          </select>
        </div>
      </>
    )
  }

  function compilePromptForPreview() {
    const system = localData.system_prompt || (localData.data && localData.data.prompts && localData.data.prompts.system) || ''
    const user = localData.user_prompt || (localData.data && localData.data.prompts && localData.data.prompts.user_template) || ''
    const combined = `=== System Prompt ===\n${system}\n\n=== User Prompt ===\n${user}`

    const vars = localData.variables || {}
    return combined.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m: string, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key])
      return `<${key}>`
    })
  }

  // 预定义的变量选项
  const availableVariables = {
    '触发器数据': [
      { label: '发送者姓名', value: '{{trigger.name}}', description: '发送消息的用户姓名' },
      { label: '发送者电话', value: '{{trigger.phone}}', description: '发送消息的用户电话号码' },
      { label: '消息内容', value: '{{trigger.content}}', description: '用户发送的原始消息内容' },
      { label: '时间戳', value: '{{trigger.timestamp}}', description: '消息发送的时间' },
    ],
    '客户数据库': [
      { label: '客户姓名', value: '{{db.customer.name}}', description: '数据库中的客户姓名' },
      { label: '客户电话', value: '{{db.customer.phone}}', description: '数据库中的客户电话' },
      { label: '客户状态', value: '{{db.customer.status}}', description: '客户的当前状态' },
      { label: '客户邮箱', value: '{{db.customer.email}}', description: '客户的邮箱地址' },
      { label: '客户来源', value: '{{db.customer.source}}', description: '客户的来源渠道' },
    ],
    'AI 分析': [
      { label: 'AI 回复', value: '{{ai.reply}}', description: 'AI 生成的回复内容' },
      { label: 'AI 分析结果', value: '{{ai.analysis}}', description: 'AI 对消息的分析结果' },
      { label: '意图识别', value: '{{ai.intent}}', description: 'AI 识别的用户意图' },
      { label: '情感分析', value: '{{ai.sentiment}}', description: 'AI 分析的情感倾向' },
    ]
  }

  return (
    <div className="node-config-panel">
      <h3>配置节点: {node.type}</h3>
      <div className="config-fields">
        {renderConfigFields()}
      </div>
      <div className="config-actions">
        <button onClick={onClose}>关闭</button>
      </div>

      {/* 变量选择器弹窗 */}
      {showVariableSelector.show && (
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
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '500px',
            maxHeight: '70vh',
            overflow: 'auto',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              borderBottom: '1px solid #e9ecef',
              paddingBottom: '8px'
            }}>
              <h4 style={{ margin: 0 }}>选择变量</h4>
              <button
                onClick={() => setShowVariableSelector({ show: false })}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {Object.entries(availableVariables).map(([category, variables]) => (
              <div key={category} style={{ marginBottom: '16px' }}>
                <h5 style={{ 
                  margin: '0 0 8px 0',
                  color: '#007bff',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  {category}
                </h5>
                <div style={{ marginLeft: '8px' }}>
                  {variables.map((variable, index) => (
                    <div
                      key={index}
                      onClick={() => {
                        if (showVariableSelector.position === 'fallback') {
                          // 插入到备用模板中
                          const currentTemplate = localData.fallback_template || '';
                          const newTemplate = currentTemplate + variable.value;
                          updateNodeData({ fallback_template: newTemplate });
                        } else if (showVariableSelector.position === 'system_prompt') {
                          // 插入到系统提示中
                          const currentPrompt = localData.system_prompt || '';
                          const newPrompt = currentPrompt + variable.value;
                          updateNodeData({ system_prompt: newPrompt });
                        } else if (showVariableSelector.position === 'user_prompt') {
                          // 插入到用户提示中
                          const currentPrompt = localData.user_prompt || '';
                          const newPrompt = currentPrompt + variable.value;
                          updateNodeData({ user_prompt: newPrompt });
                        } else {
                          // 插入到变量列表中
                          const variables = localData.variables || {};
                          if (showVariableSelector.position) {
                            variables[showVariableSelector.position] = variable.value;
                            updateNodeData({ variables });
                          }
                        }
                        setShowVariableSelector({ show: false });
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #e9ecef',
                        marginBottom: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: '#f8f9fa'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#e9ecef';
                        e.currentTarget.style.borderColor = '#007bff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                        e.currentTarget.style.borderColor = '#e9ecef';
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {variable.label}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#28a745',
                        fontFamily: 'monospace',
                        margin: '2px 0'
                      }}>
                        {variable.value}
                      </div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        {variable.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt 预览弹窗（合并 System + User） */}
      {showPromptPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '18px',
            width: '760px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Prompt 预览</h4>
              <div>
                <button onClick={() => { navigator.clipboard?.writeText(compiledPromptText) }} style={{ marginRight: 8 }}>复制</button>
                <button onClick={() => setShowPromptPreview(false)}>关闭</button>
              </div>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f8f9fa', padding: 12, borderRadius: 8 }}>{compiledPromptText}</pre>
          </div>
        </div>
      )}

      <style jsx>{`
        .node-config-panel {
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .node-config-panel::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c);
          background-size: 300% 100%;
          animation: shimmer 3s linear infinite;
        }

        @keyframes shimmer {
          0% { background-position: 300% 0; }
          100% { background-position: -300% 0; }
        }
        
        h3 {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          margin: 0;
          padding: 20px 24px;
          color: #2d3748;
          font-size: 18px;
          font-weight: 600;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .config-fields {
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          padding: 24px;
          flex: 1;
          overflow-y: auto;
        }

        .prompt-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          justify-content: flex-end;
          align-items: center;
        }

        .small-action-button {
          padding: 8px 12px !important;
          font-size: 13px !important;
          border-radius: 10px !important;
          border: 1px solid rgba(11,37,69,0.06) !important;
          cursor: pointer !important;
          background: linear-gradient(180deg, #ffffff, #f7fbff) !important;
          color: #0b2545 !important;
          box-shadow: 0 6px 18px rgba(11,37,69,0.06) !important;
          transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease !important;
        }

        .small-action-button.primary {
          background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%) !important;
          color: #ffffff !important;
          border: none !important;
          box-shadow: 0 10px 28px rgba(79,70,229,0.14) !important;
        }

        .small-action-button:hover {
          transform: translateY(-3px) !important;
          box-shadow: 0 16px 36px rgba(11,37,69,0.12) !important;
        }

        .config-field textarea,
        .config-field input[type="text"],
        .config-field select {
          border: 1px solid rgba(11,37,69,0.06) !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(250,252,255,0.95)) !important;
          box-shadow: 0 6px 18px rgba(11,37,69,0.03) inset !important;
          padding: 12px 14px !important;
          border-radius: 12px !important;
        }

        /* iPhone-like switch */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #cfd8e3;
          transition: .2s;
          border-radius: 999px;
          box-shadow: inset 0 1px 2px rgba(11,37,69,0.06);
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .2s;
          border-radius: 50%;
          box-shadow: 0 4px 10px rgba(11,37,69,0.08);
        }

        .switch input:checked + .slider {
          background-color: #34d399; /* green */
        }

        .switch input:checked + .slider:before {
          transform: translateX(20px);
        }

        .config-fields::-webkit-scrollbar {
          width: 6px;
        }

        .config-fields::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 3px;
        }

        .config-fields::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 3px;
        }
        
        .config-field {
          margin-bottom: 20px;
          animation: fadeInUp 0.3s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #2d3748;
          font-size: 14px;
          position: relative;
        }

        label::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 30px;
          height: 2px;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 1px;
        }
        
        input[type="text"],
        input[type="number"],
        input[type="time"],
        select,
        textarea {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid transparent;
          border-radius: 12px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          box-sizing: border-box;
        }

        input[type="text"]:focus,
        input[type="number"]:focus,
        input[type="time"]:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #667eea;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
          transform: translateY(-1px);
        }

        textarea {
          resize: vertical;
          min-height: 80px;
          font-family: inherit;
        }

        input::placeholder,
        textarea::placeholder {
          color: #a0aec0;
        }

        /* 确保输入框可以正常选择和删除文本 */
        input[type="text"],
        input[type="number"], 
        input[type="time"],
        textarea {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          cursor: text !important;
          -webkit-touch-callout: text !important;
          -webkit-user-modify: read-write !important;
        }

        /* 确保复选框正常工作 */
        input[type="checkbox"] {
          width: auto !important;
          height: auto !important;
          padding: 0 !important;
          margin: 0 4px 0 0 !important;
          cursor: pointer;
        }
        
        .checkbox-group {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
        }
        
        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(102, 126, 234, 0.05);
          padding: 8px 12px;
          border-radius: 8px;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .checkbox-group label:hover {
          background: rgba(102, 126, 234, 0.1);
        }

        .checkbox-group label::after {
          display: none;
        }

        .checkbox-group input[type="checkbox"] {
          width: auto;
          margin: 0;
        }
        
        .config-actions {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 20px 24px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          position: sticky;
          bottom: 0;
        }
        
        button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }

        button:active {
          transform: translateY(0);
        }

        /* 变量管理美化样式 */
        .variable-item {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
          border: 2px solid rgba(102, 126, 234, 0.1);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.3s ease;
        }

        .variable-item:hover {
          border-color: rgba(102, 126, 234, 0.3);
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
          transform: translateY(-1px);
        }

        .variable-number {
          min-width: 32px !important;
          height: 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          padding: 0 !important;
        }

        .variable-input {
          flex: 1 !important;
          border: 1px solid rgba(102, 126, 234, 0.2) !important;
          background: rgba(255, 255, 255, 0.9) !important;
          border-radius: 6px !important;
          outline: none !important;
          font-size: 14px !important;
          color: #2d3748 !important;
          padding: 8px 12px !important;
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          cursor: text !important;
          -webkit-touch-callout: text !important;
          -webkit-user-modify: read-write !important;
          transition: all 0.2s ease !important;
        }

        .variable-input:focus {
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
          transform: none !important;
          background: rgba(255, 255, 255, 1) !important;
          border-color: rgba(102, 126, 234, 0.5) !important;
        }

        .variable-input:hover {
          border-color: rgba(102, 126, 234, 0.3) !important;
        }

        .variable-button {
          padding: 6px 12px !important;
          border: none !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          transition: all 0.2s ease !important;
          box-shadow: none !important;
        }

        .variable-button.select {
          background: linear-gradient(135deg, #48bb78 0%, #38a169 100%) !important;
          color: white !important;
          box-shadow: 0 2px 8px rgba(72, 187, 120, 0.3) !important;
        }

        .variable-button.select:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(72, 187, 120, 0.4) !important;
        }

        .variable-button.delete {
          background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%) !important;
          color: white !important;
          box-shadow: 0 2px 8px rgba(245, 101, 101, 0.3) !important;
        }

        .variable-button.delete:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(245, 101, 101, 0.4) !important;
        }

        .add-variable-button {
          width: 100% !important;
          padding: 16px !important;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%) !important;
          color: #667eea !important;
          border: 2px dashed rgba(102, 126, 234, 0.3) !important;
          border-radius: 12px !important;
          cursor: pointer !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          transition: all 0.3s ease !important;
          box-shadow: none !important;
        }

        .add-variable-button:hover {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%) !important;
          border-color: rgba(102, 126, 234, 0.5) !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
        }
        /* 条件构建器样式 */
        .conditions-list {
          background: rgba(248, 250, 252, 0.8);
          border-radius: 12px;
          padding: 16px;
          margin-top: 12px;
        }

        .condition-item {
          background: white;
          border: 2px solid rgba(102, 126, 234, 0.1);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
          position: relative;
          transition: all 0.3s ease;
        }

        .condition-item:hover {
          border-color: rgba(102, 126, 234, 0.3);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
        }

        .condition-item:last-child {
          margin-bottom: 0;
        }

        .logic-operator {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .condition-controls {
          display: grid;
          grid-template-columns: 2fr 1fr 2fr auto;
          gap: 12px;
          align-items: end;
        }

        .condition-field, .condition-operator, .condition-value {
          display: flex;
          flex-direction: column;
        }

        .condition-field label, .condition-operator label, .condition-value label {
          font-size: 12px;
          margin-bottom: 4px;
          color: #4a5568;
          font-weight: 500;
        }

        .condition-field label::after, .condition-operator label::after, .condition-value label::after {
          display: none;
        }

        .condition-actions {
          display: flex;
          align-items: flex-end;
        }

        @media (max-width: 768px) {
          .condition-controls {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          
          .condition-actions {
            justify-content: center;
            margin-top: 8px;
          }
        }
      `}</style>
    </div>
  )
}
