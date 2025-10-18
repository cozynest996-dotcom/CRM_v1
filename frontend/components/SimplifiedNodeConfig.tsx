/**
 * SimplifiedNodeConfig - 简化版节点配置界面
 * 
 * 设计原则：
 * 1. 80/20 原则：80% 用户只需要 20% 的配置项
 * 2. 渐进式披露：基础 → 高级 → 专家
 * 3. 智能默认值：减少用户决策负担
 * 4. 视觉分层：清晰的信息架构
 */

import React, { useState, useEffect } from 'react'
import { Node as RFNode } from 'reactflow'

interface SimplifiedNodeConfigProps {
  node: RFNode
  onUpdate: (nodeId: string, data: any) => void
  onClose: () => void
}

export default function SimplifiedNodeConfig({ node, onUpdate, onClose }: SimplifiedNodeConfigProps) {
  const [localData, setLocalData] = useState<any>(node.data || {})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showExpert, setShowExpert] = useState(false)

  const updateNodeData = (updates: any) => {
    const newData = { ...localData, ...updates }
    setLocalData(newData)
    onUpdate(node.id, newData)
  }

  // 节点标题映射
  const getNodeTitle = (type: string) => {
    const titles = {
      'MessageTrigger': '📥 消息触发器',
      'AI': '🤖 AI 处理',
      'SendMessage': '📤 发送消息',
      'SendWhatsAppMessage': '📤 发送消息',
      'Condition': '🔀 条件判断',
      'Delay': '⏰ 延迟',
      'UpdateDB': '💾 更新数据',
      'Template': '📝 模板消息',
      'Handoff': '👤 转人工'
    }
    return titles[type as keyof typeof titles] || type
  }

  // === 渲染不同节点类型的配置 ===

  const renderMessageTriggerConfig = () => (
    <div className="config-sections">
      {/* 基础配置 */}
      <div className="config-section essential">
        <h4 className="section-title">
          <span className="icon">⚡</span>
          触发设置
        </h4>
        
        <div className="config-field">
          <label>消息来源</label>
          <select
            value={localData.channel || 'whatsapp'}
            onChange={(e) => updateNodeData({ channel: e.target.value })}
            className="modern-select"
          >
            <option value="whatsapp">📱 WhatsApp 消息</option>
            <option value="telegram">✈️ Telegram 消息</option>
          </select>
          <div className="field-hint">
            选择从哪个平台接收客户消息
          </div>
        </div>
      </div>
    </div>
  )

  const renderSendMessageConfig = () => (
    <div className="config-sections">
      {/* 基础配置 */}
      <div className="config-section essential">
        <h4 className="section-title">
          <span className="icon">⚡</span>
          发送设置
        </h4>
        
        <div className="config-field">
          <label>回复方式</label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="send_mode"
                value="auto"
                checked={!localData.send_mode || localData.send_mode === 'auto' || localData.send_mode === 'trigger_number'}
                onChange={(e) => updateNodeData({ send_mode: 'auto', channel: undefined })}
              />
              <span className="radio-mark"></span>
              <div className="radio-content">
                <div className="radio-title">🎯 智能回复（推荐）</div>
                <div className="radio-desc">自动回复到客户发消息的平台</div>
              </div>
            </label>
            
            <label className="radio-label">
              <input
                type="radio"
                name="send_mode"
                value="whatsapp"
                checked={localData.channel === 'whatsapp' && localData.send_mode !== 'auto'}
                onChange={(e) => updateNodeData({ send_mode: 'specified', channel: 'whatsapp' })}
              />
              <span className="radio-mark"></span>
              <div className="radio-content">
                <div className="radio-title">📱 强制 WhatsApp</div>
                <div className="radio-desc">总是通过 WhatsApp 发送</div>
              </div>
            </label>
            
            <label className="radio-label">
              <input
                type="radio"
                name="send_mode"
                value="telegram"
                checked={localData.channel === 'telegram' && localData.send_mode !== 'auto'}
                onChange={(e) => updateNodeData({ send_mode: 'specified', channel: 'telegram' })}
              />
              <span className="radio-mark"></span>
              <div className="radio-content">
                <div className="radio-title">✈️ 强制 Telegram</div>
                <div className="radio-desc">总是通过 Telegram 发送</div>
              </div>
            </label>
          </div>
        </div>

        <div className="config-field">
          <label>消息内容</label>
          <textarea
            value={localData.template || ''}
            onChange={(e) => updateNodeData({ template: e.target.value })}
            placeholder="输入回复内容，留空则发送 AI 的回复"
            rows={4}
            className="modern-textarea"
          />
          <div className="field-hint">
            💡 留空 = 发送 AI 回复 | 填写 = 自定义消息 | 支持变量：{{ai.reply.reply_text}}、{{customer.name}}
          </div>
        </div>
      </div>

      {/* 高级配置 */}
      <div className="config-section advanced">
        <button 
          className="section-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="icon">⚙️</span>
          高级配置
          <span className={`arrow ${showAdvanced ? 'up' : 'down'}`}>▼</span>
        </button>
        
        {showAdvanced && (
          <div className="section-content">
            <div className="config-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={localData.enable_smart_delay || false}
                  onChange={(e) => updateNodeData({ enable_smart_delay: e.target.checked })}
                />
                <span className="checkmark"></span>
                启用智能延迟
              </label>
              <div className="field-hint">
                根据消息长度自动计算发送延迟，模拟真人打字速度
              </div>
            </div>

            {localData.enable_smart_delay && (
              <div className="config-field indent">
                <label>延迟设置</label>
                <div className="inline-fields">
                  <div>
                    <span>基础延迟</span>
                    <input
                      type="number"
                      value={localData.base_delay || 1}
                      onChange={(e) => updateNodeData({ base_delay: parseFloat(e.target.value) })}
                      min="0"
                      max="10"
                      step="0.5"
                    />
                    <span>秒</span>
                  </div>
                  <div>
                    <span>每字符</span>
                    <input
                      type="number"
                      value={localData.delay_per_char || 50}
                      onChange={(e) => updateNodeData({ delay_per_char: parseInt(e.target.value) })}
                      min="0"
                      max="200"
                    />
                    <span>毫秒</span>
                  </div>
                </div>
              </div>
            )}

            <div className="config-field">
              <label>重试设置</label>
              <div className="inline-fields">
                <div>
                  <span>最大重试</span>
                  <input
                    type="number"
                    value={localData.retries?.max || 3}
                    onChange={(e) => updateNodeData({
                      retries: { ...localData.retries, max: parseInt(e.target.value) }
                    })}
                    min="0"
                    max="5"
                  />
                  <span>次</span>
                </div>
                <div>
                  <span>重试间隔</span>
                  <input
                    type="number"
                    value={localData.retries?.interval || 60}
                    onChange={(e) => updateNodeData({
                      retries: { ...localData.retries, interval: parseInt(e.target.value) }
                    })}
                    min="30"
                    max="300"
                  />
                  <span>秒</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 专家配置 */}
      <div className="config-section expert">
        <button 
          className="section-toggle expert"
          onClick={() => setShowExpert(!showExpert)}
        >
          <span className="icon">🔧</span>
          专家配置
          <span className={`arrow ${showExpert ? 'up' : 'down'}`}>▼</span>
        </button>
        
        {showExpert && (
          <div className="section-content">
            <div className="config-field">
              <label>自定义发送模式</label>
              <select
                value={localData.send_mode || 'trigger_number'}
                onChange={(e) => updateNodeData({ send_mode: e.target.value })}
              >
                <option value="trigger_number">原触发号码</option>
                <option value="specified_number">指定号码</option>
                <option value="telegram_chat_id">Telegram Chat ID</option>
              </select>
            </div>

            {localData.send_mode === 'specified_number' && (
              <div className="config-field indent">
                <label>指定号码</label>
                <input
                  type="text"
                  value={localData.to_number || ''}
                  onChange={(e) => updateNodeData({ to_number: e.target.value })}
                  placeholder="+85212345678"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const renderAIConfig = () => (
    <div className="config-sections">
      {/* 基础配置 */}
      <div className="config-section essential">
        <h4 className="section-title">
          <span className="icon">⚡</span>
          基础配置
        </h4>
        
        <div className="config-field">
          <label>AI 模型</label>
          <select
            value={localData.model?.name || 'gpt-4o-mini'}
            onChange={(e) => updateNodeData({ 
              model: { ...localData.model, name: e.target.value }
            })}
            className="modern-select"
          >
            <option value="gpt-4o-mini">🚀 GPT-4 Mini（推荐）</option>
            <option value="gpt-4">💎 GPT-4（高质量）</option>
            <option value="gpt-3.5-turbo">⚡ GPT-3.5 Turbo（快速）</option>
          </select>
        </div>

        <div className="config-field">
          <label>提示词模板</label>
          <textarea
            value={localData.user_prompt || ''}
            onChange={(e) => updateNodeData({ user_prompt: e.target.value })}
            placeholder="输入AI提示词，例如：你是一个专业的房产顾问..."
            rows={6}
            className="modern-textarea"
          />
          <div className="field-hint">
            这里定义AI的角色和行为方式
          </div>
        </div>

        <div className="config-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={localData.enableAutoReply ?? true}
              onChange={(e) => updateNodeData({ enableAutoReply: e.target.checked })}
            />
            <span className="checkmark"></span>
            启用自动回复
          </label>
        </div>
      </div>

      {/* 高级配置 */}
      <div className="config-section advanced">
        <button 
          className="section-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="icon">⚙️</span>
          高级配置
          <span className={`arrow ${showAdvanced ? 'up' : 'down'}`}>▼</span>
        </button>
        
        {showAdvanced && (
          <div className="section-content">
            <div className="config-field">
              <label>创造性程度</label>
              <div className="slider-field">
                <input
                  type="range"
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
                  className="modern-slider"
                />
                <div className="slider-labels">
                  <span>保守 (0)</span>
                  <span>当前: {localData.model?.temperature || 0.7}</span>
                  <span>创新 (1)</span>
                </div>
              </div>
            </div>

            <div className="config-field">
              <label>最大回复长度</label>
              <input
                type="number"
                value={localData.model?.max_tokens || 800}
                onChange={(e) => updateNodeData({
                  model: {
                    ...localData.model,
                    max_tokens: parseInt(e.target.value)
                  }
                })}
                min="100"
                max="4000"
                step="100"
              />
              <div className="field-hint">
                控制AI回复的最大字数
              </div>
            </div>

            <div className="config-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={localData.enableUpdateInfo ?? false}
                  onChange={(e) => updateNodeData({ enableUpdateInfo: e.target.checked })}
                />
                <span className="checkmark"></span>
                允许更新客户信息
              </label>
              <div className="field-hint">
                AI可以根据对话内容更新客户资料
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderConfigFields = () => {
    switch (node.type) {
      case 'MessageTrigger':
        return renderMessageTriggerConfig()
      case 'SendMessage':
      case 'SendWhatsAppMessage':
        return renderSendMessageConfig()
      case 'AI':
        return renderAIConfig()
      // 其他节点类型可以类似简化...
      default:
        return (
          <div className="config-section">
            <div className="placeholder">
              <span className="icon">🚧</span>
              <h4>配置界面开发中</h4>
              <p>该节点类型的简化配置界面正在开发中</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="simplified-node-config">
      {/* 头部 */}
      <div className="config-header">
        <div className="header-content">
          <h3 className="node-title">{getNodeTitle(node.type)}</h3>
          <div className="node-id">ID: {node.id}</div>
        </div>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* 配置内容 */}
      <div className="config-body">
        {renderConfigFields()}
      </div>

      {/* 底部操作 */}
      <div className="config-footer">
        <div className="footer-info">
          <span className="save-status">✅ 自动保存</span>
        </div>
        <button className="primary-btn" onClick={onClose}>
          完成配置
        </button>
      </div>

      <style jsx>{`
        .simplified-node-config {
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          border: 1px solid #e2e8f0;
          width: 480px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .config-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
        }

        .node-title {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
        }

        .node-id {
          font-size: 12px;
          color: #64748b;
          font-family: monospace;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: #f1f5f9;
          border-radius: 8px;
          cursor: pointer;
          color: #64748b;
          font-size: 16px;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #fee2e2;
          color: #dc2626;
        }

        .config-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .config-sections {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .config-section {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }

        .config-section.essential {
          border-color: #10b981;
          background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
        }

        .config-section.advanced {
          border-color: #f59e0b;
        }

        .config-section.expert {
          border-color: #ef4444;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          padding: 16px 20px;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          background: rgba(16, 185, 129, 0.05);
        }

        .section-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border: none;
          background: #f8fafc;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          transition: all 0.2s;
        }

        .section-toggle:hover {
          background: #f1f5f9;
        }

        .section-toggle.expert {
          background: #fef2f2;
        }

        .section-toggle.expert:hover {
          background: #fee2e2;
        }

        .section-content {
          padding: 20px;
          border-top: 1px solid #e2e8f0;
        }

        .config-field {
          margin-bottom: 20px;
        }

        .config-field.indent {
          margin-left: 20px;
          padding-left: 16px;
          border-left: 2px solid #e2e8f0;
        }

        .config-field label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #374151;
        }

        .modern-select,
        .modern-textarea,
        input[type="text"],
        input[type="number"] {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s;
          background: white;
        }

        .modern-select:focus,
        .modern-textarea:focus,
        input[type="text"]:focus,
        input[type="number"]:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .field-hint {
          margin-top: 6px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          margin-bottom: 0 !important;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid #e2e8f0;
          border-radius: 4px;
          position: relative;
          transition: all 0.2s;
        }

        input[type="checkbox"]:checked + .checkmark {
          background: #3b82f6;
          border-color: #3b82f6;
        }

        input[type="checkbox"]:checked + .checkmark::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 12px;
          font-weight: bold;
        }

        input[type="checkbox"] {
          display: none;
        }

        .inline-fields {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .inline-fields > div {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .inline-fields input {
          width: 80px;
        }

        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }

        .radio-label {
          display: flex !important;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
          margin-bottom: 0 !important;
        }

        .radio-label:hover {
          border-color: #3b82f6;
          background: #f8fafc;
        }

        input[type="radio"]:checked + .radio-mark + .radio-content .radio-title {
          color: #3b82f6;
          font-weight: 700;
        }

        input[type="radio"]:checked ~ .radio-content {
          color: #1e293b;
        }

        .radio-label:has(input[type="radio"]:checked) {
          border-color: #3b82f6;
          background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .radio-mark {
          width: 20px;
          height: 20px;
          border: 2px solid #e2e8f0;
          border-radius: 50%;
          position: relative;
          flex-shrink: 0;
          transition: all 0.2s;
          margin-top: 2px;
        }

        input[type="radio"]:checked + .radio-mark {
          border-color: #3b82f6;
          background: #3b82f6;
        }

        input[type="radio"]:checked + .radio-mark::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: white;
        }

        input[type="radio"] {
          display: none;
        }

        .radio-content {
          flex: 1;
        }

        .radio-title {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 4px;
        }

        .radio-desc {
          font-size: 14px;
          color: #64748b;
          line-height: 1.4;
        }

        .slider-field {
          margin-top: 8px;
        }

        .modern-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e2e8f0;
          outline: none;
          -webkit-appearance: none;
        }

        .modern-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .config-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .save-status {
          font-size: 14px;
          color: #10b981;
          font-weight: 500;
        }

        .primary-btn {
          padding: 12px 24px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .primary-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .placeholder {
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
        }

        .placeholder .icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
        }

        .arrow {
          transition: transform 0.2s;
        }

        .arrow.up {
          transform: rotate(180deg);
        }
      `}</style>
    </div>
  )
}
