import React, { useState, useEffect } from 'react'
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect
import useSWR from 'swr'
import { formatMessageTime, formatMessageDate, shouldShowDateSeparator, formatFullDateTime, formatCustomerListTime } from '../utils/dateFormat'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { useWhatsAppAutoConnect } from '../hooks/useWhatsAppAutoConnect'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
// inline SVG placeholder to avoid 404s when no avatar available
const PLACEHOLDER_AVATAR = `data:image/svg+xml;utf8,` + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23ffffff'/><circle cx='32' cy='32' r='28' fill='%23e6eef9'/></svg>"
)
const getAuthHeaders = () => {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }

  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  // 未登录：重定向到登录页，避免匿名访问私有数据
  if (typeof window !== 'undefined') {
    console.warn('No auth token found — redirecting to login')
    window.location.href = '/login'
  }
  return headers
}

const fetcher = async (url: string) => {
  try {
    console.log(`🔄 Fetching ${url}...`)
    const res = await fetch(url, { headers: getAuthHeaders() })
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`)
    }
    const data = await res.json()
    console.log(`✅ Fetched ${url}:`, data)
    return data
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error)
    throw error
  }
}

const SidebarComponent = ({ children }: any) => (
  <>{children}</>
)

function AckIcon({ ack }: { ack: number | null }) {
  if (!ack) return <span style={{ color: '#999' }}>•</span>
  if (ack === 1) return <span style={{ color: '#999' }}>✓</span>
  if (ack === 2) return <span style={{ color: '#666' }}>✓✓</span>
  if (ack === 3) return <span style={{ color: '#0b72ff' }}>✓✓</span>
  return <span style={{ color: '#999' }}>•</span>
}

export default function HomePage() {
  const { user } = useAuth()
  
  // 🚀 自動連接 WhatsApp
  const { isConnecting, connectionStatus, error } = useWhatsAppAutoConnect()
  
  // State definitions
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [customerDetail, setCustomerDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'telegram'>('whatsapp') // 新增：用于选择发送渠道
  const [searchQuery, setSearchQuery] = useState('') // 新增：搜索查询
  const [activeTab, setActiveTab] = useState<'info' | 'notes'>('info') // 标签页切换
  const [notesValue, setNotesValue] = useState('') // 备注内容
  const [customFieldsValue, setCustomFieldsValue] = useState<Record<string, any>>({}) // 自定义字段
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'customer' | 'message'; id: string | number } | null>(null) // 右键菜单
  
  // Refs
  const messagesContainerRef = React.useRef<HTMLDivElement>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const prevSelectedRef = React.useRef<string | null>(null)
  const justSwitchedRef = React.useRef(false)

  // SWR hooks
  const { data: customers, mutate: mutateCustomers } = useSWR(
    `${API_BASE}/api/customers/summary${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`, 
    fetcher, 
    {
      refreshInterval: 0,  // 禁用自动刷新
      revalidateOnFocus: false  // 禁用焦点刷新
    }
  )

  const { data: stages } = useSWR(`${API_BASE}/api/pipeline/stages`, fetcher, { refreshInterval: 0 })

  const { data: messages, mutate: mutateMessages } = useSWR(
    selectedCustomer ? `${API_BASE}/api/messages/${selectedCustomer}` : null,
    fetcher,
    {
      refreshInterval: 0,
      revalidateOnMount: true,
      revalidateOnFocus: false
    }
  )

  // load customer detail (callable from click handler or effect)
  const loadDetail = async (id: string | null) => {
    if (!id) { setCustomerDetail(null); setDetailLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/api/customers/${id}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Failed to load customer')
      const json = await res.json()
      setCustomerDetail(json)
      setDetailLoading(false)
    } catch (err) {
      console.error('Failed to load customer detail', err)
      setCustomerDetail(null)
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    // when selectedCustomer changes, fetch full detail
    setDetailLoading(true)
    loadDetail(selectedCustomer)
  }, [selectedCustomer])

  // sync editable input values when customerDetail changes
  useEffect(() => {
    setPhoneValue(customerDetail?.phone || '')
    setEmailValue(customerDetail?.email || '')
    setNotesValue(customerDetail?.notes || '')
    setCustomFieldsValue(customerDetail?.custom_fields || {})
  }, [customerDetail])

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // SSE连接
  React.useEffect(() => {
    console.log('📡 Setting up SSE connection...')
    const es = new EventSource(`${API_BASE}/api/messages/events/stream`)
    
    es.onmessage = (event) => {
      try {
        const start = performance.now()
        const data = JSON.parse(event.data)
        console.log(`📩 ${new Date().toISOString()} - SSE事件:`, data.type)
        
        // 🔒 過濾：只處理屬於當前用戶的事件
        if (data.user_id && user?.id && data.user_id !== user.id) {
          console.log(`🚫 事件被過濾 - 不屬於當前用戶 (事件用戶: ${data.user_id}, 當前用戶: ${user.id})`)
          return
        }
        
        if (data.type === 'customer_update') {
          console.log('🔄 Updating customers list')
          // 直接更新缓存中的客户数据，不触发重新加载
          mutateCustomers((current) => {
            if (!current) return current
            return current.map(c => c.id === data.customer.id ? { ...c, ...data.customer } : c)
          }, false) // false 表示不重新验证数据
        } else if (data.type === 'inbound_message') {
          console.log('📨 New inbound message', data.message, data.customer)
          
          // 更新消息列表（如果正在查看该客户）
          if (data.message.customer_id === selectedCustomer) {
            mutateMessages((current) => {
              if (!current) return [data.message]
              return [...current, data.message]
            }, false)
            
            // 滚动到底部
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
            }
          }
          
          // 立即更新客户列表
          mutateCustomers((current) => {
            if (!current) return current
            
            // 找到当前客户
            const customerIndex = current.findIndex(c => c.id === data.customer.id)
            
            // 如果找不到客户，将新客户添加到列表顶部
            if (customerIndex === -1) {
              return [data.customer, ...current]
            }
            
            // 更新现有客户
            const newCustomers = [...current]
            const updatedCustomer = {
              ...data.customer,
              unread_count: data.customer.id === selectedCustomer 
                ? 0  // 如果正在查看该客户，不增加未读计数
                : (data.customer.unread_count || 0)
            }
            
            // 移除旧的客户记录
            newCustomers.splice(customerIndex, 1)
            // 将更新后的客户添加到列表顶部
            newCustomers.unshift(updatedCustomer)
            
            return newCustomers
          }, false)
        } else if (data.type === 'message_seen') {
          if (data.customer_id === selectedCustomer) {
            mutateMessages()
          }
        }
        
        const end = performance.now()
        console.log(`⏱️ SSE处理耗时: ${Math.round(end - start)}ms`)
      } catch (err) {
        console.error('❌ SSE parsing error:', err)
      }
    }
    
    es.onerror = () => {
      try { es.close() } catch (e) {}
    }
    
    return () => {
      try { es.close() } catch (e) {}
    }
  }, [selectedCustomer, mutateCustomers, mutateMessages])

  // Scrolling behavior:
  // - If user just switched customer (click), instantly jump to bottom after messages render
  // - If messages update for the currently open customer, smooth-scroll to bottom
  React.useEffect(() => {
    if (!messagesContainerRef.current) return

    // If we just switched customer, do an immediate jump to bottom
    if (justSwitchedRef.current) {
      // schedule on next tick after DOM updates
      setTimeout(() => {
        try { messagesContainerRef.current!.scrollTop = messagesContainerRef.current!.scrollHeight } catch (e) {}
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
        prevSelectedRef.current = selectedCustomer
        justSwitchedRef.current = false
      }, 0)
      return
    }

    // Otherwise, if messages changed for the same customer, smooth scroll
    if (prevSelectedRef.current === selectedCustomer) {
      setTimeout(() => {
        try { messagesContainerRef.current!.scrollTop = messagesContainerRef.current!.scrollHeight } catch (e) {}
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }, 0)
    }
  }, [messages, selectedCustomer])

  const sendMessage = async () => {
    if (!text.trim() || !selectedCustomer) return
    
    const optimistic = {
      id: Date.now(),
      content: text,
      direction: 'outbound' as const,
      timestamp: new Date().toISOString(),
      ack: 1
    }

    setText('')
    mutateMessages(current => current ? [...current, optimistic] : [optimistic], false)

    try {
      const res = await fetch(`${API_BASE}/api/messages/send`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customer_id: selectedCustomer, content: optimistic.content, channel: selectedChannel })
      })

      if (!res.ok) {
        // show error to user and refresh messages from server
        const errText = await res.text().catch(() => res.statusText)
        alert(`发送失败: ${res.status} ${errText}`)
        mutateMessages()
        mutateCustomers()
        return
      }

      mutateMessages()
      mutateCustomers()
    } catch (err) {
      console.error('send failed', err)
      alert('发送时发生错误，请重试')
      mutateMessages()
      mutateCustomers()
    }
  }

  // 删除客户
  const deleteCustomer = async (customerId: string) => {
    if (!confirm('⚠️ 确定要删除此客户吗？\n\n这将永久删除客户资料和所有聊天记录，此操作无法撤销！')) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/customers/${customerId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        alert(`删除失败: ${res.status} ${errText}`)
        return
      }

      // 如果删除的是当前选中的客户，清空选择
      if (customerId === selectedCustomer) {
        setSelectedCustomer(null)
        setCustomerDetail(null)
      }

      // 刷新客户列表
      mutateCustomers()
      alert('✅ 客户已删除')
    } catch (err) {
      console.error('delete customer failed', err)
      alert('❌ 删除时发生错误')
    }
  }

  // 删除单条消息
  const deleteMessage = async (messageId: number) => {
    if (!confirm('确定要删除这条消息吗？')) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        alert(`删除失败: ${res.status} ${errText}`)
        return
      }

      // 刷新消息列表
      mutateMessages()
      alert('✅ 消息已删除')
    } catch (err) {
      console.error('delete message failed', err)
      alert('❌ 删除时发生错误')
    }
  }

  return (
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
        {/* Top section headers for three columns */}
        <div style={{ position: 'fixed', left: 70, right: 0, top: 0, height: 48, display: 'flex', alignItems: 'center', padding: '0 16px', background: '#fff', borderBottom: '1px solid #eee', zIndex: 50 }}>
          <div style={{ flex: 1, fontWeight: 700 }}>Customer List</div>
          <div style={{ flex: 2, textAlign: 'center', fontWeight: 700 }}>Chat</div>
          <div style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>Customer Details</div>
        </div>
      <Sidebar currentPage="/chat" />
      
      {/* 主内容区域 */}
      <div style={{ 
        marginLeft: '70px', 
        flex: 1,
        transition: 'margin-left 0.3s ease',
        display: 'flex',
        paddingTop: 48, // leave space for fixed header
        height: '100vh', // 固定高度为视口高度
        overflow: 'hidden' // 防止整体滚动
      }}>
        <div style={{ 
          width: 300, 
          padding: 12, 
          background: '#f8f9fa', 
          borderRight: '1px solid #e9ecef',
          height: 'calc(100vh - 48px)', // 减去顶部header高度
          overflowY: 'auto', // 只让客户列表滚动
          overflowX: 'hidden'
        }}>
          <SidebarComponent>
            {/* 搜索框 */}
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="搜索客户..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              />
            </div>
            {!customers && <div style={{ textAlign: 'center', padding: 20, color: '#6c757d' }}>Loading...</div>}
          {customers?.map((c: any) => (
            <div key={c.id} style={{ 
              padding: 12, 
              cursor: 'pointer', 
              background: c.id === selectedCustomer ? '#007bff' : '#ffffff', 
              borderRadius: 8, 
              marginBottom: 8, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12,
              boxShadow: c.id === selectedCustomer ? '0 2px 8px rgba(0,123,255,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid ' + (c.id === selectedCustomer ? '#007bff' : '#e9ecef'),
              transition: 'all 0.2s ease'
            }} 
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'customer', id: c.id })
            }}
            onClick={async () => {
              // If clicking the already-selected customer, refresh detail + messages
              if (c.id === selectedCustomer) {
                try {
                  setDetailLoading(true)
                  await loadDetail(c.id)
                  mutateMessages()
                } catch (err) {
                  console.error('Failed to refresh selected customer', err)
                  setDetailLoading(false)
                }
                return
              }

              // start loading full details for newly selected customer
              setDetailLoading(true)
              setSelectedCustomer(c.id)
              setCustomerDetail(null)
              justSwitchedRef.current = true
              try {
                // 使用新的批量标记已读API
                await fetch(`${API_BASE}/api/messages/${c.id}/mark_read`, {
                  method: 'POST',
                  headers: getAuthHeaders()
                })
                // 直接更新缓存中的客户数据
                mutateCustomers((current) => {
                  if (!current) return current
                  return current.map(customer => {
                    if (customer.id === c.id) {
                      return { ...customer, unread_count: 0 }
                    }
                    return customer
                  })
                }, false)
                
                // 加载消息
                mutateMessages()
              } catch (err) {
                console.error('Failed to mark messages as read:', err)
              }
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <img key={`list-avatar-${c.id}`} src={c.photo_url || PLACEHOLDER_AVATAR} alt="avatar" crossOrigin="anonymous" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover', backgroundColor: '#fff', display: 'block' }} onError={(e)=>{(e.target as HTMLImageElement).src=PLACEHOLDER_AVATAR}} />
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    color: c.id === selectedCustomer ? '#ffffff' : '#212529',
                    fontSize: '14px'
                  }}>
                    {c.name || c.phone}
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: c.id === selectedCustomer ? 'rgba(255,255,255,0.8)' : '#6c757d',
                    marginTop: 2
                  }}>
                    {c.last_message ? (c.last_message.length > 35 ? c.last_message.substring(0, 35) + '...' : c.last_message) : c.phone}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {c.unread_count > 0 && (
                    <div style={{ 
                      background: c.id === selectedCustomer ? '#ffffff' : '#dc3545', 
                      color: c.id === selectedCustomer ? '#007bff' : 'white', 
                      borderRadius: 10, 
                      padding: '2px 6px', 
                      fontSize: 11,
                      fontWeight: '600',
                      minWidth: 18,
                      textAlign: 'center'
                    }}>
                      {c.unread_count}
                    </div>
                  )}
                  <div style={{ 
                    fontSize: 11, 
                    color: c.id === selectedCustomer ? 'rgba(255,255,255,0.7)' : '#6c757d'
                  }}>
                    {formatCustomerListTime(c.last_timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          </SidebarComponent>
        </div>

        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          height: 'calc(100vh - 48px)', // 减去顶部header高度
          overflow: 'hidden' // 防止整体滚动
        }}>
          <div ref={messagesContainerRef} style={{ 
            flex: 1, 
            overflow: 'auto', 
            visibility: messages ? 'visible' : 'hidden',
            background: '#f8f9fa',
            padding: '16px'
          }}>
            {selectedCustomer && (
              <>
                {!messages && <div>Loading messages...</div>}
                {messages?.map((m: any, i: number) => {
                  const prevMessage = i > 0 ? messages[i - 1] : null
                  const showDateSeparator = shouldShowDateSeparator(m.timestamp, prevMessage?.timestamp)
                  
                  return (
                    <React.Fragment key={m.id}>
                      {showDateSeparator && (
                        <div style={{
                          textAlign: 'center',
                          margin: '16px 0',
                          color: '#666',
                          fontSize: '12px'
                        }}>
                          <div style={{
                            display: 'inline-block',
                            backgroundColor: '#f0f0f0',
                            padding: '4px 12px',
                            borderRadius: '12px'
                          }}>
                            {formatMessageDate(m.timestamp)}
                          </div>
                        </div>
                      )}
                      <div style={{
                        marginBottom: 4,
                        display: 'flex',
                        justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start'
                      }} />
                      <div style={{ 
                        margin: '8px 0', 
                        textAlign: m.direction === 'outbound' ? 'right' : 'left'
                      }}>
                        <div style={{
                          display: 'inline-block',
                          maxWidth: '70%',
                          padding: '12px 16px',
                          borderRadius: m.direction === 'outbound' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          backgroundColor: m.direction === 'outbound' ? '#007bff' : '#ffffff',
                          color: m.direction === 'outbound' ? 'white' : '#212529',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          border: m.direction === 'outbound' ? 'none' : '1px solid #e9ecef',
                          position: 'relative',
                          wordWrap: 'break-word', // 确保长文本自动换行
                          cursor: 'context-menu'
                        }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'message', id: m.id })
                          }}
                        >
                          <div>{m.content}</div>
                          <div style={{
                            fontSize: '11px',
                            opacity: 0.7,
                            marginTop: '4px',
                            textAlign: 'right',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '4px'
                          }}>
                            {m.channel && (
                              <img
                                src={`/icons/${m.channel}.svg`}
                                alt={m.channel}
                                style={{ width: 16, height: 16 }}
                              />
                            )}
                            {formatMessageTime(m.timestamp)}
                            <AckIcon ack={m.ack} />
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          
          {/* 消息输入区域 - 固定在底部 */}
          <div style={{ 
            padding: '16px',
            background: 'white',
            borderTop: '1px solid #e9ecef',
            flexShrink: 0 // 防止被压缩
          }}>
            <textarea 
              value={text} 
              onChange={e => setText(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault() // 阻止默认的换行行为
                  sendMessage()
                }
              }}
              style={{ 
                width: '100%', 
                height: 80,
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px',
                resize: 'none'
              }} 
              placeholder="Type a message..." 
            />
            <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSelectedChannel('whatsapp')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: selectedChannel === 'whatsapp' ? '2px solid #007bff' : '1px solid #ccc',
                    backgroundColor: selectedChannel === 'whatsapp' ? '#e8f0ff' : 'white',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  <img src="/icons/whatsapp.svg" alt="WhatsApp" style={{ width: 20, height: 20, marginRight: 5 }} /> WhatsApp
                </button>
                <button
                  onClick={() => setSelectedChannel('telegram')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: selectedChannel === 'telegram' ? '2px solid #007bff' : '1px solid #ccc',
                    backgroundColor: selectedChannel === 'telegram' ? '#e8f0ff' : 'white',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  <img src="/icons/telegram.svg" alt="Telegram" style={{ width: 20, height: 20, marginRight: 5 }} /> Telegram
                </button>
              </div>
              <button onClick={sendMessage} style={{ padding: '8px 16px', borderRadius: '6px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>Send</button>
            </div>
          </div>
        </div>

        <div style={{ 
          width: 320, 
          borderLeft: '1px solid #eee', 
          padding: '20px 12px 12px 12px',
          height: 'calc(100vh - 48px)', // 减去顶部header高度
          overflowY: 'auto', // 独立滚动
          overflowX: 'hidden',
          background: '#fafbfc',
          boxSizing: 'border-box'
        }}>
          {customerDetail ? (
            <div style={{ paddingTop: 8, paddingBottom: 20 }}>
              {/* 头部区域 - 头像和基本信息 */}
              <div style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ position: 'relative' }}>
                    <img 
                      key={`detail-avatar-${selectedCustomer || (customerDetail && customerDetail.id) || 'none'}`} 
                      src={(customerDetail && customerDetail.photo_url) || PLACEHOLDER_AVATAR} 
                      alt="avatar" 
                      crossOrigin="anonymous" 
                      style={{ 
                        width: 100, 
                        height: 100, 
                        borderRadius: 50, 
                        objectFit: 'cover', 
                        backgroundColor: '#fff', 
                        display: 'block',
                        border: '4px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }} 
                      onError={(e)=>{(e.target as HTMLImageElement).src=PLACEHOLDER_AVATAR}} 
                    />
                    <button 
                      onClick={async () => {
                    const url = prompt('Enter image URL', customerDetail.photo_url || '')
                    if (!url) return
                    try {
                      const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ photo_url: url }) })
                      if (!res.ok) throw new Error('Failed')
                      setCustomerDetail({ ...customerDetail, photo_url: url })
                      mutateCustomers()
                          alert('头像已更新')
                        } catch (err) { console.error(err); alert('更新失败') }
                      }}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        background: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: 32,
                        height: 32,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="更换头像"
                    >
                      📷
                    </button>
                </div>
                  <div style={{ textAlign: 'center', color: 'white' }}>
                    <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
                      {customerDetail.name || customerDetail.phone || '未命名客户'}
              </div>
                    {customerDetail.email && (
                      <div style={{ fontSize: 13, opacity: 0.9 }}>{customerDetail.email}</div>
                    )}
                </div>
              </div>
              </div>

              {/* 标签页切换 */}
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                marginBottom: 16,
                borderBottom: '2px solid #e9ecef'
              }}>
                <button
                  onClick={() => setActiveTab('info')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: activeTab === 'info' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                    color: activeTab === 'info' ? 'white' : '#6c757d',
                    border: 'none',
                    borderBottom: activeTab === 'info' ? 'none' : '2px solid transparent',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    borderRadius: '8px 8px 0 0',
                    transition: 'all 0.2s ease'
                  }}
                >
                  📋 客户信息
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: activeTab === 'notes' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                    color: activeTab === 'notes' ? 'white' : '#6c757d',
                    border: 'none',
                    borderBottom: activeTab === 'notes' ? 'none' : '2px solid transparent',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    borderRadius: '8px 8px 0 0',
                    transition: 'all 0.2s ease'
                  }}
                >
                  📝 备注
                </button>
              </div>

              {activeTab === 'info' && (
                <>
              {/* 编辑按钮区域 */}
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                marginBottom: 20,
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: 8,
                border: '1px solid #e9ecef'
              }}>
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    ✏️ 编辑信息
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={async () => {
                    if (!customerDetail) return
                    const payload: any = {}
                    if (phoneValue !== customerDetail.phone) payload.phone = phoneValue
                    if (emailValue !== customerDetail.email) payload.email = emailValue
                    if (customerDetail.name !== (customerDetail.name || '')) payload.name = customerDetail.name
                    if (JSON.stringify(customFieldsValue) !== JSON.stringify(customerDetail.custom_fields || {})) {
                      payload.custom_fields = customFieldsValue
                    }
                    if (!Object.keys(payload).length) { setIsEditing(false); return }
                    try {
                      const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) })
                      if (!res.ok) throw new Error('Failed')
                      await loadDetail(customerDetail.id)
                      mutateCustomers()
                      setIsEditing(false)
                          alert('✅ 保存成功')
                        } catch (err) { console.error(err); alert('❌ 保存失败') }
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14
                      }}
                    >
                      ✅ 保存
                    </button>
                    <button 
                      onClick={() => { 
                        setPhoneValue(customerDetail?.phone || ''); 
                        setEmailValue(customerDetail?.email || '');
                        setCustomFieldsValue(customerDetail?.custom_fields || {});
                        setCustomerDetail({ ...customerDetail }); // 重置 name
                        setIsEditing(false) 
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14
                      }}
                    >
                      ❌ 取消
                    </button>
                  </>
                )}
              </div>

              {/* 基本信息卡片 */}
              <div style={{ 
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#495057',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid #667eea',
                  paddingBottom: 8
                }}>
                  📱 基本信息
                </div>
                
                {/* 客户姓名 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    👤 客户姓名
                  </label>
                  <input 
                    disabled={!isEditing} 
                    value={customerDetail.name || ''} 
                    onChange={(e) => setCustomerDetail({ ...customerDetail, name: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px',
                      border: isEditing ? '2px solid #667eea' : '1px solid #dee2e6',
                      borderRadius: 6,
                      fontSize: 14,
                      backgroundColor: isEditing ? 'white' : '#f8f9fa',
                      transition: 'all 0.2s ease'
                    }} 
                    placeholder="请输入客户姓名"
                  />
                </div>

                {/* 电话号码 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    📞 电话号码
                  </label>
                  <input 
                    disabled={!isEditing} 
                    value={phoneValue} 
                    onChange={(e) => setPhoneValue(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px',
                      border: isEditing ? '2px solid #667eea' : '1px solid #dee2e6',
                      borderRadius: 6,
                      fontSize: 14,
                      backgroundColor: isEditing ? 'white' : '#f8f9fa',
                      transition: 'all 0.2s ease'
                    }} 
                    placeholder="请输入电话号码"
                  />
                </div>

                {/* 邮箱 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    📧 邮箱地址
                  </label>
                  <input 
                    disabled={!isEditing} 
                    value={emailValue} 
                    onChange={(e) => setEmailValue(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px',
                      border: isEditing ? '2px solid #667eea' : '1px solid #dee2e6',
                      borderRadius: 6,
                      fontSize: 14,
                      backgroundColor: isEditing ? 'white' : '#f8f9fa',
                      transition: 'all 0.2s ease'
                    }} 
                    placeholder="请输入邮箱地址"
                  />
                </div>
              </div>

              {/* 状态管理卡片 */}
              <div style={{ 
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#495057',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid #f59e0b',
                  paddingBottom: 8
                }}>
                  🎯 状态管理
                </div>

                {/* Stage 阶段 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    📊 当前阶段
                  </label>
                  <select 
                    disabled={detailLoading} 
                    value={customerDetail?.stage_id ? String(customerDetail.stage_id) : ''} 
                    onChange={async (e) => {
                      const val = e.target.value || ''
                      const stageId = val === '' ? null : parseInt(val, 10)
                      if (stageId !== null && stages && !stages.find((s: any) => Number(s.id) === Number(stageId))) { 
                        alert('无效的阶段'); 
                        return 
                      }
                      try {
                        const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { 
                          method: 'PATCH', 
                          headers: getAuthHeaders(), 
                          body: JSON.stringify({ stage_id: stageId }) 
                        })
                        if (!res.ok) throw new Error('Failed')
                        setCustomerDetail({ ...customerDetail, stage_id: stageId })
                        mutateCustomers()
                        alert('✅ 阶段已更新')
                      } catch (err) { console.error(err); alert('❌ 更新失败') }
                    }} 
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: 6,
                      fontSize: 14,
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">无阶段</option>
                    {(stages || []).map((s: any) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Status 状态 */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    🚦 客户状态
                  </label>
                  <select 
                    disabled={detailLoading} 
                    value={customerDetail?.status || ''} 
                    onChange={async (e) => {
                      const status = e.target.value
                      try {
                        const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { 
                          method: 'PATCH', 
                          headers: getAuthHeaders(), 
                          body: JSON.stringify({ status }) 
                        })
                        if (!res.ok) throw new Error('Failed')
                        setCustomerDetail({ ...customerDetail, status })
                        mutateCustomers()
                        alert('✅ 状态已更新')
                      } catch (err) { console.error(err); alert('❌ 更新失败') }
                    }} 
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px',
                      border: '1px solid #dee2e6',
                      borderRadius: 6,
                      fontSize: 14,
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">选择状态</option>
                    <option value="new">🆕 新客户</option>
                    <option value="active">✅ 活跃</option>
                    <option value="inactive">💤 不活跃</option>
                    <option value="blocked">🚫 已屏蔽</option>
                  </select>
                </div>

                {/* Unread Count */}
                <div>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    💬 未读消息
                  </label>
                  <div style={{ 
                    padding: '10px 12px',
                    background: customerDetail?.unread_count > 0 ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' : '#f9fafb',
                    borderRadius: 6,
                    color: customerDetail?.unread_count > 0 ? '#dc2626' : '#6b7280',
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: 'center',
                    border: customerDetail?.unread_count > 0 ? '1px solid #fca5a5' : '1px solid #e5e7eb'
                  }}>
                    {customerDetail?.unread_count || 0} 条未读
                  </div>
                </div>
              </div>

              {/* 时间信息卡片 */}
              <div style={{ 
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#495057',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid #3b82f6',
                  paddingBottom: 8
                }}>
                  ⏰ 时间信息
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    📅 最后联系时间
                  </label>
                  <div style={{ 
                    padding: '10px 12px',
                    background: '#f0f9ff',
                    borderRadius: 6,
                    fontSize: 14,
                    color: '#1e40af',
                    border: '1px solid #bfdbfe'
                  }}>
                  {(() => {
                    const ts = customerDetail.last_timestamp || customerDetail.updated_at
                    if (!ts) return '—'
                    try {
                      const d = new Date(ts)
                      const today = new Date()
                      if (d.toDateString() === today.toDateString()) return formatMessageTime(ts)
                      return formatFullDateTime(ts)
                    } catch (e) { return String(ts) }
                  })()}
                </div>
              </div>

                <div>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    🔄 最后更新时间
                  </label>
                  <div style={{ 
                    padding: '10px 12px',
                    background: '#f0fdf4',
                    borderRadius: 6,
                    fontSize: 14,
                    color: '#166534',
                    border: '1px solid #bbf7d0'
                  }}>
                  {(() => {
                    const ts = customerDetail.updated_at
                    if (!ts) return '—'
                    try {
                      const d = new Date(ts)
                      const today = new Date()
                      if (d.toDateString() === today.toDateString()) return formatMessageTime(ts)
                      return formatFullDateTime(ts)
                    } catch (e) { return String(ts) }
                  })()}
                </div>
              </div>
              </div>

              {/* 联系渠道卡片 */}
              {customerDetail?.telegram_chat_id && (
                <div style={{ 
                  background: 'white',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ 
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#495057',
                    marginBottom: 16,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '2px solid #0088cc',
                    paddingBottom: 8
                  }}>
                    💬 联系渠道
                  </div>
                  
                  <div>
                    <label style={{ 
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#6c757d',
                      marginBottom: 6
                    }}>
                      ✈️ Telegram Chat ID
                    </label>
                    <div style={{ 
                      padding: '10px 12px',
                      background: 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
                      borderRadius: 6,
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      color: '#0088cc',
                      fontWeight: 600,
                      border: '1px solid #7dd3fc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{ flex: 1 }}>{customerDetail.telegram_chat_id}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(customerDetail.telegram_chat_id)
                          alert('✅ 已复制到剪贴板')
                        }}
                        style={{
                          background: 'white',
                          border: '1px solid #0088cc',
                          borderRadius: 4,
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        📋 复制
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 自定义字段卡片 */}
              <div style={{ 
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#495057',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid #8b5cf6',
                  paddingBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>🏷️ 自定义字段</span>
                  {isEditing && (
                    <button
                      onClick={() => {
                        const key = prompt('输入字段名称:')
                        if (!key) return
                        const value = prompt('输入字段值:')
                        if (value === null) return
                        setCustomFieldsValue({ ...customFieldsValue, [key]: value })
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      ➕ 添加字段
                    </button>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.keys(customFieldsValue).length > 0 ? (
                    Object.entries(customFieldsValue).map(([key, value]) => (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <div style={{ 
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#7c3aed',
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span>{key}</span>
                          {isEditing && (
                            <button
                              onClick={() => {
                                const newFields = { ...customFieldsValue }
                                delete newFields[key]
                                setCustomFieldsValue(newFields)
                              }}
                              style={{
                                background: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                cursor: 'pointer'
                              }}
                              title="删除字段"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <input
                            value={String(value)}
                            onChange={(e) => setCustomFieldsValue({ ...customFieldsValue, [key]: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: '2px solid #8b5cf6',
                              borderRadius: 6,
                              fontSize: 14,
                              backgroundColor: 'white'
                            }}
                          />
                        ) : (
                          <div style={{ 
                            padding: '10px 12px',
                            background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                            borderRadius: 6,
                            border: '1px solid #e9d5ff',
                            fontSize: 14,
                            color: '#6b21a8',
                            fontWeight: 500
                          }}>
                            {String(value)}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '20px',
                      color: '#9ca3af',
                      fontSize: 13
                    }}>
                      {isEditing ? '点击"添加字段"按钮添加自定义字段' : '暂无自定义字段'}
                    </div>
                  )}
                </div>
              </div>

              {/* 系统信息卡片 */}
              <div style={{ 
                background: 'white',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#495057',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid #6b7280',
                  paddingBottom: 8
                }}>
                  🔧 系统信息
                </div>
                
                <div>
                  <label style={{ 
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#6c757d',
                    marginBottom: 6
                  }}>
                    🆔 客户 ID
                  </label>
                  <div style={{ 
                    padding: '10px 12px',
                    background: '#f9fafb',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#6b7280',
                    border: '1px solid #e5e7eb',
                    wordBreak: 'break-all'
                  }}>
                    {customerDetail?.id}
                  </div>
                </div>
              </div>
                </>
              )}

              {/* 备注标签页 */}
              {activeTab === 'notes' && (
                <div style={{ 
                  background: 'white',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ 
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#495057',
                    marginBottom: 16,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '2px solid #f59e0b',
                    paddingBottom: 8
                  }}>
                    📝 客户备注
                  </div>
                  
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    placeholder="在此添加客户备注..."
                    style={{
                      width: '100%',
                      minHeight: 200,
                      padding: '12px',
                      border: '1px solid #dee2e6',
                      borderRadius: 8,
                      fontSize: 14,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      lineHeight: '1.6'
                    }}
                  />
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: 8, 
                    marginTop: 12 
                  }}>
                    <button
                      onClick={async () => {
                        if (!customerDetail) return
                        try {
                          const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, {
                            method: 'PATCH',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ notes: notesValue })
                          })
                          if (!res.ok) throw new Error('Failed')
                          setCustomerDetail({ ...customerDetail, notes: notesValue })
                          mutateCustomers()
                          alert('✅ 备注已保存')
                        } catch (err) {
                          console.error(err)
                          alert('❌ 保存失败')
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14
                      }}
                    >
                      ✅ 保存备注
                    </button>
                    <button
                      onClick={() => setNotesValue(customerDetail?.notes || '')}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14
                      }}
                    >
                      ❌ 取消
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              padding: 40,
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: 64,
                marginBottom: 16,
                opacity: 0.3
              }}>
                👤
              </div>
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: 8
              }}>
                未选择客户
              </div>
              <div style={{
                fontSize: 14,
                color: '#9ca3af'
              }}>
                从左侧选择一个客户<br />查看详细信息
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid #e9ecef',
            zIndex: 9999,
            minWidth: 150,
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={() => {
              if (contextMenu.type === 'customer') {
                deleteCustomer(contextMenu.id as string)
              } else {
                deleteMessage(contextMenu.id as number)
              }
              setContextMenu(null)
            }}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.2s ease',
              fontSize: 14,
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fee2e2'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ fontSize: 16 }}>🗑️</span>
            <span style={{ color: '#dc3545' }}>
              {contextMenu.type === 'customer' ? '删除客户' : '删除消息'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
