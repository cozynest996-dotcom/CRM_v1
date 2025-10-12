import { Position } from 'reactflow'

// 节点配置
export const nodeConfigs = {
  MessageTrigger: {
    label: '消息触发器',
    icon: '📱',
    color: '#4299e1',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: []
    }
  },
  TimeTrigger: {
    label: '时间触发器',
    icon: '⏰',
    color: '#f6ad55',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: []
    }
  },
  StatusTrigger: {
    label: '状态触发器',
    icon: '🔄',
    color: '#68d391',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: []
    }
  },
  AI: {
    label: 'AI 处理',
    icon: '🤖',
    color: '#805ad5',
    handles: {
      source: [
        { id: 'true', position: Position.Right, label: 'Handoff (True)' }, // 当AI置信度低于阈值时
        { id: 'false', position: Position.Bottom, label: '继续 (False)' } // 当AI置信度高于或等于阈值时
      ],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  UpdateDB: {
    label: '更新数据',
    icon: '💾',
    color: '#38b2ac',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  GuardrailValidator: {
    label: '合规检查',
    icon: '🛡️',
    color: '#ECC94B',
    handles: {
      source: [
        { id: 'pass', position: Position.Right, label: '通过' },
        { id: 'fail', position: Position.Bottom, label: '失败' }
      ],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  Condition: {
    label: '条件判断',
    icon: '🔀',
    color: '#667eea',
    handles: {
      source: [
        { id: 'true', position: Position.Right, label: 'true' },
        { id: 'false', position: Position.Bottom, label: 'false' }
      ],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  Delay: {
    label: '延迟',
    icon: '⏰',
    color: '#ED8936',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  SendWhatsAppMessage: {
    label: '发送消息',
    icon: '💬',
    color: '#48bb78',
    handles: {
      source: [],
      target: [{ id: 'in', position: Position.Left }]
    }
  },
  Template: {
    label: '模板',
    icon: '📝',
    color: '#4FD1C5',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: [{ id: 'in', position: Position.Left }]
    }
  }
  ,
  Handoff: {
    label: 'Handoff',
    icon: '🤝',
    color: '#f59e0b',
    handles: {
      source: [{ id: 'out', position: Position.Right }],
      target: [{ id: 'in', position: Position.Left }]
    }
  }
}
