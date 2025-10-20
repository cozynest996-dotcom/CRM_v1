import React, { useEffect, useRef } from 'react';
import { nodeConfigs } from './NodeConfigs';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddNode: (type: string) => void;
  onAddTrigger: () => void;
}

export default function ContextMenu({ x, y, onClose, onAddNode, onAddTrigger }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuItems = [
    {
      category: '触发器',
      items: [
        { type: 'trigger', icon: '🎯', label: '添加触发器', action: onAddTrigger }
      ]
    },
    {
      category: '逻辑处理',
      items: [
        { type: 'AI', icon: '🤖', label: 'AI 处理', action: () => onAddNode('AI') },
        { type: 'Condition', icon: '🔀', label: '条件判断', action: () => onAddNode('Condition') }
      ]
    },
    {
      category: '动作执行',
      items: [
        { type: 'SendWhatsAppMessage', icon: '💬', label: '发送消息', action: () => onAddNode('SendWhatsAppMessage') },
        { type: 'Template', icon: '📝', label: '模板消息', action: () => onAddNode('Template') },
        { type: 'UpdateDB', icon: '💾', label: '更新数据', action: () => onAddNode('UpdateDB') }
      ]
    },
    {
      category: '工具',
      items: [
        { type: 'Delay', icon: '⏰', label: '延迟', action: () => onAddNode('Delay') },
        { type: 'GuardrailValidator', icon: '🛡️', label: '合规检查', action: () => onAddNode('GuardrailValidator') },
        { type: 'CustomAPI', icon: '🔗', label: '自定义API', action: () => onAddNode('CustomAPI') }
      ]
    }
  ];

  return (
    <>
      <div 
        ref={menuRef}
        className="context-menu"
        style={{ 
          left: `${x}px`, 
          top: `${y}px`,
        }}
      >
        <div className="menu-header">添加节点</div>
        {menuItems.map((group, idx) => (
          <div key={idx} className="menu-group">
            <div className="group-label">{group.category}</div>
            {group.items.map((item, itemIdx) => (
              <button
                key={itemIdx}
                className="menu-item"
                onClick={() => {
                  item.action();
                  onClose();
                }}
              >
                <span className="item-icon">{item.icon}</span>
                <span className="item-label">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <style jsx>{`
        .context-menu {
          position: fixed;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          max-height: 70vh;
          overflow-y: auto;
          z-index: 9999;
          padding: 4px;
        }

        .menu-header {
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #4a5568;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 4px;
        }

        .menu-group {
          margin-bottom: 4px;
        }

        .group-label {
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 500;
          color: #a0aec0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .menu-item:hover {
          background: #f7fafc;
        }

        .item-icon {
          font-size: 16px;
          width: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .item-label {
          font-size: 14px;
          color: #2d3748;
          flex: 1;
        }

        .context-menu::-webkit-scrollbar {
          width: 6px;
        }

        .context-menu::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }

        .context-menu::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 3px;
        }
      `}</style>
    </>
  );
}



