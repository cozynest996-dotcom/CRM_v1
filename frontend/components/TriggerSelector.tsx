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
    <div className="trigger-selector-overlay">
      <div className="trigger-selector">
        <div className="selector-header">
          <h3>🎯 选择触发器</h3>
          <button className="close-icon" onClick={onClose}>✕</button>
        </div>

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
              <div className="arrow">→</div>
            </div>
          ))}
        </div>
      </div>

      {/* 点击遮罩层关闭 */}
      <div className="overlay-background" onClick={onClose}></div>

      <style jsx>{`
        .trigger-selector-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .trigger-selector {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 480px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .selector-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        h3 {
          margin: 0;
          font-size: 20px;
          color: #2d3748;
          font-weight: 600;
        }

        .close-icon {
          background: none;
          border: none;
          font-size: 20px;
          color: #a0aec0;
          cursor: pointer;
          padding: 4px 8px;
          transition: all 0.2s;
        }

        .close-icon:hover {
          color: #4a5568;
        }

        .trigger-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .trigger-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .trigger-item:hover {
          border-color: #4299e1;
          background-color: #ebf8ff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(66, 153, 225, 0.15);
        }

        .trigger-icon {
          font-size: 28px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .trigger-item:nth-child(1) .trigger-icon {
          background: linear-gradient(135deg, #4299e1 0%, #667eea 100%);
        }

        .trigger-item:nth-child(2) .trigger-icon {
          background: linear-gradient(135deg, #f6ad55 0%, #fc8181 100%);
        }

        .trigger-item:nth-child(3) .trigger-icon {
          background: linear-gradient(135deg, #8b5cf6 0%, #667eea 100%);
        }

        .trigger-info {
          flex: 1;
        }

        .trigger-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          color: #2d3748;
          font-weight: 500;
        }

        .trigger-info p {
          margin: 0;
          font-size: 13px;
          color: #718096;
        }

        .arrow {
          font-size: 20px;
          color: #cbd5e0;
          transition: all 0.2s;
        }

        .trigger-item:hover .arrow {
          color: #4299e1;
          transform: translateX(4px);
        }

        .overlay-background {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: -1;
        }
      `}</style>
    </div>
  )
}
