import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../components/Sidebar'
import WorkflowEditor from '../components/WorkflowEditor'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'

interface Workflow {
  id: number  // 改为 number 类型，匹配后端
  name: string
  description: string
  nodes: any[]
  edges: any[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function AutomationPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }
    if (user) {
      loadWorkflows()
    }
  }, [user, authLoading])

  const loadWorkflows = async () => {
    try {
      const response = await api.get('/api/workflows')
      console.log('Automation - 工作流 API 响应:', response)
      
      // 检查响应格式
      if (Array.isArray(response)) {
        setWorkflows(response)
      } else if (response.data && Array.isArray(response.data)) {
        setWorkflows(response.data)
      } else {
        console.warn('Automation - 未知的工作流响应格式:', response)
        setWorkflows([])
      }
    } catch (error) {
      console.error('Failed to load workflows:', error)
      setWorkflows([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateWorkflow = () => {
    setSelectedWorkflow(null)
    setShowWorkflowEditor(true)
  }

  const handleEditWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setShowWorkflowEditor(true)
  }

  const handleSaveWorkflow = async (workflowData: any) => {
    setSaving(true);
    try {
      console.log('Automation - 开始保存工作流:', workflowData);
      
      let response;
      if (selectedWorkflow) {
        // 更新现有工作流
        console.log('Automation - 更新现有工作流:', selectedWorkflow.id);
        response = await api.put(`/api/workflows/${selectedWorkflow.id}`, {
          ...workflowData,
          id: selectedWorkflow.id
        });
      } else {
        // 创建新工作流
        console.log('Automation - 创建新工作流');
        response = await api.post('/api/workflows', workflowData);
      }
      
      console.log('Automation - 保存响应:', response);
      
      // 显示成功提示
      alert('工作流保存成功！');
      
      // 重新加载工作流列表
      await loadWorkflows();
      
      // 关闭编辑器
      setShowWorkflowEditor(false);
      setSelectedWorkflow(null);
      
    } catch (error) {
      console.error('Automation - 保存工作流失败:', error);
      alert('保存失败，请重试：' + (error as any)?.message);
    } finally {
      setSaving(false);
    }
  }

  const handleDeleteWorkflow = async (workflowId: number) => {
    console.log('Automation - 尝试删除工作流:', workflowId);
    
    if (!confirm('确定要删除这个工作流吗？')) {
      console.log('Automation - 用户取消删除');
      return;
    }

    try {
      console.log('Automation - 开始删除工作流:', workflowId);
      
      // 尝试使用 DELETE 方法
      try {
        const response = await api.delete(`/api/workflows/${workflowId}`);
        console.log('Automation - 删除响应:', response);
        
        alert('工作流删除成功！');
        
        console.log('Automation - 重新加载工作流列表');
        await loadWorkflows();
        return;
      } catch (deleteError) {
        console.warn('DELETE 请求失败，尝试使用 PATCH 标记删除:', deleteError);
        
        // 备选方案：使用 PATCH 设置 deleted 标志
        const response = await api.patch(`/api/workflows/${workflowId}`, {
          is_deleted: true,
          is_active: false
        });
        console.log('Automation - 软删除响应:', response);
        
        alert('工作流删除成功！');
        
        console.log('Automation - 重新加载工作流列表');
        await loadWorkflows();
      }
      
    } catch (error) {
      console.error('Automation - 删除工作流失败:', error);
      alert('删除失败，请重试：' + (error as any)?.message);
    }
  }

  const handleToggleWorkflow = async (workflow: Workflow) => {
    try {
      console.log('Automation - 切换工作流状态:', workflow.id, '当前状态:', workflow.is_active);
      
      // 使用 PATCH 方法更新状态
      const newStatus = !workflow.is_active;
      await api.patch(`/api/workflows/${workflow.id}`, {
        is_active: newStatus
      });
      
      console.log('Automation - 状态切换成功，重新加载列表');
      await loadWorkflows();
      
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
      alert('切换状态失败，请重试：' + (error as any)?.message);
    }
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);
      
      // 确保导入数据是数组，即使只导入一个工作流也包装成数组
      const dataToSend = Array.isArray(importData) ? importData : [importData];

      const response = await api.post('/api/workflows/import', dataToSend);
      console.log('Automation - 导入工作流响应:', response);
      alert('工作流导入成功！');
      await loadWorkflows();
    } catch (error) {
      console.error('Automation - 导入工作流失败:', error);
      alert('导入失败，请重试：' + (error as any)?.message);
    }
  };

  const handleExportAllWorkflows = async () => {
    try {
      console.log('开始导出工作流...');
      
      // 使用原生 fetch 确保没有缓存问题
      const token = localStorage.getItem('auth_token');
      const response = await fetch('http://localhost:8000/api/workflows/export', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Automation - 导出工作流响应:', data);
      console.log('响应类型:', typeof data);
      console.log('响应是否为数组:', Array.isArray(data));
      
      if (!data) {
        throw new Error('服务器返回空响应');
      }
      
      // 将 JSON 数据转换为字符串，然后创建 Blob
      const jsonString = JSON.stringify(data, null, 2);
      console.log('JSON 字符串长度:', jsonString.length);
      console.log('JSON 字符串预览:', jsonString.substring(0, 200));
      
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'workflows.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      alert('工作流导出成功！');
    } catch (error) {
      console.error('Automation - 导出工作流失败:', error);
      alert('导出失败，请重试：' + (error as any)?.message);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f7fafc' }}>
      <Sidebar currentPage="/automation" />
      
      <div style={{ flex: 1, marginLeft: '70px', padding: '30px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* 标题 */}
          <div style={{ marginBottom: '30px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
              ⚡ 自动化工作流
            </h1>
            <p style={{ color: '#718096', marginTop: '8px', fontSize: '16px' }}>
              创建和管理自动化工作流
            </p>
          </div>

          {/* 工作流列表 */}
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#2d3748' }}>我的工作流</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                id="import-workflow-file"
                onChange={handleImportFileChange}
              />
              <button
                onClick={() => document.getElementById('import-workflow-file')?.click()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                📥 导入工作流
              </button>
              <button
                onClick={handleExportAllWorkflows}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                📤 导出所有工作流
              </button>
              <button
                onClick={handleCreateWorkflow}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4299e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                + 创建工作流
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
              加载中...
            </div>
          ) : !workflows || workflows.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              color: '#718096'
            }}>
              还没有创建工作流
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {workflows.map(workflow => (
                <div key={workflow.id} style={{
                  backgroundColor: 'white',
                  padding: '24px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                          {workflow.name}
                        </h3>
                        <span style={{
                          padding: '4px 12px',
                          backgroundColor: workflow.is_active ? '#c6f6d5' : '#fed7d7',
                          color: workflow.is_active ? '#2f855a' : '#c53030',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {workflow.is_active ? '运行中' : '已暂停'}
                        </span>
                      </div>
                      <p style={{ color: '#718096', marginBottom: '16px' }}>
                        {workflow.description || '无描述'}
                      </p>
                      <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#4a5568' }}>
                        <span>📅 创建于: {new Date(workflow.created_at).toLocaleDateString()}</span>
                        <span>🕒 更新于: {new Date(workflow.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEditWorkflow(workflow)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#f7fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggleWorkflow(workflow)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: workflow.is_active ? '#fed7d7' : '#c6f6d5',
                          color: workflow.is_active ? '#c53030' : '#2f855a',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        {workflow.is_active ? '暂停' : '启动'}
                      </button>
                      <button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#fff5f5',
                          color: '#c53030',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 工作流编辑器模态框 */}
      {showWorkflowEditor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '90vw',
            height: '90vh',
            backgroundColor: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            position: 'relative'
          }}>
            {saving && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001,
                fontSize: '18px',
                fontWeight: '500'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    display: 'inline-block',
                    width: '40px',
                    height: '40px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #007bff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '15px'
                  }}></div>
                  <div>正在保存工作流...</div>
                </div>
              </div>
            )}
            <WorkflowEditor
              workflow={selectedWorkflow}
              onSave={handleSaveWorkflow}
              onClose={() => {
                if (!saving) {
                  setShowWorkflowEditor(false)
                  setSelectedWorkflow(null)
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}