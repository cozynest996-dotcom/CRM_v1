import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface ColumnMapping {
  [sheetColumn: string]: string // { "Sheet Column Name": "dbFieldName" }
}

type IntegrationTab = 'googleSheets' | 'aiJsonImport'

export default function KnowledgeBaseIntegrationsPage() {
  const { t, language } = useLanguage()
  const [activeTab, setActiveTab] = useState<IntegrationTab>('googleSheets')

  // Google Sheets states (from previous GoogleSheetsIntegrationSettings.tsx)
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [selectedTab, setSelectedTab] = useState('')
  const [availableTabs, setAvailableTabs] = useState<string[]>([])
  const [selectedKnowledgeType, setSelectedKnowledgeType] = useState<'faq' | 'product_service' | 'article' | 'custom' | ''>('faq')
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [selectedCustomEntityId, setSelectedCustomEntityId] = useState<string | null>(null)
  const [isSyncEnabled, setIsSyncEnabled] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null) // New state for Google user email
  const [sheetColumns, setSheetColumns] = useState<string[]>([]) // New state for sheet columns
  const [customEntityTypes, setCustomEntityTypes] = useState<any[]>([])
  const [knowledgeBaseFields, setKnowledgeBaseFields] = useState<{ label: string; value: string }[]>([])

  // AI JSON Import states
  const [nonStructuredText, setNonStructuredText] = useState('')
  const [generatedJson, setGeneratedJson] = useState('')
  const [importTargetType, setImportTargetType] = useState<'faq' | 'products' | 'articles' | ''>('faq')
  const [jsonLoading, setJsonLoading] = useState(false)
  const [jsonMessage, setJsonMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  // const [authToken, setAuthToken] = useState<string | null>(null) // New state for auth token

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

  // Helper to extract spreadsheet ID from URL
  const extractSpreadsheetId = (url: string): string | null => {
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname === 'docs.google.com' && urlObj.pathname.startsWith('/spreadsheets/d/')) {
        const parts = urlObj.pathname.split('/')
        return parts[3] || null
      }
    } catch (e) {
      console.error("Invalid Google Sheet URL:", e)
    }
    return null
  }

  // Google Sheets Handlers (re-used from previous component)
  const handleConnectGoogle = async () => {
    setLoading(true)
    setMessage(null)
    try {
      window.location.href = `${API_BASE_URL}/auth/google/login?redirect_to=/knowledge-base?tab=googleSheets` // Redirect to knowledge-base for OAuth
    } catch (error) {
      console.error("Failed to initiate Google OAuth:", error)
      setMessage({ type: 'error', text: language === 'zh' ? '无法启动 Google 认证。' : 'Failed to initiate Google authentication.' })
      setLoading(false)
    }
  }

  const handleFetchSheetTabs = async () => {
    setLoading(true)
    setMessage(null)
    const jwtToken = localStorage.getItem('token')
    if (!jwtToken) {
      setMessage({ type: 'error', text: language === 'zh' ? '请先连接 Google 账号。' : 'Please connect Google account first.' })
      setLoading(false)
      return
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId) {
      setMessage({ type: 'error', text: language === 'zh' ? 'Google Sheet URL 无效或缺少 ID。' : 'Invalid Google Sheet URL or missing ID.' })
      setLoading(false)
      return
    }

    try {
      // Fetch tabs for the selected spreadsheet
      const response = await fetch(`${API_BASE_URL}/api/google-sheets/${spreadsheetId}/tabs`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      })
      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: 'error', text: language === 'zh' ? '会话过期，请重新连接 Google 账号。' : 'Session expired, please reconnect Google account.' })
          setIsGoogleConnected(false)
          localStorage.removeItem('token')
        }
        throw new Error(`Failed to fetch sheet tabs: ${response.statusText}`)
      }
      const tabs = await response.json()
      if (tabs && tabs.length > 0) {
        setAvailableTabs(tabs)
        setSelectedTab(tabs[0])
        setMessage({ type: 'success', text: language === 'zh' ? '已加载工作表列表。' : 'Sheet tabs loaded.' })

        // After loading tabs, fetch column headers for the selected tab
        await fetchSheetColumnHeaders(spreadsheetId, tabs[0])

      } else {
        setAvailableTabs([])
        setSelectedTab('')
        setSheetColumns([]) // Clear columns if no tabs
        setMessage({ type: 'info', text: language === 'zh' ? '未找到工作表。' : 'No tabs found.' })
      }
    } catch (e) {
      console.error("Error fetching sheet tabs:", e)
      setMessage({ type: 'error', text: language === 'zh' ? '加载工作表列表失败。' : 'Failed to load sheet tabs.' })
    } finally {
      setLoading(false)
    }
  }

  const getMappingStorageKey = (spreadsheetId: string, sheetName: string, knowledgeType: string, customEntityId: string | null = null) => {
    let key = `kb_mapping_${spreadsheetId}::${sheetName}::${knowledgeType}`
    if (knowledgeType === 'custom' && customEntityId) {
      key += `::${customEntityId}`
    }
    return key
  }

  const fetchSheetColumnHeaders = async (spreadsheetId: string, sheetName: string) => {
    setLoading(true)
    setMessage(null)
    const jwtToken = localStorage.getItem('token')
    if (!jwtToken) {
      setMessage({ type: 'error', text: language === 'zh' ? '请先连接 Google 账号。' : 'Please connect Google account first.' })
      setLoading(false)
      return
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/google-sheets/${spreadsheetId}/sheet_data?sheet_name=${encodeURIComponent(sheetName)}`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      })
      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: 'error', text: language === 'zh' ? '会话过期，请重新连接 Google 账号。' : 'Session expired, please reconnect Google account.' })
          setIsGoogleConnected(false)
          localStorage.removeItem('token')
        }
        throw new Error(`Failed to fetch sheet data: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.headers && data.headers.length > 0) {
        setSheetColumns(data.headers)
        if (selectedKnowledgeType) {
          const key = getMappingStorageKey(spreadsheetId, sheetName, selectedKnowledgeType, selectedCustomEntityId)
          try {
            const saved = localStorage.getItem(key)
            if (saved) {
              setColumnMapping(JSON.parse(saved))
            } else {
              const initial: ColumnMapping = {}
              data.headers.forEach((h: string) => { initial[h] = columnMapping[h] || '' })
              setColumnMapping(initial)
            }
          } catch (e) {
            console.warn('Failed to load saved mapping', e)
          }
        } else {
          const initial: ColumnMapping = {}
          data.headers.forEach((h: string) => { initial[h] = columnMapping[h] || '' })
          setColumnMapping(initial)
        }
      } else {
        setSheetColumns([])
        setMessage({ type: 'info', text: language === 'zh' ? '未找到列标题。' : 'No column headers found.' })
      }
    } catch (e) {
      console.error("Error fetching sheet column headers:", e)
      setMessage({ type: 'error', text: language === 'zh' ? '加载列标题失败。' : 'Failed to load column headers.' })
    } finally {
      setLoading(false)
    }
  }

  // when selectedKnowledgeType or selectedTab changes, try load mapping
  useEffect(() => { // Trigger on selectedCustomEntityId change as well
    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId || !selectedTab || !selectedKnowledgeType) {
      setColumnMapping({})
      return
    }
    if (selectedKnowledgeType === 'custom' && !selectedCustomEntityId) {
      setColumnMapping({})
      return
    }
    const key = getMappingStorageKey(spreadsheetId, selectedTab, selectedKnowledgeType, selectedCustomEntityId)
    try {
      const saved = localStorage.getItem(key)
      if (saved) setColumnMapping(JSON.parse(saved))
    } catch (e) {
      console.warn('Failed to load saved mapping on change', e)
    }

    // Re-initialize if no saved mapping found for the new combination
    if (!localStorage.getItem(key)) {
      const initial: ColumnMapping = {}
      sheetColumns.forEach((h: string) => { initial[h] = columnMapping[h] || '' })
      setColumnMapping(initial)
    }

  }, [selectedKnowledgeType, selectedTab, sheetUrl, selectedCustomEntityId, sheetColumns])

  const saveColumnMappingToStorage = () => {
    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId || !selectedTab || !selectedKnowledgeType) {
      setMessage({ type: 'error', text: language === 'zh' ? '请先填写 Sheet URL、选择工作表和知识库类型然后再保存映射。' : 'Please set Sheet URL, select Tab and Knowledge Type before saving mapping.' })
      return
    }
    if (selectedKnowledgeType === 'custom' && !selectedCustomEntityId) {
      setMessage({ type: 'error', text: language === 'zh' ? '请选择一个自定义实体类型。' : 'Please select a custom entity type.' })
      return
    }
    const key = getMappingStorageKey(spreadsheetId, selectedTab, selectedKnowledgeType, selectedCustomEntityId)
    try {
      localStorage.setItem(key, JSON.stringify(columnMapping))
      setMessage({ type: 'success', text: language === 'zh' ? '列映射已保存' : 'Column mapping saved' })
    } catch (e) {
      console.error('Failed to save mapping', e)
      setMessage({ type: 'error', text: language === 'zh' ? '保存映射失败' : 'Failed to save mapping' })
    }
  }

  const handleMapColumnChange = (sheetCol: string, dbField: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [sheetCol]: dbField,
    }))
  }

  const handleImportData = async () => {
    setLoading(true)
    setMessage(null)
    const jwtToken = localStorage.getItem('token')
    if (!jwtToken) {
      setMessage({ type: 'error', text: language === 'zh' ? '请先连接 Google 账号。' : 'Please connect Google account first.' })
      setLoading(false)
      return
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId) {
      setMessage({ type: 'error', text: language === 'zh' ? 'Google Sheet URL 无效或缺少 ID。' : 'Invalid Google Sheet URL or missing ID.' })
      setLoading(false)
      return
    }

    if (selectedKnowledgeType === 'custom' && !selectedCustomEntityId) {
      setMessage({ type: 'error', text: language === 'zh' ? '请选择一个自定义实体类型进行导入。' : 'Please select a custom entity type for import.' })
      setLoading(false)
      return
    }
    if (!selectedKnowledgeType || !selectedTab || Object.keys(columnMapping).length === 0) {
      setMessage({ type: 'error', text: language === 'zh' ? '请选择知识库类型、工作表并配置列映射。' : 'Please select knowledge base type, sheet tab, and configure column mapping.' })
      setLoading(false)
      return
    }

    try {
      const importApiUrl = selectedKnowledgeType === 'custom'
        ? `${API_BASE_URL}/api/google-sheets/${spreadsheetId}/custom/${selectedCustomEntityId}/import`
        : `${API_BASE_URL}/api/google-sheets/${spreadsheetId}/${selectedKnowledgeType}/import`
      const response = await fetch(importApiUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sheet_name: selectedTab,
            column_mapping: columnMapping,
          }),
        }
      )
      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: 'error', text: language === 'zh' ? '会话过期，请重新连接 Google 账号。' : 'Session expired, please reconnect Google account.' })
          setIsGoogleConnected(false)
          localStorage.removeItem('token')
        }
        throw new Error(`Failed to import data: ${response.statusText}`)
      }
      const result = await response.json()
      setLastSyncAt(new Date().toLocaleString())
      setMessage({ type: 'success', text: result.message || (language === 'zh' ? '数据已成功从 Google Sheet 导入！' : 'Data imported successfully from Google Sheet!') })
    } catch (e) {
      console.error("Error importing data:", e)
      setMessage({ type: 'error', text: language === 'zh' ? '数据导入失败。' : 'Failed to import data.' })
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async () => {
    setLoading(true)
    setMessage(null)
    const jwtToken = localStorage.getItem('token')
    if (!jwtToken) {
      setMessage({ type: 'error', text: language === 'zh' ? '请先连接 Google 账号。' : 'Please connect Google account first.' })
      setLoading(false)
      return
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl)
    if (!spreadsheetId) {
      setMessage({ type: 'error', text: language === 'zh' ? 'Google Sheet URL 无效或缺少 ID。' : 'Invalid Google Sheet URL or missing ID.' })
      setLoading(false)
      return
    }

    if (selectedKnowledgeType === 'custom' && !selectedCustomEntityId) {
      setMessage({ type: 'error', text: language === 'zh' ? '请选择一个自定义实体类型进行导出。' : 'Please select a custom entity type for export.' })
      setLoading(false)
      return
    }
    if (!selectedKnowledgeType || !selectedTab || Object.keys(columnMapping).length === 0) {
      setMessage({ type: 'error', text: language === 'zh' ? '请选择知识库类型、工作表并配置列映射。' : 'Please select knowledge base type, sheet tab, and configure column mapping.' })
      setLoading(false)
      return
    }

    try {
      const exportApiUrl = selectedKnowledgeType === 'custom'
        ? `${API_BASE_URL}/api/google-sheets/${spreadsheetId}/custom/${selectedCustomEntityId}/export`
        : `${API_BASE_URL}/api/google-sheets/${spreadsheetId}/${selectedKnowledgeType}/export`
      const response = await fetch(exportApiUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sheet_name: selectedTab,
            column_mapping: columnMapping,
          }),
        }
      )
      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: 'error', text: language === 'zh' ? '会话过期，请重新连接 Google 账号。' : 'Session expired, please reconnect Google account.' })
          setIsGoogleConnected(false)
          localStorage.removeItem('token')
        }
        throw new Error(`Failed to export data: ${response.statusText}`)
      }
      const result = await response.json()
      setLastSyncAt(new Date().toLocaleString())
      setMessage({ type: 'success', text: result.message || (language === 'zh' ? '数据已成功导出到 Google Sheet！' : 'Data exported successfully to Google Sheet!') })
    } catch (e) {
      console.error("Error exporting data:", e)
      setMessage({ type: 'error', text: language === 'zh' ? '数据导出失败。' : 'Failed to export data.' })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSync = async () => {
    setLoading(true)
    setMessage(null)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSyncEnabled(!isSyncEnabled)
    setMessage({ type: 'success', text: isSyncEnabled ? (language === 'zh' ? '双向同步已禁用。' : 'Two-way sync disabled.') : (language === 'zh' ? '双向同步已启用。' : 'Two-way sync enabled.') })
    setLoading(false)
  }

  const getDbFieldsForType = () => {
    if (!selectedKnowledgeType) return []
    if (selectedKnowledgeType === 'custom') {
      if (!selectedCustomEntityId) return []
      const entity = customEntityTypes.find((e) => e.id === selectedCustomEntityId)
      if (!entity || !entity.fields) return []
      return entity.fields.map((f: any) => ({ label: `${f.name} (${f.fieldKey})`, value: f.fieldKey }))
    }
    // Fallback for KnowledgeBase types (faq, product_service, article)
    return [
      ...knowledgeBaseFields
    ]
  }

  // Fetch custom entity types for mapping options
  useEffect(() => {
    const fetchCustomEntityTypes = async () => {
      const jwtToken = localStorage.getItem('token')
      if (!jwtToken) return // Don't fetch if not authenticated
      try {
        const res = await fetch(`${API_BASE_URL}/api/custom-objects/custom-entity-types/`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        })
        if (!res.ok) return
        const data = await res.json()
        setCustomEntityTypes(data)
      } catch (e) {
        console.warn('Failed to load custom entity types', e)
      }
    }

    const fetchKnowledgeBaseFields = async () => {
      const jwtToken = localStorage.getItem('token')
      if (!jwtToken) return // Don't fetch if not authenticated
      try {
        const res = await fetch(`${API_BASE_URL}/api/knowledge-bases/fields`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        })
        if (!res.ok) throw new Error('Failed to fetch knowledge base fields')
        const data = await res.json()
        setKnowledgeBaseFields(data)
      } catch (e) {
        console.error('Error fetching knowledge base fields:', e)
      }
    }

    fetchCustomEntityTypes()
    fetchKnowledgeBaseFields()
  }, []) // Empty dependency array means this runs once on mount

  // AI JSON Import Handlers
  const handleGenerateJson = async () => {
    setJsonLoading(true)
    setJsonMessage(null)
    setGeneratedJson('')
    // Simulate API call to backend AI for JSON generation
    await new Promise(resolve => setTimeout(resolve, 2500))
    // Instead of hardcoded JSON, ideally call a backend AI service to generate it.
    // For now, we'll just clear it.
    // setGeneratedJson(JSON.stringify(exampleJson, null, 2))
    setJsonMessage({ type: 'success', text: language === 'zh' ? 'AI 已成功生成结构化 JSON！' : 'AI successfully generated structured JSON!' })
    setJsonLoading(false)
  }

  const handleImportJson = async () => {
    setJsonLoading(true)
    setJsonMessage(null)
    // Simulate API call to backend to import JSON data
    await new Promise(resolve => setTimeout(resolve, 2000))
    setJsonMessage({ type: 'success', text: language === 'zh' ? 'JSON 数据已成功导入知识库！' : 'JSON data imported successfully to knowledge base!' })
    setJsonLoading(false)
    setNonStructuredText('') // Clear input after import
    setGeneratedJson('') // Clear generated JSON
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const success = params.get('success')
    const error = params.get('error')
    const tab = params.get('tab')

    if (token) {
      localStorage.setItem('token', token)
      // Optionally, remove token from URL to keep it clean
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/([?&])token=[^&]*(&|$)/, '$1').replace(/[?&]$/, ''))
    }

    if (success === 'google_connected') {
      setMessage({ type: 'success', text: language === 'zh' ? 'Google 账号连接成功！' : 'Google account connected successfully!' })
      setIsGoogleConnected(true)
      // Clear success param from URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/([?&])success=[^&]*(&|$)/, '$1').replace(/[?&]$/, ''))
    }

    if (error) {
      setMessage({ type: 'error', text: language === 'zh' ? `Google 连接失败: ${error}` : `Google connection failed: ${error}` })
      setIsGoogleConnected(false)
      // Clear error param from URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/([?&])error=[^&]*(&|$)/, '$1').replace(/[?&]$/, ''))
    }

    // Fetch Google Sheets settings when component mounts or language changes
    const fetchGoogleSheetsSettings = async () => {
      const jwtToken = localStorage.getItem('token')
      if (!jwtToken) { // Use authToken state
        console.warn("No JWT token found, can't fetch Google Sheets settings.")
        setIsGoogleConnected(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/auth/google-sheets/settings`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        })
        if (!response.ok) {
          if (response.status === 401) {
            // Token expired or invalid, prompt user to re-authenticate
            setMessage({ type: 'error', text: language === 'zh' ? '会话过期，请重新连接 Google 账号。' : 'Session expired, please reconnect Google account.' })
            setIsGoogleConnected(false)
            localStorage.removeItem('token')
          } else {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
        }
        const data = await response.json()
        
        if (data.is_connected) {
          setIsGoogleConnected(true)
          setGoogleUserEmail(data.google_user_email)
        } else {
          setIsGoogleConnected(false)
          setGoogleUserEmail(null)
        }
      } catch (e) {
        console.error("Failed to fetch Google Sheets settings:", e)
        setMessage({ type: 'error', text: language === 'zh' ? '加载 Google Sheets 设置失败。' : 'Failed to load Google Sheets settings.' })
        setIsGoogleConnected(false)
      } finally {
        setLoading(false)
      }
    }

    fetchGoogleSheetsSettings()

    if (tab) {
      setActiveTab(tab as IntegrationTab)
      // Clear tab param from URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/([?&])tab=[^&]*(&|$)/, '$1').replace(/[?&]$/, ''))
    }

  }, [language]) // Rerun when language changes

  const renderGoogleSheetsIntegration = () => (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: '#2d3748', marginBottom: '20px' }}>
        {language === 'zh' ? 'Google Sheets 集成' : 'Google Sheets Integration'}
      </h3>
      
      {message && (
        <div style={{ 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '20px',
          backgroundColor: message.type === 'success' ? '#f0fff4' : message.type === 'error' ? '#fef2f2' : '#ebf8ff',
          color: message.type === 'success' ? '#2f855a' : message.type === 'error' ? '#c53030' : '#2b6cb0',
          border: `1px solid ${message.type === 'success' ? '#9ae6b4' : message.type === 'error' ? '#fc8181' : '#63b3ed'}`
        }}>
          {message.text}
        </div>
      )}

      {/* Google 账号连接 */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
        <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
          {language === 'zh' ? '1. 连接 Google 账号' : '1. Connect Google Account'}
        </h4>
        {!isGoogleConnected ? (
          <button 
            onClick={handleConnectGoogle} 
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4299e1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (language === 'zh' ? '连接中...' : 'Connecting...') : (language === 'zh' ? '连接 Google 账号' : 'Connect Google Account')}
          </button>
        ) : (
          <p style={{ color: '#38a169', fontWeight: '600' }}>✅ {language === 'zh' ? '已连接 Google 账号' : 'Google Account Connected'}{googleUserEmail && ` (${googleUserEmail})`}</p>
        )}
      </div>

      {isGoogleConnected && (
        <> 
          {/* Google Sheet 配置 */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
            <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
              {language === 'zh' ? '2. 配置 Google Sheet' : '2. Configure Google Sheet'}
            </h4>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="sheetUrl" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
                {language === 'zh' ? 'Google Sheet URL 或 ID' : 'Google Sheet URL or ID'}
              </label>
              <input
                type="text"
                id="sheetUrl"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder={language === 'zh' ? '例如: https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit' : 'e.g., https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit'}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <button
                onClick={handleFetchSheetTabs}
                disabled={loading || !sheetUrl}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3182ce',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: loading || !sheetUrl ? 0.7 : 1,
                }}
              >
                {loading ? (language === 'zh' ? '加载中...' : 'Loading...') : (language === 'zh' ? '加载工作表' : 'Load Sheet Tabs')}
              </button>
            </div>
            {availableTabs.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="selectedTab" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
                  {language === 'zh' ? '选择工作表' : 'Select Tab'}
                </label>
                <select
                  id="selectedTab"
                  value={selectedTab}
                  onChange={(e) => {
                    setSelectedTab(e.target.value)
                    const spreadsheetId = extractSpreadsheetId(sheetUrl)
                    if (spreadsheetId) {
                      fetchSheetColumnHeaders(spreadsheetId, e.target.value)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {availableTabs.map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedTab && (
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="knowledgeType" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>
                  {language === 'zh' ? '映射到知识库类型' : 'Map to Knowledge Base Type'}
                </label>
                <select
                  id="knowledgeType"
                  value={selectedKnowledgeType}
                  onChange={(e) => {
                    setSelectedKnowledgeType(e.target.value as any)
                    // reset selected custom entity when switching types
                    if (e.target.value !== 'custom') setSelectedCustomEntityId(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">{language === 'zh' ? '请选择' : 'Select...'}</option>
                  <option value="faq">{language === 'zh' ? '常见问题 (FAQ)' : 'FAQs'}</option>
                  <option value="product_service">{language === 'zh' ? '产品与服务' : 'Products & Services'}</option>
                  <option value="article">{language === 'zh' ? '文章与文档' : 'Articles & Documents'}</option>
                  <option value="custom">{language === 'zh' ? '自定义对象' : 'Custom Object'}</option>
                </select>
                {selectedKnowledgeType === 'custom' && (
                  <div style={{ marginTop: '10px' }}>
                    <label htmlFor="customEntity" style={{ display: 'block', fontSize: '14px', color: '#4a5568', marginBottom: '5px' }}>{language === 'zh' ? '选择实体类型' : 'Select Entity Type'}</label>
                    <select id="customEntity" value={selectedCustomEntityId || ''} onChange={(e) => setSelectedCustomEntityId(e.target.value || null)} style={{ width: '100%', padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '16px', backgroundColor: 'white', cursor: 'pointer' }}>
                      <option value="">{language === 'zh' ? '请选择实体类型' : 'Select an entity type...'}</option>
                      {customEntityTypes.map(ct => (
                        <option key={ct.id} value={ct.id}>{language === 'zh' ? `${ct.name}` : `${ct.name}`}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedTab && selectedKnowledgeType && (
            <> 
              {/* 列映射配置器 */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
                  {language === 'zh' ? '3. 配置列映射' : '3. Configure Column Mapping'}
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', color: '#718096' }}>{language === 'zh' ? '将您的 Google Sheet 列与系统数据库字段进行匹配。' : 'Match your Google Sheet columns to system database fields.'}</div>
                  <div>
                    <button onClick={saveColumnMappingToStorage} style={{ padding: '8px 12px', marginLeft: '8px', backgroundColor: '#48bb78', color: 'white', border: 'none', borderRadius: '6px' }}>{language === 'zh' ? '保存映射' : 'Save Mapping'}</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  {(selectedKnowledgeType === 'custom' && !selectedCustomEntityId) ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#e53e3e', padding: '20px' }}>
                      {language === 'zh' ? '请先选择一个自定义实体类型以配置列映射。' : 'Please select a custom entity type to configure column mapping.'}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 'bold' }}>{language === 'zh' ? 'Google Sheet 列' : 'Google Sheet Column'}</div>
                      <div style={{ fontWeight: 'bold' }}>{language === 'zh' ? '数据库字段' : 'Database Field'}</div>
                      {sheetColumns.map((sheetCol) => (
                        <React.Fragment key={sheetCol}>
                          <div style={{ fontSize: '14px', color: '#4a5568' }}>{sheetCol}</div>
                          <select
                            value={columnMapping[sheetCol] || ''}
                            onChange={(e) => handleMapColumnChange(sheetCol, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '14px',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">{language === 'zh' ? '不映射' : 'Do not map'}</option>
                            {getDbFieldsForType().map((field) => (
                              <option key={field.value} value={field.value}>
                                {field.label}
                              </option>
                            ))}
                          </select>
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
                  {language === 'zh' ? '4. 数据同步操作' : '4. Data Sync Operations'}
                </h4>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                  <button 
                    onClick={handleImportData}
                    disabled={loading || Object.keys(columnMapping).length === 0}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#48bb78',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      opacity: loading || Object.keys(columnMapping).length === 0 ? 0.7 : 1,
                    }}
                  >
                    {loading ? (language === 'zh' ? '导入中...' : 'Importing...') : (language === 'zh' ? '一键导入数据' : 'One-Click Import Data')}
                  </button>
                  <button 
                    onClick={handleExportData}
                    disabled={loading}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#63b3ed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    {loading ? (language === 'zh' ? '导出中...' : 'Exporting...') : (language === 'zh' ? '一键导出数据' : 'One-Click Export Data')}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="enableSync"
                    checked={isSyncEnabled}
                    onChange={handleToggleSync}
                    disabled={loading}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="enableSync" style={{ fontSize: '16px', color: '#2d3748' }}>
                    {language === 'zh' ? '启用双向同步 (实验性功能)' : 'Enable Two-Way Sync (Experimental)'}
                  </label>
                </div>

                {lastSyncAt && (
                  <p style={{ fontSize: '14px', color: '#718096' }}>
                    {language === 'zh' ? '上次同步时间:' : 'Last Sync At:'} {lastSyncAt}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )

  const renderAIJsonImport = () => (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: '#2d3748', marginBottom: '20px' }}>
        {language === 'zh' ? 'AI / JSON 智能导入' : 'AI / JSON Smart Import'}
      </h3>

      {jsonMessage && (
        <div style={{ 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '20px',
          backgroundColor: jsonMessage.type === 'success' ? '#f0fff4' : jsonMessage.type === 'error' ? '#fef2f2' : '#ebf8ff',
          color: jsonMessage.type === 'success' ? '#2f855a' : jsonMessage.type === 'error' ? '#c53030' : '#2b6cb0',
          border: `1px solid ${jsonMessage.type === 'success' ? '#9ae6b4' : jsonMessage.type === 'error' ? '#fc8181' : '#63b3ed'}`
        }}>
          {jsonMessage.text}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
        <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
          {language === 'zh' ? '1. 导入目标类型' : '1. Import Target Type'}
        </h4>
        <select
          value={importTargetType}
          onChange={(e) => setImportTargetType(e.target.value as 'faq' | 'product_service' | 'article')}
          style={{
            width: '100%',
            padding: '10px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '16px',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          <option value="faq">{language === 'zh' ? '常见问题 (FAQ)' : 'FAQs'}</option>
          <option value="product_service">{language === 'zh' ? '产品与服务' : 'Products & Services'}</option>
          <option value="article">{language === 'zh' ? '文章与文档' : 'Articles & Documents'}</option>
        </select>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
        <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
          {language === 'zh' ? '2. 输入非结构化文本或上传文件' : '2. Enter Non-Structured Text or Upload File'}
        </h4>
        <textarea
          placeholder={language === 'zh' ? '粘贴您的非结构化 FAQ、房源信息等...' : 'Paste your non-structured FAQs, rental listings, etc...'}
          value={nonStructuredText}
          onChange={(e) => setNonStructuredText(e.target.value)}
          rows={10}
          style={{
            width: '100%',
            padding: '10px 15px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box',
            marginBottom: '15px'
          }}
        ></textarea>
        {/* TODO: 文件上传功能 */}
        {/* <input type="file" /> */}
        <button
          onClick={handleGenerateJson}
          disabled={jsonLoading || !nonStructuredText}
          style={{
            padding: '10px 20px',
            backgroundColor: '#805ad5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            opacity: jsonLoading || !nonStructuredText ? 0.7 : 1,
          }}
        >
          {jsonLoading ? (language === 'zh' ? 'AI 整理中...' : 'AI Processing...') : (language === 'zh' ? '🚀 使用 AI 整理并生成 JSON' : '🚀 Use AI to Generate JSON')}
        </button>
      </div>

      {generatedJson && (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '20px', marginBottom: '30px' }}>
          <h4 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '15px' }}>
            {language === 'zh' ? '3. 预览并确认 JSON 数据' : '3. Preview and Confirm JSON Data'}
          </h4>
          <pre style={{
            backgroundColor: '#f7fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '15px',
            maxHeight: '400px',
            overflowY: 'auto',
            fontSize: '14px',
            color: '#4a5568',
            marginBottom: '15px'
          }}>
            <code>{generatedJson}</code>
          </pre>
          <button
            onClick={handleImportJson}
            disabled={jsonLoading || !generatedJson}
            style={{
              padding: '10px 20px',
              backgroundColor: '#48bb78',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              opacity: jsonLoading || !generatedJson ? 0.7 : 1,
            }}
          >
            {jsonLoading ? (language === 'zh' ? '导入中...' : 'Importing...') : (language === 'zh' ? '✅ 导入到知识库' : '✅ Import to Knowledge Base')}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#2d3748', marginBottom: '25px' }}>
        ⚙️ {language === 'zh' ? '集成与导入' : 'Integrations & Import'}
      </h2>
      
      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('googleSheets')}
          style={{
            padding: '10px 20px',
            border: 'none',
            backgroundColor: activeTab === 'googleSheets' ? 'white' : 'transparent',
            color: activeTab === 'googleSheets' ? '#2d3748' : '#718096',
            fontWeight: activeTab === 'googleSheets' ? '600' : 'normal',
            cursor: 'pointer',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            borderTop: activeTab === 'googleSheets' ? '1px solid #e2e8f0' : 'none',
            borderLeft: activeTab === 'googleSheets' ? '1px solid #e2e8f0' : 'none',
            borderRight: activeTab === 'googleSheets' ? '1px solid #e2e8f0' : 'none',
            borderBottom: activeTab === 'googleSheets' ? 'none' : '2px solid #e2e8f0',
            marginBottom: '-2px',
            zIndex: activeTab === 'googleSheets' ? 1 : 0,
          }}
        >
          {language === 'zh' ? 'Google Sheets 集成' : 'Google Sheets Integration'}
        </button>
        <button
          onClick={() => setActiveTab('aiJsonImport')}
          style={{
            padding: '10px 20px',
            border: 'none',
            backgroundColor: activeTab === 'aiJsonImport' ? 'white' : 'transparent',
            color: activeTab === 'aiJsonImport' ? '#2d3748' : '#718096',
            fontWeight: activeTab === 'aiJsonImport' ? '600' : 'normal',
            cursor: 'pointer',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            borderTop: activeTab === 'aiJsonImport' ? '1px solid #e2e8f0' : 'none',
            borderLeft: activeTab === 'aiJsonImport' ? '1px solid #e2e8f0' : 'none',
            borderRight: activeTab === 'aiJsonImport' ? '1px solid #e2e8f0' : 'none',
            borderBottom: activeTab === 'aiJsonImport' ? 'none' : '2px solid #e2e8f0',
            marginBottom: '-2px',
            zIndex: activeTab === 'aiJsonImport' ? 1 : 0,
          }}
        >
          {language === 'zh' ? 'AI / JSON 智能导入' : 'AI / JSON Smart Import'}
        </button>
      </div>

      <div>
        {activeTab === 'googleSheets' && renderGoogleSheetsIntegration()}
        {activeTab === 'aiJsonImport' && renderAIJsonImport()}
      </div>
    </div>
  )
}
