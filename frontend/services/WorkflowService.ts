import api from '../utils/api'
import { WhatsAppMessage } from './MessageEventService'

export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

export interface WorkflowNode {
  id: string
  type: string
  description?: string
  config?: any
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  is_active: boolean  // 注意：后端使用 is_active 而不是 active
  created_at?: string
  updated_at?: string
  user_id?: number
}

class WorkflowService {
  private static instance: WorkflowService
  private activeWorkflows: Map<string, Workflow> = new Map()
  private workflowExecutions: Map<string, any> = new Map()

  private constructor() {}

  public static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService()
    }
    return WorkflowService.instance
  }

  public async saveWorkflow(workflow: Workflow): Promise<string> {
    try {
      const response = await api.post('/api/workflows', workflow)
      const savedWorkflow = response.data
      if (workflow.is_active) {
        this.activeWorkflows.set(savedWorkflow.id, savedWorkflow)
      }
      return savedWorkflow.id
    } catch (error) {
      console.error('Failed to save workflow:', error)
      throw error
    }
  }

  public async executeWorkflow(workflowId: string, trigger: WhatsAppMessage) {
    try {
      const execution = {
        workflowId,
        trigger,
        startTime: new Date().toISOString(),
        context: {
          trigger: {
            type: 'message',
            channel: 'whatsapp',
            phone: trigger.phone,
            message: trigger.message
          }
        }
      }

      this.workflowExecutions.set(execution.workflowId, execution)

      // 调用后端API执行工作流
      const response = await api.post(`/api/workflows/${workflowId}/execute`, {
        trigger: execution.context.trigger
      })

      return response.data
    } catch (error) {
      console.error('Failed to execute workflow:', error)
      throw error
    }
  }

  public async getWorkflows(): Promise<Workflow[]> {
    try {
      const response = await api.get('/api/workflows')
      return response.data
    } catch (error) {
      console.error('Failed to get workflows:', error)
      throw error
    }
  }

  public async activateWorkflow(workflowId: string): Promise<void> {
    try {
      await api.post(`/api/workflows/${workflowId}/activate`, {})
      const workflow = await this.getWorkflowById(workflowId)
      if (workflow) {
        workflow.is_active = true
        this.activeWorkflows.set(workflowId, workflow)
      }
    } catch (error) {
      console.error('Failed to activate workflow:', error)
      throw error
    }
  }

  public async deactivateWorkflow(workflowId: string): Promise<void> {
    try {
      await api.post(`/api/workflows/${workflowId}/deactivate`, {})
      this.activeWorkflows.delete(workflowId)
    } catch (error) {
      console.error('Failed to deactivate workflow:', error)
      throw error
    }
  }

  public async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    try {
      const response = await api.get(`/api/workflows/${workflowId}`)
      return response.data
    } catch (error) {
      console.error('Failed to get workflow:', error)
      return null
    }
  }

  public getActiveWorkflows(): Workflow[] {
    return Array.from(this.activeWorkflows.values())
  }

  public getRecentExecutions(limit: number = 10): any[] {
    return Array.from(this.workflowExecutions.values())
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit)
  }
}

export default WorkflowService
