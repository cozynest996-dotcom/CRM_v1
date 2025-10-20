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
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Node as RFNode } from 'reactflow'
import api from '../utils/api'
import { PlayCircleOutlined } from '@ant-design/icons' // 导入 PlayCircleOutlined 图标
import PromptFormModal, { Prompt } from './PromptFormModal' // 导入 PromptFormModal 和 Prompt 接口
import { v4 as uuidv4 } from 'uuid' // 导入 uuid

interface NodeConfigProps {
  node: RFNode
  onUpdate: (nodeId: string, data: any) => void
  onClose: () => void
}

export default function NodeConfig({ node, onUpdate, onClose }: NodeConfigProps) {
  const [showVariableSelector, setShowVariableSelector] = useState<{show: boolean, position?: string, anchor?: DOMRect }>({ show: false })
  const [showMediaSelector, setShowMediaSelector] = useState<{show: boolean, position?: string, anchor?: DOMRect }>({ show: false })
  const [showPromptPreview, setShowPromptPreview] = useState(false) // 新增：显示 prompt 预览
  const [showPromptEditor, setShowPromptEditor] = useState(false) // 新增：显示 prompt 编辑器
  const [localData, setLocalData] = useState<any>(node.data || {})
  const [editingVariableName, setEditingVariableName] = useState<{originalName: string, tempName: string} | null>(null) // 新增：用于跟踪正在编辑的变量名
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false) // 图片预览弹窗
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('') // 预览图片URL
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
  const [showKnowledgeBaseSelector, setShowKnowledgeBaseSelector] = useState<{show: boolean, position?: string, anchor?: DOMRect }>({ show: false })
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]) // 新增：知识库列表
  const [showAdvancedApiConfig, setShowAdvancedApiConfig] = React.useState(false) // CustomAPI 的高级配置开关
  // Template 配置相关状态
  const [showSmartVarHelp, setShowSmartVarHelp] = React.useState(false)
  const [showMediaHelp, setShowMediaHelp] = React.useState(false)
  const [showTemplateHelp, setShowTemplateHelp] = React.useState(false)
  const [showApiSmartVarHelp, setShowApiSmartVarHelp] = React.useState(false)
  // DbTrigger 相关状态
  const [dbTriggerFields, setDbTriggerFields] = useState<Array<{key: string, label: string, type: string}>>([])
  const [loadingDbFields, setLoadingDbFields] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    dataUpdate: false,
    messageReply: false,
    handoff: false,
    advanced: false
  })

  // Helper function to get display title for node types
  const getNodeTitle = (type: string) => {
    switch (type) {
      case 'MessageTrigger': return '消息触发器';
      case 'AI': return 'AI 处理';
      case 'Condition': return '条件判断';
      case 'UpdateDB': return '更新数据库';
      case 'Delay': return '延迟';
      case 'SendWhatsAppMessage': return '发送消息'; // 兼容旧名称，统一显示为"发送消息"
      case 'SendTelegramMessage': return '发送 Telegram 消息';
      case 'SendMessage': return '发送消息'; // 通用发送消息节点
      case 'CustomAPI': return '自定义API';
      case 'Template': return '模板消息';
      case 'GuardrailValidator': return '内容审核';
      case 'Handoff': return '转接人工';
      default: return type;
    }
  };

  // 打开变量选择器并锚定到触发元素位置
  const openVariableSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      const anchor = rect ? rect : undefined; // 直接使用 DOMRect
      setShowVariableSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) });
    } catch (err) {
      setShowVariableSelector({ show: true, position: position });
    }
  }

  // 打开媒体选择器并锚定到触发元素位置
  const openMediaSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      const anchor = rect ? rect : undefined; // 直接使用 DOMRect
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

  // 获取 customers 表的字段信息
  async function fetchDbTriggerFields() {
    if (dbTriggerFields.length > 0) return
    setLoadingDbFields(true)
    try {
      // 尝试获取详细的字段信息
      const response = await api.get('/api/customers/fields/detailed')
      console.log('Fetched customer fields:', response)
      
      const fields = []
      
      // 处理基础字段
      if (response && response.basic_fields && Array.isArray(response.basic_fields)) {
        response.basic_fields.forEach(field => {
          fields.push({
            key: field.name,
            label: field.label,
            type: field.type || 'string'
          })
        })
      }
      
      // 处理自定义字段
      if (response && response.custom_fields && Array.isArray(response.custom_fields)) {
        response.custom_fields.forEach(field => {
          fields.push({
            key: `custom_fields.${field.name}`,
            label: `${field.label} (自定义)`,
            type: 'custom'
          })
        })
      }
      
      if (fields.length > 0) {
        setDbTriggerFields(fields)
      } else {
        // 回退到基本字段
        const basicFields = [
          { key: 'name', label: '姓名', type: 'string' },
          { key: 'phone', label: '手机号', type: 'string' },
          { key: 'email', label: '邮箱', type: 'string' },
          { key: 'status', label: '状态', type: 'string' },
          { key: 'stage_id', label: '阶段ID', type: 'number' }
        ]
        setDbTriggerFields(basicFields)
      }
    } catch (error) {
      console.error('Failed to fetch customer fields:', error)
      // 使用默认字段
      const defaultFields = [
        { key: 'name', label: '姓名', type: 'string' },
        { key: 'phone', label: '手机号', type: 'string' },
        { key: 'email', label: '邮箱', type: 'string' },
        { key: 'status', label: '状态', type: 'string' }
      ]
      setDbTriggerFields(defaultFields)
    } finally {
      setLoadingDbFields(false)
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
      fetchCustomerFields(); // 获取完整的客户字段信息
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

  // 新增：当节点类型为 UpdateDB 时，加载客户字段信息
  useEffect(() => {
    if (node.type === 'UpdateDB') {
      fetchCustomerFields(); // 获取完整的客户字段信息
      fetchCustomerStages(); // 获取客户阶段用于 stage_id 下拉选择
    }
  }, [node.type]);

  // 新增：当节点类型为 DbTrigger 时，加载客户字段信息
  useEffect(() => {
    if (node.type === 'DbTrigger' || node.type === 'StatusTrigger') {
      fetchDbTriggerFields(); // 获取 customers 表的字段信息
      fetchCustomerStages(); // 预加载客户阶段用于 stage_id 下拉
    }
  }, [node.type]);

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

  // 存储当前光标位置和输入框引用
  const [cursorPosition, setCursorPosition] = useState<{[key: string]: number}>({});
  const inputRefs = useRef<{[key: string]: HTMLInputElement | HTMLTextAreaElement}>({});

  // 处理输入框的键盘事件，支持 @ 激活变量选择器
  const handleInputKeyDown = (e: React.KeyboardEvent, fieldName: string) => {
    if (e.key === '@') {
      e.preventDefault(); // 阻止 @ 字符输入
      
      // 记录当前光标位置
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      setCursorPosition(prev => ({
        ...prev,
        [fieldName]: target.selectionStart || 0
      }));
      
      // 立即打开变量选择器
      setShowVariableSelector({ show: true, position: fieldName });
      fetchCustomerFields();
    }
  };

  // 处理光标位置变化
  const handleInputSelect = (e: React.SyntheticEvent, fieldName: string) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    setCursorPosition(prev => ({
      ...prev,
      [fieldName]: target.selectionStart || 0
    }));
  };

  // 插入文本到光标位置的通用函数
  const insertTextAtCursor = (fieldName: string, textToInsert: string) => {
    const element = inputRefs.current[fieldName];
    if (!element) return;

    const start = cursorPosition[fieldName] ?? element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const currentValue = element.value;
    
    const newValue = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
    
    // 直接更新React状态
    if (fieldName === 'url') {
      updateNodeData({ url: newValue });
    } else if (fieldName === 'body') {
      updateNodeData({ body: newValue });
    } else if (fieldName === 'fallback_template') {
      updateNodeData({ fallback_template: newValue });
    } else if (fieldName === 'system_prompt') {
      updateNodeData({ system_prompt: newValue });
    } else if (fieldName === 'user_prompt') {
      updateNodeData({ user_prompt: newValue });
    } else if (fieldName === 'match_value') {
      updateNodeData({ match_value: newValue });
    } else if (fieldName.startsWith('static_')) {
      const updateId = fieldName.replace('static_', '');
      const staticUpdates = localData.static_updates || [];
      const newStaticUpdates = staticUpdates.map((update: any) => 
        update.id === updateId 
          ? { ...update, value: newValue }
          : update
      );
      updateNodeData({ static_updates: newStaticUpdates });
    }
    
    // 延迟设置光标位置，确保DOM已更新
    setTimeout(() => {
      const newCursorPos = start + textToInsert.length;
      element.setSelectionRange(newCursorPos, newCursorPos);
      element.focus();
    }, 10);
  };

  const handleMediaSelect = (mediaUuid: string, mediaName: string) => {
    const position = showMediaSelector.position;
    
    if (position === 'template_media') {
      // 模板媒体选择 - 支持多选
      const currentMediaList = localData.media_list || [];
      const newMedia = { uuid: mediaUuid, name: mediaName };
      
      // 检查是否已经选择了这个媒体
      const isAlreadySelected = currentMediaList.some(media => media.uuid === mediaUuid);
      
      let updatedMediaList;
      if (isAlreadySelected) {
        // 如果已选择，则取消选择
        updatedMediaList = currentMediaList.filter(media => media.uuid !== mediaUuid);
      } else {
        // 如果未选择，则添加到列表
        updatedMediaList = [...currentMediaList, newMedia];
      }
      
      updateNodeData({ 
        media_list: updatedMediaList,
        media_send_mode: localData.media_send_mode || 'together_with_caption' // 保持或设置默认发送模式
      });
    } else if (position === 'system_prompt') {
      // System prompt 媒体选择
      const tag = `[[MEDIA:${mediaUuid}]]`;
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, system_prompt: (p.system_prompt || '') + tag }
            : p
        ));
      } else {
        const currentPrompt = localData.system_prompt || '';
        const updatedPrompt = currentPrompt + tag;
        updateNodeData({ system_prompt: updatedPrompt });
      }
    } else if (position === 'user_prompt') {
      // User prompt 媒体选择
      const tag = `[[MEDIA:${mediaUuid}]]`;
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, user_prompt: (p.user_prompt || '') + tag }
            : p
        ));
      } else {
        const currentPrompt = localData.user_prompt || '';
        const updatedPrompt = currentPrompt + tag;
        updateNodeData({ user_prompt: updatedPrompt });
      }
    }
    
    setShowMediaSelector({ show: false });
  };

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

    const position = showVariableSelector.position;

    // 使用光标位置插入变量
    if (position === 'url' || position === 'body') {
      insertTextAtCursor(position, finalVariableValue);
    } else if (position === 'smart_body') {
      // 智能变量选择器专门处理
      insertTextAtCursor('body', finalVariableValue);
    } else if (position === 'template') {
      insertTextAtCursor('template', finalVariableValue);
    } else if (position?.startsWith('template_')) {
      // 处理多个模板消息的变量注入
      const templateIndex = parseInt(position.replace('template_', ''));
      const currentMessages = localData.message_templates || [];
      if (currentMessages[templateIndex]) {
        const updatedMessages = currentMessages.map((msg, i) => 
          i === templateIndex 
            ? { ...msg, content: (msg.content || '') + finalVariableValue }
            : msg
        );
        updateNodeData({ message_templates: updatedMessages });
      }
    } else if (position === 'fallback') {
      insertTextAtCursor('fallback_template', finalVariableValue);
    } else if (position === 'system_prompt') {
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, system_prompt: (p.system_prompt || '') + finalVariableValue }
            : p
        ));
      } else {
        insertTextAtCursor('system_prompt', finalVariableValue);
      }
    } else if (position === 'user_prompt') {
      if (selectedPromptId) {
        setPromptLibrary(promptLibrary.map((p: any) => 
          p.id === selectedPromptId 
            ? { ...p, user_prompt: (p.user_prompt || '') + finalVariableValue }
            : p
        ));
      } else {
        insertTextAtCursor('user_prompt', finalVariableValue);
      }
    } else if (position === 'match_value') {
      insertTextAtCursor('match_value', finalVariableValue);
    } else if (position?.startsWith('static_')) {
      const updateId = position.replace('static_', '');
      insertTextAtCursor(`static_${updateId}`, finalVariableValue);
    } else if (position?.startsWith('smart_template_')) {
      // 处理模板消息的智能变量注入
      const templateIndex = parseInt(position.replace('smart_template_', ''));
      const currentMessages = localData.message_templates || [];
      if (currentMessages[templateIndex]) {
        const updatedMessages = currentMessages.map((msg, i) => 
          i === templateIndex 
            ? { ...msg, content: (msg.content || '') + finalVariableValue }
            : msg
        );
        updateNodeData({ message_templates: updatedMessages });
      }
    } else if (position?.startsWith('smart_var_template_')) {
      // 处理模板消息智能变量的数据源选择
      const varName = position.replace('smart_var_template_', '');
      const smartVariables = localData.smart_variables || {};
      if (smartVariables[varName]) {
        smartVariables[varName] = { ...smartVariables[varName], source: finalVariableValue };
        updateNodeData({ smart_variables: smartVariables });
      }
    } else if (position?.startsWith('smart_var_')) {
      // 处理智能变量的数据源选择
      const varName = position.replace('smart_var_', '');
      const smartVariables = localData.smart_variables || {};
      if (smartVariables[varName]) {
        smartVariables[varName] = { ...smartVariables[varName], source: finalVariableValue };
        updateNodeData({ smart_variables: smartVariables });
      }
    } else {
      const variables = localData.variables || {};
      if (position) {
        variables[position] = finalVariableValue;
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
        <label>消息来源平台</label>
        <select
          value={localData.config?.channel || localData.channel || 'whatsapp'}
          onChange={(e) => {
            updateNodeData({
              config: {
                ...localData.config,
                channel: e.target.value,
              },
              // 同时更新 data.channel 以保持兼容性
              channel: e.target.value
            });
          }}
        >
          <option value="whatsapp">📱 WhatsApp 消息</option>
          <option value="telegram">✈️ Telegram 消息</option>
        </select>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          选择从哪个平台接收客户消息来触发工作流
        </div>
      </div>
    </>
  )

  const renderDbTriggerConfig = () => {
    const triggerMode = localData.config?.trigger_mode || 'immediate'
    const isScheduled = triggerMode === 'scheduled' || triggerMode === 'hybrid'
    const isImmediate = triggerMode === 'immediate' || triggerMode === 'hybrid'
    
    return (
      <>

        {/* 触发条件 */}
        <div className="config-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ 
            fontSize: '14px',
            fontWeight: '600',
            color: '#334155',
            marginBottom: '16px',
            paddingBottom: '8px',
            borderBottom: '2px solid #e2e8f0'
          }}>
            🎯 触发条件
          </h3>

          <div className="config-field">
            <label>数据表</label>
            <select 
              value={localData.config?.table || 'customers'} 
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    table: e.target.value,
                  }
                });
              }}
            >
              <option value="customers">customers (客户表)</option>
            </select>
          </div>

          <div className="config-field">
            <label>监听字段</label>
            <select 
              value={localData.config?.field || ''} 
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    field: e.target.value,
                  }
                });
              }}
              disabled={loadingDbFields}
            >
              <option value="">{loadingDbFields ? '加载字段中...' : '请选择字段...'}</option>
              {dbTriggerFields.map(field => (
                <option key={field.key} value={field.key}>
                  {field.label} ({field.key})
                </option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              选择要监听变化的客户字段，如 stage_id（客户阶段）、status（状态）等
            </div>
          </div>

          <div className="config-field">
            <label>触发条件</label>
            <select 
              value={localData.config?.condition || 'equals'} 
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    condition: e.target.value,
                  }
                });
              }}
            >
              <option value="equals">等于 (=)</option>
              <option value="not_equals">不等于 (≠)</option>
              <option value="contains">包含</option>
              <option value="not_contains">不包含</option>
              <option value="starts_with">开头是</option>
              <option value="ends_with">结尾是</option>
              <option value="is_empty">为空</option>
              <option value="is_not_empty">不为空</option>
            </select>
          </div>

          {localData.config?.condition && !['is_empty', 'is_not_empty', 'changed'].includes(localData.config.condition) && (
            <div className="config-field">
              <label>匹配值</label>
              {localData.config?.field === 'stage_id' ? (
                <select
                  value={localData.config?.value || ''}
                  onChange={(e) => {
                    updateNodeData({
                      config: {
                        ...localData.config,
                        value: e.target.value,
                      }
                    });
                  }}
                >
                  <option value="">选择阶段...</option>
                  {customerStages.map((stage: any) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={localData.config?.value || ''}
                  onChange={(e) => {
                    updateNodeData({
                      config: {
                        ...localData.config,
                        value: e.target.value,
                      }
                    });
                  }}
                  placeholder="输入要匹配的值"
                />
              )}
            </div>
          )}
        </div>

        {/* 触发模式 */}
        <div className="config-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ 
            fontSize: '14px',
            fontWeight: '600',
            color: '#334155',
            marginBottom: '16px',
            paddingBottom: '8px',
            borderBottom: '2px solid #e2e8f0'
          }}>
            ⚙️ 触发模式
          </h3>

          <div className="config-field">
            <label>模式选择</label>
            <select 
              value={triggerMode} 
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    trigger_mode: e.target.value,
                  }
                });
              }}
            >
              <option value="immediate">⚡ 即时触发（状态改变时）</option>
              <option value="scheduled">📅 定时触发（定期检查）</option>
              <option value="hybrid">🔄 混合模式（即时 + 定时）</option>
            </select>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {triggerMode === 'immediate' && '⚡ 即时触发：客户状态改变时触发一次，推荐用于欢迎消息、状态通知等一次性操作'}
              {triggerMode === 'scheduled' && '📅 定时触发：定期检查并提醒符合条件的客户，推荐用于催款提醒、定期跟进等周期性任务'}
              {triggerMode === 'hybrid' && '🔄 混合模式：结合即时触发和定时触发，推荐用于重要业务流程、关键客户跟进'}
            </div>
          </div>

          {/* 定时触发配置 */}
          {isScheduled && (
            <>
              <div className="config-field">
                <label>触发间隔</label>
                <select 
                  value={localData.config?.schedule?.interval || 86400} 
                  onChange={(e) => {
                    updateNodeData({
                      config: {
                        ...localData.config,
                        schedule: {
                          ...(localData.config?.schedule || {}),
                          interval: parseInt(e.target.value),
                          enabled: true
                        }
                      }
                    });
                  }}
                >
                  <option value="60">1 分钟（仅测试用）</option>
                  <option value="300">5 分钟</option>
                  <option value="900">15 分钟</option>
                  <option value="1800">30 分钟</option>
                  <option value="3600">1 小时</option>
                  <option value="21600">6 小时</option>
                  <option value="86400">24 小时（推荐）</option>
                </select>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  系统会按此间隔定期检查符合条件的客户并触发工作流
                </div>
              </div>

              <div className="config-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input 
                    type="checkbox" 
                    checked={localData.config?.prevent_duplicate_triggers !== false} 
                    onChange={(e) => {
                      updateNodeData({
                        config: {
                          ...localData.config,
                          prevent_duplicate_triggers: e.target.checked,
                        }
                      });
                    }}
                  />
                  防止重复触发同一客户
                </label>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {localData.config?.prevent_duplicate_triggers !== false 
                    ? '✓ 已开启：同一客户在间隔周期内只触发一次，防止频繁打扰客户（强烈推荐）'
                    : '⚠️ 未开启：可能导致重复触发，客户会频繁收到消息'}
                </div>
              </div>

              {localData.config?.prevent_duplicate_triggers === false && (
                <div style={{ 
                  fontSize: '13px', 
                  color: '#dc2626', 
                  padding: '12px',
                  background: '#fef2f2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  marginTop: '8px'
                }}>
                  ⚠️ 警告：未开启去重可能导致客户每{(() => {
                    const interval = localData.config?.schedule?.interval || 86400
                    if (interval < 60) return `${interval}秒`
                    if (interval < 3600) return `${interval / 60}分钟`
                    if (interval < 86400) return `${interval / 3600}小时`
                    return `${interval / 86400}天`
                  })()}收到一次消息，建议开启
                </div>
              )}
            </>
          )}
        </div>

        {/* 其他设置 */}
        <div className="config-section">
          <h3 style={{ 
            fontSize: '14px',
            fontWeight: '600',
            color: '#334155',
            marginBottom: '16px',
            paddingBottom: '8px',
            borderBottom: '2px solid #e2e8f0'
          }}>
            🔧 其他设置
          </h3>

          {isImmediate && (
            <div className="config-field">
              <label>防抖设置</label>
              <select 
                value={localData.config?.frequency || 'immediate'} 
                onChange={(e) => {
                  updateNodeData({
                    config: {
                      ...localData.config,
                      frequency: e.target.value,
                    }
                  });
                }}
              >
                <option value="immediate">立即触发</option>
                <option value="debounce_1s">防抖 1秒</option>
                <option value="debounce_5s">防抖 5秒</option>
                <option value="debounce_30s">防抖 30秒</option>
              </select>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                防抖可避免短时间内频繁触发，适用于即时触发模式
              </div>
            </div>
          )}

          <div className="config-field">
            <label>触发平台</label>
            <select 
              value={localData.config?.trigger_platform || 'whatsapp'} 
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    trigger_platform: e.target.value,
                  }
                });
              }}
            >
              <option value="whatsapp">📱 WhatsApp</option>
              <option value="telegram">💬 Telegram</option>
              <option value="auto">🤖 自动检测</option>
            </select>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {localData.config?.trigger_platform === 'whatsapp' && 'WhatsApp: 使用客户的 phone 字段'}
              {localData.config?.trigger_platform === 'telegram' && 'Telegram: 使用客户的 telegram_chat_id 字段'}
              {localData.config?.trigger_platform === 'auto' && '自动检测: 优先使用 WhatsApp，若无则使用 Telegram'}
            </div>
          </div>

          <div className="config-field">
            <label>描述（可选）</label>
            <input
              type="text"
              value={localData.config?.description || ''}
              onChange={(e) => {
                updateNodeData({
                  config: {
                    ...localData.config,
                    description: e.target.value,
                  }
                });
              }}
              placeholder="为触发器添加说明..."
            />
          </div>
        </div>
      </>
    )
  }

  const renderAIConfig = () => {
    const toggleSection = (section: string) => {
      setExpandedSections(prev => ({
        ...prev,
        [section]: !prev[section]
      }))
    }

    // 数据更新字段管理
    const updateFields = localData.update_fields || []

    const addUpdateField = () => {
      const newFields = [...updateFields, {
                id: uuidv4(),
        field_name: '',
        output_key: '',
        data_type: 'string',
                description: '',
        example: '',
        enabled: true
      }]
      updateNodeData({ update_fields: newFields })
    }

    const removeUpdateField = (id: string) => {
      const newFields = updateFields.filter((f: any) => f.id !== id)
      updateNodeData({ update_fields: newFields })
    }

    const updateField = (id: string, updates: any) => {
      const newFields = updateFields.map((f: any) => 
        f.id === id ? { ...f, ...updates } : f
      )
      updateNodeData({ update_fields: newFields })
    }

    return (
      <>
        {/* 基础配置 */}
        <div className="config-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('basic')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: expandedSections.basic ? '16px' : '8px',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚙️</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>基础配置</h3>
              <span style={{ 
                fontSize: '12px', 
                color: '#666',
                background: '#e2e8f0',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {localData.model?.name || 'GPT-4 Mini'}
              </span>
        </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {expandedSections.basic ? '🔽' : '▶️'}
            </span>
      </div>

          {expandedSections.basic && (
            <div className="section-content" style={{ marginBottom: '16px' }}>
      <div className="config-field">
                <label>🤖 AI 模型</label>
        <select
          value={localData.model?.name || 'gpt-4o-mini'}
          onChange={(e) => updateNodeData({ 
            model: { ...localData.model, name: e.target.value }
          })}
        >
                  <option value="gpt-4o-mini">GPT-4 Mini (推荐)</option>
                  <option value="gpt-4">GPT-4 (高质量)</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (快速)</option>
        </select>
      </div>

      <div className="config-field">
                <label>🌡️ 温度设置 (0-1)</label>
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
                  较低值更保守准确，较高值更创造灵活
        </div>
      </div>

      <div className="config-field">
                <label>📏 最大令牌数</label>
        <input
          type="number"
                  min="100"
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

              {/* 聊天历史配置 */}
      <div className="config-field">
                <label>💬 聊天历史设置</label>
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
                    </label>
                  </div>

                  {localData.chat_history?.enabled && (
                    <div style={{ marginLeft: '24px' }}>
                      <div style={{ marginBottom: '12px' }}>
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
                      </div>
                      
                      <div style={{ marginBottom: '12px' }}>
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
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', marginLeft: '20px' }}>
                          在聊天历史中显示每条消息的发送时间
                        </div>
                      </div>

                      {/* 聊天历史示例 */}
                      <div style={{ 
                        background: '#f8fafc', 
                        padding: '12px', 
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        marginTop: '8px'
                      }}>
                        <div style={{ fontSize: '12px', color: '#475569', fontWeight: '600', marginBottom: '8px' }}>
                          📋 聊天历史格式示例:
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#64748b',
                          fontFamily: 'monospace',
                          lineHeight: '1.4'
                        }}>
                          {localData.chat_history?.include_timestamps ? (
                            <>
                              客户 [2024-01-15 14:30]: 你好，我想了解一下房源信息<br/>
                              AI [2024-01-15 14:31]: 您好！很高兴为您服务...<br/>
                              客户 [2024-01-15 14:32]: 有什么推荐的吗？
                            </>
                          ) : (
                            <>
                              客户: 你好，我想了解一下房源信息<br/>
                              AI: 您好！很高兴为您服务...<br/>
                              客户: 有什么推荐的吗？
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="config-field">
                <label>📚 Prompt 模板选择</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <select
            value={selectedPromptId || ''}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
          >
                    <option value="">-- 使用动态生成的 Prompt --</option>
            {promptLibrary.map((prompt: any) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.name}
              </option>
            ))}
          </select>
            <button
              className="small-action-button"
              onClick={async () => {
                try {
                  const newPromptData = {
                    name: `新 Prompt ${promptLibrary.length + 1}`,
                    description: '',
                    system_prompt: '',
                    user_prompt: '',
                  }
                  
                  // 保存到后端数据库
                  const savedPrompt = await api.post('/api/prompt-library', newPromptData);
                  
                  // 更新本地状态
                  setPromptLibrary([...promptLibrary, savedPrompt]);
                  setSelectedPromptId(savedPrompt.id);
                } catch (error) {
                  console.error('Error creating new prompt:', error);
                  alert('创建新 Prompt 失败，请重试');
                }
              }}
                    style={{ 
                      fontSize: '12px', 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)', 
                      color: 'white', 
                      border: 'none',
                      fontWeight: '600',
                      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)'
                    }}
          >
            新建
            </button>
            {/* 新增：预览 Prompt 按钮 */}
            <button
              className="small-action-button"
              onClick={() => setShowPromptPreview(true)}
              disabled={!selectedPromptId}
              style={{
                fontSize: '12px', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                color: 'white', 
                border: 'none',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)'
              }}
            >
              预览
            </button>
        </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  选择预设 Prompt 模板，或留空使用基于字段配置动态生成的 Prompt
                </div>
              </div>
            </div>
          )}
      </div>

        {/* 数据更新配置 */}
        <div className="config-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('dataUpdate')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: expandedSections.dataUpdate ? '16px' : '8px',
              border: '1px solid #0ea5e9'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📊</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>数据更新配置</h3>
              <span style={{ 
                fontSize: '12px', 
                color: '#0369a1',
                background: '#e0f2fe',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {updateFields.filter((f: any) => f.enabled).length} 个字段
              </span>
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {expandedSections.dataUpdate ? '🔽' : '▶️'}
            </span>
          </div>

          {expandedSections.dataUpdate && (
            <div className="section-content" style={{ marginBottom: '16px' }}>
      <div className="config-field">
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={localData.enable_data_update || false}
                    onChange={(e) => updateNodeData({ enable_data_update: e.target.checked })}
                    style={{ marginRight: '8px' }}
                  />
                  启用数据更新功能
                </label>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  让 AI 分析客户消息并提取结构化信息用于数据库更新
        </div>
      </div>

              {localData.enable_data_update && (
                <>
      <div className="config-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <label>📋 配置要分析的字段</label>
            <button
                        type="button"
                        onClick={addUpdateField}
                        className="small-action-button primary"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        + 添加字段
                      </button>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                      配置 AI 需要从客户消息中分析和提取的信息字段
                    </div>

                    {updateFields.length === 0 ? (
                      <div style={{ 
                        padding: '20px', 
                        textAlign: 'center', 
                        color: '#666', 
                        border: '2px dashed #ddd', 
                        borderRadius: '8px',
                        background: '#f9f9f9'
                      }}>
                        点击"添加字段"开始配置 AI 数据分析
                      </div>
                    ) : (
                      <div className="update-fields-list">
                        {updateFields.map((field: any, index: number) => (
                          <div key={field.id} className="field-item" style={{
                            padding: '16px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            background: field.enabled ? '#ffffff' : '#f8f9fa'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                                分析字段 #{index + 1}
                              </h4>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                                  <input
                                    type="checkbox"
                                    checked={field.enabled}
                                    onChange={(e) => updateField(field.id, { enabled: e.target.checked })}
                                    style={{ marginRight: '4px' }}
                                  />
                                  启用
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeUpdateField(field.id)}
              className="small-action-button"
            style={{ 
                                    background: '#ef4444',
              color: 'white',
                                    fontSize: '12px',
                                    padding: '4px 8px'
                                  }}
                                >
                                  删除
            </button>
                              </div>
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                                🎯 选择要分析的客户字段
                              </label>
                              <select
                                value={field.output_key}
                                onChange={(e) => {
                                  const selectedField = e.target.value;
                                  // 从 availableVariables 中查找对应的字段信息
                                  let fieldLabel = selectedField;
                                  
                                  // 查找基础字段
                                  const basicField = availableVariables['客户基础信息']?.find((f: any) => f.value === `{{db.customer.${selectedField}}}`);
                                  if (basicField) {
                                    fieldLabel = basicField.label;
                                  } else {
                                    // 查找自定义字段
                                    const customField = availableVariables['客户自定义字段']?.find((f: any) => f.value === `{{${selectedField}}}`);
                                    if (customField) {
                                      fieldLabel = customField.label;
                                    }
                                  }
                                  
                                  updateField(field.id, { 
                                    output_key: selectedField,
                                    field_name: fieldLabel
                                  });
                                }}
                                style={{ width: '100%' }}
                              >
                                <option value="">选择字段...</option>
                                {availableVariables['客户基础信息'] && availableVariables['客户基础信息'].length > 0 && (
                                  <optgroup label="基础字段">
                                    {availableVariables['客户基础信息'].map((field: any) => {
                                      // 从 {{db.customer.field_name}} 中提取字段名
                                      const fieldKey = field.value.replace('{{db.customer.', '').replace('}}', '');
                                      return (
                                        <option key={fieldKey} value={fieldKey}>
                                          {field.label} ({fieldKey})
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                                {availableVariables['客户自定义字段'] && availableVariables['客户自定义字段'].length > 0 && (
                                  <optgroup label="自定义字段">
                                    {availableVariables['客户自定义字段'].map((field: any) => {
                                      // 从 {{custom_fields.field_name}} 中提取字段名
                                      const fieldKey = field.value.replace('{{', '').replace('}}', '');
                                      return (
                                        <option key={fieldKey} value={fieldKey}>
                                          {field.label} ({fieldKey})
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                              </select>
                              {field.output_key && (
                                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                  选中字段: <strong>{field.field_name || field.output_key}</strong>
          </div>
      )}
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                                🔢 数据类型
                              </label>
                              <select
                                value={field.data_type}
                                onChange={(e) => updateField(field.id, { data_type: e.target.value })}
                                style={{ width: '100%' }}
                              >
                                <option value="string">📝 文本 (string)</option>
                                <option value="number">🔢 数字 (number)</option>
                                <option value="date">📅 日期 (date)</option>
                                <option value="boolean">✅ 布尔值 (boolean)</option>
                                <option value="array">📚 数组 (array)</option>
                                <option value="object">📋 对象 (object)</option>
                              </select>
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                                📝 分析说明 (告诉 AI 如何处理这个字段)
                              </label>
                              <textarea
                                value={field.description}
                                onChange={(e) => updateField(field.id, { description: e.target.value })}
                                placeholder={`例如: 分析客户预算信息：
- 提取金额数字
- 万元自动转换 (800万→8000000)
- 范围取最大值 (800-1000万→1000万)
- 没有预算信息输出 null`}
                                rows={4}
                                style={{ width: '100%', fontFamily: 'inherit' }}
                              />
        </div>

                            <div>
                              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                                💡 输出示例 (给 AI 参考)
                              </label>
        <input
                                type="text"
                                value={field.example}
                                onChange={(e) => updateField(field.id, { example: e.target.value })}
                                placeholder="例如: 8000000, 2025-03-01, true"
                                style={{ width: '100%' }}
                              />
        </div>
                          </div>
                        ))}
                      </div>
                    )}
      </div>

                  {updateFields.length > 0 && (
      <div className="config-field">
                      <div style={{ 
                        padding: '12px', 
                        background: '#f0f9ff', 
                        borderRadius: '8px',
                        border: '1px solid #0ea5e9'
                      }}>
                        <div style={{ fontSize: '12px', color: '#0369a1', marginBottom: '8px', fontWeight: '600' }}>
                          🔍 预览生成的 Prompt 指令
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#475569',
                          fontFamily: 'monospace',
                          background: 'white',
                          padding: '8px',
                          borderRadius: '4px',
                          maxHeight: '120px',
                          overflow: 'auto'
                        }}>
                          请分析客户消息并提取以下信息：<br/>
                          {updateFields.filter((f: any) => f.enabled).map((field: any, index: number) => (
                            <span key={field.id}>
                              {index + 1}. {field.output_key} ({field.field_name}):<br/>
                              &nbsp;&nbsp;{field.description || '(未设置说明)'}<br/>
                              &nbsp;&nbsp;数据类型: {field.data_type}<br/>
                              {field.example && (
                                <>
                                  &nbsp;&nbsp;示例: {field.example}<br/>
                                </>
                              )}
                              <br/>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 消息回复配置 */}
        <div className="config-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('messageReply')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: expandedSections.messageReply ? '16px' : '8px',
              border: '1px solid #22c55e'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>💬</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>消息回复配置</h3>
              <span style={{ 
                fontSize: '12px', 
                color: '#15803d',
                background: '#dcfce7',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {localData.enable_auto_reply ? '已启用' : '已禁用'}
              </span>
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {expandedSections.messageReply ? '🔽' : '▶️'}
            </span>
          </div>

          {expandedSections.messageReply && (
            <div className="section-content" style={{ marginBottom: '16px' }}>
              <div className="config-field">
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
        <input
                    type="checkbox"
                    checked={localData.enable_auto_reply || false}
                    onChange={(e) => updateNodeData({ enable_auto_reply: e.target.checked })}
                    style={{ marginRight: '8px' }}
                  />
                  启用自动回复功能
                </label>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  让 AI 生成回复消息发送给客户
                </div>
      </div>

              {localData.enable_auto_reply && (
                <>
                  <div className="config-field">
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={localData.enable_split_reply || false}
                        onChange={(e) => updateNodeData({ enable_split_reply: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      启用分句回复
                    </label>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      AI会自动将回复分成2-4个短句，分别发送（更自然的对话体验）
                    </div>
                  </div>

      <div className="config-field">
                    <label>📏 回复长度限制</label>
        <input
          type="number"
                      min="50"
                      max="2000"
                      value={localData.reply_max_length || 700}
                      onChange={(e) => updateNodeData({ reply_max_length: parseInt(e.target.value) })}
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      AI 生成回复的最大字符数
        </div>
      </div>

      <div className="config-field">
                    <label>🎨 回复风格</label>
                    <select
                      value={localData.reply_style || 'professional'}
                      onChange={(e) => updateNodeData({ reply_style: e.target.value })}
                    >
                      <option value="professional">🤵 专业正式</option>
                      <option value="friendly">😊 友好亲切</option>
                      <option value="casual">😎 轻松随意</option>
                      <option value="enthusiastic">🎉 热情积极</option>
                    </select>
                  </div>

                  <div className="config-field">
                    <label>📱 媒体发送设置</label>
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
                </>
              )}
            </div>
          )}
      </div>

        {/* Handoff 配置 */}
        <div className="config-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('handoff')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: expandedSections.handoff ? '16px' : '8px',
              border: '1px solid #f59e0b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🤝</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Handoff 配置</h3>
              <span style={{ 
                fontSize: '12px', 
                color: '#92400e',
                background: '#fde68a',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {localData.enable_handoff ? `阈值 ${localData.handoff_threshold || 0.6}` : '已禁用'}
              </span>
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {expandedSections.handoff ? '🔽' : '▶️'}
            </span>
          </div>

          {expandedSections.handoff && (
            <div className="section-content" style={{ marginBottom: '16px' }}>
      <div className="config-field">
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
              <input
                type="checkbox"
                    checked={localData.enable_handoff || false}
                    onChange={(e) => updateNodeData({ enable_handoff: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
                  启用 Handoff 功能
            </label>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  当 AI 置信度低时自动转接人工处理
            </div>
          </div>

              {localData.enable_handoff && (
                <div className="config-field">
                  <label>🎯 置信度阈值 (0-1)</label>
                <input
                  type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={localData.handoff_threshold ?? 0.6}
                    onChange={(e) => updateNodeData({ handoff_threshold: parseFloat(e.target.value) })}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    当 AI 置信度低于此值时触发 Handoff 分支
                </div>
                <div style={{ 
                    fontSize: '11px', 
                    color: '#0369a1',
                    background: '#f0f9ff',
                  padding: '8px', 
                  borderRadius: '4px',
                    marginTop: '8px'
                  }}>
                    💡 提示：Handoff 触发后会走 "true" 分支，连接到下一个处理节点
                </div>
              </div>
          )}
        </div>
          )}
      </div>

        {/* 高级选项 */}
        <div className="config-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('advanced')}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: expandedSections.advanced ? '16px' : '8px',
              border: '1px solid #9ca3af'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🔧</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>高级选项</h3>
              <span style={{ 
                fontSize: '12px', 
                color: '#4b5563',
                background: '#e5e7eb',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                可选配置
              </span>
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {expandedSections.advanced ? '🔽' : '▶️'}
            </span>
          </div>

          {expandedSections.advanced && (
            <div className="section-content" style={{ marginBottom: '16px' }}>
              <div className="config-field">
                <label>🔄 重试设置</label>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={localData.enable_retry !== false} // 默认启用
                      onChange={(e) => updateNodeData({ enable_retry: e.target.checked })}
                      style={{ marginRight: '8px' }}
                    />
                    启用重试机制
                  </label>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    当 AI 请求失败时自动重试
                  </div>
                </div>

                {localData.enable_retry !== false && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginLeft: '24px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>最大重试次数</label>
                <input
                        type="number"
                        min="0"
                        max="5"
                        value={localData.max_retries || 3}
                        onChange={(e) => updateNodeData({ max_retries: parseInt(e.target.value) })}
                      />
              </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>重试间隔（秒）</label>
                <input
                        type="number"
                        min="1"
                        max="60"
                        value={localData.retry_delay || 5}
                        onChange={(e) => updateNodeData({ retry_delay: parseInt(e.target.value) })}
                      />
              </div>
                  </div>
                )}

                {/* 重试设置说明 */}
                <div style={{ 
                  background: '#fef3c7', 
                  padding: '10px', 
                  borderRadius: '6px',
                  border: '1px solid #fbbf24',
                  marginTop: '12px'
                }}>
                  <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '600', marginBottom: '4px' }}>
                    💡 重试机制说明:
                  </div>
                  <div style={{ fontSize: '11px', color: '#78350f', lineHeight: '1.4' }}>
                    • 启用时：网络错误或API限流时会自动重试<br/>
                    • 禁用时：失败后立即返回错误，不进行重试<br/>
                    • 重试次数为0时等同于禁用重试
                  </div>
                </div>
              </div>

              <div className="config-field">
                <label>📝 日志与调试</label>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                          <input
                            type="checkbox"
                        checked={localData.save_raw_response || false}
                        onChange={(e) => updateNodeData({ save_raw_response: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      保存原始 AI 响应
                        </label>
              </div>
                  
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={localData.enable_debug_logs || false}
                        onChange={(e) => updateNodeData({ enable_debug_logs: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      启用详细调试日志
                    </label>
          </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
            <input
              type="checkbox"
                        checked={localData.auto_fix_json || true}
                        onChange={(e) => updateNodeData({ auto_fix_json: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      自动修复 JSON 格式错误
          </label>
          </div>
        </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
  }

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

  const renderUpdateDBConfig = () => {
    // 硬性更新字段管理
    const staticUpdates = localData.static_updates || []

    // 辅助函数：判断是否为 stage_id 字段
    const isStageIdField = (fieldName: string) => {
      if (!fieldName) return false;
      return fieldName === 'stage_id' || 
             fieldName === 'customer.stage_id' || 
             fieldName === 'db.customer.stage_id' || 
             fieldName.includes('stage_id');
    }

    const addStaticUpdate = () => {
      const newUpdates = [...staticUpdates, {
        id: uuidv4(),
        db_field: '',
        value: '',
        data_type: 'string',
        enabled: true
      }]
      updateNodeData({ static_updates: newUpdates })
    }

    const removeStaticUpdate = (id: string) => {
      const newUpdates = staticUpdates.filter((u: any) => u.id !== id)
      updateNodeData({ static_updates: newUpdates })
    }

    const updateStaticUpdate = (id: string, updates: any) => {
      const newUpdates = staticUpdates.map((u: any) => 
        u.id === id ? { ...u, ...updates } : u
      )
      updateNodeData({ static_updates: newUpdates })
    }

    return (
      <>
        {/* 更新模式配置 */}
      <div className="config-field">
          <label>🎯 更新模式</label>
        <select
            value={localData.update_mode || 'smart_update'}
            onChange={(e) => updateNodeData({ update_mode: e.target.value })}
          >
            <option value="smart_update">🤖 智能更新 (自动检测 AI 输出)</option>
            <option value="static_update">⚙️ 硬性更新 (固定字段更新)</option>
            <option value="hybrid">🔄 混合模式 (智能 + 硬性)</option>
        </select>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            智能更新：自动处理 AI 节点输出的 updates 字段
      </div>
        </div>

        {/* 目标配置说明 */}
      <div className="config-field">
          <div style={{ 
            padding: '12px', 
            background: '#f8fafc', 
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '14px', color: '#374151', marginBottom: '8px', fontWeight: '600' }}>
              🎯 更新目标：客户表 (customers)
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              • 自动根据触发器类型匹配客户记录<br/>
              • WhatsApp 消息：使用手机号匹配<br/>
              • Telegram 消息：使用聊天ID匹配<br/>
              • 其他触发器：使用客户ID匹配
            </div>
          </div>
        </div>

        {/* 新客户创建配置 */}
        <div className="config-field">
          <div style={{ 
            padding: '16px', 
            background: '#f8fafc', 
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '8px'
          }}>
            <div style={{ fontSize: '14px', color: '#374151', marginBottom: '12px', fontWeight: '600' }}>
              👤 新客户创建设置
            </div>
            
            {/* 第一层：是否启用创建新客户 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={localData.enable_create_customer || false}
                  onChange={(e) => updateNodeData({ 
                    enable_create_customer: e.target.checked,
                    // 如果禁用创建新客户，清除默认阶段设置
                    default_stage_id: e.target.checked ? localData.default_stage_id : null
                  })}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontWeight: '500' }}>启用创建新客户</span>
              </label>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', marginLeft: '24px' }}>
                当找不到匹配的客户时，自动创建新的客户记录
              </div>
            </div>

            {/* 第二层：新客户默认阶段选择（仅在启用创建新客户时显示） */}
            {localData.enable_create_customer && (
              <div style={{ 
                paddingLeft: '16px', 
                borderLeft: '3px solid #3b82f6',
                backgroundColor: '#f0f9ff',
                padding: '12px',
                borderRadius: '8px'
              }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#1e40af', marginBottom: '8px', display: 'block' }}>
                  新客户默认阶段
                </label>
                <select
                  value={localData.default_stage_id || ''}
                  onChange={(e) => updateNodeData({ default_stage_id: parseInt(e.target.value) || null })}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '13px'
                  }}
                >
                  <option value="">选择阶段...</option>
                  {(customerStages || []).map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} {s.description ? `(${s.description})` : ''} - ID:{s.id}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '6px' }}>
                  💡 新创建的客户将自动设置为此阶段，便于后续的 DbTrigger 工作流处理
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DbTrigger 触发配置 */}
        <div className="config-field">
          <div style={{ 
            padding: '16px', 
            background: '#f0fdf4', 
            borderRadius: '12px',
            border: '1px solid #bbf7d0',
            marginBottom: '8px'
          }}>
            <div style={{ fontSize: '14px', color: '#166534', marginBottom: '12px', fontWeight: '600' }}>
              🔄 DbTrigger 触发设置
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={localData.enable_db_trigger !== false} // 默认启用
                  onChange={(e) => updateNodeData({ enable_db_trigger: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontWeight: '500' }}>启用 DbTrigger 自动触发</span>
              </label>
              <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px', marginLeft: '24px' }}>
                数据更新完成后，自动检查并触发相关的 DbTrigger 工作流
              </div>
            </div>

            {localData.enable_db_trigger !== false && (
              <div style={{ 
                paddingLeft: '16px', 
                borderLeft: '3px solid #22c55e',
                backgroundColor: '#f0fdf4',
                padding: '8px',
                borderRadius: '6px'
              }}>
                <div style={{ fontSize: '11px', color: '#15803d' }}>
                  💡 启用后，当客户数据发生变化时，会立即触发监听相应字段的 DbTrigger 工作流
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 智能更新说明 */}
        {(localData.update_mode === 'smart_update' || localData.update_mode === 'hybrid') && (
      <div className="config-field">
            <div style={{ 
              padding: '12px', 
              background: '#f0f9ff', 
              borderRadius: '8px',
              border: '1px solid #0ea5e9'
            }}>
              <div style={{ fontSize: '14px', color: '#0369a1', marginBottom: '8px', fontWeight: '600' }}>
                🤖 智能更新模式
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                • 自动检测 AI 节点输出的 <code>ai.analyze.updates</code> 字段<br/>
                • 根据字段名直接更新对应的数据库字段<br/>
                • 支持基础字段 (name, phone, email) 和自定义字段 (custom_fields.xxx)<br/>
                • 无需手动配置字段映射，AI 节点负责输出正确的字段名
              </div>
            </div>
          </div>
        )}

        {/* 硬性更新配置 */}
        {(localData.update_mode === 'static_update' || localData.update_mode === 'hybrid') && (
          <div className="config-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label>⚙️ 硬性更新配置</label>
              <button
                type="button"
                onClick={addStaticUpdate}
                className="small-action-button primary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                + 添加字段
              </button>
            </div>
            
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              配置固定的字段更新值（不依赖 AI 分析）
            </div>

            {staticUpdates.length === 0 ? (
              <div style={{ 
                padding: '16px', 
                textAlign: 'center', 
                color: '#666', 
                border: '2px dashed #ddd', 
                borderRadius: '8px',
                background: '#f9f9f9'
              }}>
                点击"添加字段"配置硬性更新
              </div>
            ) : (
              <div className="static-updates-list">
                {staticUpdates.map((update: any, index: number) => (
                  <div key={update.id} className="static-update-item" style={{
                    padding: '16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    background: update.enabled ? '#ffffff' : '#f8f9fa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                        更新字段 #{index + 1}
                      </h4>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
        <input
          type="checkbox"
                            checked={update.enabled}
                            onChange={(e) => updateStaticUpdate(update.id, { enabled: e.target.checked })}
                            style={{ marginRight: '4px' }}
                          />
                          启用
                        </label>
                        <button
                          type="button"
                          onClick={() => removeStaticUpdate(update.id)}
                          className="small-action-button"
                          style={{ 
                            background: '#ef4444',
                            color: 'white',
                            fontSize: '12px',
                            padding: '4px 8px'
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                          🎯 数据库字段
                        </label>
                        <select
                          value={update.db_field}
                          onChange={(e) => {
                            let selectedField = e.target.value;
                            // 从 availableVariables 中查找对应的字段信息
                            let fieldLabel = selectedField;
                            
                            // 查找基础字段
                            const basicField = availableVariables['客户基础信息']?.find((f: any) => f.value === `{{db.customer.${selectedField}}}`);
                            if (basicField) {
                              fieldLabel = basicField.label;
                            } else {
                              // 查找自定义字段
                              const customField = availableVariables['客户自定义字段']?.find((f: any) => f.value === `{{${selectedField}}}`);
                              if (customField) {
                                fieldLabel = customField.label;
                              }
                              // 如果选择的是完整的变量格式，需要提取字段名
                              if (selectedField.startsWith('{{') && selectedField.endsWith('}}')) {
                                // 从 {{db.customer.field}} 或 {{custom_fields.field}} 中提取字段名
                                if (selectedField.includes('db.customer.')) {
                                  const extractedField = selectedField.replace('{{db.customer.', '').replace('}}', '');
                                  fieldLabel = availableVariables['客户基础信息']?.find((f: any) => f.value === selectedField)?.label || extractedField;
                                  selectedField = extractedField; // 更新为纯字段名
                                } else if (selectedField.includes('custom_fields.')) {
                                  const extractedField = selectedField.replace('{{custom_fields.', '').replace('}}', '');
                                  fieldLabel = availableVariables['客户自定义字段']?.find((f: any) => f.value === selectedField)?.label || extractedField;
                                  selectedField = `custom_fields.${extractedField}`; // 保持自定义字段格式
                                }
                              }
                            }
                            
                            updateStaticUpdate(update.id, { 
                              db_field: selectedField,
                              field_label: fieldLabel
                            });
                          }}
                          style={{ width: '100%' }}
                        >
                          <option value="">选择字段...</option>
                          {availableVariables['客户基础信息'] && availableVariables['客户基础信息'].length > 0 && (
                            <optgroup label="基础字段">
                              {availableVariables['客户基础信息'].map((field: any) => {
                                // 从 {{db.customer.field_name}} 中提取字段名
                                const fieldKey = field.value.replace('{{db.customer.', '').replace('}}', '');
                                return (
                                  <option key={fieldKey} value={fieldKey}>
                                    {field.label} ({fieldKey})
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {availableVariables['客户自定义字段'] && availableVariables['客户自定义字段'].length > 0 && (
                            <optgroup label="自定义字段">
                              {availableVariables['客户自定义字段'].map((field: any) => {
                                // 从 {{custom_fields.field_name}} 中提取字段名
                                const fieldKey = field.value.replace('{{', '').replace('}}', '');
                                return (
                                  <option key={fieldKey} value={fieldKey}>
                                    {field.label} ({fieldKey})
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                        {update.db_field && (
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                            选中字段: <strong>{update.field_label || update.db_field}</strong>
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                          💡 更新值
                        </label>
                        <div style={{ position: 'relative' }}>
                          {/* 调试信息 */}
                          {process.env.NODE_ENV === 'development' && (
                            <div style={{ fontSize: '10px', color: '#999', marginBottom: '4px' }}>
                              Debug: db_field = "{update.db_field}", customerStages.length = {customerStages.length}
                            </div>
                          )}
                          {isStageIdField(update.db_field) ? (
                            <select
                              value={update.value}
                              onChange={(e) => updateStaticUpdate(update.id, { value: e.target.value })}
                              style={{ 
                                width: '100%',
                                maxWidth: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            >
                              <option value="">选择阶段...</option>
                              {customerStages.map((stage: any) => (
                                <option key={stage.id} value={stage.id}>
                                  {stage.name} {stage.description ? `(${stage.description})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <textarea
                              value={update.value}
                              onChange={(e) => updateStaticUpdate(update.id, { value: e.target.value })}
                              placeholder="输入固定值或使用变量，支持多行文本"
                              rows={2}
                              style={{ 
                                width: '100%',
                                maxWidth: '100%',
                                paddingRight: '40px',
                                resize: 'vertical',
                                minHeight: '60px',
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                          {!isStageIdField(update.db_field) && (
                            <button
                              onClick={(e) => openVariableSelector(e, `static_${update.id}`)}
                              style={{
                                position: 'absolute',
                                right: '8px',
                                top: '8px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              @变量
                            </button>
                          )}
                        </div>
                        {isStageIdField(update.db_field) && update.value && (
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                            选中阶段: <strong>
                              {customerStages.find((stage: any) => stage.id.toString() === update.value.toString())?.name || '未知阶段'}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                        数据类型
                      </label>
                      <select
                        value={update.data_type}
                        onChange={(e) => updateStaticUpdate(update.id, { data_type: e.target.value })}
                        style={{ width: '100%' }}
                      >
                        <option value="string">📝 文本</option>
                        <option value="number">🔢 数字</option>
                        <option value="date">📅 日期</option>
                        <option value="boolean">✅ 布尔值</option>
                        <option value="current_timestamp">⏰ 当前时间戳</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 安全与一致性选项 */}
      <div className="config-field">
          <label>🔒 数据安全与一致性</label>
          <div style={{ marginTop: '8px' }}>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
        <input
          type="checkbox"
                  checked={localData.optimistic_lock || false}
          onChange={(e) => updateNodeData({ optimistic_lock: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                启用乐观锁
              </label>
              <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
                防止并发更新冲突，确保数据一致性
              </div>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={localData.skip_if_equal || true}
                  onChange={(e) => updateNodeData({ skip_if_equal: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                跳过相同值更新
              </label>
              <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
                如果新值与当前值相同，则跳过更新操作
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={localData.audit_log || true}
                  onChange={(e) => updateNodeData({ audit_log: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                记录审计日志
              </label>
              <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
                记录所有数据库更新操作，便于追踪和审计
              </div>
            </div>
          </div>
        </div>

        {/* 错误处理 */}
        <div className="config-field">
          <label>⚠️ 错误处理策略</label>
          <select
            value={localData.error_strategy || 'log_and_continue'}
            onChange={(e) => updateNodeData({ error_strategy: e.target.value })}
          >
            <option value="log_and_continue">📝 记录错误并继续</option>
            <option value="abort_on_error">🛑 遇到错误时中止</option>
            <option value="rollback_on_error">↩️ 遇到错误时回滚</option>
            <option value="skip_invalid_fields">⏭️ 跳过无效字段</option>
          </select>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            选择当更新过程中遇到错误时的处理方式
          </div>
      </div>
      </>
    )
  }

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
        <label>📤 发送模式</label>
        <select
          value={localData.send_mode || 'smart_reply'}
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === 'smart_reply') {
              updateNodeData({ 
                send_mode: 'smart_reply', 
                channel: undefined, 
                to_number: undefined,
                telegram_chat_id: undefined,
                number_source: undefined
              })
            } else if (mode === 'force_whatsapp') {
              updateNodeData({ 
                send_mode: 'force_whatsapp', 
                channel: 'whatsapp',
                number_source: 'trigger_number',
                telegram_chat_id: undefined
              })
            } else if (mode === 'force_telegram') {
              updateNodeData({ 
                send_mode: 'force_telegram', 
                channel: 'telegram',
                number_source: 'trigger_number',
                to_number: undefined
              })
            }
          }}
        >
          <option value="smart_reply">🎯 智能回复（自动检测平台）</option>
          <option value="force_whatsapp">📱 强制发送到 WhatsApp</option>
          <option value="force_telegram">✈️ 强制发送到 Telegram</option>
        </select>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
          💡 智能回复会根据客户发消息的平台自动选择 WhatsApp 或 Telegram
        </div>
      </div>

      {/* 智能回复说明 */}
      {localData.send_mode === 'smart_reply' && (
        <div className="config-field">
          <div style={{ 
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
            padding: '16px', 
            borderRadius: '12px',
            border: '1px solid #0ea5e9'
          }}>
            <div style={{ fontSize: '14px', color: '#0369a1', marginBottom: '8px', fontWeight: '600' }}>
              🎯 智能回复工作原理
            </div>
            <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
              • <strong>WhatsApp 消息</strong>：自动使用客户的电话号码 (trigger.phone) 发送回复<br/>
              • <strong>Telegram 消息</strong>：自动使用客户的 Chat ID (trigger.chat_id) 发送回复<br/>
              • <strong>平台检测</strong>：根据触发器类型自动识别消息来源平台<br/>
              • <strong>无需配置</strong>：系统会自动处理所有的路由和标识符匹配
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp 强制发送配置 */}
      {localData.send_mode === 'force_whatsapp' && (
        <div className="config-field">
          <label>📱 WhatsApp 号码来源</label>
          <select
            value={localData.number_source || 'trigger_number'}
            onChange={(e) => {
              const source = e.target.value;
              if (source === 'trigger_number') {
                updateNodeData({ number_source: 'trigger_number', to_number: undefined })
              } else {
                updateNodeData({ number_source: 'custom_number' })
              }
            }}
          >
            <option value="trigger_number">🎯 使用触发号码（客户的号码）</option>
            <option value="custom_number">✏️ 自定义号码</option>
          </select>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            选择使用客户的号码还是指定的号码
          </div>

          {localData.number_source === 'custom_number' && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                📞 自定义 WhatsApp 号码
              </label>
              <input
                type="text"
                value={localData.to_number || ''}
                onChange={(e) => updateNodeData({ to_number: e.target.value })}
                placeholder="例如: +85212345678"
                style={{ 
                  borderColor: (!localData.to_number || localData.to_number.trim() === '') ? '#ef4444' : '#e2e8f0'
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                消息将发送到这个指定的 WhatsApp 号码
              </div>
              {(!localData.to_number || localData.to_number.trim() === '') && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#ef4444', 
                  marginTop: '4px',
                  padding: '8px',
                  background: '#fef2f2',
                  borderRadius: '4px',
                  border: '1px solid #fecaca'
                }}>
                  ⚠️ 请输入有效的 WhatsApp 号码，否则消息发送将失败
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Telegram 强制发送配置 */}
      {localData.send_mode === 'force_telegram' && (
        <div className="config-field">
          <label>✈️ Telegram Chat ID 来源</label>
          <select
            value={localData.number_source || 'trigger_number'}
            onChange={(e) => {
              const source = e.target.value;
              if (source === 'trigger_number') {
                updateNodeData({ number_source: 'trigger_number', telegram_chat_id: undefined })
              } else {
                updateNodeData({ number_source: 'custom_number' })
              }
            }}
          >
            <option value="trigger_number">🎯 使用触发 Chat ID（客户的 Chat ID）</option>
            <option value="custom_number">✏️ 自定义 Chat ID</option>
          </select>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            选择使用客户的 Chat ID 还是指定的 Chat ID
          </div>

          {localData.number_source === 'custom_number' && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                💬 自定义 Telegram Chat ID
              </label>
              <input
                type="text"
                value={localData.telegram_chat_id || ''}
                onChange={(e) => updateNodeData({ telegram_chat_id: e.target.value })}
                placeholder="例如: 123456789 (私聊) 或 @channel_name (频道)"
                style={{ 
                  borderColor: (!localData.telegram_chat_id || localData.telegram_chat_id.trim() === '') ? '#ef4444' : '#e2e8f0'
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                消息将发送到这个指定的 Telegram Chat ID
              </div>
              
              <label style={{marginTop: '12px', fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block'}}>
                🤖 Telegram Bot Token
              </label>
              <input
                type="text"
                value={localData.telegram_bot_token || ''}
                onChange={(e) => updateNodeData({ telegram_bot_token: e.target.value })}
                placeholder="填写您的 Telegram Bot API Token"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                需要 Bot Token 才能发送消息到指定的 Chat ID
              </div>

              {(!localData.telegram_chat_id || localData.telegram_chat_id.trim() === '') && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#ef4444', 
                  marginTop: '4px',
                  padding: '8px',
                  background: '#fef2f2',
                  borderRadius: '4px',
                  border: '1px solid #fecaca'
                }}>
                  ⚠️ 请输入有效的 Telegram Chat ID，否则消息发送将失败
                </div>
              )}
            </div>
          )}
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
    <div style={{
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
    }}>
      {/* 标题区域 */}
      <div style={{
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid rgba(102, 126, 234, 0.1)'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '20px',
          fontWeight: '600',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          📝 模板消息配置
        </h3>
        <p style={{
          margin: '8px 0 0 0',
          fontSize: '14px',
          color: '#64748b',
          fontWeight: '500'
        }}>
          配置消息模板类型和媒体内容，支持智能变量
        </p>
      </div>

      {/* 媒体选择配置 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <label style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151'
          }}>
            📎 媒体内容
          </label>
          {/* 帮助提示图标 */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div
              onClick={() => setShowMediaHelp(!showMediaHelp)}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ?
            </div>
            {/* 帮助提示气泡 */}
            {showMediaHelp && (
              <div style={{
                position: 'absolute',
                left: '30px',
                top: '-10px',
                background: 'white',
                border: '2px solid #0ea5e9',
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                zIndex: 1000,
                width: '380px',
                fontSize: '11px',
                lineHeight: '1.5'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0284c7' }}>
                  📱 媒体发送模式说明
                </div>
                <div style={{ color: '#475569' }}>
                  • <strong>文本和媒体一起发送：</strong>只取第一张照片和第一条文本一起发送<br/>
                  • <strong>媒体文本配对发送：</strong>媒体1+文本1，媒体2+文本2...<br/>
                  • <strong>媒体和文本分开发送：</strong>先发送所有媒体，再发送文本
                </div>
                <div 
                  onClick={() => setShowMediaHelp(false)}
                  style={{
                    marginTop: '8px',
                    textAlign: 'right',
                    color: '#0ea5e9',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '600'
                  }}
                >
                  ✕ 关闭
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div style={{ 
          background: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid rgba(148, 163, 184, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <button
              onClick={(e) => {
                openMediaSelector(e, 'template_media');
                fetchMediaData(); // 确保加载媒体数据
              }}
              style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
              }}
            >
              📎 选择媒体
                  </button>
            
            {localData.media_list && localData.media_list.length > 0 && (
                  <button
                onClick={() => updateNodeData({ media_list: [], media_send_mode: null })}
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                🗑️ 清除全部
                  </button>
            )}
          </div>
          
          {localData.media_list && localData.media_list.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '2px solid #0ea5e9',
                borderRadius: '10px',
                fontSize: '13px',
                color: '#0369a1',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <span style={{ fontSize: '16px' }}>✅</span>
                <span>已选择 {localData.media_list.length} 个媒体文件</span>
            </div>
            
              {/* 媒体预览网格 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(248, 250, 252, 0.8)',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.2)'
              }}>
                {localData.media_list.map((media, index) => (
                  <div key={media.uuid} style={{
                    position: 'relative',
                    background: 'white',
                    borderRadius: '8px',
                    padding: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                  }}>
                    {/* 媒体缩略图 */}
                    <div style={{
                      width: '100%',
                      height: '80px',
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '8px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {/* 查找对应的媒体数据以获取file_url */}
                      {(() => {
                        const mediaData = mediaList.find(m => m.id === media.uuid);
                        if (mediaData && mediaData.media_type === 'image' && mediaData.file_url) {
                          return (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                              <img 
                                src={mediaData.file_url}
                                alt={media.name}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  borderRadius: '4px'
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (nextElement) {
                                    nextElement.style.display = 'flex';
                                  }
                                }}
                              />
                              {/* 预览按钮 */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '24px',
                                  background: 'rgba(0, 0, 0, 0.6)',
                                  borderRadius: '50%',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  zIndex: 5,
                                  width: '20px',
                                  height: '20px'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewImageUrl(mediaData.file_url);
                                  setShowImagePreviewModal(true);
                                }}
                                title="预览图片"
                              >
                                👁️
                              </div>
                              {/* 备用图标（如果图片加载失败） */}
                              <div style={{
                                display: 'none',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                color: '#64748b',
                                width: '100%',
                                height: '100%'
                              }}>
                                🖼️
                              </div>
                            </div>
                          );
                        } else {
                          // 非图片文件或没有找到媒体数据
                          const isVideo = media.name.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i);
                          const isImage = media.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                          return (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '24px',
                              color: '#64748b'
                            }}>
                              {isVideo ? '🎥' : isImage ? '🖼️' : '📄'}
                            </div>
                          );
                        }
                      })()}
                    </div>
                    
                    {/* 文件名 */}
                    <div style={{
                      fontSize: '11px',
                      color: '#475569',
                      fontWeight: '500',
                      textAlign: 'center',
                      marginBottom: '8px',
                      wordBreak: 'break-all',
                      lineHeight: '1.3'
                    }}>
                      {media.name.length > 15 ? `${media.name.substring(0, 12)}...` : media.name}
                    </div>
                    
                    {/* 删除按钮 */}
                  <button
                    onClick={() => {
                        const updatedMediaList = localData.media_list.filter((_, i) => i !== index);
                        updateNodeData({ 
                          media_list: updatedMediaList,
                          media_send_mode: updatedMediaList.length === 0 ? null : localData.media_send_mode
                        });
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '20px',
                        height: '20px',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        zIndex: 10
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 1)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="删除此媒体"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                📱 媒体发送模式
              </label>
              
              <select
                value={localData.media_send_mode || 'together_with_caption'}
                onChange={(e) => {
                  const mode = e.target.value;
                  let media_settings = {};
                  
                  switch(mode) {
                    case 'together_with_caption':
                      // 文本和媒体一起发送：只取第一张照片和第一条文本一起发送
                      media_settings = {
                        send_media_separately: false,
                        send_with_caption: true,
                        use_first_media_only: true,
                        paired_sending: false,
                        delay_between_media: false
                      };
                      break;
                    case 'paired_sending':
                      // 媒体文本配对发送：媒体1+文本1，媒体2+文本2...
                      media_settings = {
                        send_media_separately: false,
                        send_with_caption: true,
                        use_first_media_only: false,
                        paired_sending: true,
                        delay_between_media: false
                      };
                      break;
                    case 'separate_no_delay':
                      // 媒体和文本分开发送：先发送所有媒体，再发送文本
                      media_settings = {
                        send_media_separately: true,
                        send_with_caption: false,
                        use_first_media_only: false,
                        paired_sending: false,
                        delay_between_media: false
                      };
                      break;
                  }
                  
                  updateNodeData({ 
                    media_send_mode: mode,
                    media_settings: media_settings
                });
              }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <option value="together_with_caption">📎 文本和媒体一起发送（只取第一张照片）</option>
                <option value="paired_sending">🔗 媒体文本配对发送（媒体1+文本1，媒体2+文本2...）</option>
                <option value="separate_no_delay">📤 媒体和文本分开发送（先发所有媒体，再发文本）</option>
              </select>

              {localData.media_send_mode === 'separate_with_delay' && (
                <div style={{ marginTop: '12px', paddingLeft: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    ⏱️ 延迟时间 (秒)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={localData.media_settings?.delay_seconds || 3}
                    onChange={(e) => updateNodeData({
                      media_settings: {
                        ...localData.media_settings,
                        delay_seconds: parseInt(e.target.value) || 3
                      }
                    })}
                    style={{
                      width: '120px',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                      outline: 'none',
                      transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
          </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 智能变量配置面板 - 紧凑版 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              🔧 智能变量配置
            </label>
            {/* 帮助提示图标 */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div
                onClick={() => setShowSmartVarHelp(!showSmartVarHelp)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ?
              </div>
              {/* 帮助提示气泡 */}
              {showSmartVarHelp && (
                <div style={{
                  position: 'absolute',
                  left: '30px',
                  top: '-10px',
                  background: 'white',
                  border: '2px solid #0ea5e9',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  width: '320px',
                  fontSize: '11px',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0284c7' }}>
                    💡 智能变量使用说明
                  </div>
                  <div style={{ color: '#475569' }}>
                    • 创建变量名，在模板中用 <code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{变量名}}'}</code><br/>
                    • 支持数据转换：取首词、后4位等<br/>
                    • 点击 🔗 智能变量 按钮快速插入<br/>
                    • 示例：<code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{customer_name}}'}</code>
                  </div>
                  <div 
                    onClick={() => setShowSmartVarHelp(false)}
                    style={{
                      marginTop: '8px',
                      textAlign: 'right',
                      color: '#0ea5e9',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}
                  >
                    ✕ 关闭
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              const variables = localData.smart_variables || {};
              const nextKey = `var_${Object.keys(variables).length + 1}`;
              updateNodeData({ 
                smart_variables: {
                  ...variables,
                  [nextKey]: {
                    display_name: '',
                    source: '',
                    transformer: 'None',
                    description: ''
                  }
                }
              });
            }}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ➕ 添加变量
          </button>
        </div>

        {/* 变量列表 - 紧凑版 */}
        {Object.keys(localData.smart_variables || {}).length > 0 ? (
          <div style={{ 
            maxHeight: '300px',
            overflow: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px'
          }}>
            {Object.entries(localData.smart_variables || {}).map(([varName, varConfig]: [string, any]) => (
              <div key={varName} style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '8px',
                background: 'white',
                position: 'relative'
              }}>
                {/* 紧凑头部 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        变量名
                      </label>
                      <input
                        type="text"
                        value={editingVariableName?.originalName === varName ? editingVariableName.tempName : varName}
                        onChange={(e) => {
                          setEditingVariableName({ originalName: varName, tempName: e.target.value });
                        }}
                        onBlur={() => {
                          if (editingVariableName && editingVariableName.originalName === varName && editingVariableName.tempName !== varName) {
                            const newVariables = { ...localData.smart_variables };
                            const newName = editingVariableName.tempName;
                            if (newName && !newVariables[newName]) {
                              newVariables[newName] = newVariables[varName];
                              delete newVariables[varName];
                              updateNodeData({ smart_variables: newVariables });
                            }
                          }
                          setEditingVariableName(null);
                        }}
                        onFocus={() => {
                          setEditingVariableName({ originalName: varName, tempName: varName });
                        }}
                        placeholder="var_1"
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'monospace'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                        显示名称
                      </label>
                      <input
                        type="text"
                        value={varConfig.display_name || ''}
                        onChange={(e) => {
                          const newVariables = { ...localData.smart_variables };
                          newVariables[varName] = { ...newVariables[varName], display_name: e.target.value };
                          updateNodeData({ smart_variables: newVariables });
                        }}
                        placeholder="客户姓名"
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '11px'
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const newVariables = { ...localData.smart_variables };
                      delete newVariables[varName];
                      updateNodeData({ smart_variables: newVariables });
                    }}
                    style={{
                      marginLeft: '8px',
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    删除
                  </button>
                </div>

                {/* 数据源 */}
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    数据源
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="text"
                      value={varConfig.source || ''}
                      onChange={(e) => {
                        const newVariables = { ...localData.smart_variables };
                        newVariables[varName] = { ...newVariables[varName], source: e.target.value };
                        updateNodeData({ smart_variables: newVariables });
                      }}
                      placeholder="{{trigger.name}}"
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}
                    />
                    <button
                      onClick={(e) => {
                        setShowVariableSelector({ show: true, position: `smart_var_template_${varName}` });
                        fetchCustomerFields();
                      }}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      @ 选择
                    </button>
                  </div>
                </div>

                {/* 转换和预览 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                      数据转换
                    </label>
                    <select
                      value={varConfig.transformer || 'None'}
                      onChange={(e) => {
                        const newVariables = { ...localData.smart_variables };
                        newVariables[varName] = { ...newVariables[varName], transformer: e.target.value };
                        updateNodeData({ smart_variables: newVariables });
                      }}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '10px'
                      }}
                    >
                      <option value="None">无转换</option>
                      <option value="First Word">取首词</option>
                      <option value="Last Word">取末词</option>
                      <option value="Last 4 Digits">后4位</option>
                      <option value="First 4 Digits">前4位</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                      预览
                    </label>
                    <div style={{
                      padding: '4px 6px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#475569',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {(() => {
                        const sampleValue = varConfig.source?.includes('name') ? '张三丰' :
                                          varConfig.source?.includes('phone') ? '13812345678' :
                                          varConfig.source?.includes('message') ? '你好世界' : '示例';
                        
                        let transformedValue = sampleValue;
                        if (varConfig.transformer === 'First Word') {
                          transformedValue = sampleValue.split(' ')[0] || sampleValue.charAt(0);
                        } else if (varConfig.transformer === 'Last Word') {
                          const words = sampleValue.split(' ');
                          transformedValue = words[words.length - 1] || sampleValue;
                        } else if (varConfig.transformer === 'Last 4 Digits') {
                          transformedValue = sampleValue.slice(-4);
                        } else if (varConfig.transformer === 'First 4 Digits') {
                          transformedValue = sampleValue.slice(0, 4);
                        }
                        
                        return varConfig.transformer === 'None' ? 
                          transformedValue : 
                          `${sampleValue}→${transformedValue}`;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '16px',
            background: 'rgba(102, 126, 234, 0.05)',
            borderRadius: '8px',
            border: '1px dashed #d1d5db',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '12px'
          }}>
            暂无智能变量，点击"➕ 添加变量"开始配置
          </div>
        )}
      </div>

      {/* 多条消息模板 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              📝 消息模板内容
            </label>
            {/* 帮助提示图标 */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div
                onClick={() => setShowTemplateHelp(!showTemplateHelp)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ?
              </div>
              {/* 帮助提示气泡 */}
              {showTemplateHelp && (
                <div style={{
                  position: 'absolute',
                  left: '30px',
                  top: '-10px',
                  background: 'white',
                  border: '2px solid #0ea5e9',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  width: '360px',
                  fontSize: '11px',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0284c7' }}>
                    💬 消息模板使用说明
                  </div>
                  <div style={{ color: '#475569' }}>
                    • <strong>多条消息：</strong>支持按顺序发送多条消息<br/>
                    • <strong>系统变量：</strong> <code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{trigger.name}}'}</code>, <code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{db.customer.phone}}'}</code> 等<br/>
                    • <strong>智能变量：</strong>使用上方配置的自定义变量（支持数据转换）<br/>
                    • <strong>快速插入：</strong>点击 @ 变量 或 🔗 智能变量 按钮
                  </div>
                  <div 
                    onClick={() => setShowTemplateHelp(false)}
                    style={{
                      marginTop: '8px',
                      textAlign: 'right',
                      color: '#0ea5e9',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}
                  >
                    ✕ 关闭
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              const currentMessages = localData.message_templates || [{ id: Date.now(), content: '' }];
              const newMessage = { id: Date.now(), content: '' };
              updateNodeData({ message_templates: [...currentMessages, newMessage] });
            }}
            style={{
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ➕ 添加消息
            </button>
          </div>

        {/* 消息模板列表 */}
        {(localData.message_templates || [{ id: Date.now(), content: localData.template || '' }]).map((message, index) => (
          <div key={message.id} style={{
            marginBottom: '16px',
            padding: '16px',
            background: 'white',
            border: '2px solid rgba(102, 126, 234, 0.1)',
            borderRadius: '12px',
            position: 'relative'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                消息 #{index + 1}
              </span>
              {(localData.message_templates || []).length > 1 && (
                <button
                  onClick={() => {
                    const updatedMessages = (localData.message_templates || []).filter((_, i) => i !== index);
                    updateNodeData({ message_templates: updatedMessages });
                  }}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#dc2626',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                  title="删除此消息"
                >
                  ×
                </button>
              )}
            </div>
            
            <div style={{ position: 'relative' }}>
          <textarea
                value={message.content === undefined ? '' : message.content}
                onChange={(e) => {
                  const updatedMessages = (localData.message_templates || []).map((msg, i) => 
                    i === index ? { ...msg, content: e.target.value } : msg
                  );
                  updateNodeData({ message_templates: updatedMessages });
                }}
                onKeyDown={(e) => handleInputKeyDown(e, `template_${index}`)}
                onSelect={(e) => handleInputSelect(e, `template_${index}`)}
                placeholder={`💡 输入消息内容，使用 {{ 获得智能变量提示

示例：您好 {{trigger.name}}！我们已收到您的咨询。`}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 100px 12px 12px',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  lineHeight: '1.5',
                  resize: 'vertical',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  background: '#fafafa'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                  e.currentTarget.style.background = 'white';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.background = '#fafafa';
                }}
              />
              <div style={{ position: 'absolute', right: '8px', top: '8px', display: 'flex', gap: '4px' }}>
            <button
                  onClick={() => {
                  setShowVariableSelector({ show: true, position: `template_${index}` })
                    fetchCustomerFields() // 获取最新的客户字段
                  }}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                @ 变量
            </button>
                {Object.keys(localData.smart_variables || {}).length > 0 && (
                  <button
                    onClick={(e) => {
                      setShowVariableSelector({ show: true, position: `smart_template_${index}` });
                      fetchCustomerFields();
                    }}
                    style={{
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#d97706';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f59e0b';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    🔗 智能变量
                  </button>
                )}
              </div>
          </div>
        </div>
        ))}
      </div>
      </div>
  )

  const renderCustomAPIConfig = () => {
    
    return (
    <div style={{
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
    }}>
      {/* 标题区域 */}
      <div style={{
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid rgba(102, 126, 234, 0.1)'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '20px',
          fontWeight: '600',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          🔌 自定义 API 配置
        </h3>
        <p style={{
          margin: '8px 0 0 0',
          fontSize: '14px',
          color: '#64748b',
          fontWeight: '500'
        }}>
          配置外部 API 调用和数据处理
        </p>
      </div>

      {/* 基础配置 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ 
          background: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid rgba(148, 163, 184, 0.15)'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              API 名称
            </label>
            <input
              type="text"
              value={localData.name || ''}
              onChange={(e) => updateNodeData({ name: e.target.value })}
              placeholder="例如：获取天气信息、发送邮件通知"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              请求方法
            </label>
            <select
              value={localData.method || 'GET'}
              onChange={(e) => updateNodeData({ method: e.target.value })}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
                outline: 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="GET">🔍 GET - 获取数据</option>
              <option value="POST">📤 POST - 发送数据</option>
              <option value="PUT">✏️ PUT - 更新数据</option>
              <option value="DELETE">🗑️ DELETE - 删除数据</option>
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              API 地址
            </label>
            <input
              type="text"
              value={localData.url || ''}
              onChange={(e) => updateNodeData({ url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* 认证配置 */}
          <div style={{ marginBottom: localData.auth?.type && localData.auth?.type !== 'none' ? '16px' : '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              认证方式
            </label>
            <select
              value={localData.auth?.type || 'none'}
              onChange={(e) => updateNodeData({ 
                auth: { ...localData.auth, type: e.target.value }
              })}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
                outline: 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="none">🚫 无需认证</option>
              <option value="bearer">🔑 Bearer Token</option>
              <option value="api_key">🗝️ API Key</option>
              <option value="basic">👤 Basic Auth</option>
            </select>
          </div>

          {/* 根据认证方式显示对应配置 */}
          {localData.auth?.type === 'bearer' && (
            <div style={{ marginTop: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151'
              }}>
                Bearer Token
              </label>
              <input
                type="password"
                value={localData.auth?.token || ''}
                onChange={(e) => updateNodeData({ 
                  auth: { ...localData.auth, token: e.target.value }
                })}
                placeholder="输入你的 Bearer Token"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {localData.auth?.type === 'api_key' && (
            <>
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={localData.auth?.api_key || ''}
                  onChange={(e) => updateNodeData({ 
                    auth: { ...localData.auth, api_key: e.target.value }
                  })}
                  placeholder="输入你的 API Key"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  API Key Header 名称
                </label>
                <input
                  type="text"
                  value={localData.auth?.api_key_header || 'X-API-Key'}
                  onChange={(e) => updateNodeData({ 
                    auth: { ...localData.auth, api_key_header: e.target.value }
                  })}
                  placeholder="X-API-Key"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </>
          )}

          {localData.auth?.type === 'basic' && (
            <>
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  用户名
                </label>
                <input
                  type="text"
                  value={localData.auth?.username || ''}
                  onChange={(e) => updateNodeData({ 
                    auth: { ...localData.auth, username: e.target.value }
                  })}
                  placeholder="输入用户名"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  密码
                </label>
                <input
                  type="password"
                  value={localData.auth?.password || ''}
                  onChange={(e) => updateNodeData({ 
                    auth: { ...localData.auth, password: e.target.value }
                  })}
                  placeholder="输入密码"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 请求体配置（仅POST/PUT显示） */}
      {(localData.method === 'POST' || localData.method === 'PUT') && (
        <>
          {/* 智能变量配置面板 */}
          <div style={{ 
            background: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            marginBottom: '16px'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  🔧 智能变量配置
                </label>
                {/* 帮助提示图标 */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <div
                    onClick={() => setShowApiSmartVarHelp(!showApiSmartVarHelp)}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    ?
                  </div>
                  {/* 帮助提示气泡 */}
                  {showApiSmartVarHelp && (
                    <div style={{
                      position: 'absolute',
                      left: '30px',
                      top: '-10px',
                      background: 'white',
                      border: '2px solid #0ea5e9',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      width: '320px',
                      fontSize: '11px',
                      lineHeight: '1.5'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0284c7' }}>
                        💡 智能变量使用说明
                      </div>
                      <div style={{ color: '#475569' }}>
                        • 创建变量名，在请求体中用 <code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{变量名}}'}</code><br/>
                        • 支持数据转换：取首词、后4位等<br/>
                        • 输入 <code style={{background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px'}}>{'{{{'}</code> 获得智能提示<br/>
                        • 变量会自动在请求体中可用
                      </div>
                      <div 
                        onClick={() => setShowApiSmartVarHelp(false)}
                        style={{
                          marginTop: '8px',
                          textAlign: 'right',
                          color: '#0ea5e9',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: '600'
                        }}
                      >
                        ✕ 关闭
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  const variables = localData.smart_variables || {};
                  const nextKey = `var_${Object.keys(variables).length + 1}`;
                  updateNodeData({ 
                    smart_variables: {
                      ...variables,
                      [nextKey]: {
                        displayName: '',
                        source: '',
                        transformer: 'None',
                        description: ''
                      }
                    }
                  });
                }}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ➕ 添加变量
              </button>
            </div>
            
            {/* 变量列表 */}
            <div style={{ 
              marginBottom: '16px',
              maxHeight: '400px',
              overflow: 'auto',
              border: Object.keys(localData.smart_variables || {}).length > 2 ? '1px solid #e9ecef' : 'none',
              borderRadius: '12px',
              padding: Object.keys(localData.smart_variables || {}).length > 2 ? '12px' : '0'
            }}>
              {Object.entries(localData.smart_variables || {}).map(([varName, varConfig]: [string, any]) => (
                <div key={varName} style={{
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                  {/* 变量头部 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#1e293b',
                        fontFamily: 'monospace'
                      }}>
                        {varName}
                      </span>
                      <span style={{
                        fontSize: '12px',
                        color: '#64748b',
                        background: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        {varConfig.displayName || '未命名变量'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newVariables = { ...localData.smart_variables };
                        delete newVariables[varName];
                        updateNodeData({ smart_variables: newVariables });
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      🗑️ 删除
                    </button>
                  </div>

                  {/* 变量配置 - 改为分行显示 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', color: '#374151', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                        📝 变量名
                      </label>
                      <input
                        type="text"
                        value={editingVariableName?.originalName === varName ? editingVariableName.tempName : varName}
                        onChange={(e) => {
                          setEditingVariableName({ originalName: varName, tempName: e.target.value });
                        }}
                        onBlur={() => {
                          if (editingVariableName && editingVariableName.originalName === varName && editingVariableName.tempName !== varName) {
                            const newVariables = { ...localData.smart_variables };
                            const newName = editingVariableName.tempName;
                            
                            if (newName && !newVariables[newName]) { // 确保新名称不为空且不重复
                              newVariables[newName] = newVariables[varName];
                            delete newVariables[varName];
                            updateNodeData({ smart_variables: newVariables });
                          }
                          }
                          setEditingVariableName(null); // 清除编辑状态
                        }}
                        onFocus={() => {
                          setEditingVariableName({ originalName: varName, tempName: varName });
                        }}
                        placeholder="例如: customer_name"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#374151', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                        📋 显示名称
                      </label>
                      <input
                        type="text"
                        value={varConfig.display_name || ''}
                        onChange={(e) => {
                          const newVariables = { ...localData.smart_variables };
                          newVariables[varName] = { ...newVariables[varName], display_name: e.target.value };
                          updateNodeData({ smart_variables: newVariables });
                        }}
                        placeholder="例如: 客户姓名"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', color: '#374151', fontWeight: '600' }}>
                        🔗 数据源
                      </label>
                      <button
                        onClick={(e) => {
                          setShowVariableSelector({ show: true, position: `smart_var_${varName}` });
                          fetchCustomerFields();
                        }}
                        style={{
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          fontWeight: '600'
                        }}
                      >
                        @ 选择
                      </button>
                    </div>
                    <input
                      type="text"
                      value={varConfig.source || ''}
                      onChange={(e) => {
                        const newVariables = { ...localData.smart_variables };
                        newVariables[varName] = { ...newVariables[varName], source: e.target.value };
                        updateNodeData({ smart_variables: newVariables });
                      }}
                      placeholder="例如: {{trigger.name}} 或 {{db.customer.phone}}"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#374151', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                      🔄 数据转换
                    </label>
                    <select
                      value={varConfig.transformer || 'None'}
                      onChange={(e) => {
                        const newVariables = { ...localData.smart_variables };
                        newVariables[varName] = { ...newVariables[varName], transformer: e.target.value };
                        updateNodeData({ smart_variables: newVariables });
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="None">无转换</option>
                      <option value="First Word">取首词</option>
                      <option value="Last Word">取末词</option>
                      <option value="Last 4 Digits">取后4位</option>
                      <option value="First 4 Digits">取前4位</option>
                    </select>
                  </div>

                  {varConfig.transformer && varConfig.transformer !== 'None' && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', color: '#374151', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                        📊 预览效果
                      </label>
                      <div style={{
                        padding: '8px 12px',
                        background: '#f0f9ff',
                        border: '1px solid #0ea5e9',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color: '#0369a1',
                        wordBreak: 'break-all'
                      }}>
                        {(() => {
                          const sampleValue = varConfig.source?.includes('name') ? '张三丰' :
                                            varConfig.source?.includes('phone') ? '13812345678' :
                                            varConfig.source?.includes('message') ? '你好世界' : '示例值';
                          
                          let transformedValue = sampleValue;
                          if (varConfig.transformer === 'First Word') {
                            transformedValue = sampleValue.split(' ')[0] || sampleValue.charAt(0);
                          } else if (varConfig.transformer === 'Last Word') {
                            const words = sampleValue.split(' ');
                            transformedValue = words[words.length - 1] || sampleValue;
                          } else if (varConfig.transformer === 'Last 4 Digits') {
                            transformedValue = sampleValue.slice(-4);
                          } else if (varConfig.transformer === 'First 4 Digits') {
                            transformedValue = sampleValue.slice(0, 4);
                          }
                          
                          return `"${sampleValue}" → "${transformedValue}"`;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 空状态提示 */}
            {Object.keys(localData.smart_variables || {}).length === 0 && (
              <div style={{ 
                textAlign: 'center', 
                color: '#9ca3af', 
                padding: '24px',
                fontStyle: 'italic',
                fontSize: '13px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px dashed #d1d5db'
              }}>
                暂无智能变量，点击上方"添加变量"开始配置
              </div>
            )}
          </div>

          {/* 请求体配置 */}
          <div style={{ 
            background: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            marginTop: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151'
              }}>
                📝 请求体配置
              </label>
              <button
                onClick={(e) => openVariableSelector(e, 'body')}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                @ 变量
              </button>
            </div>
            
            {/* 请求体编辑器 */}
            <textarea
              ref={(el) => { if (el) inputRefs.current['body'] = el; }}
              value={localData.body || ''}
              onChange={(e) => updateNodeData({ body: e.target.value })}
              onKeyDown={(e) => handleInputKeyDown(e, 'body')}
              onSelect={(e) => handleInputSelect(e, 'body')}
              placeholder={`{
  "name": "{{customer_name}}",
  "phone": "{{phone_last4}}",
  "message": "{{trigger.message}}"
}

💡 输入 {{ 获得智能提示`}
              style={{ 
                fontFamily: 'monospace', 
                fontSize: '13px',
                minHeight: '200px',
                width: '100%',
                padding: '12px',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                resize: 'vertical',
                boxSizing: 'border-box',
                marginBottom: '12px'
              }}
            />

            {/* 智能变量快捷按钮 */}
            {Object.keys(localData.smart_variables || {}).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                  💡 快速插入：
                </span>
                <button
                  onClick={(e) => openVariableSelector(e, 'smart_body')}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(245, 158, 11, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(245, 158, 11, 0.3)';
                  }}
                >
                  🔗 智能变量
                </button>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                  （已配置 {Object.keys(localData.smart_variables || {}).length} 个变量）
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* 原有的非POST/PUT方法的配置保持不变 */}
      {(localData.method !== 'POST' && localData.method !== 'PUT') && (
        <div style={{ 
          padding: '16px', 
          background: 'white',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          textAlign: 'center',
          color: '#64748b',
          marginBottom: '16px'
        }}>
          💡 GET 和 DELETE 请求不需要配置请求体
        </div>
      )}

      {/* 高级配置 */}
      <div style={{ 
        background: 'white',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        marginBottom: '16px'
      }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#374151',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showAdvancedApiConfig}
            onChange={(e) => setShowAdvancedApiConfig(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          🔧 显示高级配置
        </label>

        {showAdvancedApiConfig && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                ⏱️ 超时时间 (秒)
              </label>
              <input
                type="number"
                value={localData.timeout || 30}
                onChange={(e) => updateNodeData({ timeout: parseInt(e.target.value) })}
                min="5"
                max="300"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                🔄 重试次数
              </label>
              <input
                type="number"
                value={localData.retry_count || 3}
                onChange={(e) => updateNodeData({ retry_count: parseInt(e.target.value) })}
                min="0"
                max="5"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                📋 自定义请求头
              </label>
              <textarea
                value={localData.headers ? JSON.stringify(localData.headers, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const headers = JSON.parse(e.target.value || '{}')
                    updateNodeData({ headers })
                  } catch (err) {
                    // 忽略JSON解析错误，用户还在输入
                  }
                }}
                placeholder={`{
  "Content-Type": "application/json",
  "X-User-ID": "{{trigger.user_id}}",
  "X-Customer-Phone": "{{trigger.phone}}"
}`}
                rows={4}
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '13px',
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151'
              }}>
                📊 响应数据提取
              </label>
              <input
                type="text"
                value={localData.response_mapping?.data_field || ''}
                onChange={(e) => updateNodeData({ 
                  response_mapping: { 
                    ...localData.response_mapping, 
                    data_field: e.target.value 
                  }
                })}
                placeholder="data.result (提取响应中的特定字段)"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                💡 留空则保存完整响应，填写字段路径可提取特定数据
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    )
  }

  const renderConfigFields = () => {
    switch (node.type) {
      case 'MessageTrigger':
        return renderMessageTriggerConfig()
      case 'DbTrigger':
      case 'StatusTrigger': // 向后兼容：旧的StatusTrigger使用DbTrigger配置
        return renderDbTriggerConfig()
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
      case 'SendMessage':
      case 'SendWhatsAppMessage': // 兼容旧名称
        return renderSendMessageConfig()
      case 'CustomAPI':
        return renderCustomAPIConfig()
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
        id: uuidv4(),
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
      const fieldName = field.split('.').pop() || ''
      if (['budget_min', 'budget_max', 'unread_count', 'user_id', 'stage_id', 'version'].includes(fieldName)) return 'number'
      if (['move_in_date', 'updated_at', 'last_timestamp', 'last_follow_up_time', 'created_at'].includes(fieldName)) return 'date'
      if (['is_archived'].includes(fieldName)) return 'boolean'
      return 'text'
    }
    
    // 获取字段的友好名称
    const getFieldDisplayName = (field: string) => {
      const fieldMap: { [key: string]: string } = {
        'db.customer.name': '客户姓名',
        'db.customer.phone': '电话号码',
        'db.customer.telegram_chat_id': 'Telegram Chat ID',
        'db.customer.email': '邮箱',
        'db.customer.status': '状态',
        'db.customer.stage_id': '阶段',
        'db.customer.unread_count': '未读消息数',
        'db.customer.move_in_date': '搬入日期',
        'db.customer.updated_at': '更新时间',
        'db.customer.created_at': '创建时间',
        'db.customer.last_timestamp': '最后消息时间',
        'db.customer.last_follow_up_time': '最后跟进时间',
        'db.customer.last_message': '最后消息内容',
        'db.customer.photo_url': '头像URL',
        'db.customer.tags': '标签',
        'db.customer.notes': '备注',
        'db.customer.is_archived': '已归档'
      }
      return fieldMap[field] || field.replace('db.customer.', '').replace('custom_fields.', '')
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
        case 'boolean':
          return [
            { value: '==', label: '等於' },
            { value: '!=', label: '不等於' }
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <label style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>
                    📋 条件规则
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={addCondition}
                      className="small-action-button primary"
                      style={{ 
                        fontSize: '13px', 
                        fontWeight: 600,
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(99, 102, 241, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(99, 102, 241, 0.3)'
                      }}
                    >
                      ➕ 添加条件
                    </button>
                  </div>
                </div>

              {conditions.length === 0 ? (
                <div style={{ 
                  padding: 32, 
                  textAlign: 'center', 
                  color: '#9ca3af', 
                  border: '2px dashed #e5e7eb', 
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                  fontSize: 14,
                  fontWeight: 500
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                  <div>点击"添加条件"开始配置条件规则</div>
                  <div style={{ fontSize: 12, color: '#d1d5db', marginTop: 4 }}>
                    支持多条件组合，使用 AND/OR 逻辑运算
                  </div>
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

                  <div className="conditions-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {conditions.map((condition: any, index: number) => {
                      const fieldType = getFieldType(condition.field)
                      const operators = getOperatorsForType(fieldType)
                      
                      return (
                        <div 
                          key={condition.id} 
                          className="condition-item"
                          style={{
                            background: 'linear-gradient(135deg, #f6f8fb 0%, #ffffff 100%)',
                            border: '2px solid #e0e7ff',
                            borderRadius: 12,
                            padding: 16,
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#818cf8'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.15)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#e0e7ff'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.08)'
                          }}
                        >
                          {index > 0 && (
                            <div 
                              className="logic-operator"
                              style={{
                                position: 'absolute',
                                top: -12,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: logicOperator === 'AND' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                color: 'white',
                                padding: '4px 16px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 600,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                letterSpacing: '0.5px'
                              }}
                            >
                              {logicOperator}
                            </div>
                          )}
                          
                          <div className="condition-controls" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                            {/* 字段选择 */}
                            <div className="condition-field" style={{ flex: '1 1 200px', minWidth: '200px' }}>
                              <label style={{ 
                                display: 'block', 
                                marginBottom: 6, 
                                fontSize: 13, 
                                fontWeight: 600, 
                                color: '#4b5563',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>
                                字段
                              </label>
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
                                  style={{ 
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1.5px solid #d1d5db',
                                    fontSize: 14,
                                    backgroundColor: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="">选择字段...</option>
                                  {(() => {
                                    // 定义完整的基础字段列表（排除内部字段）
                                    const baseDbFields = [
                                      'db.customer.name',
                                      'db.customer.phone',
                                      'db.customer.telegram_chat_id',
                                      'db.customer.email',
                                      'db.customer.status',
                                      'db.customer.stage_id',
                                      'db.customer.tags',
                                      'db.customer.notes',
                                      'db.customer.unread_count',
                                      'db.customer.move_in_date',
                                      'db.customer.last_message',
                                      'db.customer.last_timestamp',
                                      'db.customer.last_follow_up_time',
                                      'db.customer.created_at',
                                      'db.customer.updated_at',
                                      'db.customer.photo_url',
                                      'db.customer.is_archived'
                                    ]
                                    
                                    // 合并配置的字段和基础字段
                                    let configuredDb: string[] = []
                                    let customFields: string[] = []
                                    
                                    // 内部字段列表（不应该在条件中使用）
                                    const internalFields = [
                                      'db.customer.id',
                                      'db.customer.user_id',
                                      'db.customer.version',
                                      'db.customer.budget_min',
                                      'db.customer.budget_max',
                                      'db.customer.preferred_location'
                                    ]
                                    
                                    if (Array.isArray(headerList) && headerList.length > 0) {
                                      configuredDb = headerList.filter(h => h.startsWith('db.customer.'))
                                        .filter(h => !internalFields.includes(h))
                                      customFields = headerList.filter(h => h.startsWith('custom_fields.'))
                                    }
                                    
                                    const dbFieldsSet = new Set([...baseDbFields, ...configuredDb])
                                    const dbFields = Array.from(dbFieldsSet).sort()
                                    
                                    return (
                                      <>
                                        {dbFields.length > 0 && (
                                          <optgroup label="📊 数据库字段">
                                            {dbFields.map(h => (
                                              <option key={h} value={h}>
                                                {getFieldDisplayName(h)}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {customFields.length > 0 && (
                                          <optgroup label="✨ 自定义字段">
                                            {customFields.map(h => (
                                              <option key={h} value={h}>
                                                {h.replace('custom_fields.', '')}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </>
                                    )
                                  })()}
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
                            <div className="condition-operator" style={{ flex: '0 1 160px', minWidth: '160px' }}>
                              <label style={{ 
                                display: 'block', 
                                marginBottom: 6, 
                                fontSize: 13, 
                                fontWeight: 600, 
                                color: '#4b5563',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>
                                条件
                              </label>
                              <select
                                value={condition.operator}
                                onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  border: '1.5px solid #d1d5db',
                                  fontSize: 14
                                }}
                              >
                                {operators.map(op => (
                                  <option key={op.value} value={op.value}>{op.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* 值输入 */}
                            {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                              <div className="condition-value" style={{ flex: '1 1 200px', minWidth: '200px' }}>
                                <label style={{ 
                                  display: 'block', 
                                  marginBottom: 6, 
                                  fontSize: 13, 
                                  fontWeight: 600, 
                                  color: '#4b5563',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}>
                                  值
                                </label>
                                {/* Stage 字段：下拉选择 */}
                                {condition.field === 'db.customer.stage_id' ? (
                                  <select
                                    value={condition.value || ''}
                                    onChange={(e) => {
                                      updateCondition(condition.id, { value: e.target.value });
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      border: '1.5px solid #d1d5db',
                                      fontSize: 14,
                                      backgroundColor: 'white',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="">选择阶段...</option>
                                    {customerStages.map((stage: any) => (
                                      <option key={stage.id} value={stage.id}>
                                        {stage.name} {stage.description ? `(${stage.description})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                
                                /* Status 字段：预定义选项 */
                                ) : condition.field === 'db.customer.status' ? (
                                  <select
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      border: '1.5px solid #d1d5db',
                                      fontSize: 14,
                                      backgroundColor: 'white',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="">选择状态...</option>
                                    <option value="active">活跃 (active)</option>
                                    <option value="inactive">不活跃 (inactive)</option>
                                    <option value="blocked">已屏蔽 (blocked)</option>
                                  </select>
                                
                                /* Boolean 字段：true/false 选择 */
                                ) : fieldType === 'boolean' ? (
                                  <select
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      border: '1.5px solid #d1d5db',
                                      fontSize: 14,
                                      backgroundColor: 'white',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="">选择...</option>
                                    <option value="true">是 (true)</option>
                                    <option value="false">否 (false)</option>
                                  </select>
                                
                                /* Between 操作符：两个输入框 */
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
                                      style={{ 
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1.5px solid #d1d5db',
                                        fontSize: 14
                                      }}
                                    />
                                    <span style={{ color: '#6b7280', fontWeight: 600 }}>到</span>
                                    <input
                                      type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                      value={condition.value?.split(',')[1] || ''}
                                      onChange={(e) => {
                                        const parts = condition.value?.split(',') || ['', '']
                                        parts[1] = e.target.value
                                        updateCondition(condition.id, { value: parts.join(',') })
                                      }}
                                      placeholder="最大值"
                                      style={{ 
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1.5px solid #d1d5db',
                                        fontSize: 14
                                      }}
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
                                      style={{ 
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1.5px solid #d1d5db',
                                        fontSize: 14
                                      }}
                                    />
                                    <span style={{ color: '#6b7280', fontWeight: 600 }}>天</span>
                                  </div>
                                ) : (
                                  <input
                                    type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                    value={condition.value || ''}
                                    onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                    placeholder={fieldType === 'number' ? '输入数字' : fieldType === 'date' ? '选择日期' : '输入文本'}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      border: '1.5px solid #d1d5db',
                                      fontSize: 14,
                                      transition: 'border-color 0.2s ease'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                                  />
                                )}
                              </div>
                            )}

                            {/* 删除按钮 */}
                            <div className="condition-actions" style={{ flex: '0 0 auto' }}>
                              <button
                                type="button"
                                onClick={() => removeCondition(condition.id)}
                                className="small-action-button"
                                style={{ 
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  padding: '8px 16px',
                                  border: 'none',
                                  borderRadius: 8,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
                                  whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                                  e.currentTarget.style.transform = 'translateY(-1px)'
                                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(239, 68, 68, 0.4)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                  e.currentTarget.style.transform = 'translateY(0)'
                                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(239, 68, 68, 0.3)'
                                }}
                              >
                                🗑️ 删除
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
  const [availableVariables, setAvailableVariables] = useState<any>(() => ({
    '触发器信息': [
      { label: '手机号', value: '{{trigger.phone}}', description: '触发消息的发送者手机号' },
      { label: '聊天ID', value: '{{trigger.chat_id}}', description: 'Telegram 聊天ID' },
      { label: '发送者姓名', value: '{{trigger.name}}', description: '触发消息的发送者姓名' },
      { label: '消息内容', value: '{{trigger.message}}', description: '触发消息的文本内容' },
      { label: '时间戳', value: '{{trigger.timestamp}}', description: '消息发送时间' },
      { label: '用户ID', value: '{{trigger.user_id}}', description: '系统用户ID' },
    ],
    'AI 输出': [
      { label: 'AI 回复文本', value: '{{ai.reply.reply_text}}', description: 'AI 生成的回复内容' },
      { label: 'AI 分析结果', value: '{{ai.analyze}}', description: 'AI 分析的完整结果' },
      { label: 'AI 置信度', value: '{{ai.analyze.confidence}}', description: 'AI 分析的置信度评分' },
    ],
    'API 响应': [
      { label: 'API 响应数据', value: '{{api.response.data}}', description: 'API 调用返回的数据' },
      { label: 'API 状态码', value: '{{api.response.status_code}}', description: 'API 调用的HTTP状态码' },
    ],
    '客户基础信息': [],
    '客户自定义字段': [],
  })); // Corrected: removed [1] after useState initialization

  const fetchCustomerFields = useCallback(async () => {
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
      // 如果API调用失败，设置默认的字段信息
      setAvailableVariables((prev: any) => ({
        ...prev,
        '客户基础信息': [
          { label: '客户ID', value: '{{db.customer.id}}', description: '客户的唯一标识符' },
          { label: '客户姓名', value: '{{db.customer.name}}', description: '客户的姓名' },
          { label: '客户电话', value: '{{db.customer.phone}}', description: '客户的电话号码' },
          { label: '客户邮箱', value: '{{db.customer.email}}', description: '客户的邮箱地址' },
          { label: '客户状态', value: '{{db.customer.status}}', description: '客户的当前状态' },
          { label: '阶段ID', value: '{{db.customer.stage_id}}', description: '客户所在的销售阶段' },
          { label: '最小预算', value: '{{db.customer.budget_min}}', description: '客户的最小预算' },
          { label: '最大预算', value: '{{db.customer.budget_max}}', description: '客户的最大预算' },
          { label: '入住日期', value: '{{db.customer.move_in_date}}', description: '客户期望的入住日期' },
          { label: '偏好位置', value: '{{db.customer.preferred_location}}', description: '客户偏好的位置' },
          { label: '创建时间', value: '{{db.customer.created_at}}', description: '客户记录创建时间' },
          { label: '更新时间', value: '{{db.customer.updated_at}}', description: '客户记录最后更新时间' },
        ],
        '客户自定义字段': [
          { label: '客户备注', value: '{{custom_fields.备注}}', description: '客户的备注信息' },
          { label: '客户来源', value: '{{custom_fields.来源}}', description: '客户的来源渠道' },
          { label: '客户标签', value: '{{custom_fields.标签}}', description: '客户的标签' },
          { label: '房型偏好', value: '{{custom_fields.房型偏好}}', description: '客户的房型偏好' },
          { label: '联系偏好', value: '{{custom_fields.联系偏好}}', description: '客户的联系偏好' },
          { label: '跟进状态', value: '{{custom_fields.跟进状态}}', description: '客户的跟进状态' },
        ]
      }))
    }
  }, [setAvailableVariables])

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
      const anchor = rect ? rect : undefined; // 直接使用 DOMRect
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

  // 获取客户阶段（用于 stage_id 字段的下拉选择）
  async function fetchCustomerStages() {
    try {
      const response = await api.get('/api/pipeline/stages');
      setCustomerStages(response || []);
    } catch (e) {
      console.error('Error fetching customer stages:', e);
      setCustomerStages([]);
    }
  }

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
          配置节点: {getNodeTitle(node.type)}
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
            position: 'fixed',
            left: (() => {
              if (!showVariableSelector.anchor) return '50%';
              const anchorRect = showVariableSelector.anchor;
              const popoverWidth = 360; // from style
              let calculatedLeft = anchorRect.left;

              // Prevent overflow on the right
              if (calculatedLeft + popoverWidth > window.innerWidth - 20) {
                calculatedLeft = window.innerWidth - popoverWidth - 20;
              }
              // Prevent overflow on the left
              if (calculatedLeft < 20) {
                calculatedLeft = 20;
              }
              return `${calculatedLeft}px`;
            })(),
            top: (() => {
              if (!showVariableSelector.anchor) return '50%';
              const anchorRect = showVariableSelector.anchor;
              const popoverMaxHeight = window.innerHeight * 0.6; // from style
              let calculatedTop = anchorRect.bottom + 8; // 8px offset below trigger

              // Prevent overflow on the bottom
              if (calculatedTop + popoverMaxHeight > window.innerHeight - 20) {
                calculatedTop = anchorRect.top - popoverMaxHeight - 8; // Position above the trigger
                // If still overflows top (unlikely given max-height), clamp to 20px from top
                if (calculatedTop < 20) {
                  calculatedTop = 20;
                }
              }
              return `${calculatedTop}px`;
            })(),
            transform: showVariableSelector.anchor ? 'none' : 'translate(-50%, -50%)'
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
            {(showVariableSelector.position === 'smart_body' || showVariableSelector.position?.startsWith('smart_template_')) ? (
              // 智能变量专用显示
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '16px',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.08) 100%)',
                  borderRadius: '12px',
                  border: '1px solid rgba(245, 158, 11, 0.15)'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    marginRight: '12px'
                  }}></div>
                  <h5 style={{ 
                    margin: 0, 
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1e293b'
                  }}>
                    🔗 智能变量
                  </h5>
                </div>
                
                {/* 智能变量列表 */}
                <div style={{ display: 'grid', gap: '12px' }}>
                  {Object.entries(localData.smart_variables || {}).map(([varName, varConfig]: [string, any]) => (
                    <div
                      key={varName}
                      onClick={() => handleVariableSelect(`{{${varName}}}`)}
                      style={{
                        padding: '16px',
                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                        borderRadius: '12px',
                        border: '2px solid rgba(245, 158, 11, 0.2)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(245, 158, 11, 0.15)';
                        e.currentTarget.style.borderColor = '#f59e0b';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                      }}
                    >
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#92400e',
                        marginBottom: '8px',
                        fontFamily: 'monospace'
                      }}>
                        {`{{${varName}}}`}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#a16207',
                        marginBottom: '4px'
                      }}>
                        📋 {varConfig.display_name || varName}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#a16207',
                        opacity: 0.8
                      }}>
                        🔗 数据源: {varConfig.source || '未设置'}
                      </div>
                      {varConfig.transformer && varConfig.transformer !== 'None' && (
                        <div style={{
                          fontSize: '12px',
                          color: '#a16207',
                          opacity: 0.8,
                          marginTop: '4px'
                        }}>
                          🔄 转换: {varConfig.transformer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // 普通变量显示
              Object.entries(availableVariables).map(([category, variables]) => (
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
            ))
            )}
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
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            position: 'fixed',
            left: (() => {
              if (!showMediaSelector.anchor) return '50%';
              const anchorRect = showMediaSelector.anchor;
              const popoverWidth = 480; // from style
              let calculatedLeft = anchorRect.left;
              if (calculatedLeft + popoverWidth > window.innerWidth - 20) {
                calculatedLeft = window.innerWidth - popoverWidth - 20;
              }
              if (calculatedLeft < 20) {
                calculatedLeft = 20;
              }
              return `${calculatedLeft}px`;
            })(),
            top: (() => {
              if (!showMediaSelector.anchor) return '50%';
              const anchorRect = showMediaSelector.anchor;
              const popoverMaxHeight = window.innerHeight * 0.6; // from style
              let calculatedTop = anchorRect.bottom + 8;
              if (calculatedTop + popoverMaxHeight > window.innerHeight - 20) {
                calculatedTop = anchorRect.top - popoverMaxHeight - 8;
                if (calculatedTop < 20) {
                  calculatedTop = 20;
                }
              }
              return `${calculatedTop}px`;
            })(),
            transform: showMediaSelector.anchor ? 'none' : 'translate(-50%, -50%)'
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
                                        handleMediaSelect(media.id, media.filename);
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
                            handleMediaSelect(media.id, media.filename);
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
                            <div style={{ position: 'relative' }}>
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
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '4px',
                                  background: 'rgba(0, 0, 0, 0.5)',
                                  borderRadius: '50%',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  zIndex: 10
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewImageUrl(media.file_url);
                                  setShowImagePreviewModal(true);
                                }}
                              >
                                👁️
                              </div>
                            </div>
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
                      onClick={() => {
                        setShowPromptPreview(false); // 关闭预览
                        setShowPromptEditor(true); // 打开编辑
                      }}
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
            position: 'fixed',
            left: (() => {
              if (!showKnowledgeBaseSelector.anchor) return '50%';
              const anchorRect = showKnowledgeBaseSelector.anchor;
              const popoverWidth = 480; // from style
              let calculatedLeft = anchorRect.left;
              if (calculatedLeft + popoverWidth > window.innerWidth - 20) {
                calculatedLeft = window.innerWidth - popoverWidth - 20;
              }
              if (calculatedLeft < 20) {
                calculatedLeft = 20;
              }
              return `${calculatedLeft}px`;
            })(),
            top: (() => {
              if (!showKnowledgeBaseSelector.anchor) return '50%';
              const anchorRect = showKnowledgeBaseSelector.anchor;
              const popoverMaxHeight = window.innerHeight * 0.6; // from style
              let calculatedTop = anchorRect.bottom + 8;
              if (calculatedTop + popoverMaxHeight > window.innerHeight - 20) {
                calculatedTop = anchorRect.top - popoverMaxHeight - 8;
                if (calculatedTop < 20) {
                  calculatedTop = 20;
                }
              }
              return `${calculatedTop}px`;
            })(),
            transform: showKnowledgeBaseSelector.anchor ? 'none' : 'translate(-50%, -50%)'
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
                      onClick={() => {
                        setShowPromptPreview(false); // 关闭预览
                        setShowPromptEditor(true); // 打开编辑
                      }}
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

      {/* 图片预览弹窗 */}
      {showImagePreviewModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '90vh',
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            <button
              onClick={() => setShowImagePreviewModal(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000
              }}
            >
              ×
            </button>
            <img
              src={previewImageUrl}
              alt="预览"
              style={{
                maxWidth: '80vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
