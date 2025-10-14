import React, { useState, useEffect } from 'react'
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect
import useSWR from 'swr'
import { formatMessageTime, formatMessageDate, shouldShowDateSeparator, formatFullDateTime } from '../utils/dateFormat'
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
  <div style={{ width: 300, borderRight: '1px solid #eee', padding: 12, overflow: 'auto' }}>{children}</div>
)

const ChatWindow = ({ children }: any) => (
  <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>{children}</div>
)

const DetailsPanel = ({ children }: any) => (
  <div style={{ width: 320, borderLeft: '1px solid #eee', padding: 12 }}>{children}</div>
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
  
  const { data: customers, mutate: mutateCustomers } = useSWR(`${API_BASE}/api/customers/summary`, fetcher, {
    refreshInterval: 0,  // 禁用自动刷新
    revalidateOnFocus: false  // 禁用焦点刷新
  })

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [customerDetail, setCustomerDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const { data: stages } = useSWR(`${API_BASE}/api/pipeline/stages`, fetcher, { refreshInterval: 0 })
  const messagesContainerRef = React.useRef<HTMLDivElement>(null)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const prevSelectedRef = React.useRef<string | null>(null)
  const justSwitchedRef = React.useRef(false)

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
  }, [customerDetail])

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
        body: JSON.stringify({ customer_id: selectedCustomer, content: optimistic.content })
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

  return (
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
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
        paddingTop: 48 // leave space for fixed header
      }}>
        <div style={{ width: 300, padding: 12 }}>
          <SidebarComponent>
          {!customers && <div>Loading...</div>}
          {customers?.map((c: any) => (
            <div key={c.id} style={{ padding: 8, cursor: 'pointer', background: c.id === selectedCustomer ? '#e8f0ff' : 'transparent', borderRadius: 6, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }} onClick={async () => {
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
                  <div style={{ fontWeight: 600 }}>{c.name || c.phone}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{c.last_message ? (c.last_message.length > 40 ? c.last_message.substring(0, 40) + '...' : c.last_message) : c.phone}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 64 }}>
                  {c.unread_count > 0 && <div style={{ background: '#ff4d4f', color: 'white', borderRadius: 12, padding: '2px 8px', fontSize: 12 }}>{c.unread_count}</div>}
                  <div style={{ fontSize: 11, color: '#999' }}>{c.last_timestamp ? formatMessageTime(c.last_timestamp) : ''}</div>
                </div>
              </div>
            </div>
          ))}
          </SidebarComponent>
        </div>

        <ChatWindow>
          <div ref={messagesContainerRef} style={{ flex: 1, overflow: 'auto', visibility: messages ? 'visible' : 'hidden' }}>
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
                      <div style={{ margin: '8px 0', textAlign: m.direction === 'outbound' ? 'right' : 'left' }}>
                        <div style={{
                          display: 'inline-block',
                          maxWidth: '70%',
                          padding: '8px 12px',
                          borderRadius: '18px',
                          backgroundColor: m.direction === 'outbound' ? '#007bff' : '#f1f1f1',
                          color: m.direction === 'outbound' ? 'white' : 'black'
                        }}>
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
          <div style={{ marginTop: 12 }}>
            <textarea 
              value={text} 
              onChange={e => setText(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault() // 阻止默认的换行行为
                  sendMessage()
                }
              }}
              style={{ width: '100%', height: 80 }} 
              placeholder="Type a message..." 
            />
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>
        </ChatWindow>

        <DetailsPanel>
          {customerDetail ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img key={`detail-avatar-${selectedCustomer || (customerDetail && customerDetail.id) || 'none'}`} src={(customerDetail && customerDetail.photo_url) || PLACEHOLDER_AVATAR} alt="avatar" crossOrigin="anonymous" style={{ width: 80, height: 80, borderRadius: 40, objectFit: 'cover', backgroundColor: '#fff', display: 'block' }} onError={(e)=>{(e.target as HTMLImageElement).src=PLACEHOLDER_AVATAR}} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{customerDetail.name || customerDetail.phone}</div>
                    <div>
                      {/** Edit / Save buttons handled below **/}
                    </div>
                  </div>
                  <div style={{ color: '#666' }}>{customerDetail.email}</div>
                </div>
                <div>
                  <button onClick={async () => {
                    const url = prompt('Enter image URL', customerDetail.photo_url || '')
                    if (!url) return
                    try {
                      const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ photo_url: url }) })
                      if (!res.ok) throw new Error('Failed')
                      setCustomerDetail({ ...customerDetail, photo_url: url })
                      mutateCustomers()
                      alert('Saved')
                    } catch (err) { console.error(err); alert('Save failed') }
                  }}>Change Photo</button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Phone</strong>
                  {!isEditing && <button onClick={() => setIsEditing(true)}>Edit</button>}
                </div>
                <input disabled={!isEditing} value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} style={{ width: '100%', padding: 8 }} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}><strong>Email</strong></div>
                <input disabled={!isEditing} value={emailValue} onChange={(e) => setEmailValue(e.target.value)} style={{ width: '100%', padding: 8 }} />
              </div>

              {isEditing && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={async () => {
                    if (!customerDetail) return
                    const payload: any = {}
                    if (phoneValue !== customerDetail.phone) payload.phone = phoneValue
                    if (emailValue !== customerDetail.email) payload.email = emailValue
                    if (!Object.keys(payload).length) { setIsEditing(false); return }
                    try {
                      const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) })
                      if (!res.ok) throw new Error('Failed')
                      // reload detail
                      await loadDetail(customerDetail.id)
                      mutateCustomers()
                      setIsEditing(false)
                    } catch (err) { console.error(err); alert('Save failed') }
                  }}>Save</button>
                  <button onClick={() => { setPhoneValue(customerDetail?.phone || ''); setEmailValue(customerDetail?.email || ''); setIsEditing(false) }}>Cancel</button>
                </div>
              )}

              {/* Read-only timestamps */}
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}><strong>Last Contact</strong></div>
                <div style={{ padding: 8, background: '#fafafa', borderRadius: 6 }}>
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

              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}><strong>Last Updated</strong></div>
                <div style={{ padding: 8, background: '#fafafa', borderRadius: 6 }}>
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

              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}><strong>Stage</strong></div>
                <select disabled={detailLoading} value={customerDetail?.stage_id ? String(customerDetail.stage_id) : ''} onChange={async (e) => {
                  const val = e.target.value || ''
                  const stageId = val === '' ? null : parseInt(val, 10)
                  // validate against stages
                  if (stageId !== null && stages && !stages.find((s: any) => Number(s.id) === Number(stageId))) { alert('Invalid stage'); return }
                  try {
                    const res = await fetch(`${API_BASE}/api/customers/${customerDetail.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ stage_id: stageId }) })
                    if (!res.ok) throw new Error('Failed')
                    setCustomerDetail({ ...customerDetail, stage_id: stageId })
                    mutateCustomers()
                  } catch (err) { console.error(err); alert('Save failed') }
                }} style={{ width: '100%', padding: 8 }}>
                  <option value="">None</option>
                  {(stages || []).map((s: any) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>

            </div>
          ) : (
            <div>Select a customer to see details</div>
          )}
        </DetailsPanel>
      </div>
    </div>
  )
}
