import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import GenericCustomObjectList from './GenericCustomObjectList' // 导入记录列表组件
import GenericCustomObjectForm from './GenericCustomObjectForm' // 导入表单组件
// import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'; // 移除 EmojiPicker 导入

interface CustomField {
  id: string
  name: string // Display name, e.g., "价格"
  fieldKey: string // Unique key for data storage, e.g., "price"
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'textarea' | 'image_url'
  isRequired: boolean
  options?: string[] // For select/multiselect
}

interface CustomEntityType {
  id: string
  name: string // Display name, e.g., "房源"
  description?: string
  icon?: string // Optional icon for UI
  fields: CustomField[]
}

// 定义内部视图类型
type InnerView = 'manageRecords' | 'addRecord' | 'editRecord'

// 模拟的自定义对象记录数据
interface CustomEntityRecord {
  id: string;
  entityTypeId: string;
  [key: string]: any; // Allow arbitrary fields
}

export default function CustomEntityConfigurationPage() {
  const { t, language } = useLanguage()
  const [entityTypes, setEntityTypes] = useState<CustomEntityType[]>([])
  const [activeEntityType, setActiveEntityType] = useState<CustomEntityType | null>(null)
  const [showAddEntityTypeModal, setShowAddEntityTypeModal] = useState(false)
  const [newEntityTypeName, setNewEntityTypeName] = useState('')
  const [newEntityTypeIcon, setNewEntityTypeIcon] = useState('')

  const [showAddFieldModal, setShowAddFieldModal] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomField['fieldType']>('text')
  const [newFieldIsRequired, setNewFieldIsRequired] = useState(false)
  const [newFieldOptions, setNewFieldOptions] = useState('') // Comma separated for select types

  // 新增字段编辑状态
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [showEditFieldModal, setShowEditFieldModal] = useState(false);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldType, setEditFieldType] = useState<CustomField['fieldType']>('text');
  const [editFieldIsRequired, setEditFieldIsRequired] = useState(false);
  const [editFieldOptions, setEditFieldOptions] = useState('');

  // 新增字段删除状态
  const [deletingField, setDeletingField] = useState<CustomField | null>(null);
  const [showDeleteFieldModal, setShowDeleteFieldModal] = useState(false);
  const [deleteFieldConfirmationText, setDeleteFieldConfirmationText] = useState('');

  const [currentInnerView, setCurrentInnerView] = useState<InnerView>('manageRecords') // 将默认视图设置为管理记录
  const [editingRecord, setEditingRecord] = useState<any | null>(null) // 用于编辑记录时存储当前记录数据

  // 新增实体类型编辑状态
  const [editingEntityType, setEditingEntityType] = useState<CustomEntityType | null>(null)
  const [showEditEntityTypeModal, setShowEditEntityTypeModal] = useState(false)
  const [editEntityTypeName, setEditEntityTypeName] = useState('')
  const [editEntityTypeIcon, setEditEntityTypeIcon] = useState('')
  const [editEntityTypeDescription, setEditEntityTypeDescription] = useState('')

  // 新增实体类型删除状态
  const [deletingEntityType, setDeletingEntityType] = useState<CustomEntityType | null>(null)
  const [showDeleteEntityTypeModal, setShowDeleteEntityTypeModal] = useState(false)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')

  // 模拟的记录数据 (现在从后端获取)
  const [records, setRecords] = useState<CustomEntityRecord[]>([])
  const [selectedCondoUnitId, setSelectedCondoUnitId] = useState<string | null>(null); // 用于房间筛选

  // 新增状态用于搜索和排序
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByField, setSortByField] = useState<string>(''); // 存储字段的fieldKey
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 'asc' 为升序，'desc' 为降序

  const API_BASE_URL = 'http://localhost:8000/api' // 后端API的基础URL

  // JWT Token (需要从认证系统获取)
  const getAuthToken = () => {
    // 这是一个占位符，实际应用中你需要从 localStorage 或认证 context 中获取 JWT token
    return localStorage.getItem('auth_token') || 'your-super-secret-jwt-key-change-in-production' // [[memory:9377830]]
  }

  // Effect to fetch entity types on component mount
  useEffect(() => {
    const fetchEntityTypes = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-types/`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
        })
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data: CustomEntityType[] = await response.json()
        setEntityTypes(data)
        if (!activeEntityType && data.length > 0) {
          setActiveEntityType(data[0])
        }
      } catch (error) {
        console.error("Error fetching entity types:", error)
      }
    }
    fetchEntityTypes()
  }, [])

  // Effect to fetch records when activeEntityType changes
  const fetchRecords = async () => {
    if (!activeEntityType) {
      setRecords([])
      return
    }

    try {
      const params = new URLSearchParams({
        entity_type_id: activeEntityType.id,
        ...(selectedCondoUnitId && { filter_by_parent_record_id: selectedCondoUnitId }),
        ...(selectedCondoUnitId && { filter_by_parent_field_key: 'condo_unit_id' }), // Assuming 'condo_unit_id' is the field key for the reference
        ...(searchQuery && { search_query: searchQuery }),
        ...(sortByField && { sort_by: sortByField }),
        ...(sortByField && { sort_order: sortOrder }),
      }).toString()
      
      const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: CustomEntityRecord[] = await response.json()
      // 将 record.data 从 JSON 字符串解析为对象
      const parsedData = data.map(record => ({
        ...record,
        data: typeof record.data === 'string' ? JSON.parse(record.data) : record.data
      }));
      setRecords(parsedData)
    } catch (error) {
      console.error("Error fetching records:", error)
      setRecords([])
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [activeEntityType, selectedCondoUnitId, searchQuery, sortByField, sortOrder])

  // 处理新增记录的导航
  const handleNavigateToAddRecord = () => {
    setCurrentInnerView('addRecord')
    setEditingRecord(null)
  }

  // 处理编辑记录的导航
  const handleNavigateToEditRecord = (record: any) => {
    setCurrentInnerView('editRecord')
    setEditingRecord(record)
  }

  // 处理保存记录
  const handleSaveRecord = async (data: any) => {
    if (!activeEntityType) return // Should not happen if UI is correct
    
    try {
      let response
      if (editingRecord) {
        // 更新现有记录
        response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/${editingRecord.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({ data: data }),
        })
      } else {
        // 新增记录
        response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({ entity_type_id: activeEntityType.id, data: data }),
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const savedRecord: CustomEntityRecord = await response.json()
      // Refetch records to update the list, including the new/updated record
      // This is simpler than local state manipulation for now
      // The useEffect for records will be triggered by activeEntityType change (if any) or manually
      // For now, a full re-fetch is acceptable
      // (Ideally, a more optimized approach would update local state or only fetch the affected record)
      fetchRecords(); // 调用 fetchRecords 来更新数据

      setCurrentInnerView('manageRecords')
      setEditingRecord(null)
      alert(language === 'zh' ? `记录${editingRecord ? '更新' : '添加'}成功！` : `Record ${editingRecord ? 'updated' : 'added'} successfully!`)
    } catch (error: any) {
      console.error("Error saving record:", error)
      alert(language === 'zh' ? `保存记录失败: ${error.message}` : `Failed to save record: ${error.message}`)
    }
  }

  // 处理内联编辑更新
  const handleUpdateRecord = async (recordId: string, fieldKey: string, value: any) => {
    if (!activeEntityType) return
    console.log("Attempting to update record:", recordId, "Field Key:", fieldKey, "Value:", value); // 添加这一行
    try {
      // Find the record to update its data field
      const recordToUpdate = records.find(r => r.id === recordId)
      if (!recordToUpdate) throw new Error("Record not found for update.")

      const updatedData = { ...recordToUpdate.data, [fieldKey]: value }
      
      const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ data: updatedData }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const updatedRecord: CustomEntityRecord = await response.json()
      setRecords(prev => prev.map(record => 
        record.id === recordId ? { ...record, data: updatedRecord.data } : record
      ))
      // Optionally re-fetch for complete consistency
      // fetchRecords();
    } catch (error: any) {
      console.error("Error updating record:", error)
      alert(language === 'zh' ? `更新记录失败: ${error.message}` : `Failed to update record: ${error.message}`)
    }
  }

  // 处理删除记录
  const handleDeleteRecord = async (recordId: string) => {
    if (!activeEntityType) return
    if (confirm(language === 'zh' ? `确定要删除此记录吗？` : `Are you sure you want to delete this record?`)) {
      try {
        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/${recordId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
        }

        setRecords(prev => prev.filter(record => record.id !== recordId))
        alert(language === 'zh' ? '记录删除成功！' : 'Record deleted successfully!')
      } catch (error: any) {
        console.error("Error deleting record:", error)
        alert(language === 'zh' ? `删除记录失败: ${error.message}` : `Failed to delete record: ${error.message}`)
      }
    }
  }

  // 处理快速添加记录
  const handleQuickAddRecord = async (data: { [key: string]: any }) => {
    if (!activeEntityType) return
    try {
      const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-records/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ entity_type_id: activeEntityType.id, data: data }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const newRecord: CustomEntityRecord = await response.json()
      // Refetch records to update the list, including the new record
      fetchRecords(); // 调用 fetchRecords 来更新数据
    } catch (error: any) {
      console.error("Error quick adding record:", error)
    }
  }

  const handleAddField = async () => {
    if (activeEntityType && newFieldName.trim()) {
      try {
        const payload = {
          entity_type_id: activeEntityType.id,
          name: newFieldName.trim(),
          field_key: newFieldName.toLowerCase().replace(/\s/g, '_'),
          field_type: newFieldType,
          is_required: newFieldIsRequired,
          options: (newFieldType === 'select' || newFieldType === 'multiselect') ? newFieldOptions.split(',').map(opt => opt.trim()) : undefined,
          // reference_entity_type_id will be handled if fieldType is 'reference' in the future
        }

        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-fields/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
        }

        const newField: CustomField = await response.json()
        // Update activeEntityType's fields locally (optimistic update or re-fetch entity types)
        setActiveEntityType((prev) =>
          prev ? { ...prev, fields: [...prev.fields, newField] } : null
        )
        setNewFieldName('')
        setNewFieldType('text')
        setNewFieldIsRequired(false)
        setNewFieldOptions('')
        setShowAddFieldModal(false)
        alert(language === 'zh' ? `字段 ${newField.name} 添加成功！` : `Field ${newField.name} added successfully!`)
      } catch (error: any) {
        console.error("Error adding field:", error)
        alert(language === 'zh' ? `添加字段失败: ${error.message}` : `Failed to add field: ${error.message}`)
      }
    } else {
      alert(language === 'zh' ? '字段名称不能为空' : 'Field name cannot be empty')
    }
  }

  // 处理编辑字段
  const handleEditField = async () => {
    if (!activeEntityType || !editingField || !editFieldName.trim()) {
      alert(language === 'zh' ? '字段名称不能为空' : 'Field name cannot be empty');
      return;
    }

    try {
      const payload = {
        name: editFieldName.trim(),
        field_key: editFieldName.toLowerCase().replace(/\s/g, '_'), // Preserve existing fieldKey if possible, or generate new one based on name
        field_type: editFieldType,
        is_required: editFieldIsRequired,
        options: (editFieldType === 'select' || editFieldType === 'multiselect') ? editFieldOptions.split(',').map(opt => opt.trim()) : undefined,
      };

      const response = await fetch(`${API_BASE_URL}/custom-objects/custom-fields/${editingField.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const updatedField: CustomField = await response.json();
      setActiveEntityType((prev) =>
        prev ? { ...prev, fields: prev.fields.map(f => f.id === updatedField.id ? updatedField : f) } : null
      );
      setShowEditFieldModal(false);
      setEditingField(null);
      alert(language === 'zh' ? `字段 ${updatedField.name} 更新成功！` : `Field ${updatedField.name} updated successfully!`);
    } catch (error: any) {
      console.error("Error updating field:", error);
      alert(language === 'zh' ? `更新字段失败: ${error.message}` : `Failed to update field: ${error.message}`);
    }
  };

  // 处理删除字段
  const handleDeleteField = async () => {
    if (!activeEntityType || !deletingField || deleteFieldConfirmationText !== deletingField.name) {
      alert(language === 'zh' ? '确认文本不匹配或字段无效。' : 'Confirmation text mismatch or invalid field.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/custom-objects/custom-fields/${deletingField.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      setActiveEntityType((prev) =>
        prev ? { ...prev, fields: prev.fields.filter(f => f.id !== deletingField.id) } : null
      );
      setShowDeleteFieldModal(false);
      setDeletingField(null);
      setDeleteFieldConfirmationText('');
      alert(language === 'zh' ? `字段 ${deletingField.name} 已删除！` : `Field ${deletingField.name} deleted!`);
    } catch (error: any) {
      console.error("Error deleting field:", error);
      alert(language === 'zh' ? `删除字段失败: ${error.message}` : `Failed to delete field: ${error.message}`);
    }
  };

  // 处理取消表单
  const handleCancelForm = () => {
    setCurrentInnerView('manageRecords') // 取消后返回记录列表
    setEditingRecord(null)
  }

  const handleAddEntityType = async () => {
    if (newEntityTypeName.trim()) {
      try {
        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-types/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
        name: newEntityTypeName.trim(),
        icon: newEntityTypeIcon || '✨',
            fields: [], // New entity type starts with no fields
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
        }

        const newEntityType: CustomEntityType = await response.json()
      setEntityTypes((prev) => [...prev, newEntityType])
      setActiveEntityType(newEntityType)
      setNewEntityTypeName('')
      setNewEntityTypeIcon('')
      setShowAddEntityTypeModal(false)
        setCurrentInnerView('manageRecords')
        alert(language === 'zh' ? `实体类型 ${newEntityType.name} 添加成功！` : `Entity type ${newEntityType.name} added successfully!`)
      } catch (error: any) {
        console.error("Error adding entity type:", error)
        alert(language === 'zh' ? `添加实体类型失败: ${error.message}` : `Failed to add entity type: ${error.message}`)
      }
    } else {
      alert(language === 'zh' ? '实体类型名称不能为空' : 'Entity type name cannot be empty')
    }
  }

  // Effect to initialize edit form when editingEntityType changes
  useEffect(() => {
    if (editingEntityType) {
      setEditEntityTypeName(editingEntityType.name)
      setEditEntityTypeIcon(editingEntityType.icon || '')
      setEditEntityTypeDescription(editingEntityType.description || '')
    }
  }, [editingEntityType])

  const handleEditEntityType = async () => {
    if (editingEntityType && editEntityTypeName.trim()) {
      try {
        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-types/${editingEntityType.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
        name: editEntityTypeName.trim(),
            icon: editEntityTypeIcon || '✨',
        description: editEntityTypeDescription || '',
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
        }

        const updatedEntityType: CustomEntityType = await response.json()
      setEntityTypes((prev) =>
        prev.map((entity) =>
          entity.id === updatedEntityType.id ? updatedEntityType : entity
        )
      )
      setActiveEntityType(updatedEntityType) // 如果当前编辑的是活跃实体类型，则更新活跃实体类型
      setShowEditEntityTypeModal(false)
      setEditingEntityType(null)
        alert(language === 'zh' ? `实体类型 ${updatedEntityType.name} 更新成功！` : `Entity type ${updatedEntityType.name} updated successfully!`)
      } catch (error: any) {
        console.error("Error updating entity type:", error)
        alert(language === 'zh' ? `更新实体类型失败: ${error.message}` : `Failed to update entity type: ${error.message}`)
      }
    } else if (editingEntityType) {
      alert(language === 'zh' ? '实体类型名称不能为空' : 'Entity type name cannot be empty')
    }
  }

  const handleDeleteEntityType = async () => {
    if (deletingEntityType && deleteConfirmationText === deletingEntityType.name) {
      try {
        const response = await fetch(`${API_BASE_URL}/custom-objects/custom-entity-types/${deletingEntityType.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
        }

        setEntityTypes((prev) => prev.filter((entity) => entity.id !== deletingEntityType.id))
        setActiveEntityType(null)
        setShowDeleteEntityTypeModal(false)
        setDeletingEntityType(null)
        setDeleteConfirmationText('')
        alert(language === 'zh' ? `实体类型 ${deletingEntityType.name} 已删除！` : `Entity type ${deletingEntityType.name} deleted!`)
      } catch (error: any) {
        console.error("Error deleting entity type:", error)
        alert(language === 'zh' ? `删除实体类型失败: ${error.message}` : `Failed to delete entity type: ${error.message}`)
      }
    }
  }

  const renderRightContent = () => {
    if (!activeEntityType) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
          <h3 style={{ fontSize: '24px', marginBottom: '15px' }}>
            {language === 'zh' ? '欢迎使用自定义对象管理！' : 'Welcome to Custom Object Management!'}
          </h3>
          <p style={{ marginBottom: '20px' }}>
            {language === 'zh' ? '自定义对象让您可以根据业务需求创建和管理任何类型的数据。' : 'Custom objects allow you to create and manage any type of data based on your business needs.'}
          </p>
          <p style={{ marginBottom: '30px' }}>
            {language === 'zh' ? '请在左侧选择一个实体类型，或者点击 ' : 'Please select an entity type on the left, or click '} 
            <strong style={{ color: '#4299e1' }}>{language === 'zh' ? '新增实体类型' : 'Add Entity Type'}</strong> 
            {language === 'zh' ? ' 来创建您的第一个自定义数据结构。' : ' to create your first custom data structure.'}
          </p>

          {/* Placeholder table structure */}
          <div style={{ 
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            padding: '15px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            maxWidth: '800px',
            margin: '0 auto',
            opacity: 0.7, /* 模糊效果 */
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e0' }}>
                  <th style={{ padding: '10px', textAlign: 'left', color: '#a0aec0' }}>#</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: '#a0aec0' }}>{language === 'zh' ? '占位符字段 A' : 'Placeholder Field A'}</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: '#a0aec0' }}>{language === 'zh' ? '占位符字段 B' : 'Placeholder Field B'}</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: '#a0aec0' }}>{language === 'zh' ? '占位符字段 C' : 'Placeholder Field C'}</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: '#a0aec0' }}>{language === 'zh' ? '操作' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((rowNum) => (
                  <tr key={rowNum} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{rowNum}</td>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{language === 'zh' ? '示例文本数据' : 'Sample Text Data'}</td>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{language === 'zh' ? '示例数字' : 'Sample Number'} {rowNum * 100}</td>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{language === 'zh' ? (rowNum % 2 === 0 ? '是' : '否') : (rowNum % 2 === 0 ? 'Yes' : 'No')}</td>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    const filteredRecords = records.filter(record => {
      if (record.entityTypeId !== activeEntityType.id) return false;
      if (activeEntityType.id === 'room' && selectedCondoUnitId) {
        return record.condo_unit_id === selectedCondoUnitId;
      }
      // 全局搜索过滤
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        return Object.values(record).some(value => 
          String(value).toLowerCase().includes(searchLower)
        );
      }
      return true;
    }).sort((a, b) => {
      if (!sortByField) return 0;

      const fieldA = a[sortByField];
      const fieldB = b[sortByField];

      if (fieldA === undefined || fieldB === undefined) return 0; // 如果字段不存在，则不排序

      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        return sortOrder === 'asc' ? fieldA.localeCompare(fieldB) : fieldB.localeCompare(fieldA);
      } else if (typeof fieldA === 'number' && typeof fieldB === 'number') {
        return sortOrder === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      }
      return 0;
    });

    const allCondoUnitRecords = records.filter(r => r.entityTypeId === 'condoUnit');

    // 获取CondoUnit的选项，用于Room的筛选器
    const condoUnitOptions = activeEntityType.id === 'room' 
      ? allCondoUnitRecords
      : [];

    switch (currentInnerView) {
      case 'manageRecords':
        return (
          <>
            {activeEntityType.id === 'room' && (
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="condoUnitFilter" style={{ display: 'block', marginBottom: '5px' }}>
                  {language === 'zh' ? '筛选所属公寓单元' : 'Filter by Condo Unit'}
                </label>
                <select
                  id="condoUnitFilter"
                  value={selectedCondoUnitId || ''}
                  onChange={(e) => setSelectedCondoUnitId(e.target.value || null)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                >
                  <option value="">{language === 'zh' ? '所有公寓单元' : 'All Condo Units'}</option>
                  {records.filter(r => r.entityTypeId === 'condoUnit').map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_number} ({unit.address})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* 全局搜索和排序UI */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                placeholder={language === 'zh' ? '搜索记录...' : 'Search records...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flexGrow: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
              <select
                value={sortByField}
                onChange={(e) => setSortByField(e.target.value)}
                style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              >
                <option value="">{language === 'zh' ? '不排序' : 'No Sort'}</option>
                {activeEntityType.fields.map(field => (
                  <option key={field.fieldKey} value={field.fieldKey}>
                    {field.name}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              >
                <option value="asc">{language === 'zh' ? '升序' : 'Ascending'}</option>
                <option value="desc">{language === 'zh' ? '降序' : 'Descending'}</option>
              </select>
            </div>
            <GenericCustomObjectList 
              entityTypeId={activeEntityType.id} 
              fields={activeEntityType.fields} 
              records={filteredRecords} // 传入筛选后的记录
              onAddRecord={handleNavigateToAddRecord} // 传递新增回调
              onEditRecord={handleNavigateToEditRecord} // 传递编辑回调
              condoUnitRecords={allCondoUnitRecords} // 传递所有公寓单元记录
              onUpdateRecord={handleUpdateRecord} // 传递内联编辑回调
              onDeleteRecord={handleDeleteRecord} // 传递删除记录回调
              onQuickAddRecord={handleQuickAddRecord} // 传递快速添加回调
              onAddField={() => setShowAddFieldModal(true)} // 传递添加字段回调
              onEditField={(field) => {
                setEditingField(field);
                setEditFieldName(field.name);
                setEditFieldType(field.fieldType);
                setEditFieldIsRequired(field.isRequired);
                setEditFieldOptions(field.options ? field.options.join(', ') : '');
                setShowEditFieldModal(true);
              }} // 传递编辑字段回调
              onDeleteField={(field) => {
                setDeletingField(field);
                setShowDeleteFieldModal(true);
              }} // 传递删除字段回调
            />
          </>
        )
      case 'addRecord':
        return (
          <GenericCustomObjectForm
            entityTypeId={activeEntityType.id}
            fields={activeEntityType.fields}
            onSave={handleSaveRecord}
            onCancel={handleCancelForm}
            condoUnitOptions={condoUnitOptions} // 传递公寓单元选项给表单
          />
        )
      case 'editRecord':
        return (
          <GenericCustomObjectForm
            entityTypeId={activeEntityType.id}
            fields={activeEntityType.fields}
            initialData={editingRecord}
            onSave={handleSaveRecord}
            onCancel={handleCancelForm}
            condoUnitOptions={condoUnitOptions} // 传递公寓单元选项给表单
          />
        )
      default:
        return <p>{language === 'zh' ? '未知视图' : 'Unknown view'}</p>
    }
  }

  return (
    <div style={{ padding: '0' }}>
      <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#2d3748', marginBottom: '15px' }}>
        🧱 {language === 'zh' ? '自定义对象管理' : 'Custom Objects Management'}
      </h2>

      <div style={{ display: 'flex', gap: '15px', height: 'calc(100% - 70px)' }}>
        {/* 左侧：实体类型列表 */}
        <div style={{ width: '200px', flexShrink: 0, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '15px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '18px', color: '#2d3748', marginBottom: '10px' }}>
            {language === 'zh' ? '实体类型' : 'Entity Types'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
            {entityTypes.map((entityType) => (
              <div
                key={entityType.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 15px',
                  borderRadius: '6px',
                  backgroundColor: activeEntityType?.id === entityType.id ? '#ebf8ff' : 'transparent',
                  color: activeEntityType?.id === entityType.id ? '#2b6cb0' : '#4a5568',
                  fontWeight: activeEntityType?.id === entityType.id ? '600' : 'normal',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: activeEntityType?.id === entityType.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
                onClick={() => {
                    setActiveEntityType(entityType)
                    setCurrentInnerView('manageRecords') // 切换实体类型时默认显示记录管理
                }}
              >
                <span style={{ fontSize: '18px' }}>{entityType.icon}</span>
                <span style={{ flexGrow: 1 }}>{entityType.name}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // 阻止事件冒泡到父div
                            setEditingEntityType(entityType);
                            setShowEditEntityTypeModal(true);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#63b3ed',
                            fontSize: '14px',
                            padding: '5px',
                        }}
                        title={language === 'zh' ? '编辑实体类型' : 'Edit Entity Type'}
                    > ✏️ </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // 阻止事件冒泡到父div
                            setDeletingEntityType(entityType);
                            setShowDeleteEntityTypeModal(true);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#fc8181',
                            fontSize: '14px',
                            padding: '5px',
                        }}
                        title={language === 'zh' ? '删除实体类型' : 'Delete Entity Type'}
                    > 🗑️ </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAddEntityTypeModal(true)}
            style={{
              width: '100%',
              padding: '10px 15px',
              backgroundColor: '#4299e1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            + {language === 'zh' ? '新增实体类型' : 'Add Entity Type'}
          </button>
        </div>

        {/* 右侧：主内容区 */}
        <div style={{ flex: 1, minWidth: '0', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '15px', overflowY: 'auto' }}>
          {activeEntityType && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <button
                onClick={() => {
                  setCurrentInnerView('manageRecords');
                  setSelectedCondoUnitId(null); // 切换视图时清空筛选
                }}
                style={{
                  padding: '8px 15px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: currentInnerView === 'manageRecords' ? '#ebf8ff' : 'transparent',
                  color: currentInnerView === 'manageRecords' ? '#2b6cb0' : '#4a5568',
                  fontWeight: currentInnerView === 'manageRecords' ? '600' : 'normal',
                }}
              >
                📋 {language === 'zh' ? '管理记录' : 'Manage Records'}
              </button>
            </div>
          )}
          {renderRightContent()}
        </div>
      </div>

      {/* 新增实体类型 Modal */}
      {showAddEntityTypeModal && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
              {language === 'zh' ? '新增实体类型' : 'Add New Entity Type'}
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="newEntityTypeName" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '实体类型名称' : 'Entity Type Name'}
              </label>
              <input
                type="text"
                id="newEntityTypeName"
                value={newEntityTypeName}
                onChange={(e) => setNewEntityTypeName(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="newEntityTypeIcon" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '图标 (Emoji)' : 'Icon (Emoji)'}
              </label>
              {/* 恢复为文本输入，移除表情符号选择器按钮和组件 */}
              <input
                type="text"
                id="newEntityTypeIcon"
                value={newEntityTypeIcon}
                onChange={(e) => setNewEntityTypeIcon(e.target.value)}
                placeholder="✨"
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowAddEntityTypeModal(false)}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleAddEntityType}
                style={{ padding: '8px 15px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '新增' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑实体类型 Modal */}
      {showEditEntityTypeModal && editingEntityType && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
              {language === 'zh' ? `编辑实体类型: ${editingEntityType.name}` : `Edit Entity Type: ${editingEntityType.name}`}
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="editEntityTypeName" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '实体类型名称' : 'Entity Type Name'}
              </label>
              <input
                type="text"
                id="editEntityTypeName"
                value={editEntityTypeName}
                onChange={(e) => setEditEntityTypeName(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="editEntityTypeIcon" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '图标 (Emoji)' : 'Icon (Emoji)'}
              </label>
              {/* 恢复为文本输入，移除表情符号选择器按钮和组件 */}
              <input
                type="text"
                id="editEntityTypeIcon"
                value={editEntityTypeIcon}
                onChange={(e) => setEditEntityTypeIcon(e.target.value)}
                placeholder="✨"
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="editEntityTypeDescription" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '描述' : 'Description'}
              </label>
              <textarea
                id="editEntityTypeDescription"
                value={editEntityTypeDescription}
                onChange={(e) => setEditEntityTypeDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              ></textarea>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowEditEntityTypeModal(false);
                  setEditingEntityType(null);
                }}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleEditEntityType}
                style={{ padding: '8px 15px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除实体类型 Modal */}
      {showDeleteEntityTypeModal && deletingEntityType && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px', color: '#e53e3e' }}>
              {language === 'zh' ? `删除实体类型: ${deletingEntityType.name}` : `Delete Entity Type: ${deletingEntityType.name}`}
            </h3>
            <p style={{ marginBottom: '15px' }}>
              {language === 'zh' ? '输入 ' : 'Type '}<strong style={{ color: '#e53e3e' }}>{deletingEntityType.name}</strong>{language === 'zh' ? ' 以确认删除。' : ' to confirm deletion.'}
            </p>
            <input
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #fc8181', borderRadius: '4px', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteEntityTypeModal(false);
                  setDeletingEntityType(null);
                  setDeleteConfirmationText('');
                }}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteEntityType} // 调用新的 handleDeleteEntityType 函数
                disabled={deleteConfirmationText !== deletingEntityType.name}
                style={{
                  padding: '8px 15px', 
                  backgroundColor: deleteConfirmationText === deletingEntityType.name ? '#e53e3e' : '#cbd5e0', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: deleteConfirmationText === deletingEntityType.name ? 'pointer' : 'not-allowed'
                }}
              >
                {language === 'zh' ? '确认删除' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增字段 Modal */}
      {showAddFieldModal && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
              {language === 'zh' ? '为' : 'Add Field to'} {activeEntityType?.name}
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="newFieldName" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '字段名称' : 'Field Name'}
              </label>
              <input
                type="text"
                id="newFieldName"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="newFieldType" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '字段类型' : 'Field Type'}
              </label>
              <select
                id="newFieldType"
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as CustomField['fieldType'])}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              >
                <option value="text">{language === 'zh' ? '文本' : 'Text'}</option>
                <option value="number">{language === 'zh' ? '数字' : 'Number'}</option>
                <option value="date">{language === 'zh' ? '日期' : 'Date'}</option>
                <option value="boolean">{language === 'zh' ? '布尔值 (是/否)' : 'Boolean (Yes/No)'}</option>
                <option value="textarea">{language === 'zh' ? '多行文本' : 'Text Area'}</option>
                <option value="select">{language === 'zh' ? '单选下拉列表' : 'Select (Single)'}</option>
                <option value="multiselect">{language === 'zh' ? '多选下拉列表' : 'Multi-Select'}</option>
                <option value="image_url">{language === 'zh' ? '图片 URL' : 'Image URL'}</option>
              </select>
            </div>
            {(newFieldType === 'select' || newFieldType === 'multiselect') && (
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="newFieldOptions" style={{ display: 'block', marginBottom: '5px' }}>
                  {language === 'zh' ? '选项 (逗号分隔)' : 'Options (comma separated)'}
                </label>
                <input
                  type="text"
                  id="newFieldOptions"
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  placeholder="选项1,选项2,选项3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                />
              </div>
            )}
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="newFieldIsRequired"
                checked={newFieldIsRequired}
                onChange={(e) => setNewFieldIsRequired(e.target.checked)}
                style={{ marginRight: '10px' }}
              />
              <label htmlFor="newFieldIsRequired">{language === 'zh' ? '是否必填' : 'Is Required'}</label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowAddFieldModal(false)}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleAddField}
                style={{ padding: '8px 15px', backgroundColor: '#48bb78', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '新增' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑字段 Modal */}
      {showEditFieldModal && editingField && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
              {language === 'zh' ? '编辑字段' : 'Edit Field'}
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="editFieldName" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '字段名称' : 'Field Name'}
              </label>
              <input
                type="text"
                id="editFieldName"
                value={editFieldName}
                onChange={(e) => setEditFieldName(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="editFieldType" style={{ display: 'block', marginBottom: '5px' }}>
                {language === 'zh' ? '字段类型' : 'Field Type'}
              </label>
              <select
                id="editFieldType"
                value={editFieldType}
                onChange={(e) => setEditFieldType(e.target.value as CustomField['fieldType'])}
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              >
                <option value="text">{language === 'zh' ? '文本' : 'Text'}</option>
                <option value="number">{language === 'zh' ? '数字' : 'Number'}</option>
                <option value="date">{language === 'zh' ? '日期' : 'Date'}</option>
                <option value="boolean">{language === 'zh' ? '布尔值 (是/否)' : 'Boolean (Yes/No)'}</option>
                <option value="textarea">{language === 'zh' ? '多行文本' : 'Text Area'}</option>
                <option value="select">{language === 'zh' ? '单选下拉列表' : 'Select (Single)'}</option>
                <option value="multiselect">{language === 'zh' ? '多选下拉列表' : 'Multi-Select'}</option>
                <option value="image_url">{language === 'zh' ? '图片 URL' : 'Image URL'}</option>
              </select>
            </div>
            {(editFieldType === 'select' || editFieldType === 'multiselect') && (
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="editFieldOptions" style={{ display: 'block', marginBottom: '5px' }}>
                  {language === 'zh' ? '选项 (逗号分隔)' : 'Options (comma separated)'}
                </label>
              <input
                type="text"
                  id="editFieldOptions"
                  value={editFieldOptions}
                  onChange={(e) => setEditFieldOptions(e.target.value)}
                  placeholder="选项1,选项2,选项3"
                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
              />
            </div>
            )}
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="editFieldIsRequired"
                checked={editFieldIsRequired}
                onChange={(e) => setEditFieldIsRequired(e.target.checked)}
                style={{ marginRight: '10px' }}
              />
              <label htmlFor="editFieldIsRequired">{language === 'zh' ? '是否必填' : 'Is Required'}</label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowEditFieldModal(false);
                  setEditingField(null);
                }}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleEditField}
                style={{ padding: '8px 15px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除字段 Modal */}
      {showDeleteFieldModal && deletingField && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '400px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px', color: '#e53e3e' }}>
              {language === 'zh' ? `删除字段: ${deletingField.name}` : `Delete Field: ${deletingField.name}`}
            </h3>
            <p style={{ marginBottom: '15px' }}>
              {language === 'zh' ? '输入 ' : 'Type '}<strong style={{ color: '#e53e3e' }}>{deletingField.name}</strong>{language === 'zh' ? ' 以确认删除。' : ' to confirm deletion.'}
            </p>
            <input
              type="text"
              value={deleteFieldConfirmationText}
              onChange={(e) => setDeleteFieldConfirmationText(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #fc8181', borderRadius: '4px', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteFieldModal(false);
                  setDeletingField(null);
                  setDeleteFieldConfirmationText('');
                }}
                style={{ padding: '8px 15px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteField} // 调用新的 handleDeleteField 函数
                disabled={deleteFieldConfirmationText !== deletingField.name}
                style={{
                  padding: '8px 15px', 
                  backgroundColor: deleteFieldConfirmationText === deletingField.name ? '#e53e3e' : '#cbd5e0', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: deleteFieldConfirmationText === deletingField.name ? 'pointer' : 'not-allowed'
                }}
              >
                {language === 'zh' ? '确认删除' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}