import React from 'react';
import { nodeConfigs } from './NodeConfigs';

interface NodeSelectorProps {
  onSelect: (type: string) => void;
  onClose: () => void;
}

export default function NodeSelector({ onSelect, onClose }: NodeSelectorProps) {
  const nodeTypes = [
    { 
      type: 'AI',
      title: 'AI 处理',
      description: '当前客户消息的AI分析和回复',
      icon: nodeConfigs.AI.icon,
    },
    { 
      type: 'UpdateDB',
      title: '更新数据',
      description: '保存客户信息到数据库',
      icon: nodeConfigs.UpdateDB.icon,
    },
    { 
      type: 'GuardrailValidator',
      title: '合规检查',
      description: '检查消息内容是否合规',
      icon: nodeConfigs.GuardrailValidator.icon,
    },
    {
      type: 'Condition',
      title: '条件判断',
      description: '根据上下文字段进行条件分支（true/false 多路）',
      icon: nodeConfigs.Condition.icon,
    },
    { 
      type: 'Delay',
      title: '时间延迟',
      description: '按设定的时间延迟执行',
      icon: nodeConfigs.Delay.icon,
    },
    { 
      type: 'SendWhatsAppMessage',
      title: '发送消息',
      description: '发送 WhatsApp 消息给客户',
      icon: nodeConfigs.SendWhatsAppMessage.icon,
    },
    { 
      type: 'Template',
      title: '模板消息',
      description: '使用预设的回复模板',
      icon: nodeConfigs.Template.icon,
    },
    // { # Handoff 节点已合并到 AI 节点中
    //   type: 'Handoff',
    //   title: 'Handoff (人工接手)',
    //   description: '把会话交给人工或其它 LLM 进行处理，可配置升级/转接策略',
    //   icon: '🤝',
    //   color: '#f59e0b'
    // },
  ];

  return (
    <div className="node-selector-overlay">
      <div className="node-selector">
        <h3>选择节点类型</h3>
      <div className="node-list">
        {nodeTypes.map(node => (
          <div
            key={node.type}
            className="node-item"
            onClick={() => {
              onSelect(node.type);
              onClose();
            }}
          >
            <div 
              className="node-icon"
              style={{ 
                backgroundColor: `${nodeConfigs[node.type]?.color || '#e2e8f0'}20`,
                color: nodeConfigs[node.type]?.color || '#4a5568'
              }}
            >
              {node.icon}
            </div>
            <div className="node-info">
              <h4>{node.title}</h4>
              <p>{node.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="close-button" onClick={onClose}>取消</button>
      </div>
      {/* 点击遮罩层关闭 */}
      <div className="overlay-background" onClick={onClose}></div>
      <style jsx>{`
        .node-selector-overlay {
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

        .node-selector {
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

        .node-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .node-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .node-item:hover {
          border-color: #4299e1;
          background-color: #ebf8ff;
        }

        .node-icon {
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .node-info {
          flex: 1;
        }

        .node-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          color: #2d3748;
        }

        .node-info p {
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
  );
}