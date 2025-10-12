import React from 'react'
import { Handle, Position } from 'reactflow'

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

interface BaseNodeProps {
  data: any
  selected: boolean
  config: {
    label: string
    icon: string
    color: string
    handles: {
      source: Array<{
        id: string
        position: Position
        label?: string
      }>
      target: Array<{
        id: string
        position: Position
      }>
    }
  }
}

export default function BaseNode({ data, selected, config }: BaseNodeProps) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={getStatusStyle(data.isActive, selected)} />
      <div style={{
        ...nodeBaseStyle,
        borderColor: config.color
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: `${config.color}20`,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px'
          }}>
            {config.icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{config.label}</div>
            <div style={{ fontSize: '12px', color: '#718096' }}>{data.description || '...'}</div>
          </div>
        </div>
        {data.content && (
          <div style={{ 
            fontSize: '13px',
            color: '#4a5568',
            padding: '8px',
            backgroundColor: '#f7fafc',
            borderRadius: '4px',
            marginTop: '8px'
          }}>
            {data.content}
          </div>
        )}
      </div>
      {/* 连接点 */}
      {config.handles.source.map(handle => (
        <Handle
          key={handle.id}
          type="source"
          position={handle.position}
          id={handle.id}
          style={{
            background: config.color,
            width: 8,
            height: 8,
            right: handle.position === Position.Right ? -4 : undefined,
            bottom: handle.position === Position.Bottom ? -4 : undefined,
            ...(handle.label && {
              '&::after': {
                content: `"${handle.label}"`,
                position: 'absolute',
                right: -40,
                top: -10,
                fontSize: '12px',
                color: '#718096'
              }
            })
          }}
        />
      ))}
      {config.handles.target.map(handle => (
        <Handle
          key={handle.id}
          type="target"
          position={handle.position}
          id={handle.id}
          style={{
            background: config.color,
            width: 8,
            height: 8,
            left: -4
          }}
        />
      ))}
    </div>
  )
}
