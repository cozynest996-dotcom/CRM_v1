import React, { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import { Modal, Image } from 'antd' // 导入 Modal 和 Image 组件
import { EyeOutlined } from '@ant-design/icons' // 导入 EyeOutlined 图标

// 提示词接口定义
export interface Prompt {
  id: string
  name: string
  description?: string
  system_prompt: string
  user_prompt: string
  created_at?: string
  updated_at?: string
}

// 提示词表单弹窗组件的 Props 接口
interface PromptFormModalProps {
  prompt?: Prompt | null
  onSave: (data: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>) => void
  onCancel: () => void
}

export default function PromptFormModal({ prompt, onSave, onCancel }: PromptFormModalProps) {
  const [formData, setFormData] = useState({
    name: prompt?.name || '',
    description: prompt?.description || '',
    system_prompt: prompt?.system_prompt || '',
    user_prompt: prompt?.user_prompt || ''
  })

  const [showVariableSelector, setShowVariableSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }} >({ show: false })
  const [showKnowledgeBaseSelector, setShowKnowledgeBaseSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }}>({ show: false }) // 修改类型，添加 anchor
  const [showMediaSelector, setShowMediaSelector] = useState<{show: boolean, position?: string, anchor?: { left: number, top: number }} >({ show: false })
  const [mediaList, setMediaList] = useState<any[]>([])
  const [folderList, setFolderList] = useState<any[]>([])
  const [folderMediaList, setFolderMediaList] = useState<any[]>([])
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null)
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const [customEntityTypes, setCustomEntityTypes] = useState<any[]>([]) // 新增：自定义实体类型列表
  const [selectedCustomEntityTypeId, setSelectedCustomEntityTypeId] = useState<number | null>(null) // 新增：选中的自定义实体类型ID
  const [selectedCustomEntityRecordId, setSelectedCustomEntityRecordId] = useState<number | null>(null) // 新增：选中的自定义实体记录ID
  const [customEntityRecords, setCustomEntityRecords] = useState<any[]>([]) // 新增：特定实体类型下的记录

  const [showImagePreviewModal, setShowImagePreviewModal] = useState<boolean>(false) // 新增：控制图片预览弹窗显示
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null) // 新增：存储要预览的图片URL
  const [showVideoPreviewModal, setShowVideoPreviewModal] = useState<boolean>(false) // 新增：控制视频预览弹窗显示
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null) // 新增：存储要预览的视频URL
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]) // 新增：存储当前Prompt中已选择的知识库ID
  const [filteredSuggestions, setFilteredSuggestions] = useState<any[]>([]) // 新增：过滤后的建议列表
  const [activeSuggestionType, setActiveSuggestionType] = useState<'variable' | 'knowledgeBase' | 'media' | null>(null) // 新增：当前激活的建议类型
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const userPromptRef = useRef<HTMLTextAreaElement>(null);

  // refs and helpers for anchored popovers
  const variablePopoverRef = useRef<HTMLDivElement | null>(null)
  const mediaPopoverRef = useRef<HTMLDivElement | null>(null)
  const knowledgeBasePopoverRef = useRef<HTMLDivElement | null>(null) // 新增：知识库弹窗的ref
 
  // 通用文本插入函数，用于在光标位置插入文本
  const insertTextAtCaret = (textarea: HTMLTextAreaElement, textToInsert: string) => {
    console.log('🔧 insertTextAtCaret called with:', textToInsert);
    console.log('🔧 textarea:', textarea);
    console.log('🔧 current value:', textarea.value);
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    console.log('🔧 selection start:', start, 'end:', end);

    const newValue = value.substring(0, start) + textToInsert + value.substring(end);
    
    console.log('🔧 new value:', newValue);
    
    // 同时更新 DOM 和 React 状态
    textarea.value = newValue;
    
    if (textarea === systemPromptRef.current) {
      console.log('🔧 Updating system_prompt state');
      setFormData(prev => ({ ...prev, system_prompt: newValue }));
    } else if (textarea === userPromptRef.current) {
      console.log('🔧 Updating user_prompt state');
      setFormData(prev => ({ ...prev, user_prompt: newValue }));
    }
    
    // 设置光标位置
    textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    textarea.focus();
    
    // 触发 input 事件以确保 React 知道值已更改
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
    
    console.log('🔧 insertTextAtCaret completed');
  };

  // 处理知识库选择（包括单个知识库和类别）
  const handleKnowledgeBaseSelect = (kbTag: string) => {
    if (showKnowledgeBaseSelector.position === 'system_prompt' && systemPromptRef.current) {
      insertTextAtCaret(systemPromptRef.current, kbTag);
    } else if (showKnowledgeBaseSelector.position === 'user_prompt' && userPromptRef.current) {
      insertTextAtCaret(userPromptRef.current, kbTag);
    }
    setShowKnowledgeBaseSelector({ show: false });
    setFilteredSuggestions([]);
    setActiveSuggestionType(null);
  };

  // 处理媒体选择
  const handleMediaSelect = (mediaTag: string) => {
    if (showMediaSelector.position === 'system_prompt' && systemPromptRef.current) {
      insertTextAtCaret(systemPromptRef.current, mediaTag);
    } else if (showMediaSelector.position === 'user_prompt' && userPromptRef.current) {
      insertTextAtCaret(userPromptRef.current, mediaTag);
    }
    setShowMediaSelector({ show: false });
    setFilteredSuggestions([]);
    setActiveSuggestionType(null);
  };

  // 打开变量选择器并锚定到触发元素位置
  const openVariableSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.()
      if (rect) {
        const anchorBelow = { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY }
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceBelow = viewportHeight - rect.bottom
        // if not enough space below, show above
        const preferAbove = spaceBelow < 320 // popover height estimate
        const anchor = preferAbove
          ? { left: rect.left + window.scrollX, top: rect.top + window.scrollY }
          : anchorBelow
        setShowVariableSelector({ show: true, position: position, anchor })
      } else {
        setShowVariableSelector({ show: true, position: position })
      }
    } catch (err) {
      setShowVariableSelector({ show: true, position: position })
    }
  }

  // 打开媒体选择器并锚定到触发元素位置
  const openMediaSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.()
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined
      setShowMediaSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) })
    } catch (err) {
      setShowMediaSelector({ show: true, position: position })
    }
  }

  // 打开知识库选择器并锚定到触发元素位置
  const openKnowledgeBaseSelector = (e: any, position?: string) => {
    try {
      const rect = e?.currentTarget?.getBoundingClientRect?.()
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined
      setShowKnowledgeBaseSelector({ show: true, position: position, ...(anchor ? { anchor } : {}) })
    } catch (err) {
      setShowKnowledgeBaseSelector({ show: true, position: position })
    }
  }

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

  useEffect(() => {
    if (!showVariableSelector.show && !showMediaSelector.show && !showKnowledgeBaseSelector.show) return
    const handler = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (variablePopoverRef.current && variablePopoverRef.current.contains(target)) return
      if (mediaPopoverRef.current && mediaPopoverRef.current.contains(target)) return
      if (knowledgeBasePopoverRef.current && knowledgeBasePopoverRef.current.contains(target)) return // 新增：知识库弹窗的外部点击关闭逻辑
      // 如果图片预览弹窗打开，则不关闭媒体选择器
      if (showImagePreviewModal) return;
      if (showVideoPreviewModal) return; // 如果视频预览弹窗打开，则不关闭媒体选择器
      setShowVariableSelector({ show: false })
      setShowMediaSelector({ show: false })
      setShowKnowledgeBaseSelector({ show: false }); // 新增：关闭知识库选择器
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [showVariableSelector.show, showMediaSelector.show, showKnowledgeBaseSelector.show, showImagePreviewModal, showVideoPreviewModal]) // 添加 showKnowledgeBaseSelector.show 作为依赖

  // 提取已选知识库ID的辅助函数
  const extractKnowledgeBaseIds = (text: string): string[] => {
    const regex = /{{kb\.([^}]+)}}/g;
    const matches = Array.from(text.matchAll(regex));
    return matches.map(match => match[1]);
  };

  // 当 prompt 或 showKnowledgeBaseSelector.show 变化时，更新 selectedKnowledgeBaseIds
  useEffect(() => {
    if (prompt || formData.system_prompt || formData.user_prompt) {
      const systemKbIds = extractKnowledgeBaseIds(formData.system_prompt);
      const userKbIds = extractKnowledgeBaseIds(formData.user_prompt);
      setSelectedKnowledgeBaseIds(Array.from(new Set([...systemKbIds, ...userKbIds])));
    }
  }, [prompt, formData.system_prompt, formData.user_prompt, showKnowledgeBaseSelector.show]);

  // 获取知识库数据
  const fetchKnowledgeBases = async () => {
    try {
      const response = await api.get('/api/knowledge-base/')
      console.log('Fetched knowledge bases:', response); // 新增：打印 API 响应
      setKnowledgeBases(response || [])
    } catch (error) {
      console.error('Error fetching knowledge bases:', error)
      setKnowledgeBases([])
    }
  }

  // 获取媒体数据
  const fetchMediaData = async () => {
    try {
      const response = await api.get('/api/media')
      if (response) {
        setMediaList(response.media || [])
        setFolderList(response.folders || [])
      }
    } catch (error) {
      console.error('Error fetching media data:', error)
    }
  }

  // 获取文件夹内媒体
  const fetchFolderMedia = async (folderName: string) => {
    try {
      const response = await api.get(`/api/media?folder=${encodeURIComponent(folderName)}`)
      if (response && response.media) {
        setFolderMediaList(response.media)
      }
    } catch (error) {
      console.error('Error fetching folder media:', error)
      setFolderMediaList([])
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('请输入提示词名称')
      return
    }
    onSave(formData)
  }

  const [availableVariables, setAvailableVariables] = useState<any>({});

  useEffect(() => {
    const initializeVariables = async () => {
      await fetchCustomerFields();
      await fetchCustomEntityTypes();
    };
    initializeVariables();
  }, []);

  // 新增：当选中的自定义实体类型变化时，加载其对应的记录
  useEffect(() => {
    if (selectedCustomEntityTypeId) {
      fetchCustomEntityRecords(selectedCustomEntityTypeId);
    } else {
      setCustomEntityRecords([]); // 如果没有选择实体类型，则清空记录
    }
  }, [selectedCustomEntityTypeId]);

  // 每次 customEntityTypes 变化时，更新 availableVariables 中的自定义实体类型部分
  useEffect(() => {
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
              value: `{{custom_object.${entityType.id}.recordId.${field.field_key}}}`,
              description: `${entityType.name} 的 ${field.name} 字段`
            });
          });
        });
        return newVars;
      });
    }
  }, [customEntityTypes]);

  // 获取客户字段数据
  const fetchCustomerFields = async () => {
    try {
      const response = await api.get('/api/customers/fields/detailed');
      console.log('Fetched customer fields:', response);

      setAvailableVariables(prev => ({
        ...prev,
        '触发器数据': [
          { label: '发送者姓名', value: '{{trigger.name}}', description: '发送消息的用户姓名' },
          { label: '发送者电话', value: '{{trigger.phone}}', description: '发送消息的用户电话号码' },
          { label: '聊天ID', value: '{{trigger.chat_id}}', description: 'Telegram 聊天ID' },
          { label: '消息内容', value: '{{trigger.message}}', description: '用户发送的原始消息内容' },
          { label: '时间戳', value: '{{trigger.timestamp}}', description: '消息发送的时间' },
          { label: '用户ID', value: '{{trigger.user_id}}', description: '系统用户ID' },
          { label: '消息来源', value: '{{trigger.channel}}', description: '消息来源平台（whatsapp/telegram）' },
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
        '客户基础信息': response.basic_fields || [],
        '客户自定义字段': response.custom_fields || []
      }));
    } catch (error) {
      console.error('Failed to fetch customer fields:', error);
    }
  };

  // 处理变量选择
  const handleVariableSelect = (variableValue: string) => {
    console.log('🔍 handleVariableSelect called with:', variableValue);
    console.log('🔍 showVariableSelector.position:', showVariableSelector.position);
    console.log('🔍 systemPromptRef.current:', systemPromptRef.current);
    console.log('🔍 userPromptRef.current:', userPromptRef.current);
    
    let finalVariableValue = variableValue;
    // 如果变量是自定义实体记录字段，则替换 recordId 占位符
    if (variableValue.includes('.recordId.') && selectedCustomEntityRecordId) {
      const entityTypeIdMatch = variableValue.match(/{{custom_object\.([^}]+)\.recordId\.(.*)}}/);
      if (entityTypeIdMatch) {
        finalVariableValue = `{{custom_object.${entityTypeIdMatch[1]}.${selectedCustomEntityRecordId}.${entityTypeIdMatch[2]}}}`;
      }
    } else if (variableValue.includes('.all}}') && variableValue.includes('custom_object') && selectedCustomEntityTypeId) {
      // 如果是 {{custom_object.entityTypeId.all}} 形式，则替换 entityTypeId
      const entityTypeIdMatch = variableValue.match(/{{custom_object\.([^}]+)\.all}}/);
      if (entityTypeIdMatch) {
        finalVariableValue = `{{custom_object.${selectedCustomEntityTypeId}.all}}`;
      }
    }

    console.log('🔍 finalVariableValue:', finalVariableValue);

    if (showVariableSelector.position === 'system_prompt' && systemPromptRef.current) {
      console.log('✅ Inserting into system_prompt');
      insertTextAtCaret(systemPromptRef.current, finalVariableValue);
    } else if (showVariableSelector.position === 'user_prompt' && userPromptRef.current) {
      console.log('✅ Inserting into user_prompt');
      insertTextAtCaret(userPromptRef.current, finalVariableValue);
    } else {
      console.log('❌ No valid target found for insertion');
    }
    setShowVariableSelector({ show: false });
    setFilteredSuggestions([]);
    setActiveSuggestionType(null);
  };

  // 根據输入过滤建议列表
  const filterSuggestions = (inputValue: string) => {
    const lowerCaseInput = inputValue.toLowerCase();
    if (!activeSuggestionType || !lowerCaseInput) {
      setFilteredSuggestions([]);
      return;
    }

    let suggestions: any[] = [];
    if (activeSuggestionType === 'variable') {
      Object.values(availableVariables).forEach((categoryVars: any) => {
        suggestions = suggestions.concat(categoryVars.map((v: any) => ({
          ...v, type: 'variable'
        })));
      });
    } else if (activeSuggestionType === 'knowledgeBase') {
      suggestions = knowledgeBases.map((kb: any) => ({ ...kb, type: 'knowledgeBase' }));
    } else if (activeSuggestionType === 'media') {
      suggestions = mediaList.map((m: any) => ({ ...m, type: 'media' }));
    }

    const filtered = suggestions.filter(item => {
      if (item.type === 'variable') {
        return item.label.toLowerCase().includes(lowerCaseInput) || item.value.toLowerCase().includes(lowerCaseInput);
      } else if (item.type === 'knowledgeBase') {
        return item.name.toLowerCase().includes(lowerCaseInput) || item.description?.toLowerCase().includes(lowerCaseInput);
      } else if (item.type === 'media') {
        return item.filename.toLowerCase().includes(lowerCaseInput);
      }
      return false;
    });
    setFilteredSuggestions(filtered);
  };

  // 处理 Prompt 输入框的键盘事件
  const handlePromptInput = (e: React.KeyboardEvent<HTMLTextAreaElement>, field: 'system_prompt' | 'user_prompt') => {
    const textarea = e.currentTarget;
    const caretPos = textarea.selectionStart; // 光标位置
    const textBeforeCaret = textarea.value.substring(0, caretPos);
    const currentInput = textBeforeCaret.split(/[\s@📚📷]+/).pop() || ''; // 获取光标前的最后一个单词作为过滤输入

    // 如果按下了 Escape 键，关闭所有选择器
    if (e.key === 'Escape') {
      setShowVariableSelector({ show: false });
      setShowKnowledgeBaseSelector({ show: false });
      setShowMediaSelector({ show: false });
      setActiveSuggestionType(null);
      setFilteredSuggestions([]);
      return;
    }

    // 获取当前光标前的字符
    const charBeforeCaret = textBeforeCaret.slice(-1);

    // 获取触发按钮的 DOM 元素
    const getTriggerButton = (buttonText: string): Element | null => {
      const buttonContainer = field === 'system_prompt' ? systemPromptRef.current?.nextElementSibling : userPromptRef.current?.nextElementSibling;
      if (buttonContainer) {
        // 使用更精确的选择器，例如通过 data-attribute 或 class
        // 假设按钮文本是唯一的，可以尝试查找包含该文本的按钮
        const buttons = Array.from(buttonContainer.querySelectorAll('button'));
        return buttons.find(btn => btn.textContent?.includes(buttonText)) || null;
      }
      return null;
    };

    const triggerSelector = (selectorSetter: any, fetcher: any, buttonText: string, type: 'variable' | 'knowledgeBase' | 'media') => {
      const buttonElement = getTriggerButton(buttonText);
      const rect = buttonElement?.getBoundingClientRect();
      const anchor = rect ? { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY } : undefined;

      const isAnySelectorOpen = showVariableSelector.show || showKnowledgeBaseSelector.show || showMediaSelector.show;
      const isCurrentSelectorActive = (selectorSetter === setShowVariableSelector && showVariableSelector.show) ||
                                      (selectorSetter === setShowKnowledgeBaseSelector && showKnowledgeBaseSelector.show) ||
                                      (selectorSetter === setShowMediaSelector && showMediaSelector.show);

      if (!isAnySelectorOpen || isCurrentSelectorActive) {
        selectorSetter({ show: true, position: field, anchor });
        setActiveSuggestionType(type);
        if (fetcher) fetcher();
      }
    };

    // 根据激活字符触发相应的选择器
    if (charBeforeCaret === '@') {
      triggerSelector(setShowVariableSelector, fetchCustomerFields, '@变量', 'variable');
    } else if (charBeforeCaret === '#') { // 修改为 # 激活知识库
      triggerSelector(setShowKnowledgeBaseSelector, fetchKnowledgeBases, '📚知识库', 'knowledgeBase');
    } else if (charBeforeCaret === '$') { // 修改为 $ 激活媒体
      triggerSelector(setShowMediaSelector, fetchMediaData, '📷媒体', 'media');
    } else if (activeSuggestionType) { // 如果有激活的建议类型，则继续过滤
      filterSuggestions(currentInput);
    } else {
      if (showVariableSelector.show && showVariableSelector.position === field) {
        setShowVariableSelector({ show: false });
      }
      if (showKnowledgeBaseSelector.show && showKnowledgeBaseSelector.position === field) {
        setShowKnowledgeBaseSelector({ show: false });
      }
      if (showMediaSelector.show && showMediaSelector.position === field) {
        setShowMediaSelector({ show: false });
      }
      setActiveSuggestionType(null); // 重置激活的建议类型
      setFilteredSuggestions([]);
    }
  };

  // 确保所有函数都已定义完毕，然后是组件的 JSX 返回部分
  return (
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
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        width: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
      }}>
        <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600', color: '#2d3748' }}>
          {prompt ? '编辑提示词' : '创建新提示词'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>
              名称 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="输入提示词名称"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>
              描述
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="简短描述这个提示词的用途"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>
              System Prompt
              <span style={{ marginLeft: '8px', fontSize: '12px', color: '#718096', fontWeight: 'normal' }}>(快捷符號: @變量, #知識庫, $媒體)</span>
            </label>
            <textarea
              ref={systemPromptRef} // 绑定 ref
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              onKeyUp={(e) => handlePromptInput(e, 'system_prompt')} // 添加 onKeyUp 事件监听器
              placeholder="你是一个专业的CRM智能助手..."
              rows={6}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  openVariableSelector(e, 'system_prompt')
                  fetchCustomerFields() // 获取最新的客户字段
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                @变量
              </button>
              <button
                type="button"
                onClick={(e) => {
                  openKnowledgeBaseSelector(e, 'system_prompt') // 使用新的 openKnowledgeBaseSelector 函数
                  fetchKnowledgeBases()
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                📚知识库
              </button>
              <button
                type="button"
                onClick={(e) => {
                  openMediaSelector(e, 'system_prompt')
                  fetchMediaData()
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                📷媒体
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2d3748' }}>
              User Prompt
              <span style={{ marginLeft: '8px', fontSize: '12px', color: '#718096', fontWeight: 'normal' }}>(快捷符號: @變量, #知識庫, $媒體)</span>
            </label>
            <textarea
              ref={userPromptRef} // 绑定 ref
              value={formData.user_prompt}
              onChange={(e) => setFormData({ ...formData, user_prompt: e.target.value })}
              onKeyUp={(e) => handlePromptInput(e, 'user_prompt')} // 添加 onKeyUp 事件监听器
              placeholder="客户刚刚发送的最新消息：{{trigger.message}}&#10;&#10;请根据以上消息内容进行分析和回复。"
              rows={6}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  openVariableSelector(e, 'user_prompt')
                  fetchCustomerFields() // 获取最新的客户字段
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                @变量
              </button>
              <button
                type="button"
                onClick={(e) => {
                  openKnowledgeBaseSelector(e, 'user_prompt') // 使用新的 openKnowledgeBaseSelector 函数
                  fetchKnowledgeBases()
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                📚知识库
              </button>
              <button
                type="button"
                onClick={(e) => {
                  openMediaSelector(e, 'user_prompt')
                  fetchMediaData()
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                📷媒体
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '12px 24px',
                background: '#e2e8f0',
                color: '#4a5568',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}
            >
              {prompt ? '更新' : '创建'}
            </button>
          </div>
        </form>

        {/* 变量选择器弹窗 - 锚定版本 */}
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
            zIndex: 3000,
            pointerEvents: 'none'
          }}>
            <div ref={variablePopoverRef} style={{
              pointerEvents: 'auto',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '12px',
              padding: '16px',
              width: '360px',
              maxHeight: '60vh',
              overflow: 'auto',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(0,0,0,0.06)',
              position: 'absolute',
              left: showVariableSelector.anchor ? `${(showVariableSelector as any).anchor.left}px` : '50%',
              top: showVariableSelector.anchor ? `${(showVariableSelector as any).anchor.top}px` : '50%',
              transform: (() => {
                try {
                  const anchor = (showVariableSelector as any).anchor
                  if (!anchor) return 'translate(-50%, -50%)'
                  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
                  // if anchor.top is at the trigger top (we preferred above), shift popover upwards
                  const preferAbove = anchor && anchor.top < (window.scrollY +  (viewportHeight / 2)) && anchor.top === anchor.top
                  return preferAbove ? 'translateY(-100%)' : 'translateY(8px)'
                } catch (e) {
                  return 'translateY(8px)'
                }
              })()
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>选择变量</h4>
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

              {activeSuggestionType === 'variable' && filteredSuggestions.length > 0 ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {filteredSuggestions.map((variable, varIndex) => (
                    <button
                      key={varIndex}
                      onClick={() => handleVariableSelect(variable.value)}
                      style={{
                        padding: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: 'white',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#667eea'; e.currentTarget.style.background = '#f0f4ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px', color: '#2d3748' }}>
                        {variable.label}
                      </div>
                      <div style={{
                        background: '#f8f9fa',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#666',
                        fontFamily: 'monospace',
                        marginBottom: '4px'
                      }}>
                        {variable.value}
                      </div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        {variable.description}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                Object.entries(availableVariables).map(([category, variables]) => (
                  <div key={category} style={{ marginBottom: '16px' }}>
                    <h5 style={{
                      margin: '0 0 8px 0',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#667eea'
                    }}>
                      {category}
                    </h5>
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
                    <div style={{
                      display: 'grid',
                      gap: '8px'
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
                              padding: '12px',
                              border: isDisabled ? '1px solid #e2e8f0' : '1px solid #e2e8f0',
                              borderRadius: '8px',
                              background: isDisabled ? '#f8fafc' : 'white',
                              textAlign: 'left',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled ? 0.6 : 1,
                              transition: 'all 0.2s ease'
                            }}
                            title={variable.description}
                            onMouseEnter={(e) => {
                              if (!isDisabled) {
                                e.currentTarget.style.borderColor = '#667eea'
                                e.currentTarget.style.background = '#f0f4ff'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isDisabled) {
                                e.currentTarget.style.borderColor = '#e2e8f0'
                                e.currentTarget.style.background = 'white'
                              }
                            }}
                          >
                            <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px', color: isDisabled ? '#94a3b8' : '#2d3748' }}>
                              {variable.label}
                            </div>
                            <div style={{
                              background: isDisabled ? '#e2e8f0' : '#f8f9fa',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              color: isDisabled ? '#94a3b8' : '#666',
                              fontFamily: 'monospace',
                              marginBottom: '4px'
                            }}>
                              {variable.value}
                            </div>
                            <div style={{ fontSize: '11px', color: isDisabled ? '#94a3b8' : '#666' }}>
                              {variable.description}
                            </div>
                            {isDisabled && (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: '#ffedd5',
                                color: '#ea580c',
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>
                                需选择记录
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 媒体选择器弹窗 - 锚定版本 */}
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
            zIndex: 3000,
            pointerEvents: 'none'
          }}>
            <div ref={mediaPopoverRef} style={{
              pointerEvents: 'auto',
              background: 'white',
              borderRadius: '10px',
              padding: '16px',
              width: '480px',
              maxHeight: '60vh',
              overflow: 'auto',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(0,0,0,0.06)',
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

              {/* 媒体文件列表 */}
              {mediaList.length > 0 && (
                <div>
                  <h5 style={{ margin: '0 0 8px 0', color: '#667eea' }}>🖼️ 媒体文件</h5>
                  {activeSuggestionType === 'media' && filteredSuggestions.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                      {filteredSuggestions.map((media, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            const tag = `[[MEDIA:${media.id}]]`;
                            const field = showMediaSelector.position as keyof typeof formData;
                            if (field === 'system_prompt' || field === 'user_prompt') {
                              setFormData({
                                ...formData,
                                [field]: formData[field] + tag
                              });
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
                            textAlign: 'center',
                            position: 'relative' // 允许绝对定位的子元素
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
                          {media.media_type === 'image' ? (
                            <>
                              <img 
                                src={media.file_url} 
                                alt={media.filename}
                                style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }}
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
                                  zIndex: 10 // 确保在图片之上
                                }}
                                onClick={(e) => {
                                  e.stopPropagation(); // 阻止事件冒泡到父级，避免插入tag
                                  setPreviewImageUrl(media.file_url); // 设置预览图片URL
                                  setShowImagePreviewModal(true); // 显示预览弹窗
                                }}
                              >
                                <EyeOutlined style={{ color: 'white', fontSize: '14px' }} />
                              </div>
                            </>
                          ) : media.media_type === 'video' ? (
                            <div style={{ position: 'relative' }}>
                              <video
                                src={media.file_url}
                                style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }}
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
                                  setPreviewVideoUrl(media.file_url);
                                  setShowVideoPreviewModal(true);
                                }}
                              >
                                <EyeOutlined style={{ color: 'white', fontSize: '14px' }} />
                              </div>
                            </div>
                          ) : (
                            <div style={{ 
                              height: '60px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: '24px',
                              marginBottom: '4px'
                            }}>
                              {media.media_type === 'audio' ? '🎵' : 
                               media.media_type === 'document' ? '📄' : '📎'}
                            </div>
                          )}
                          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
                            {media.filename.length > 12 ? media.filename.substring(0, 12) + '...' : media.filename}
                          </div>
                          <div style={{ fontSize: '9px', color: '#666' }}>
                            {media.media_type}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                      {mediaList.map((media, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            const tag = `[[MEDIA:${media.id}]]`;
                            const field = showMediaSelector.position as keyof typeof formData;
                            if (field === 'system_prompt' || field === 'user_prompt') {
                              setFormData({
                                ...formData,
                                [field]: formData[field] + tag
                              });
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
                            textAlign: 'center',
                            position: 'relative' // 允许绝对定位的子元素
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
                          {media.media_type === 'image' ? (
                            <>
                              <img 
                                src={media.file_url} 
                                alt={media.filename}
                                style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }}
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
                                <EyeOutlined style={{ color: 'white', fontSize: '14px' }} />
                              </div>
                            </>
                          ) : media.media_type === 'video' ? (
                            <div style={{ position: 'relative' }}>
                              <video
                                src={media.file_url}
                                style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px' }}
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
                                  setPreviewVideoUrl(media.file_url);
                                  setShowVideoPreviewModal(true);
                                }}
                              >
                                <EyeOutlined style={{ color: 'white', fontSize: '14px' }} />
                              </div>
                            </div>
                          ) : (
                            <div style={{ 
                              height: '60px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: '24px',
                              marginBottom: '4px'
                            }}>
                              {media.media_type === 'audio' ? '🎵' : 
                               media.media_type === 'document' ? '📄' : '📎'}
                            </div>
                          )}
                          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
                            {media.filename.length > 12 ? media.filename.substring(0, 12) + '...' : media.filename}
                          </div>
                          <div style={{ fontSize: '9px', color: '#666' }}>
                            {media.media_type}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 文件夹列表 (保持原有逻辑) */}
              {folderList.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{ margin: '0 0 8px 0', color: '#667eea' }}>📁 文件夹</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' , gap: '8px' }}>
                    {folderList.map((folder, index) => (
                      <div key={index}>
                        <div
                          style={{
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #e9ecef',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: expandedFolder === folder.name ? '#e3f2fd' : '#f8f9fa',
                            textAlign: 'center'
                          }}
                          onClick={() => {
                            if (expandedFolder === folder.name) {
                              setExpandedFolder(null);
                              setFolderMediaList([]);
                            } else {
                              setExpandedFolder(folder.name);
                              fetchFolderMedia(folder.name);
                            }
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
                                  const field = showMediaSelector.position as keyof typeof formData;
                                  if (field === 'system_prompt' || field === 'user_prompt') {
                                    setFormData({
                                      ...formData,
                                      [field]: formData[field] + tag
                                    });
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
                            </div>
                          </div>
                        </div>
                        {expandedFolder === folder.name && ( // 文件夹展开内容
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
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' , gap: '6px' }}>
                                {folderMediaList.map((media, mediaIndex) => (
                                  <div
                                    key={mediaIndex}
                                    onClick={() => {
                                      const tag = `[[MEDIA:${media.id}]]`;
                                      const field = showMediaSelector.position as keyof typeof formData;
                                      if (field === 'system_prompt' || field === 'user_prompt') {
                                        setFormData({
                                          ...formData,
                                          [field]: formData[field] + tag
                                        });
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
                                      textAlign: 'center',
                                      position: 'relative' // 允许绝对定位的子元素
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
                                      <>
                                        <img 
                                          src={media.file_url} 
                                          alt={media.filename}
                                          style={{ 
                                            width: '100%', 
                                            height: '50px', 
                                            objectFit: 'cover', 
                                            borderRadius: '3px',
                                            marginBottom: '3px'
                                          }}
                                        />
                                        <div
                                          style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            background: 'rgba(0, 0, 0, 0.5)',
                                            borderRadius: '50%',
                                            padding: '3px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 10 // 确保在图片之上
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation(); // 阻止事件冒泡到父级，避免插入tag
                                            setPreviewImageUrl(media.file_url); // 设置预览图片URL
                                            setShowImagePreviewModal(true); // 显示预览弹窗
                                          }}
                                        >
                                          <EyeOutlined style={{ color: 'white', fontSize: '12px' }} />
                                        </div>
                                      </>
                                    ) : media.media_type === 'video' ? (
                                      <div style={{ position: 'relative' }}>
                                        <video
                                          src={media.file_url}
                                          style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '3px', marginBottom: '3px' }}
                                        />
                                        <div
                                          style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            background: 'rgba(0, 0, 0, 0.5)',
                                            borderRadius: '50%',
                                            padding: '3px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 10
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewVideoUrl(media.file_url);
                                            setShowVideoPreviewModal(true);
                                          }}
                                        >
                                          <EyeOutlined style={{ color: 'white', fontSize: '12px' }} />
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ 
                                        width: '100%', 
                                        height: '50px', 
                                        backgroundColor: '#f0f0f0',
                                        borderRadius: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: '3px',
                                        fontSize: '18px'
                                      }}>
                                        {media.media_type === 'audio' ? '🎵' : 
                                         media.media_type === 'document' ? '📄' : '📎'}
                                      </div>
                                    )}
                                    <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
                                      {media.filename.length > 10 ? media.filename.substring(0, 10) + '...' : media.filename}
                                    </div>
                                    <div style={{ fontSize: '8px', color: '#666' }}>
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

              {mediaList.length === 0 && folderList.length === 0 && (
                <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                  暂无媒体文件
                </div>
              )}
            </div>
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
            zIndex: 3000, // 确保在其他内容之上
            pointerEvents: 'none'
          }}>
            <div ref={knowledgeBasePopoverRef} style={{
              pointerEvents: 'auto',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '12px',
              padding: '16px',
              width: '360px',
              maxHeight: '60vh',
              overflow: 'auto',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(0,0,0,0.06)',
              position: 'absolute',
              left: (showKnowledgeBaseSelector as any).anchor ? `${(showKnowledgeBaseSelector as any).anchor.left}px` : '50%',
              top: (showKnowledgeBaseSelector as any).anchor ? `${(showKnowledgeBaseSelector as any).anchor.top}px` : '50%',
              transform: (() => {
                try {
                  const anchor = (showKnowledgeBaseSelector as any).anchor
                  if (!anchor) return 'translate(-50%, -50%)'
                  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
                  // if anchor.top is at the trigger top (we preferred above), shift popover upwards
                  const preferAbove = anchor && anchor.top < (window.scrollY +  (viewportHeight / 2)) && anchor.top === anchor.top
                  return preferAbove ? 'translateY(-100%)' : 'translateY(8px)'
                } catch (e) {
                  return 'translateY(8px)'
                }
              })()
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                  选择 {showKnowledgeBaseSelector.position === 'system_prompt' ? 'System Prompt' : 'User Prompt'} 知识库
                </h3>
                <button
                  onClick={() => setShowKnowledgeBaseSelector({ show: false })}
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
              {(() => {
                const groupedKnowledgeBases = knowledgeBases.reduce((acc: any, kb: any) => {
                  const category = kb.category || '未分类';
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(kb);
                  return acc;
                }, {});

                return (
                  <div>
                    {/* 按类别分组知识库 */}
                    {activeSuggestionType === 'knowledgeBase' && filteredSuggestions.length > 0 ? (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {filteredSuggestions.map((kb, kbIndex) => (
                          <div
                            key={kbIndex}
                            onClick={() => {
                              const kbTag = `{{kb.${kb.id}}}`;
                              const field = showKnowledgeBaseSelector.position as keyof typeof formData;
                              if (field === 'system_prompt' || field === 'user_prompt') {
                                setFormData({
                                  ...formData,
                                  [field]: formData[field] + kbTag
                                });
                                setSelectedKnowledgeBaseIds(prev => Array.from(new Set([...prev, kb.id])));
                              }
                              setShowKnowledgeBaseSelector({ show: false });
                            }}
                            style={{
                              padding: '12px 16px',
                              borderRadius: '8px',
                              border: selectedKnowledgeBaseIds.includes(kb.id) ? '2px solid #667eea' : '1px solid #e9ecef',
                              marginBottom: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              backgroundColor: selectedKnowledgeBaseIds.includes(kb.id) ? '#e6efff' : 'white',
                              boxShadow: selectedKnowledgeBaseIds.includes(kb.id) ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedKnowledgeBaseIds.includes(kb.id)) {
                                e.currentTarget.style.backgroundColor = '#e9ecef';
                                e.currentTarget.style.borderColor = '#667eea';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedKnowledgeBaseIds.includes(kb.id)) {
                                e.currentTarget.style.backgroundColor = 'white';
                                e.currentTarget.style.borderColor = '#e9ecef';
                              }
                            }}
                          >
                            <div style={{ fontWeight: '600', fontSize: '14px', color: '#2d3748', marginBottom: '4px' }}>
                              📚 {kb.name}
                              {selectedKnowledgeBaseIds.includes(kb.id) && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#667eea' }}> (已选择)</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {kb.description}
                            </div>
                            <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                              分类: {kb.category || '未分类'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace', marginTop: '4px' }}>
                              {`{{kb.${kb.id}}}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      Object.entries(groupedKnowledgeBases).map(([category, kbs]) => (
                        <div key={category} style={{ marginBottom: '20px' }}>
                          <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: '600', color: '#4a5568' }}>
                            📚 {category || '未分类'}
                          </h4>
                          <button
                            onClick={() => {
                              const categoryTag = `{{kb.category.${category}}}`;
                              const field = showKnowledgeBaseSelector.position as keyof typeof formData;
                              if (field === 'system_prompt' || field === 'user_prompt') {
                                setFormData({
                                  ...formData,
                                  [field]: formData[field] + categoryTag
                                });
                              }
                              setShowKnowledgeBaseSelector({ show: false });
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #a0aec0',
                              backgroundColor: '#edf2f7',
                              color: '#2d3748',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              marginBottom: '12px',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.borderColor = '#4a5568'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#edf2f7'; e.currentTarget.style.borderColor = '#a0aec0'; }}
                          >
                            选择全部 {category || '未分类'} 知识库
                          </button>
                          {(kbs as any[]).map((kb: any) => {
                            const isSelected = selectedKnowledgeBaseIds.includes(kb.id);
                            return (
                              <div
                                key={kb.id}
                                onClick={() => {
                                  const kbTag = `{{kb.${kb.id}}}`;
                                  const field = showKnowledgeBaseSelector.position as keyof typeof formData;
                                  if (field === 'system_prompt' || field === 'user_prompt') {
                                    setFormData({
                                      ...formData,
                                      [field]: formData[field] + kbTag
                                    });
                                    setSelectedKnowledgeBaseIds(prev => Array.from(new Set([...prev, kb.id])));
                                  }
                                  setShowKnowledgeBaseSelector({ show: false });
                                }}
                                style={{
                                  padding: '12px 16px',
                                  borderRadius: '8px',
                                  border: isSelected ? '2px solid #667eea' : '1px solid #e9ecef',
                                  marginBottom: '8px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  backgroundColor: isSelected ? '#e6efff' : 'white',
                                  boxShadow: isSelected ? '0 4px 12px rgba(102, 126, 234, 0.2)' : 'none'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = '#e9ecef';
                                    e.currentTarget.style.borderColor = '#667eea';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = 'white';
                                    e.currentTarget.style.borderColor = '#e9ecef';
                                  }
                                }}
                              >
                                <div style={{ fontWeight: '600', fontSize: '14px', color: '#2d3748', marginBottom: '4px' }}>
                                  📚 {kb.name}
                                  {isSelected && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#667eea' }}> (已选择)</span>}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>
                                  {kb.description}
                                </div>
                                <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                                  分类: {kb.category || '未分类'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace', marginTop: '4px' }}>
                                  {`{{kb.${kb.id}}}`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                );
              })()} 
            </div>
          </div>
        )}

        {/* 图片预览弹窗 */}
        <Modal
          open={showImagePreviewModal}
          onCancel={() => setShowImagePreviewModal(false)}
          footer={null}
          centered
          width="80%"
          style={{ maxWidth: '800px' }}
        >
          {previewImageUrl && <Image src={previewImageUrl} alt="Image Preview" style={{ width: '100%', height: 'auto' }} preview={false} />}
        </Modal>

        {/* 视频预览弹窗 */}
        <Modal
          open={showVideoPreviewModal}
          onCancel={() => setShowVideoPreviewModal(false)}
          footer={null}
          centered
          width="80%"
          style={{ maxWidth: '800px' }}
        >
          {previewVideoUrl && (
            <video
              src={previewVideoUrl}
              controls
              style={{ width: '100%', height: 'auto' }}
            />
          )}
        </Modal>
      </div>
    </div>
  )
}
