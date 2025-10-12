import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { formatMessageTime, formatMessageDate, formatFullDateTime } from '../utils/dateFormat'

const DEFAULT_COLUMNS = [
  { key: 'name', label: '姓名', visible: true },
  { key: 'phone', label: '电话', visible: true },
  { key: 'email', label: '邮箱', visible: true },
  { key: 'stage_id', label: '阶段', visible: true },
  { key: 'last_timestamp', label: '最后联系时间', visible: true },
  { key: 'tags', label: '标签', visible: true },
  { key: 'status', label: '状态', visible: true }
]

export default function CustomerList() {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [editingValues, setEditingValues] = useState<Record<string, any>>({})
  const [editingCustomKeys, setEditingCustomKeys] = useState<string[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [lastAfter, setLastAfter] = useState<string | null>(null)
  const [lastBefore, setLastBefore] = useState<string | null>(null)
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [showConfig, setShowConfig] = useState(false)
  const [stages, setStages] = useState<any[]>([])

  const fetchConfig = async () => {
    try {
      const res = await api.get('/settings/customer-list-config')
      if (res && res.config && Array.isArray(res.config.columns)) {
        setColumns(res.config.columns)
      }
    } catch (e) {
      // ignore -> use default
    }
  }

  const fetchStages = async () => {
    try {
      const res = await api.get('/api/pipeline/stages')
      if (Array.isArray(res)) setStages(res)
    } catch (e) {
      console.error('Failed to load stages', e)
    }
  }

  const buildFieldsParam = () => {
    // Always include id so rows can be keyed and edited even if id column is hidden
    const keys = ['id', ...columns.filter(c => c.visible).map(c => c.key)]
    // dedupe
    return Array.from(new Set(keys)).join(',')
  }

  const fetchRows = async (p = 1) => {
    setLoading(true)
    try {
      const filters: any = {}
      if (stageFilter) filters.stage_id = stageFilter
      if (lastAfter) filters.last_contact_after = lastAfter
      if (lastBefore) filters.last_contact_before = lastBefore

      const fields = buildFieldsParam()
      const url = `/api/customers?page=${p}&limit=${limit}&search=${encodeURIComponent(search)}` + (fields ? `&fields=${encodeURIComponent(fields)}` : '') + (Object.keys(filters).length ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : '')
      const res = await api.get(url)
      if (res && res.rows) {
        setRows(res.rows)
        setTotal(res.total || 0)
        setPage(res.page || p)
      }
    } catch (err) {
      console.error('Failed to load customers', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
    fetchStages()
    fetchRows(1)
  }, [])

  const handleSearch = async () => {
    await fetchRows(1)
  }

  const openEditModal = async (id: string) => {
    // if id is missing (rows lacked id because fields didn't include it), refresh rows then ask user to click again
    if (!id) {
      await fetchRows(page)
      alert('客户数据已刷新，请再次点击编辑以打开详情')
      return
    }
    setEditingCustomerId(id)
    try {
      // Request a full set of useful fields to ensure edit modal shows existing data
      const fields = ['id','name','phone','email','status','stage_id','photo_url','custom_fields','updated_at','last_timestamp'].join(',')
      let res: any = await api.get(`/api/customers/${id}?fields=${encodeURIComponent(fields)}`)
      // fallback: if API returned minimal shape, try generic get
      if (!res || (typeof res === 'object' && Object.keys(res).length === 0)) {
        res = await api.get(`/api/customers/${id}`)
      }
      console.log('Edit modal loaded customer:', res)
      // if wrapped response (e.g. { customer: {...} } or { rows: [...] }) unwrap
      if (res && res.customer) res = res.customer
      if (res && Array.isArray(res.rows) && res.rows.length) res = res.rows[0]
      // res may be a dict of fields per user's column config
      const initial: Record<string, any> = {}
      // flatten custom_fields
      if (res) {
        for (const k of Object.keys(res)) {
          if (k === 'custom_fields' && res.custom_fields && typeof res.custom_fields === 'object') {
            for (const ck of Object.keys(res.custom_fields)) {
              initial[`custom_fields.${ck}`] = res.custom_fields[ck]
            }
            setEditingCustomKeys(Object.keys(res.custom_fields))
          } else {
            initial[k] = res[k]
          }
        }
      }
      // ensure default columns keys exist
      for (const col of DEFAULT_COLUMNS) {
        if (!(col.key in initial)) initial[col.key] = ''
      }
      // ensure all default columns present in editingValues
      for (const col of DEFAULT_COLUMNS) {
        if (!(col.key in initial)) initial[col.key] = ''
      }
      setEditingValues(initial)
      setEditModalOpen(true)
    } catch (e) {
      console.error('Failed to load customer for edit', e)
      alert('加载客户数据失败')
      setEditingValues({})
      setEditModalOpen(false)
    }
  }

  const handleEditChange = (key: string, value: any) => {
    setEditingValues(prev => ({ ...prev, [key]: value }))
  }

  const addCustomField = () => {
    const k = prompt('请输入自定义字段 key（不含 custom_fields. 前缀）')
    if (!k) return
    const full = `custom_fields.${k}`
    if (editingCustomKeys.includes(k)) { alert('字段已存在'); return }
    setEditingCustomKeys(prev => [...prev, k])
    setEditingValues(prev => ({ ...prev, [full]: '' }))
  }

  const saveEdit = async () => {
    if (!editingCustomerId) return
    const payload: any = {}
    const customFieldsPayload: Record<string, any> = {}
    for (const [k, v] of Object.entries(editingValues)) {
      if (k.startsWith('custom_fields.')) {
        const ck = k.split('.').slice(1).join('.')
        customFieldsPayload[ck] = v
      } else {
        payload[k] = v
      }
    }
    if (Object.keys(customFieldsPayload).length) payload.custom_fields = customFieldsPayload
    try {
      await api.patch(`/api/customers/${editingCustomerId}`, payload)
      setEditModalOpen(false)
      setEditingCustomerId(null)
      fetchRows(page)
      alert('已保存')
    } catch (e) {
      console.error('Failed to save customer edit', e)
      alert('保存失败')
    }
  }

  const handlePatch = async (id: string) => {
    const name = prompt('姓名:', rows.find(r => r.id === id)?.name || '')
    const email = prompt('邮箱:', rows.find(r => r.id === id)?.email || '')
    if (name == null && email == null) return
    try {
      await api.patch(`/api/customers/${id}`, { name, email })
      fetchRows(page)
      alert('已保存')
    } catch (e: any) {
      console.error(e)
      alert(e?.body?.detail || e?.message || '保存失败')
    }
  }

  const openConfig = () => setShowConfig(true)

  const saveConfig = async (newColumns: any[]) => {
    try {
      const payload = { columns: newColumns }
      await api.post('/settings/customer-list-config', payload)
      setColumns(newColumns)
      setShowConfig(false)
      fetchRows(page)
      alert('列配置已保存')
    } catch (e) {
      console.error(e)
      alert('保存失败')
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索姓名/电话/邮箱" style={{ flex: 1, padding: 8 }} />
        <select value={stageFilter || ''} onChange={(e) => setStageFilter(e.target.value || null)} style={{ padding: 8, borderRadius: 6 }}>
          <option value="">全部阶段</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name} ({s.customer_count})</option>)}
        </select>
        <input type="date" value={lastAfter || ''} onChange={e => setLastAfter(e.target.value || null)} style={{ padding: 8 }} />
        <input type="date" value={lastBefore || ''} onChange={e => setLastBefore(e.target.value || null)} style={{ padding: 8 }} />
        <button onClick={handleSearch} className="toolbar-button">搜索</button>
        <button onClick={openConfig} className="toolbar-button">⚙️ 列设置</button>
      </div>

      {loading ? (
        <div>加载中...</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.filter(c => c.visible).map(c => (
                  <th key={c.key} style={{ textAlign: 'left', padding: 8 }}>{c.label}</th>
                ))}
                <th style={{ textAlign: 'left', padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  {columns.filter(c => c.visible).map(c => (
                    <td key={c.key} style={{ padding: 8 }}>{
                      (() => {
                        // stage_id should display stage name instead of numeric id
                        if (c.key === 'stage_id') {
                          const sid = r[c.key]
                          if (!sid) return ''
                          const s = stages.find((st: any) => String(st.id) === String(sid))
                          return s ? s.name : String(sid)
                        }

                        const val = c.key === 'tags' ? (r.custom_fields?.tags || '') : (r[c.key] ?? '')
                        if (!val && val !== 0) return ''
                        // format timestamps
                        if (c.key && (c.key.toLowerCase().includes('timestamp') || c.key === 'updated_at')) {
                          try {
                            // show time if same day, otherwise show full date
                            const d = new Date(val)
                            const today = new Date()
                            if (d.toDateString() === today.toDateString()) return formatMessageTime(val)
                            return formatFullDateTime(val)
                          } catch (e) {
                            return String(val)
                          }
                        }
                        return String(val)
                      })()
                    }</td>
                  ))}
                  <td style={{ padding: 8 }}>
                    <button onClick={() => openEditModal(r.id)} className="toolbar-button">编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <div>共 {total} 条</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fetchRows(Math.max(1, page - 1))} className="toolbar-button">上一页</button>
          <button onClick={() => fetchRows(page + 1)} className="toolbar-button">下一页</button>
        </div>
      </div>

      {/* 简单的列设置 Modal */}
      {showConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 640, background: 'white', borderRadius: 8, padding: 16 }}>
            <h3>列设置</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Draggable list */}
              <div>
                {columns.map((col, idx) => {
                  const isProtected = DEFAULT_COLUMNS.map(c=>c.key).includes(col.key)
                  return (
                    <div
                      key={col.key}
                    draggable={true}
                      onDragStart={(e) => { setDragFrom(idx); e.dataTransfer?.setData('text/plain', String(idx)) }}
                      onDragOver={(e) => { e.preventDefault() }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragFrom !== null ? dragFrom : Number(e.dataTransfer?.getData('text/plain'))
                        const to = idx
                        setDragFrom(null)
                        if (isNaN(from)) return
                        if (from === to) return
                        const next = [...columns]
                        const item = next.splice(from,1)[0]
                        next.splice(to,0,item)
                        setColumns(next)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px', border: '1px solid #f0f3f6', borderRadius: 6, marginBottom: 6, background: '#fafbfc' }}
                    >
                      <input type="checkbox" checked={col.visible} onChange={(e) => {
                        const next = [...columns]; next[idx] = { ...col, visible: e.target.checked }; setColumns(next)
                      }} />
                      <div style={{ flex: 1 }}>{col.label}</div>
                      {!isProtected && (
                        <button onClick={() => {
                          const next = columns.filter((_, i) => i !== idx)
                          setColumns(next)
                        }}>删除</button>
                      )}
                      <div style={{ width: 16, height: 16, opacity: isProtected ? 0.4 : 0.6, cursor: 'grab' }}>☰</div>
                    </div>
                  )
                })}
              </div>

              {/* 添加新列 - 直接自定义 key（将自动存为 custom_fields.<key>） */}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <input id="add-column-key" placeholder="列字段名 (例如 note 或 preference)" style={{ padding: 8 }} />
                <input id="add-column-label" placeholder="列头显示名称（可选）" style={{ padding: 8, flex: 1 }} />
                <button onClick={() => {
                  const keyInput = (document.getElementById('add-column-key') as HTMLInputElement)
                  const labelInput = (document.getElementById('add-column-label') as HTMLInputElement)
                  const rawKey = keyInput?.value?.trim()
                  const customLabel = labelInput?.value?.trim()
                  if (!rawKey) { alert('请输入字段名'); return }
                  const key = rawKey.startsWith('custom_fields.') ? rawKey : `custom_fields.${rawKey}`
                  // avoid duplicates
                  if (columns.some(c=>c.key===key)) { alert('已存在该列'); return }
                  const label = customLabel || rawKey
                  const next = [...columns, { key: key, label: label, visible: true }]
                  setColumns(next)
                  keyInput.value = ''
                  if (labelInput) labelInput.value = ''
                }} className="toolbar-button">添加列</button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowConfig(false)} className="toolbar-button">取消</button>
              <button onClick={() => saveConfig(columns)} className="toolbar-button primary">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 520, maxHeight: '80vh', overflow: 'auto', background: 'white', borderRadius: 8, padding: 16 }}>
            <h3>编辑客户</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/** show default + configured fields vertically **/}
              {columns.map(col => (
                <div key={col.key} style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: 12, color: '#333' }}>{col.label}</label>
                  {col.key === 'stage_id' ? (
                    <select
                      value={editingValues[col.key] ?? ''}
                      onChange={(e) => handleEditChange(col.key, e.target.value)}
                      style={{ padding: 8 }}
                    >
                      <option value="">选择阶段</option>
                      {stages.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={editingValues[col.key] ?? ''} onChange={(e) => handleEditChange(col.key, e.target.value)} style={{ padding: 8 }} />
                  )}
                </div>
              ))}

              {/* custom fields list */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>自定义字段</div>
                  <div>
                    <button onClick={addCustomField}>添加自定义字段</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {editingCustomKeys.map(k => (
                    <div key={k} style={{ display: 'flex', gap: 8 }}>
                      <div style={{ width: 160, padding: 8, background: '#fafafa', borderRadius: 4 }}>{k}</div>
                      <input value={editingValues[`custom_fields.${k}`] ?? ''} onChange={(e) => handleEditChange(`custom_fields.${k}`, e.target.value)} style={{ flex: 1, padding: 8 }} />
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setEditModalOpen(false); setEditingCustomerId(null) }}>取消</button>
              <button onClick={saveEdit} className="toolbar-button primary">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


