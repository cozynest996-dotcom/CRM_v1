import React, { useEffect, useState } from 'react'
import MessageEventService, { WhatsAppMessage } from '../services/MessageEventService'
import { formatMessageTime } from '../utils/dateFormat'

export default function MessageNotifications() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [showNotification, setShowNotification] = useState(false)
  const [latestMessage, setLatestMessage] = useState<WhatsAppMessage | null>(null)

  useEffect(() => {
    const messageService = MessageEventService.getInstance()
    
    // 获取历史消息
    setMessages(messageService.getMessageHistory())

    // 订阅新消息
    const unsubscribe: () => void = messageService.onNewMessage((message) => {
      setMessages(prev => [message, ...prev].slice(0, 50))
      setLatestMessage(message)
      setShowNotification(true)
      
      // 3秒后隐藏通知
      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
    })

    return () => unsubscribe()
  }, [])

  return (
    <div className="message-notifications">
      {/* 弹出通知 */}
      {showNotification && latestMessage && (
        <div className="notification">
          <div className="notification-icon">📱</div>
          <div className="notification-content">
            <div className="notification-title">新消息</div>
            <div className="notification-phone">{latestMessage.phone}</div>
            <div className="notification-message">{latestMessage.message}</div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="messages-list">
        <h3>最近消息</h3>
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className="message-item">
              <div className="message-header">
                <span className="message-phone">{msg.phone}</span>
                <span className="message-time">
                  {formatMessageTime(msg.timestamp)}
                </span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .message-notifications {
          position: relative;
          width: 100%;
        }

        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          align-items: start;
          gap: 12px;
          background: white;
          padding: 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          animation: slideIn 0.3s ease;
        }

        .notification-icon {
          font-size: 24px;
        }

        .notification-content {
          flex: 1;
        }

        .notification-title {
          font-weight: 600;
          color: #2d3748;
          margin-bottom: 4px;
        }

        .notification-phone {
          color: #4a5568;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .notification-message {
          color: #718096;
          font-size: 14px;
        }

        .messages-list {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .messages-list h3 {
          margin: 0 0 16px 0;
          color: #2d3748;
          font-size: 18px;
        }

        .messages {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
        }

        .message-item {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #f8fafc;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .message-phone {
          font-weight: 500;
          color: #2d3748;
        }

        .message-time {
          color: #718096;
          font-size: 12px;
        }

        .message-content {
          color: #4a5568;
          font-size: 14px;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

