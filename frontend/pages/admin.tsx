import React, { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string, token: string) => 
  fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => res.json())

interface User {
  id: number
  email: string
  name: string
  subscription_plan_name: string
  subscription_status: string
  activated_by_admin: boolean
  created_at: string
  last_login_at: string
  customer_count: number
  message_count: number
}

interface Plan {
  id: number
  name: string
  display_name: string
  price: number
}

interface AdminStats {
  total_users: number
  active_users: number
  trial_users: number
  paid_users: number
  total_customers: number
  total_messages: number
  revenue_estimate: number
}

export default function AdminPanel() {
  // 暂时禁用认证，直接显示演示内容
  const user = { email: 'mingkun1999@gmail.com' } // 演示用户
  const token = 'demo-token' // 演示token
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<number>(1)
  const [adminNotes, setAdminNotes] = useState('')

  // 检查是否是管理员（演示模式）
  const isAdmin = true // 演示模式下直接设为管理员

  // 演示数据
  const stats: AdminStats = {
    total_users: 15,
    active_users: 12,
    trial_users: 3,
    paid_users: 5,
    total_customers: 450,
    total_messages: 12500,
    revenue_estimate: 597
  }

  const users: User[] = [
    {
      id: 1,
      email: 'user1@example.com',
      name: '张三',
      subscription_plan_name: '免费版',
      subscription_status: 'active',
      activated_by_admin: false,
      created_at: '2024-01-15',
      last_login_at: '2024-01-20',
      customer_count: 25,
      message_count: 300
    },
    {
      id: 2,
      email: 'user2@company.com',
      name: '李四',
      subscription_plan_name: '基础版',
      subscription_status: 'active',
      activated_by_admin: true,
      created_at: '2024-01-10',
      last_login_at: '2024-01-22',
      customer_count: 150,
      message_count: 2500
    },
    {
      id: 3,
      email: 'enterprise@big.corp',
      name: '王五',
      subscription_plan_name: '企业版',
      subscription_status: 'active',
      activated_by_admin: true,
      created_at: '2024-01-05',
      last_login_at: '2024-01-23',
      customer_count: 1200,
      message_count: 15000
    }
  ]

  const { data: plans } = useSWR<Plan[]>('/api/plans', (url) => fetch(url).then(res => res.json()))
  
  const mutateUsers = () => {} // 演示模式下不需要刷新

  const handleActivateUser = async (userId: number, planId: number, notes: string) => {
    // 演示模式下的用户激活
    const planName = plans?.find(p => p.id === planId)?.display_name || '未知套餐'
    const userName = users.find(u => u.id === userId)?.name || '未知用户'
    
    // 模拟激活过程
    const confirmMessage = `确认要将用户 "${userName}" 激活到 "${planName}" 套餐吗？`
    
    if (confirm(confirmMessage)) {
      // 模拟API调用延迟
      setTimeout(() => {
        alert(`✅ 用户激活成功！\n\n用户：${userName}\n套餐：${planName}\n备注：${notes || '无'}\n\n在实际系统中，这会：\n• 更新用户的订阅状态\n• 发送激活通知邮件\n• 记录管理员操作日志\n• 立即生效新的套餐权限`)
        setSelectedUser(null)
        setAdminNotes('')
      }, 1000)
      
      // 显示处理中状态
      alert('正在处理激活请求...')
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h1>访问被拒绝</h1>
        <p>您没有管理员权限</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '30px', color: '#333' }}>管理后台</h1>

        {/* 统计卡片 */}
      {stats ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '40px'
        }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>总用户数</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', margin: 0 }}>{stats.total_users}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>活跃用户</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4caf50', margin: 0 }}>{stats.active_users}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>付费用户</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196f3', margin: 0 }}>{stats.paid_users}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>预估月收入</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ff9800', margin: 0 }}>¥{stats.revenue_estimate}</p>
          </div>
        </div>
      ) : null}

      {/* 用户列表 */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginBottom: '20px', color: '#333' }}>用户管理</h2>
        
        {users ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>用户</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>当前套餐</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>状态</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>客户数</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>消息数</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>注册时间</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#333' }}>{user.name || '未知'}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{user.email}</div>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: user.subscription_plan_name.includes('免费') ? '#e3f2fd' : '#e8f5e8',
                        color: user.subscription_plan_name.includes('免费') ? '#1976d2' : '#2e7d2e'
                      }}>
                        {user.subscription_plan_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: user.subscription_status === 'active' ? '#e8f5e8' : '#ffebee',
                        color: user.subscription_status === 'active' ? '#2e7d2e' : '#c62828'
                      }}>
                        {user.subscription_status === 'active' ? '活跃' : '暂停'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#333' }}>{user.customer_count}</td>
                    <td style={{ padding: '12px', color: '#333' }}>{user.message_count}</td>
                    <td style={{ padding: '12px', color: '#666', fontSize: '12px' }}>
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => setSelectedUser(user)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#2196f3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        管理
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* 用户管理弹窗 */}
      {selectedUser && plans ? (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90vw'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#333' }}>
              管理用户：{selectedUser.name} ({selectedUser.email})
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#666' }}>
                升级到套餐：
              </label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                {plans.map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.display_name} (¥{plan.price}/月)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#666' }}>
                管理员备注：
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="记录激活原因、沟通记录等..."
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={() => handleActivateUser(selectedUser.id, selectedPlan, adminNotes)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                激活用户
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
