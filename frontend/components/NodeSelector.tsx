import React, { useState } from 'react';
import { nodeConfigs } from './NodeConfigs';

interface NodeSelectorProps {
  onSelect: (type: string) => void;
  onClose: () => void;
}

export default function NodeSelector({ onSelect, onClose }: NodeSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 节点分类
  const nodeCategories = {
    logic: {
      title: '🧠 逻辑处理',
      nodes: [
        { 
          type: 'AI',
          title: 'AI 处理',
          description: 'AI分析消息并生成回复',
          icon: nodeConfigs.AI.icon,
        },
        {
          type: 'Condition',
          title: '条件判断',
          description: '根据条件进行分支判断',
          icon: nodeConfigs.Condition.icon,
        },
      ]
    },
    action: {
      title: '⚡ 动作执行',
      nodes: [
        { 
          type: 'SendWhatsAppMessage',
          title: '发送消息',
          description: '发送 WhatsApp 消息',
          icon: nodeConfigs.SendWhatsAppMessage.icon,
        },
        { 
          type: 'Template',
          title: '模板消息',
          description: '使用预设模板回复',
          icon: nodeConfigs.Template.icon,
        },
        { 
          type: 'UpdateDB',
          title: '更新数据',
          description: '保存数据到数据库',
          icon: nodeConfigs.UpdateDB.icon,
        },
      ]
    },
    tools: {
      title: '🛠️ 工具节点',
      nodes: [
        { 
          type: 'Delay',
          title: '时间延迟',
          description: '延迟执行下一步',
          icon: nodeConfigs.Delay.icon,
        },
        { 
          type: 'GuardrailValidator',
          title: '合规检查',
          description: '检查内容是否合规',
          icon: nodeConfigs.GuardrailValidator.icon,
        },
        { 
          type: 'CustomAPI',
          title: '自定义API',
          description: '调用外部API接口',
          icon: nodeConfigs.CustomAPI.icon,
        },
      ]
    }
  };

  // 获取当前要显示的节点列表
  const getDisplayNodes = () => {
    if (selectedCategory === 'all') {
      return Object.values(nodeCategories).flatMap(category => category.nodes);
    }
    return nodeCategories[selectedCategory]?.nodes || [];
  };

  return (
    <div className="node-selector-overlay">
      <div className="node-selector">
        <div className="selector-header">
          <h3>添加节点</h3>
          <button className="close-icon" onClick={onClose}>✕</button>
        </div>

        {/* 分类标签 */}
        <div className="category-tabs">
          <button 
            className={selectedCategory === 'all' ? 'tab active' : 'tab'}
            onClick={() => setSelectedCategory('all')}
          >
            全部
          </button>
          <button 
            className={selectedCategory === 'logic' ? 'tab active' : 'tab'}
            onClick={() => setSelectedCategory('logic')}
          >
            🧠 逻辑
          </button>
          <button 
            className={selectedCategory === 'action' ? 'tab active' : 'tab'}
            onClick={() => setSelectedCategory('action')}
          >
            ⚡ 动作
          </button>
          <button 
            className={selectedCategory === 'tools' ? 'tab active' : 'tab'}
            onClick={() => setSelectedCategory('tools')}
          >
            🛠️ 工具
          </button>
        </div>

        {/* 节点列表 */}
        <div className="node-list">
          {getDisplayNodes().map(node => (
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
          width: 500px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
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

        .category-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e2e8f0;
        }

        .tab {
          padding: 8px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: white;
          color: #718096;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .tab:hover {
          background: #f7fafc;
          border-color: #cbd5e0;
        }

        .tab.active {
          background: #4299e1;
          color: white;
          border-color: #4299e1;
        }

        .node-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          max-height: 50vh;
          padding-right: 8px;
        }

        .node-list::-webkit-scrollbar {
          width: 6px;
        }

        .node-list::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }

        .node-list::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 3px;
        }

        .node-list::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }

        .node-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .node-item:hover {
          border-color: #4299e1;
          background-color: #ebf8ff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(66, 153, 225, 0.15);
        }

        .node-icon {
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .node-info {
          flex: 1;
          min-width: 0;
        }

        .node-info h4 {
          margin: 0 0 4px 0;
          font-size: 15px;
          color: #2d3748;
          font-weight: 500;
        }

        .node-info p {
          margin: 0;
          font-size: 13px;
          color: #718096;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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