import { EventEmitter } from 'events'

export interface WhatsAppMessage {
  phone: string
  message: string
  timestamp: string
  type: 'incoming' | 'outgoing'
}

class MessageEventService {
  private static instance: MessageEventService
  private eventEmitter: EventEmitter
  private eventSource: EventSource | null = null
  private messageHistory: WhatsAppMessage[] = []
  private readonly MAX_HISTORY = 100

  private constructor() {
    this.eventEmitter = new EventEmitter()
    this.connectToSSE()
  }

  public static getInstance(): MessageEventService {
    if (!MessageEventService.instance) {
      MessageEventService.instance = new MessageEventService()
    }
    return MessageEventService.instance
  }

  private connectToSSE() {
    if (this.eventSource) {
      this.eventSource.close()
    }

    this.eventSource = new EventSource('http://localhost:8000/api/messages/events/stream')

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('Received SSE event:', data)

        // 处理入站消息事件
        if (data.type === 'inbound_message') {
          const message: WhatsAppMessage = {
            phone: data.customer?.phone,
            message: data.message?.content,
            timestamp: data.message?.timestamp || new Date().toISOString(),
            type: 'incoming'
          }
          
          if (message.phone && message.message) {
            console.log('Processing new message:', message)
            
            // 添加到历史记录
            this.messageHistory.unshift(message)
            if (this.messageHistory.length > this.MAX_HISTORY) {
              this.messageHistory.pop()
            }

            // 触发消息事件
            this.eventEmitter.emit('newMessage', message)

            // 触发工作流
            this.eventEmitter.emit('triggerWorkflow', message)
          }
        }
      } catch (error) {
        console.error('Failed to parse message event:', error)
      }
    }

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      // 重连
      setTimeout(() => {
        console.log('Reconnecting to SSE...')
        this.connectToSSE()
      }, 5000)
    }

    this.eventSource.onopen = () => {
      console.log('SSE connection opened')
    }

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      setTimeout(() => this.connectToSSE(), 5000) // 5秒后重连
    }
  }

  public onNewMessage(callback: (message: WhatsAppMessage) => void) {
    this.eventEmitter.on('newMessage', callback)
    return () => this.eventEmitter.off('newMessage', callback)
  }

  public onTriggerWorkflow(callback: (message: WhatsAppMessage) => void) {
    this.eventEmitter.on('triggerWorkflow', callback)
    return () => this.eventEmitter.off('triggerWorkflow', callback)
  }

  public getMessageHistory(): WhatsAppMessage[] {
    return [...this.messageHistory]
  }

  public disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }
}

export default MessageEventService
