/**
 * WorkflowNodes
 *
 * 该模块导出工作流画布中使用的各类节点组件（MessageTrigger, AI, UpdateDB, 等）。
 * 每个导出的节点都是基于 `BaseNode` 的包装组件，负责把节点的 `data` 映射为 UI 上展示的 `description` 和 `content`。
 *
 * 职责:
 * - 将节点配置（node.data）格式化为对用户友好的文本摘要。
 * - 不进行网络或数据库调用，仅用于展示与编辑时的提示信息。
 */
import React from 'react'
import BaseNode from './BaseNode'
import { nodeConfigs } from './NodeConfigs'
import { Position } from 'reactflow'

// 具体节点组件
export const TriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.MessageTrigger
  return <BaseNode data={{
    ...data,
    description: data.triggerType || '消息触发',
    content: data.config?.phone ? `📞 ${data.config.phone}` : '等待触发...'
  }} selected={selected} config={config} />
}

export const TimeTriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.TimeTrigger
  return <BaseNode data={{
    ...data,
    description: '定时触发',
    content: data.config?.schedule ? `⏰ ${data.config.schedule}` : '等待定时触发...'
  }} selected={selected} config={config} />
}

export const StatusTriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.StatusTrigger
  return <BaseNode data={{
    ...data,
    description: '状态触发',
    content: data.config?.table ? `📊 ${data.config.table}.${data.config.field}` : '等待状态变化...'
  }} selected={selected} config={config} />
}

export const AINode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.AI
  
  return <BaseNode data={{
    ...data,
    description: data.model?.name || 'GPT-4',
    content: `${data.capabilities?.analyze ? '✓' : '✗'} 分析 · ${data.capabilities?.reply ? '✓' : '✗'} 回复`
  }} selected={selected} config={config} />
}

export const UpdateDBNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.UpdateDB
  return <BaseNode data={{
    ...data,
    description: data.table || '客户表',
    content: `${data.optimistic_lock ? '✓' : '✗'} 乐观锁 · ${data.skip_if_equal ? '✓' : '✗'} 跳过相同 · ${data.audit_log ? '✓' : '✗'} 审计日志`
  }} selected={selected} config={config} />
}

export const GuardNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.GuardrailValidator
  return <BaseNode data={{
    ...data,
    description: '内容合规检查',
    content: `${data.checks?.blocked_keywords?.length || 0} 个敏感词 · ${data.checks?.url_whitelist?.length || 0} 个白名单URL`
  }} selected={selected} config={config} />
}

export const DelayNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.Delay
  return <BaseNode data={{
    ...data,
    description: data.policy?.mode === 'auto_window' ? '自动工作时段' : '固定延迟',
    content: data.policy?.mode === 'auto_window' 
      ? `${data.policy?.work_hours?.start || '09:00'} - ${data.policy?.work_hours?.end || '21:00'}`
      : `延迟 ${data.policy?.delay_minutes || 5} 分钟`
  }} selected={selected} config={config} />
}

export const SendMessageNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.SendWhatsAppMessage
  return <BaseNode data={{
    ...data,
    description: data.retries?.max ? `最多重试 ${data.retries.max} 次` : '不重试',
    content: data.template ? data.template.slice(0, 50) + '...' : '使用 AI 回复'
  }} selected={selected} config={config} />
}

export const TemplateNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.Template
  const templatePreview = data.template_type === 'whatsapp' 
    ? `WhatsApp模板: ${data.template_name || '未选择'}`
    : data.template 
      ? data.template.slice(0, 50) + '...' 
      : '未设置模板'
  
  const variablesPreview = data.variables && Object.keys(data.variables).length > 0
    ? `变量: ${Object.keys(data.variables).join(', ')}`
    : ''

  const content = [templatePreview, variablesPreview].filter(Boolean).join('\n')
  
  return <BaseNode data={{
    ...data,
    description: data.template_type === 'whatsapp' ? 'WhatsApp模板消息' : '固定回复模板',
    content
  }} selected={selected} config={config} />
}

export const HandoffNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.Handoff
  const modeLabel = data.mode ? (data.mode === 'human' ? '人工' : data.mode === 'ai' ? 'AI' : 'Hybrid') : 'Hybrid'
  const team = data.human_team || 'support'
  const content = `模式: ${modeLabel} · 队列: ${team}`
  return <BaseNode data={{ ...data, description: 'Handoff 节点', content, badge: '🤝' }} selected={selected} config={config} />
}

export const ConditionNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const config = nodeConfigs.Condition
  const summary = data.mode === 'jsonlogic' ? 'jsonlogic' : (data.logic || 'visual')
  const content = `条件: ${summary}`
  return <BaseNode data={{ ...data, description: 'Condition 条件节点', content }} selected={selected} config={config} />
}