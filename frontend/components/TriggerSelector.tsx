import React from 'react'

interface TriggerSelectorProps {
  onSelect: (type: string, config: any) => void
  onClose: () => void
}

export default function TriggerSelector({ onSelect, onClose }: TriggerSelectorProps) {
  const triggers = [
    {
      type: 'message',
      title: '消息触发',
      description: '当收到新消息时触发',
      icon: '📱',
      config: {
        channel: 'whatsapp',
        match_key: 'phone'
      }
    },
    {
      type: 'time',
      title: '时间触发',
      description: '按设定的时间间隔触发',
      icon: '⏰',
      config: {
        schedule: '0 */15 * * * *', // 每15分钟
        timezone: 'Asia/Shanghai'
      }
    },
    {
      type: 'status',
      title: '状态触发',
      description: '当客户状态变化时触发',
      icon: '🔄',
      config: {
        table: 'customers',
        field: 'status',
        conditions: []
      }
    }
  ]

  return (
    <div className="trigger-selector">
      <h3>选择触发器类型</h3>
      <div className="trigger-list">
        {triggers.map(trigger => (
          <div
            key={trigger.type}
            className="trigger-item"
            onClick={() => onSelect(trigger.type, trigger.config)}
          >
            <div className="trigger-icon">{trigger.icon}</div>
            <div className="trigger-info">
              <h4>{trigger.title}</h4>
              <p>{trigger.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="close-button" onClick={onClose}>取消</button>

      <style jsx>{`
        .trigger-selector {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 400px;
        }

        h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          color: #2d3748;
        }

        .trigger-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .trigger-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .trigger-item:hover {
          border-color: #4299e1;
          background-color: #ebf8ff;
        }

        .trigger-icon {
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7fafc;
          border-radius: 8px;
        }

        .trigger-info {
          flex: 1;
        }

        .trigger-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          color: #2d3748;
        }

        .trigger-info p {
          margin: 0;
          font-size: 14px;
          color: #718096;
        }

        .close-button {
          width: 100%;
          padding: 12px;
          background: #e2e8f0;
          border: none;
          border-radius: 6px;
          color: #4a5568;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #cbd5e0;
        }
      `}</style>
    </div>
  )
}
