import React, { useState } from 'react';
import { nodeConfigs } from './NodeConfigs';

interface NodePaletteProps {
  onAddNode: (type: string) => void;
  onAddTrigger: () => void;
  isCollapsed?: boolean;
}

export default function NodePalette({ onAddNode, onAddTrigger, isCollapsed = false }: NodePaletteProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // 触发器列表
  const triggers = [
    { type: 'message', icon: '📱', title: '消息', color: '#4299e1' },
    { type: 'time', icon: '⏰', title: '时间', color: '#f6ad55' },
    { type: 'status', icon: '🗄️', title: '数据库', color: '#8b5cf6' }
  ];

  // 节点分类
  const nodeCategories = {
    logic: {
      title: '逻辑',
      icon: '🧠',
      nodes: [
        { type: 'AI', icon: '🤖', title: 'AI处理' },
        { type: 'Condition', icon: '🔀', title: '条件' },
      ]
    },
    action: {
      title: '动作',
      icon: '⚡',
      nodes: [
        { type: 'SendWhatsAppMessage', icon: '💬', title: '发消息' },
        { type: 'Template', icon: '📝', title: '模板' },
        { type: 'UpdateDB', icon: '💾', title: '更新DB' },
      ]
    },
    tools: {
      title: '工具',
      icon: '🛠️',
      nodes: [
        { type: 'Delay', icon: '⏰', title: '延迟' },
        { type: 'GuardrailValidator', icon: '🛡️', title: '合规' },
        { type: 'CustomAPI', icon: '🔗', title: 'API' },
      ]
    }
  };

  const getAllNodes = () => {
    return Object.values(nodeCategories).flatMap(category => category.nodes);
  };

  const getFilteredNodes = () => {
    if (activeCategory === 'all') {
      return getAllNodes();
    }
    return nodeCategories[activeCategory]?.nodes || [];
  };

  if (isCollapsed) {
    return (
      <div className="node-palette collapsed">
        <div 
          className="expand-hint"
          title="点击工具栏的'显示面板'按钮打开节点库"
        >
          <div className="hint-icon">📦</div>
          <div className="hint-text">节点库</div>
        </div>
        <style jsx>{`
          .node-palette.collapsed {
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 5;
          }

          .expand-hint {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            cursor: help;
            transition: all 0.2s;
          }

          .expand-hint:hover {
            background: #f7fafc;
            border-color: #4299e1;
          }

          .hint-icon {
            font-size: 24px;
          }

          .hint-text {
            font-size: 11px;
            color: #718096;
            writing-mode: vertical-rl;
            text-orientation: mixed;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="node-palette">
      <div className="palette-header">
        <h3>📦 节点库</h3>
      </div>

      {/* 触发器区域 */}
      <div className="section">
        <div className="section-title">🎯 触发器</div>
        <div className="trigger-grid">
          {triggers.map(trigger => (
            <button
              key={trigger.type}
              className="trigger-chip"
              onClick={onAddTrigger}
              title={`添加${trigger.title}触发器`}
            >
              <span className="chip-icon">{trigger.icon}</span>
              <span className="chip-label">{trigger.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 分类标签 */}
      <div className="category-tabs">
        <button 
          className={activeCategory === 'all' ? 'tab active' : 'tab'}
          onClick={() => setActiveCategory('all')}
        >
          全部
        </button>
        {Object.entries(nodeCategories).map(([key, category]) => (
          <button 
            key={key}
            className={activeCategory === key ? 'tab active' : 'tab'}
            onClick={() => setActiveCategory(key)}
          >
            {category.icon}
          </button>
        ))}
      </div>

      {/* 节点列表 */}
      <div className="nodes-container">
        {getFilteredNodes().map(node => (
          <button
            key={node.type}
            className="node-chip"
            onClick={() => onAddNode(node.type)}
            style={{
              borderLeft: `3px solid ${nodeConfigs[node.type]?.color || '#4299e1'}`
            }}
            title={`添加${node.title}`}
          >
            <span className="chip-icon">{node.icon}</span>
            <span className="chip-label">{node.title}</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .node-palette {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 240px;
          background: white;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          z-index: 10;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
        }

        .palette-header {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          color: white;
        }

        .section {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
        }

        .section-title {
          font-size: 13px;
          font-weight: 500;
          color: #4a5568;
          margin-bottom: 8px;
        }

        .trigger-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .trigger-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 8px 4px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 12px;
        }

        .trigger-chip:hover {
          background: #ebf8ff;
          border-color: #4299e1;
          transform: translateY(-2px);
        }

        .category-tabs {
          display: flex;
          gap: 6px;
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
        }

        .tab {
          flex: 1;
          padding: 6px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          background: white;
          color: #718096;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          background: #f7fafc;
        }

        .tab.active {
          background: #4299e1;
          color: white;
          border-color: #4299e1;
        }

        .nodes-container {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .nodes-container::-webkit-scrollbar {
          width: 4px;
        }

        .nodes-container::-webkit-scrollbar-track {
          background: #f7fafc;
        }

        .nodes-container::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 2px;
        }

        .node-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .node-chip:hover {
          background: #f7fafc;
          border-color: #cbd5e0;
          transform: translateX(4px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .chip-icon {
          font-size: 16px;
          flex-shrink: 0;
        }

        .chip-label {
          font-size: 13px;
          color: #2d3748;
          font-weight: 400;
        }

        .trigger-chip .chip-icon {
          font-size: 20px;
        }

        .trigger-chip .chip-label {
          font-size: 11px;
          color: #718096;
        }
      `}</style>
    </div>
  );
}

