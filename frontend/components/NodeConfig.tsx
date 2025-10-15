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
import React, { useState, useEffect, useRef } from 'react'
import { Node as RFNode } from 'reactflow'
import api from '../utils/api'
import { PlayCircleOutlined } from '@ant-design/icons' // 导入 PlayCircleOutlined 图标
import PromptFormModal, { Prompt } from './PromptFormModal' // 导入 PromptFormModal 和 Prompt 接口

interface NodeConfigProps {
  node: RFNode
  onUpdate: (nodeId: string, data: any) => void
  onClose: () => void
}

export default function NodeConfig({ node, onUpdate, onClose }: NodeConfigProps) {
  const [showVariableSelector, setShowVariableSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }} >({ show: false })
  const [showMediaSelector, setShowMediaSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }} >({ show: false })
  const [showPromptPreview, setShowPromptPreview] = useState(false) // 新增：显示 prompt 预览
  const [showPromptEditor, setShowPromptEditor] = useState(false) // 新增：显示 prompt 编辑器
  const [localData, setLocalData] = useState<any>(node.data || {})
  const [compiledPromptText, setCompiledPromptText] = useState<string>('')
  const [showHeadersPanel, setShowHeadersPanel] = useState(false)
  const [availableHeaders, setAvailableHeaders] = useState<string[] | null>(null)
  const [loadingHeaders, setLoadingHeaders] = useState(false)
  const [customerStages, setCustomerStages] = useState<any[]>([]) // 新增客户阶段状态
  const [mediaList, setMediaList] = useState<any[]>([])
  const [folderList, setFolderList] = useState<any[]>([])
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null)
  const [folderMediaList, setFolderMediaList] = useState<any[]>([])
  const [promptLibrary, setPromptLibrary] = useState<any[]>([]) // 新增：AI 提示词库
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null) // 新增：当前选中的 Prompt ID
  const [customEntityTypes, setCustomEntityTypes] = useState<any[]>([]) // 新增：自定义实体类型列表
  const [selectedCustomEntityTypeId, setSelectedCustomEntityTypeId] = useState<number | null>(null) // 新增：选中的自定义实体类型ID
  const [selectedCustomEntityRecordId, setSelectedCustomEntityRecordId] = useState<number | null>(null) // 新增：选中的自定义实体记录ID
  const [customEntityRecords, setCustomEntityRecords] = useState<any[]>([]) // 新增：特定实体类型下的记录
  const [showSaveNotification, setShowSaveNotification] = useState<string | null>(null)
  const [showKnowledgeBaseSelector, setShowKnowledgeBaseSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }} >({ show: false })
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]) // 新增：知识库列表

  // 打开变量选择器并锚定到触发元素位置
  const openVariableSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined;
      setShowVariableSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) });
    } catch (err) {
      setShowVariableSelector({ show: true, position: position });
    }
  }

  // 打开媒体选择器并锚定到触发元素位置
  const openMediaSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined;
      setShowMediaSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) });
    } catch (err) {
      setShowMediaSelector({ show: true, position: position });
    }
  }

  // refs for popovers so we can close when clicking outside
  const variablePopoverRef = useRef<HTMLDivElement | null>(null);
  const mediaPopoverRef = useRef<HTMLDivElement | null>(null);
  const knowledgeBasePopoverRef = useRef<HTMLDivElement | null>(null);

  // close popovers when clicking outside
  useEffect(() => {
    if (!showVariableSelector.show && !showMediaSelector.show) return;
    const handler = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (variablePopoverRef.current && variablePopoverRef.current.contains(target)) return;
      if (mediaPopoverRef.current && mediaPopoverRef.current.contains(target)) return;
      if (knowledgeBasePopoverRef.current && knowledgeBasePopoverRef.current.contains(target)) return;
      // clicked outside
      setShowVariableSelector({ show: false });
      setShowMediaSelector({ show: false });
      setShowKnowledgeBaseSelector({ show: false });
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showVariableSelector.show, showMediaSelector.show, showKnowledgeBaseSelector.show]);

  // 新增：获取自定义实体类型
  async function fetchCustomEntityTypes() {
    try {
      const response = await api.get('/api/custom-objects/custom-entity-types/');
      setCustomEntityTypes(response || []);
    } catch (error) {
      console.error('Error fetching custom entity types:', error);
      setCustomEntityTypes([]);
    }
  }

  // 新增：获取特定实体类型下的记录
  async function fetchCustomEntityRecords(entityTypeId: number) {
    try {
      const response = await api.get(`/api/custom-objects/${entityTypeId}/records`); // 假设存在此 API
      setCustomEntityRecords(response || []);
    } catch (error) {
      console.error(`Error fetching records for entity type ${entityTypeId}:`, error);
      setCustomEntityRecords([]);
    }
  }

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

  async function fetchMediaData() {
    if (loadingMedia) return
    setLoadingMedia(true)
    try {
      const response = await api.get('/api/media')
      console.log('fetched media data:', response)
      setMediaList(response.media || [])
      setFolderList(response.folders || [])
    } catch (e) {
      console.error('failed to fetch media data', e)
      setMediaList([])
      setFolderList([])
    } finally {
      setLoadingMedia(false)
    }
  }

  async function fetchFolderMedia(folderName: string) {
    try {
      const response = await api.get(`/api/media?folder=${encodeURIComponent(folderName)}`)
      console.log('fetched folder media:', response)
      setFolderMediaList(response.media || [])
    } catch (e) {
      console.error('failed to fetch folder media', e)
      setFolderMediaList([])
    }
  }
  
  // 当 node.data 变化时更新本地状态 (来自父组件的更新)
  useEffect(() => {
    setLocalData(node.data || {})
    // 如果 node.data 包含 promptLibrary 和 selectedPromptId，则更新状态
    if (node.data?.promptLibrary) {
      setPromptLibrary(node.data.promptLibrary);
    }
    if (node.data?.selectedPromptId) {
      setSelectedPromptId(node.data.selectedPromptId);
    }
    // 新增：如果 node.data 包含自定义实体类型和记录信息，则更新状态
    if (node.data?.selectedCustomEntityTypeId) {
      setSelectedCustomEntityTypeId(node.data.selectedCustomEntityTypeId);
    }
    if (node.data?.selectedCustomEntityRecordId) {
      setSelectedCustomEntityRecordId(node.data.selectedCustomEntityRecordId);
    }
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

  // 新增：当节点类型为 AI 时，加载 AI 提示词库和自定义实体类型
  useEffect(() => {
    if (node.type === 'AI') {
      const fetchPromptLibrary = async () => {
        try {
          const response = await api.get('/api/prompt-library'); // 假设存在此 API
          setPromptLibrary(response || []);
        } catch (error) {
          console.error('Error fetching prompt library:', error);
          setPromptLibrary([]);
        }
      };
      fetchPromptLibrary();
      fetchCustomEntityTypes(); // 在 AI 节点类型时获取自定义实体类型
      const fetchKnowledgeBases = async () => {
        try {
          const response = await api.get('/api/knowledge-base/');
          setKnowledgeBases(response || []);
        } catch (error) {
          console.error('Error fetching knowledge bases:', error);
          setKnowledgeBases([]);
        }
      };
      fetchKnowledgeBases();
    }
  }, [node.type])

  // 新增：当选中的自定义实体类型变化时，加载其对应的记录
  useEffect(() => {
    if (selectedCustomEntityTypeId) {
      fetchCustomEntityRecords(selectedCustomEntityTypeId);
    } else {
      setCustomEntityRecords([]); // 如果没有选择实体类型，则清空记录
    }
  }, [selectedCustomEntityTypeId]);

  // 当 promptLibrary 或 selectedPromptId 变化时，自动更新节点数据
  useEffect(() => {
    if (node.type === 'AI') {
      updateNodeData({});
    }
  }, [promptLibrary, selectedPromptId, selectedCustomEntityTypeId, selectedCustomEntityRecordId]);
  
  const updateNodeData = (updates: any) => {
    // 如果有选中的 prompt，将其内容同步到 localData，以便工作流执行时使用
    const currentPrompt = promptLibrary.find((p: any) => p.id === selectedPromptId);
    const newData = { 
      ...localData, 
      ...updates, 
      promptLibrary: promptLibrary, // 保存整个提示词库
      selectedPromptId: selectedPromptId, // 保存当前选中的 Prompt ID
      // 同步选中的 prompt 内容到 localData，以便工作流执行时使用
      system_prompt: currentPrompt?.system_prompt || localData.system_prompt || '',
      user_prompt: currentPrompt?.user_prompt || localData.user_prompt || '',
      // 新增：保存选中的自定义实体类型和记录 ID
      selectedCustomEntityTypeId: selectedCustomEntityTypeId,
      selectedCustomEntityRecordId: selectedCustomEntityRecordId,
    }
    setLocalData(newData)
    onUpdate(node.id, newData)
  }

  const handleVariableSelect = (variableValue: string) => {
    let finalVariableValue = variableValue;
    // 如果变量是自定义实体记录字段，则替换 recordId 占位符
    if (variableValue.includes('.recordId.') && selectedCustomEntityRecordId) {
      const entityTypeIdMatch = variableValue.match(/{{custom_object\.(\d+)\.recordId\.(.*)}}/);
      if (entityTypeIdMatch) {
        finalVariableValue = `{{custom_object.${entityTypeIdMatch[1]}.${selectedCustomEntityRecordId}.${entityTypeIdMatch[2]}}}`;
      }
    } else if (variableValue.includes('.all') && variableValue.includes('custom_object') && selectedCustomEntityTypeId) {
      // 如果是 {{custom_object.entityTypeId.all}} 形式，则替换 entityTypeId
      const entityTypeIdMatch = variableValue.match(/{{custom_object\.(\d+)\.all}}/);
      if (entityTypeIdMatch) {
        finalVariableValue = `{{custom_object.${selectedCustomEntityTypeId}.all}}`;
      }
    }

    if (showVariableSelector.position === 'fallback') {
      const currentTemplate = localData.fallback_template || '';
      const newTemplate = currentTemplate + finalVariableValue;
      updateNodeData({ fallback_template: newTemplate });
    } else if (showVariableSelector.position === 'system_prompt') {
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, system_prompt: (p.system_prompt || '') + finalVariableValue }
            : p
        ));
      } else {
        const currentPrompt = localData.system_prompt || '';
        const newPrompt = currentPrompt + finalVariableValue;
        updateNodeData({ system_prompt: newPrompt });
      }
    } else if (showVariableSelector.position === 'user_prompt') {
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, user_prompt: (p.user_prompt || '') + finalVariableValue }
            : p
        ));
      } else {
        const currentPrompt = localData.user_prompt || '';
        const newPrompt = currentPrompt + finalVariableValue;
        updateNodeData({ user_prompt: newPrompt });
      }
    } else {
      const variables = localData.variables || {};
      if (showVariableSelector.position) {
        variables[showVariableSelector.position] = finalVariableValue;
        updateNodeData({ variables });
      }
    }
    setShowVariableSelector({ show: false });
  };

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
        <label>选择或创建 AI Prompt</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={selectedPromptId || ''}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">-- 新建 Prompt --</option>
            {promptLibrary.map((prompt: any) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.name}
              </option>
            ))}
          </select>
            <button
              className="small-action-button"
              onClick={() => {
              // TODO: Logic to create a new prompt in the library
              const newPrompt = {
                id: Date.now().toString(),
                _local: true,
                name: `新 Prompt ${promptLibrary.length + 1}`,
                description: '',
                system_prompt: '',
                user_prompt: '',
              }
              setPromptLibrary([...promptLibrary, newPrompt]);
              setSelectedPromptId(newPrompt.id);
            }}
          >
            新建
            </button>
        </div>
      </div>

      {/* 预览按钮 */}
      {selectedPromptId && promptLibrary.find((p: any) => p.id === selectedPromptId) && (
      <div className="config-field">
            <button
              className="small-action-button"
            onClick={() => setShowPromptPreview(true)}
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
              color: 'white',
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            🔍 预览完整 Prompt
            </button>
          </div>
      )}

      {selectedPromptId && promptLibrary.find((p: any) => p.id === selectedPromptId) ? (
        <>
          {/* Prompt 名称/描述 已移入编辑模态（避免主配置面板拥挤） */}

          {/* Prompt 的编辑/删除操作已移除；请在 AI Prompt Library 页面或预览中管理 Prompt */}
        </>
      ) : (
        <div className="config-field">
          <p style={{ color: '#666', textAlign: 'center' }}>请选择一个 Prompt 或点击 "新建" 创建。</p>
        </div>
      )}

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
        <label>媒体发送设置</label>
        <div style={{ marginTop: '8px' }}>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={localData.media_settings?.send_media_separately || false}
                onChange={(e) => updateNodeData({
                  media_settings: {
                    ...localData.media_settings,
                    send_media_separately: e.target.checked
                  }
                })}
                style={{ marginRight: '8px' }}
              />
              媒体与文本分开发送
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
              勾选后，媒体文件将单独发送，不附带文本消息
            </div>
          </div>
          
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={localData.media_settings?.send_with_caption || true}
                onChange={(e) => updateNodeData({
                  media_settings: {
                    ...localData.media_settings,
                    send_with_caption: e.target.checked
                  }
                })}
                style={{ marginRight: '8px' }}
                disabled={localData.media_settings?.send_media_separately}
              />
              媒体附带文本说明
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
              媒体文件将与 AI 生成的回复文本一起发送
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={localData.media_settings?.delay_between_media || false}
                onChange={(e) => updateNodeData({
                  media_settings: {
                    ...localData.media_settings,
                    delay_between_media: e.target.checked
                  }
                })}
                style={{ marginRight: '8px' }}
              />
              媒体间延迟发送
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
              发送多个媒体文件时，在每个文件之间添加延迟
            </div>
            {localData.media_settings?.delay_between_media && (
              <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                <label style={{ fontSize: '12px', color: '#666' }}>延迟时间（秒）:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={localData.media_settings?.delay_seconds || 2}
                  onChange={(e) => updateNodeData({
                    media_settings: {
                      ...localData.media_settings,
                      delay_seconds: parseInt(e.target.value)
                    }
                  })}
                  style={{ marginLeft: '8px', width: '60px' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>


      {/* 聊天历史配置 */}
      <div className="config-field">
        <label>聊天历史设置</label>
        <div style={{ marginTop: '8px' }}>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={localData.chat_history?.enabled || false}
                onChange={(e) => updateNodeData({
                  chat_history: {
                    ...localData.chat_history,
                    enabled: e.target.checked
                  }
                })}
                style={{ marginRight: '8px' }}
              />
              启用聊天历史
              <span style={{ fontSize: '16px', cursor: 'help', marginLeft: '8px' }} title="将客户的聊天历史记录传递给 AI，帮助 AI 更好地理解上下文">
                ℹ️
              </span>
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
              将客户的聊天历史记录传递给 AI，帮助 AI 更好地理解上下文
            </div>
          </div>

          {localData.chat_history?.enabled && (
            <>
              <div style={{ marginBottom: '8px', marginLeft: '24px' }}>
                <label style={{ fontSize: '12px', color: '#666' }}>历史记录条数:</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={localData.chat_history?.message_count || 10}
                  onChange={(e) => updateNodeData({
                    chat_history: {
                      ...localData.chat_history,
                      message_count: parseInt(e.target.value)
                    }
                  })}
                  style={{ width: '80px', marginLeft: '8px' }}
                />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  获取最近的 N 条聊天记录（包括客户和 AI 的消息）
                </div>
              </div>

              <div style={{ marginBottom: '8px', marginLeft: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={localData.chat_history?.include_timestamps || false}
                    onChange={(e) => updateNodeData({
                      chat_history: {
                        ...localData.chat_history,
                        include_timestamps: e.target.checked
                      }
                    })}
                    style={{ marginRight: '8px' }}
                  />
                  包含时间戳
                </label>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                  在聊天历史中包含消息的发送时间
                </div>
              </div>

              <div style={{ marginLeft: '24px' }}>
                <label style={{ fontSize: '12px', color: '#666' }}>历史记录格式预览:</label>
                <div style={{ 
                  padding: '8px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#495057',
                  marginTop: '4px'
                }}>
                  {localData.chat_history?.include_timestamps ? (
                    <>
                      [2024-10-14 10:30] 客户: 你好，我想了解一下房价<br/>
                      [2024-10-14 10:31] AI: 您好！我很乐意为您介绍...<br/>
                      [2024-10-14 10:32] 客户: 有什么优惠吗？
                    </>
                  ) : (
                    <>
                      客户: 你好，我想了解一下房价<br/>
                      AI: 您好！我很乐意为您介绍...<br/>
                      客户: 有什么优惠吗？
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
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

      {/* 智能延迟配置 */}
      <div className="config-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={localData.enable_smart_delay || false}
            onChange={(e) => updateNodeData({ enable_smart_delay: e.target.checked })}
          />
          启用智能延迟
          <span style={{ fontSize: '16px', cursor: 'help' }} title="根据消息长度智能计算发送延迟时间，模拟真人打字速度">
            ℹ️
          </span>
        </label>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          根据消息长度自动计算延迟时间，模拟真人打字和阅读速度
        </div>
      </div>

      {localData.enable_smart_delay && (
        <>
          <div className="config-field">
            <label>基础延迟 (秒)</label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.1"
              value={localData.base_delay || 1}
              onChange={(e) => updateNodeData({ base_delay: parseFloat(e.target.value) })}
              placeholder="1"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              每条消息的基础延迟时间（秒）
            </div>
          </div>

          <div className="config-field">
            <label>每字符延迟 (毫秒)</label>
            <input
              type="number"
              min="0"
              max="200"
              value={localData.delay_per_char || 50}
              onChange={(e) => updateNodeData({ delay_per_char: parseInt(e.target.value) })}
              placeholder="50"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              每个字符增加的延迟时间（毫秒）。中英文字符均按1个字符计算
            </div>
          </div>

          <div className="config-field">
            <label>最大延迟 (秒)</label>
            <input
              type="number"
              min="1"
              max="60"
              value={localData.max_delay || 10}
              onChange={(e) => updateNodeData({ max_delay: parseInt(e.target.value) })}
              placeholder="10"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              延迟时间的上限，防止过长消息导致延迟过久
            </div>
          </div>

          {/* 延迟预览 */}
          <div className="config-field">
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '4px',
              fontSize: '12px',
              color: '#666'
            }}>
              <strong>延迟预览：</strong>
              <br />
              • 10字符消息：{((localData.base_delay || 1) + (10 * (localData.delay_per_char || 50)) / 1000).toFixed(1)}秒
              <br />
              • 50字符消息：{Math.min((localData.base_delay || 1) + (50 * (localData.delay_per_char || 50)) / 1000, localData.max_delay || 10).toFixed(1)}秒
              <br />
              • 100字符消息：{Math.min((localData.base_delay || 1) + (100 * (localData.delay_per_char || 50)) / 1000, localData.max_delay || 10).toFixed(1)}秒
            </div>
          </div>
        </>
      )}

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
                    onClick={() => {
                      setShowVariableSelector({ show: true, position: key })
                      fetchCustomerFields() // 获取最新的客户字段
                    }}
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
                  onClick={() => {
                    setShowVariableSelector({ show: true, position: 'fallback' })
                    fetchCustomerFields() // 获取最新的客户字段
                  }}
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
    const currentPrompt = promptLibrary.find((p: any) => p.id === selectedPromptId);
    const system = currentPrompt?.system_prompt || '';
    const user = currentPrompt?.user_prompt || '';
    const combined = `=== System Prompt ===\n${system}\n\n=== User Prompt ===\n${user}`;

    const vars = localData.variables || {};
    return combined.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m: string, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
      return `<${key}>`;
    });
  }

  // 动态变量选项 - 从后端获取
  const [availableVariables, setAvailableVariables] = useState<any>({
    '触发器数据': [
      { label: '发送者姓名', value: '{{trigger.name}}', description: '发送消息的用户姓名' },
      { label: '发送者电话', value: '{{trigger.phone}}', description: '发送消息的用户电话号码' },
      { label: '发送者邮箱', value: '{{trigger.email}}', description: '发送消息的用户邮箱' },
      { label: '消息内容', value: '{{trigger.content}}', description: '用户发送的原始消息内容' },
      { label: '消息类型', value: '{{trigger.message_type}}', description: '消息类型（文本/图片/视频等）' },
      { label: '时间戳', value: '{{trigger.timestamp}}', description: '消息发送的时间' },
      { label: '触发器ID', value: '{{trigger.id}}', description: '触发器的唯一标识' },
      { label: '消息来源', value: '{{trigger.source}}', description: '消息来源平台（WhatsApp/Telegram等）' },
    ],
    '客户基础信息': [
      { label: '所有客户信息', value: '{{customer.all}}', description: '包含所有客户基础和自定义字段的信息' },
    ],
    '客户自定义字段': [],
  })

  useEffect(() => {
    fetchCustomerFields()
    // 新增：处理自定义实体类型变量
    if (customEntityTypes.length > 0) {
      setAvailableVariables((prev: any) => {
        const newVars = { ...prev };
        customEntityTypes.forEach((entityType) => {
          const categoryName = `${entityType.name} 记录`;
          // 添加一个变量来选择整个记录
          const allRecordVar = { 
            label: `所有 ${entityType.name} 信息`, 
            value: `{{custom_object.${entityType.id}.all}}`, 
            description: `包含所有 ${entityType.name} 记录信息` 
          };
          newVars[categoryName] = [allRecordVar];

          entityType.fields.forEach((field: any) => {
            newVars[categoryName].push({
              label: `${field.name} (${field.field_key})`,
              value: `{{custom_object.${entityType.id}.recordId.${field.field_key}}}`, // 占位符 recordId，后续用户选择
              description: `${entityType.name} 的 ${field.name} 字段`
            });
          });
        });
        return newVars;
      });
    }
  }, [customEntityTypes])

  // 获取客户字段数据
  const fetchCustomerFields = async () => {
    try {
      const response = await api.get('/api/customers/fields/detailed')
      console.log('Fetched customer fields:', response)
      
      // 更新变量选择器中的客户相关数据
      setAvailableVariables((prev: any) => ({
        ...prev,
        '客户基础信息': response.basic_fields || [],
        '客户自定义字段': response.custom_fields || []
      }))
    } catch (error) {
      console.error('Failed to fetch customer fields:', error)
    }
  }

  const fetchKnowledgeBases = async () => {
    try {
      const response = await api.get('/api/knowledge-base/');
      setKnowledgeBases(response || []);
    } catch (error) {
      console.error('Error fetching knowledge bases:', error);
      setKnowledgeBases([]);
    }
  };

  const openKnowledgeBaseSelector = async (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined;
      try {
        const resp = await api.get('/api/knowledge-base/');
        setKnowledgeBases(resp || []);
      } catch (err) {
        console.error('Error fetching knowledge bases on open:', err);
        setKnowledgeBases([]);
      }
      setShowKnowledgeBaseSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) });
    } catch (err) {
      setShowKnowledgeBaseSelector({ show: true, position: position });
    }
  };

  return (
      <div className="node-config-panel" style={{ 
        background: '#ffffff', 
        borderRadius: '16px', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ 
          background: '#ffffff', 
          margin: 0, 
          padding: '20px 24px', 
          borderBottom: '1px solid #e2e8f0',
          borderRadius: '16px 16px 0 0'
        }}>
          配置节点: {node.type}
        </h3>
        <div className="config-fields" style={{ 
          background: '#ffffff', 
          padding: '24px', 
          flex: 1, 
          overflowY: 'auto' 
        }}>
        {renderConfigFields()}
      </div>
      <div className="config-actions">
        <button onClick={onClose}>关闭</button>
      </div>

      {/* 变量选择器弹窗 - 美化版本 */}
      {showVariableSelector.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          zIndex: 2300,
          pointerEvents: 'none'
        }}>
          <div ref={variablePopoverRef} style={{
            pointerEvents: 'auto',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '12px',
            padding: '12px',
            width: '360px',
            maxHeight: '60vh',
            overflow: 'auto',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0,0,0,0.06)',
            position: showVariableSelector.anchor ? 'absolute' : 'fixed',
            left: showVariableSelector.anchor ? `${(showVariableSelector as any).anchor.left}px` : '50%',
            top: showVariableSelector.anchor ? `${(showVariableSelector as any).anchor.top}px` : '50%',
            transform: showVariableSelector.anchor ? 'translateY(8px)' : 'translate(-50%, -50%)'
          }}>
            {/* 头部区域 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '2px solid rgba(102, 126, 234, 0.1)'
            }}>
              <div>
                <h4 style={{ 
                  margin: 0, 
                  fontSize: '20px', 
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  🎯 选择变量
                </h4>
                <p style={{ 
                  margin: '4px 0 0 0', 
                  fontSize: '14px', 
                  color: '#64748b',
                  fontWeight: '500'
                }}>
                  点击下方变量插入到您的 Prompt 中
                </p>
              </div>
              <button
                onClick={() => setShowVariableSelector({ show: false })}
                style={{
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  border: 'none',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
                  e.currentTarget.style.color = '#dc2626';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ×
              </button>
            </div>

            {/* 滚动内容区域 */}
            <div style={{
              maxHeight: 'calc(80vh - 160px)',
              overflow: 'auto',
              paddingRight: '8px'
            }}>
            {Object.entries(availableVariables).map(([category, variables]) => (
                <div key={category} style={{ marginBottom: '24px' }}>
                  {/* 分类标题 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '16px',
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(102, 126, 234, 0.15)'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      marginRight: '12px'
                    }}></div>
                <h5 style={{ 
                      margin: 0, 
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1e293b'
                }}>
                  {category}
                </h5>
                  </div>

                  {/* 自定义实体类型选择器 */}
                  {category.includes('记录') && customEntityTypes.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontSize: '13px', 
                        color: '#475569',
                        fontWeight: '600'
                      }}>
                        📋 选择实体类型:
                      </label>
                      <select
                        value={selectedCustomEntityTypeId || ''}
                        onChange={(e) => {
                          setSelectedCustomEntityTypeId(e.target.value ? Number(e.target.value) : null);
                          setSelectedCustomEntityRecordId(null);
                      }}
                      style={{
                          width: '100%', 
                          padding: '12px 16px', 
                          border: '2px solid rgba(102, 126, 234, 0.2)', 
                          borderRadius: '12px',
                          fontSize: '14px',
                          background: 'white',
                          color: '#1e293b',
                          outline: 'none',
                          transition: 'all 0.2s ease'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#667eea';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.2)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <option value="">请选择实体类型...</option>
                        {customEntityTypes.map((et) => (
                          <option key={et.id} value={et.id}>{et.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 自定义实体记录选择器 */}
                  {selectedCustomEntityTypeId && customEntityRecords.length > 0 && category.includes('记录') && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontSize: '13px', 
                        color: '#475569',
                        fontWeight: '600'
                      }}>
                        📝 选择记录:
                      </label>
                      <select
                        value={selectedCustomEntityRecordId || ''}
                        onChange={(e) => setSelectedCustomEntityRecordId(e.target.value ? Number(e.target.value) : null)}
                        style={{ 
                          width: '100%', 
                          padding: '12px 16px', 
                          border: '2px solid rgba(102, 126, 234, 0.2)', 
                          borderRadius: '12px',
                          fontSize: '14px',
                          background: 'white',
                          color: '#1e293b',
                          outline: 'none',
                          transition: 'all 0.2s ease'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#667eea';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.2)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <option value="">请选择记录...</option>
                        {customEntityRecords.map((record) => (
                          <option key={record.id} value={record.id}>
                            {record.data?.name || `记录 ${record.id}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 变量按钮网格 */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                    gap: '12px' 
                  }}>
                    {(variables as any[]).map((variable, varIndex) => {
                      const variableValue = variable.value;
                      const isDisabled = variableValue.includes('.recordId.') && !selectedCustomEntityRecordId;

                      return (
                        <button
                          key={varIndex}
                          onClick={() => handleVariableSelect(variable.value)}
                          disabled={isDisabled}
                          style={{ 
                            padding: '16px', 
                            border: isDisabled ? '2px solid #e2e8f0' : '2px solid rgba(102, 126, 234, 0.15)', 
                            borderRadius: '12px', 
                            background: isDisabled 
                              ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' 
                              : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                            textAlign: 'left', 
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          title={variable.description}
                      onMouseEnter={(e) => {
                            if (!isDisabled) {
                              e.currentTarget.style.borderColor = '#667eea';
                              e.currentTarget.style.background = 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.15)';
                            }
                      }}
                      onMouseLeave={(e) => {
                            if (!isDisabled) {
                              e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.15)';
                              e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }
                          }}
                        >
                          {/* 变量标签 */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            marginBottom: '8px' 
                          }}>
                            <div style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isDisabled 
                                ? '#94a3b8' 
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              marginRight: '8px'
                            }}></div>
                            <span style={{ 
                              fontWeight: '600', 
                              fontSize: '14px',
                              color: isDisabled ? '#94a3b8' : '#1e293b'
                            }}>
                        {variable.label}
                            </span>
                      </div>
                          
                          {/* 变量值 */}
                      <div style={{ 
                            background: isDisabled 
                              ? 'rgba(148, 163, 184, 0.1)' 
                              : 'rgba(102, 126, 234, 0.08)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                        fontSize: '12px', 
                            color: isDisabled ? '#94a3b8' : '#4338ca',
                            fontWeight: '500'
                      }}>
                        {variable.value}
                      </div>
                          
                          {/* 描述 */}
                          <div style={{ 
                            fontSize: '12px', 
                            color: isDisabled ? '#94a3b8' : '#64748b',
                            lineHeight: '1.4'
                          }}>
                        {variable.description}
                      </div>

                          {/* 禁用状态提示 */}
                          {isDisabled && (
                            <div style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: '#fbbf24',
                              color: '#92400e',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              需选择记录
                    </div>
                          )}
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>

            {/* 底部操作区域 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '12px', 
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '2px solid rgba(102, 126, 234, 0.1)'
            }}>
              <button
                onClick={() => setShowVariableSelector({ show: false })}
                style={{ 
                  padding: '12px 24px', 
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', 
                  border: 'none', 
                  borderRadius: '12px', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#475569',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
              >
                关闭
              </button>
            </div>
          </div>

        </div>
      )}

      {/* 媒体选择器弹窗 */}
      {showMediaSelector.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          zIndex: 2300,
          pointerEvents: 'none'
        }}>
          <div ref={mediaPopoverRef} style={{
            pointerEvents: 'auto',
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '12px',
            width: '480px',
            maxHeight: '60vh',
            overflow: 'auto',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)'
            ,
            position: showMediaSelector.anchor ? 'absolute' : 'fixed',
            left: showMediaSelector.anchor ? `${(showMediaSelector as any).anchor.left}px` : '50%',
            top: showMediaSelector.anchor ? `${(showMediaSelector as any).anchor.top}px` : '50%',
            transform: showMediaSelector.anchor ? 'translateY(8px)' : 'translate(-50%, -50%)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              borderBottom: '1px solid #e9ecef',
              paddingBottom: '8px'
            }}>
              <h4 style={{ margin: 0 }}>选择媒体资源</h4>
              <button
                onClick={() => setShowMediaSelector({ show: false })}
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

            {loadingMedia ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                加载中...
              </div>
            ) : (
              <>
                <p style={{ color: '#666', marginBottom: '16px' }}>
                  请选择一个媒体文件或目录，其标识符将被插入到您的 Prompt 中。
                </p>

                {/* 文件夹列表 */}
                {folderList.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 8px 0', color: '#007bff' }}>📁 文件夹</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                      {folderList.map((folder, index) => (
                        <div key={index}>
                          <div
                            onClick={() => {
                              if (expandedFolder === folder.name) {
                                setExpandedFolder(null);
                                setFolderMediaList([]);
                              } else {
                                setExpandedFolder(folder.name);
                                fetchFolderMedia(folder.name);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                if (expandedFolder === folder.name) {
                                  setExpandedFolder(null);
                                  setFolderMediaList([]);
                                } else {
                                  setExpandedFolder(folder.name);
                                  fetchFolderMedia(folder.name);
                                }
                              }
                            }}
                            style={{
                              padding: '12px',
                              borderRadius: '4px',
                              border: '1px solid #e9ecef',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              backgroundColor: expandedFolder === folder.name ? '#e3f2fd' : '#f8f9fa',
                              textAlign: 'center'
                            }}
                            onMouseEnter={(e) => {
                              if (expandedFolder !== folder.name) {
                                e.currentTarget.style.backgroundColor = '#e9ecef';
                                e.currentTarget.style.borderColor = '#007bff';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (expandedFolder !== folder.name) {
                                e.currentTarget.style.backgroundColor = '#f8f9fa';
                                e.currentTarget.style.borderColor = '#e9ecef';
                              }
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '24px', marginBottom: '4px' }}>📁</div>
                                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{folder.name}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>{folder.media_count} 项</div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const tag = `[[FOLDER:${folder.name}]]`;
                                    let updatedPrompt = '';
                                    let currentPrompt = '';

                                    if (showMediaSelector.position === 'system_prompt') {
                                      if (selectedPromptId) {
                                        setPromptLibrary(promptLibrary.map((p: any) => 
                                          p.id === selectedPromptId 
                                            ? { ...p, system_prompt: (p.system_prompt || '') + tag }
                                            : p
                                        ));
                                      } else {
                                      currentPrompt = localData.system_prompt || '';
                                      updatedPrompt = currentPrompt + tag;
                                      updateNodeData({ system_prompt: updatedPrompt });
                                      }
                                    } else if (showMediaSelector.position === 'user_prompt') {
                                      if (selectedPromptId) {
                                        setPromptLibrary(promptLibrary.map((p: any) => 
                                          p.id === selectedPromptId 
                                            ? { ...p, user_prompt: (p.user_prompt || '') + tag }
                                            : p
                                        ));
                                      } else {
                                      currentPrompt = localData.user_prompt || '';
                                      updatedPrompt = currentPrompt + tag;
                                      updateNodeData({ user_prompt: updatedPrompt });
                                      }
                                    }

                                    setShowMediaSelector({ show: false });
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  选择整个文件夹
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (expandedFolder === folder.name) {
                                      setExpandedFolder(null);
                                      setFolderMediaList([]);
                                    } else {
                                      setExpandedFolder(folder.name);
                                      fetchFolderMedia(folder.name);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {expandedFolder === folder.name ? '收起' : '展开'}
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          {/* 展开的文件夹内容 */}
                          {expandedFolder === folder.name && (
                            <div style={{ 
                              marginTop: '8px', 
                              padding: '8px', 
                              backgroundColor: '#f0f8ff', 
                              borderRadius: '4px',
                              border: '1px solid #b3d9ff'
                            }}>
                              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                                文件夹 "{folder.name}" 中的文件：
                              </div>
                              {folderMediaList.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px' }}>
                                  {folderMediaList.map((media, mediaIndex) => (
                                    <div
                                      key={mediaIndex}
                                      onClick={() => {
                                        const tag = `[[MEDIA:${media.id}]]`;
                                        let updatedPrompt = '';
                                        let currentPrompt = '';

                                        if (showMediaSelector.position === 'system_prompt') {
                                          if (selectedPromptId) {
                                            setPromptLibrary(promptLibrary.map((p: any) => 
                                              p.id === selectedPromptId 
                                                ? { ...p, system_prompt: (p.system_prompt || '') + tag }
                                                : p
                                            ));
                                          } else {
                                          currentPrompt = localData.system_prompt || '';
                                          updatedPrompt = currentPrompt + tag;
                                          updateNodeData({ system_prompt: updatedPrompt });
                                          }
                                        } else if (showMediaSelector.position === 'user_prompt') {
                                          if (selectedPromptId) {
                                            setPromptLibrary(promptLibrary.map((p: any) => 
                                              p.id === selectedPromptId 
                                                ? { ...p, user_prompt: (p.user_prompt || '') + tag }
                                                : p
                                            ));
                                          } else {
                                          currentPrompt = localData.user_prompt || '';
                                          updatedPrompt = currentPrompt + tag;
                                          updateNodeData({ user_prompt: updatedPrompt });
                                          }
                                        }

                                        setShowMediaSelector({ show: false });
                                      }}
                                      style={{
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #cce7ff',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: 'white',
                                        textAlign: 'center'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#e6f3ff';
                                        e.currentTarget.style.borderColor = '#007bff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'white';
                                        e.currentTarget.style.borderColor = '#cce7ff';
                                      }}
                                    >
                                      {media.file_url && media.media_type === 'image' ? (
                                        <img 
                                          src={media.file_url} 
                                          alt={media.filename}
                                          style={{ 
                                            width: '100%', 
                                            height: '60px', 
                                            objectFit: 'cover', 
                                            borderRadius: '3px',
                                            marginBottom: '3px'
                                          }}
                                        />
                                      ) : (
                                        <div style={{ 
                                          width: '100%', 
                                          height: '60px', 
                                          backgroundColor: '#f0f0f0',
                                          borderRadius: '3px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          marginBottom: '3px',
                                          fontSize: '20px'
                                        }}>
                                          {media.media_type === 'video' ? '🎥' : 
                                           media.media_type === 'audio' ? '🎵' : 
                                           media.media_type === 'document' ? '📄' : '📎'}
                                        </div>
                                      )}
                                      <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '1px' }}>
                                        {media.filename.length > 12 ? media.filename.substring(0, 12) + '...' : media.filename}
                                      </div>
                                      <div style={{ fontSize: '9px', color: '#666' }}>
                                        {media.media_type}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', color: '#666', fontSize: '12px' }}>
                                  文件夹为空
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 媒体文件列表 */}
                {mediaList.length > 0 && (
                  <div>
                    <h5 style={{ margin: '0 0 8px 0', color: '#007bff' }}>🖼️ 媒体文件</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                      {mediaList.map((media, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            const tag = `[[MEDIA:${media.id}]]`;
                            let updatedPrompt = '';
                            let currentPrompt = '';

                            if (showMediaSelector.position === 'system_prompt') {
                              if (selectedPromptId) {
                                setPromptLibrary(promptLibrary.map((p: any) => 
                                  p.id === selectedPromptId 
                                    ? { ...p, system_prompt: (p.system_prompt || '') + tag }
                                    : p
                                ));
                              } else {
                              currentPrompt = localData.system_prompt || '';
                              updatedPrompt = currentPrompt + tag;
                              updateNodeData({ system_prompt: updatedPrompt });
                              }
                            } else if (showMediaSelector.position === 'user_prompt') {
                              if (selectedPromptId) {
                                setPromptLibrary(promptLibrary.map((p: any) => 
                                  p.id === selectedPromptId 
                                    ? { ...p, user_prompt: (p.user_prompt || '') + tag }
                                    : p
                                ));
                              } else {
                              currentPrompt = localData.user_prompt || '';
                              updatedPrompt = currentPrompt + tag;
                              updateNodeData({ user_prompt: updatedPrompt });
                              }
                            }

                            setShowMediaSelector({ show: false });
                          }}
                          style={{
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #e9ecef',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: '#f8f9fa',
                            textAlign: 'center'
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
                          {media.file_url && media.media_type === 'image' ? (
                            <img 
                              src={media.file_url} 
                              alt={media.filename}
                              style={{ 
                                width: '100%', 
                                height: '80px', 
                                objectFit: 'cover', 
                                borderRadius: '4px',
                                marginBottom: '4px'
                              }}
                            />
                          ) : (
                            <div style={{ 
                              width: '100%', 
                              height: '80px', 
                              backgroundColor: '#dee2e6',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: '4px',
                              fontSize: '24px'
                            }}>
                              {media.media_type === 'video' ? '🎥' : 
                               media.media_type === 'audio' ? '🎵' : 
                               media.media_type === 'document' ? '📄' : '📎'}
                            </div>
                          )}
                          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>
                            {media.filename.length > 15 ? media.filename.substring(0, 15) + '...' : media.filename}
                          </div>
                          <div style={{ fontSize: '10px', color: '#666' }}>
                            {media.media_type} • {media.folder || '未分类'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mediaList.length === 0 && folderList.length === 0 && !loadingMedia && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    暂无媒体文件
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Prompt 预览弹窗 - 详细版本 */}
      {showPromptPreview && selectedPromptId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '32px',
            width: '900px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {/* 头部 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '2px solid #f0f0f0'
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '24px', 
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                🔍 Prompt 预览
              </h2>
              <button
                onClick={() => setShowPromptPreview(false)}
                style={{
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  border: 'none',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
                  e.currentTarget.style.color = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                ×
              </button>
            </div>

            {(() => {
              const currentPrompt = promptLibrary.find((p: any) => p.id === selectedPromptId);
              if (!currentPrompt) return null;

              return (
              <div>
                  {/* Prompt 基本信息 */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
                      padding: '20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(102, 126, 234, 0.15)'
                    }}>
                      <h3 style={{ 
                        fontSize: '20px', 
                        fontWeight: '600', 
                        color: '#1e293b', 
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        📝 {currentPrompt.name}
                      </h3>
                      {currentPrompt.description && (
                        <p style={{ 
                          fontSize: '16px', 
                          color: '#64748b', 
                          margin: 0,
                          lineHeight: '1.5'
                        }}>
                          {currentPrompt.description}
                        </p>
                      )}
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#94a3b8', 
                        marginTop: '8px',
                        fontFamily: 'monospace'
                      }}>
                        ID: {currentPrompt.id}
              </div>
            </div>
          </div>

                  {/* System Prompt */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#667eea', 
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      🤖 System Prompt
                    </h3>
                    <div style={{
                      background: '#f8fafc',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                      color: '#374151'
                    }}>
                      {currentPrompt.system_prompt || '(未设置)'}
        </div>
                  </div>

                  {/* User Prompt */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#667eea', 
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      👤 User Prompt
                    </h3>
                    <div style={{
                      background: '#f8fafc',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                      color: '#374151'
                    }}>
                      {currentPrompt.user_prompt || '(未设置)'}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '12px',
                    paddingTop: '16px',
                    borderTop: '2px solid #f0f0f0'
                  }}>
                    <button
                      onClick={() => {
                        const fullPromptText = `=== ${currentPrompt.name} ===\n\n` +
                          `描述: ${currentPrompt.description || '无'}\n\n` +
                          `=== System Prompt ===\n${currentPrompt.system_prompt || '(未设置)'}\n\n` +
                          `=== User Prompt ===\n${currentPrompt.user_prompt || '(未设置)'}`;
                        navigator.clipboard?.writeText(fullPromptText);
                        alert('Prompt 内容已复制到剪贴板！');
                      }}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      📋 复制全部
                    </button>
                    {/* 新增：在预览中加入 编辑 按钮，打开 Prompt 编辑模态 */}
                    <button
                      onClick={() => setShowPromptEditor(true)}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ✏️ 编辑 Prompt
                    </button>
                    <button
                      onClick={() => setShowPromptPreview(false)}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      关闭预览
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
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

      {/* Prompt 编辑器弹窗 */}
      {showPromptEditor && selectedPromptId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2500 }}>
          <PromptFormModal
            prompt={promptLibrary.find((p: any) => p.id === selectedPromptId)}
            onSave={async (data) => {
              try {
                await api.put(`/api/prompt-library/${selectedPromptId}`, data);
                // 更新本地 promptLibrary 状态
                setPromptLibrary((prev: any) =>
                  prev.map((p: any) =>
                    p.id === selectedPromptId ? { ...p, system_prompt: data.system_prompt, user_prompt: data.user_prompt } : p
                  )
                );
                // 更新 React Flow 节点数据
                updateNodeData((prevData: any) => ({
                  ...prevData,
                  selected_prompt_system_prompt: data.system_prompt,
                  selected_prompt_user_prompt: data.user_prompt,
                }));
                          setShowPromptEditor(false);
                setShowSaveNotification('Prompt 更新成功');
                          setTimeout(() => setShowSaveNotification(null), 3000);
                        } catch (error) {
                console.error('Error updating prompt:', error);
                alert('更新 Prompt 失败');
              }
            }}
            onCancel={() => setShowPromptEditor(false)}
          />
        </div>
      )}

      {/* 知识库选择器弹窗 */}
      {showKnowledgeBaseSelector.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.0)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          zIndex: 2300,
          pointerEvents: 'none'
        }}>
          <div ref={knowledgeBasePopoverRef} style={{
            pointerEvents: 'auto',
            background: 'white',
            borderRadius: '12px',
            padding: '16px',
            width: '480px',
            maxHeight: '60vh',
            overflow: 'auto',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0,0,0,0.06)',
            position: (showKnowledgeBaseSelector as any).anchor ? 'absolute' : 'fixed',
            left: (showKnowledgeBaseSelector as any).anchor ? `${(showKnowledgeBaseSelector as any).anchor.left}px` : '50%',
            top: (showKnowledgeBaseSelector as any).anchor ? `${(showKnowledgeBaseSelector as any).anchor.top}px` : '50%',
            transform: (showKnowledgeBaseSelector as any).anchor ? 'translateY(8px)' : 'translate(-50%, -50%)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>选择知识库</h4>
              <button onClick={() => setShowKnowledgeBaseSelector({ show: false })} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div>
              {knowledgeBases.length > 0 ? knowledgeBases.map((kb: any) => (
                <div key={kb.id} onClick={() => {
                  const kbTag = `{{kb.${kb.id}}}`;
                  const field = showKnowledgeBaseSelector.position as keyof typeof localData;
                  if (field === 'system_prompt') {
                    if (selectedPromptId) {
                      setPromptLibrary(promptLibrary.map((p: any) => p.id === selectedPromptId ? { ...p, system_prompt: (p.system_prompt || '') + kbTag } : p));
                    } else {
                      const cur = localData.system_prompt || '';
                      updateNodeData({ system_prompt: cur + kbTag });
                    }
                  } else if (field === 'user_prompt') {
                    if (selectedPromptId) {
                      setPromptLibrary(promptLibrary.map((p: any) => p.id === selectedPromptId ? { ...p, user_prompt: (p.user_prompt || '') + kbTag } : p));
                    } else {
                      const cur = localData.user_prompt || '';
                      updateNodeData({ user_prompt: cur + kbTag });
                    }
                  } else if (field === 'fallback') {
                    const cur = localData.fallback_template || '';
                    updateNodeData({ fallback_template: cur + kbTag });
                  }
                  setShowKnowledgeBaseSelector({ show: false });
                }} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e9ecef', marginBottom: 8, cursor: 'pointer', background: 'white' }}>
                  <div style={{ fontWeight: 600 }}>{kb.name}</div>
                  {kb.description && <div style={{ fontSize: 12, color: '#666' }}>{kb.description}</div>}
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{`{{kb.${kb.id}}}`}</div>
                </div>
              )) : (
                <div style={{ color: '#666', padding: 12 }}>暂无知识库</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompt 预览弹窗 - 详细版本 */}
      {showPromptPreview && selectedPromptId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '32px',
            width: '900px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {/* 头部 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '2px solid #f0f0f0'
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '24px', 
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                🔍 Prompt 预览
              </h2>
              <button
                onClick={() => setShowPromptPreview(false)}
                style={{
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  border: 'none',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
                  e.currentTarget.style.color = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                ×
              </button>
            </div>

            {(() => {
              const currentPrompt = promptLibrary.find((p: any) => p.id === selectedPromptId);
              if (!currentPrompt) return null;

              return (
              <div>
                  {/* Prompt 基本信息 */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
                      padding: '20px',
                      borderRadius: '16px',
                      border: '1px solid rgba(102, 126, 234, 0.15)'
                    }}>
                      <h3 style={{ 
                        fontSize: '20px', 
                        fontWeight: '600', 
                        color: '#1e293b', 
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        📝 {currentPrompt.name}
                      </h3>
                      {currentPrompt.description && (
                        <p style={{ 
                          fontSize: '16px', 
                          color: '#64748b', 
                          margin: 0,
                          lineHeight: '1.5'
                        }}>
                          {currentPrompt.description}
                        </p>
                      )}
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#94a3b8', 
                        marginTop: '8px',
                        fontFamily: 'monospace'
                      }}>
                        ID: {currentPrompt.id}
              </div>
            </div>
          </div>

                  {/* System Prompt */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#667eea', 
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      🤖 System Prompt
                    </h3>
                    <div style={{
                      background: '#f8fafc',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                      color: '#374151'
                    }}>
                      {currentPrompt.system_prompt || '(未设置)'}
        </div>
                  </div>

                  {/* User Prompt */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#667eea', 
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      👤 User Prompt
                    </h3>
                    <div style={{
                      background: '#f8fafc',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                      color: '#374151'
                    }}>
                      {currentPrompt.user_prompt || '(未设置)'}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '12px',
                    paddingTop: '16px',
                    borderTop: '2px solid #f0f0f0'
                  }}>
                    <button
                      onClick={() => {
                        const fullPromptText = `=== ${currentPrompt.name} ===\n\n` +
                          `描述: ${currentPrompt.description || '无'}\n\n` +
                          `=== System Prompt ===\n${currentPrompt.system_prompt || '(未设置)'}\n\n` +
                          `=== User Prompt ===\n${currentPrompt.user_prompt || '(未设置)'}`;
                        navigator.clipboard?.writeText(fullPromptText);
                        alert('Prompt 内容已复制到剪贴板！');
                      }}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      📋 复制全部
                    </button>
                    {/* 新增：在预览中加入 编辑 按钮，打开 Prompt 编辑模态 */}
                    <button
                      onClick={() => setShowPromptEditor(true)}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ✏️ 编辑 Prompt
                    </button>
                    <button
                      onClick={() => setShowPromptPreview(false)}
                      style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      关闭预览
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  )
}
