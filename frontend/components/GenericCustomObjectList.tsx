import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface CustomField {
  id: string
  name: string
  fieldKey: string
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'textarea' | 'image_url'
  isRequired: boolean
  options?: string[]
}

interface CustomEntityRecord {
  id: string
  [key: string]: any // Dynamic fields based on CustomField definitions
}

interface GenericCustomObjectListProps {
  entityTypeId: string // The ID of the custom entity type to display
  fields: CustomField[] // The fields defined for this entity type
  records: CustomEntityRecord[]; // 新增：从父组件接收记录数据
  onAddRecord: () => void; // 新增：从父组件接收新增回调
  onEditRecord: (record: CustomEntityRecord) => void; // 新增：从父组件接收编辑回调
  condoUnitRecords?: CustomEntityRecord[]; // 新增：所有公寓单元记录，用于解析引用字段
  onUpdateRecord?: (recordId: string, fieldKey: string, value: any) => void; // 新增：内联编辑回调
  onDeleteRecord?: (recordId: string) => void; // 新增：删除记录回调
  onQuickAddRecord?: (data: { [key: string]: any }) => void; // 新增：快速添加记录回调
  onAddField: () => void; // 新增：添加字段回调
  onEditField: (field: CustomField) => void; // 新增：编辑字段回调
  onDeleteField: (field: CustomField) => void; // 新增：删除字段回调
}

export default function GenericCustomObjectList({ 
  entityTypeId, 
  fields, 
  records, 
  onAddRecord, 
  onEditRecord, 
  condoUnitRecords,
  onUpdateRecord,
  onDeleteRecord,
  onQuickAddRecord,
  onAddField,
  onEditField, // 解构新增的 prop
  onDeleteField // 解构新增的 prop
}: GenericCustomObjectListProps) {
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldKey: string } | null>(null)
  const [editValue, setEditValue] = useState<any>('')
  // Removed showQuickAdd state
  // Removed quickAddData state
  // Removed handleQuickAddSave function
  // Removed handleQuickAddCancel function

  // 移除模拟数据获取的 useEffect，现在记录从 prop 接收
  useEffect(() => {
    // 模拟加载状态，实际应用中这里会是API调用
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
    }, 200);
  }, [entityTypeId])

  // handleDeleteRecord 现在只用于模拟，实际应调用后端API
  const handleDeleteRecord = (recordId: string) => {
    if (confirm(language === 'zh' ? `确定要删除此记录吗？` : `Are you sure you want to delete this record?`)) {
      if (onDeleteRecord) {
        onDeleteRecord(recordId)
      }
      setMessage({ type: 'success', text: language === 'zh' ? '记录删除成功！' : 'Record deleted successfully!' })
    }
  }

  const handleCellEdit = (recordId: string, fieldKey: string, currentValue: any) => {
    setEditingCell({ recordId, fieldKey })
    setEditValue(currentValue || '')
  }

  const handleCellSave = () => {
    if (editingCell && onUpdateRecord) {
      onUpdateRecord(editingCell.recordId, editingCell.fieldKey, editValue)
      setMessage({ type: 'success', text: language === 'zh' ? '更新成功！' : 'Updated successfully!' })
    }
    setEditingCell(null)
    setEditValue('')
  }

  const handleCellCancel = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const renderCellContent = (record: CustomEntityRecord, field: CustomField) => {
    const isEditing = editingCell?.recordId === record.id && editingCell?.fieldKey === field.fieldKey
    const value = record.data[field.fieldKey]

    if (isEditing) {
      if (field.fieldType === 'boolean') {
        return (
          <select
            value={editValue ? 'true' : 'false'}
            onChange={(e) => setEditValue(e.target.value === 'true')}
            onBlur={handleCellSave} // Add onBlur for auto-save
            style={{ width: '100%', padding: '2px', border: '1px solid #4299e1', borderRadius: '3px' }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur(); // Trigger blur to save
              }
              if (e.key === 'Escape') handleCellCancel();
            }}
          >
            <option value="true">{language === 'zh' ? '是' : 'Yes'}</option>
            <option value="false">{language === 'zh' ? '否' : 'No'}</option>
          </select>
        )
      } else if (field.fieldType === 'select' && field.options) {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave} // Add onBlur for auto-save
            style={{ width: '100%', padding: '2px', border: '1px solid #4299e1', borderRadius: '3px' }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') handleCellCancel();
            }}
          >
            <option value="">{language === 'zh' ? '请选择' : 'Select'}</option>
            {field.options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )
      } else if (field.fieldKey === 'condo_unit_id' && condoUnitRecords) {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave} // Add onBlur for auto-save
            style={{ width: '100%', padding: '2px', border: '1px solid #4299e1', borderRadius: '3px' }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') handleCellCancel();
            }}
          >
            <option value="">{language === 'zh' ? '请选择公寓单元' : 'Select Condo Unit'}</option>
            {condoUnitRecords.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.unit_number} ({unit.address})
              </option>
            ))}
          </select>
        )
      } else {
        return (
          <input
            type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(field.fieldType === 'number' ? Number(e.target.value) : e.target.value)}
            onBlur={handleCellSave} // Add onBlur for auto-save
            style={{ width: '100%', padding: '2px 5px', border: '1px solid #4299e1', borderRadius: '3px' }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur(); // Trigger blur to save
              }
              if (e.key === 'Escape') handleCellCancel();
            }}
          />
        )
      }
    }

    // 显示模式
    let displayValue = value
    if (field.fieldType === 'boolean') {
      displayValue = value ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No')
    } else if (field.fieldKey === 'condo_unit_id' && condoUnitRecords) {
      const referencedUnit = condoUnitRecords.find(unit => unit.id === value)
      displayValue = referencedUnit ? `${referencedUnit.unit_number} (${referencedUnit.address})` : String(value || '')
    } else {
      displayValue = String(value || '')
    }

    return (
      <div
        onClick={() => handleCellEdit(record.id, field.fieldKey, value)}
        style={{
          padding: '8px',
          minHeight: '20px',
          cursor: 'pointer',
          borderRadius: '3px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f7fafc'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        title={language === 'zh' ? '点击编辑' : 'Click to edit'}
      >
        {displayValue}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
          📊 {language === 'zh' ? '数据表格' : 'Data Table'}
        </h3>
        <button
          onClick={onAddRecord}
          style={{
            padding: '10px 20px',
            backgroundColor: '#63b3ed',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          + {language === 'zh' ? '详细表单' : 'Detailed Form'}
        </button>
      </div>

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

      {loading ? (
        <p style={{ textAlign: 'center', color: '#718096' }}>{language === 'zh' ? '加载中...' : 'Loading records...'}</p>
      ) : (
        <div style={{ 
          overflowX: 'auto', 
          overflowY: 'auto', /* 新增：垂直滚动 */
          maxHeight: 'calc(100vh - 350px)', /* 新增：固定最大高度，根据实际UI调整 */
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '800px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ 
                  padding: '12px 15px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#2d3748',
                  borderRight: '1px solid #e2e8f0',
                  minWidth: '60px'
                }}>
                  #
                </th>
                {fields.map((field) => (
                  <th key={field.id} style={{ 
                    padding: '12px 15px', 
                    textAlign: 'left', 
                    fontWeight: '600', 
                    color: '#2d3748',
                    borderRight: '1px solid #e2e8f0',
                    minWidth: '120px'
                  }}>
                    {field.name}
                    {field.isRequired && <span style={{ color: '#e53e3e', marginLeft: '4px' }}>*</span>}
                    <div style={{ fontSize: '11px', color: '#718096', fontWeight: 'normal', marginTop: '2px' }}>
                      {field.fieldType}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditField(field);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#63b3ed',
                          fontSize: '12px',
                          padding: '2px',
                        }}
                        title={language === 'zh' ? '编辑字段' : 'Edit Field'}
                      > ✏️ </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteField(field);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#fc8181',
                          fontSize: '12px',
                          padding: '2px',
                        }}
                        title={language === 'zh' ? '删除字段' : 'Delete Field'}
                      > 🗑️ </button>
                    </div>
                  </th>
                ))}
                <th style={{ 
                  padding: '12px 15px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#2d3748',
                  minWidth: '100px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{language === 'zh' ? '操作' : 'Actions'}</span>
                    <button
                      onClick={onAddField}
                      style={{
                        background: 'none',
                        border: '1px dashed #a0aec0',
                        borderRadius: '4px',
                        color: '#4a5568',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '2px 6px',
                        lineHeight: '1',
                        height: '28px',
                        width: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={language === 'zh' ? '新增字段' : 'Add Field'}
                    >
                      +
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((record, index) => (
                  <tr key={record.id} style={{ 
                    borderBottom: '1px solid #e2e8f0'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f7fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={{ 
                      padding: '8px 15px', 
                      borderRight: '1px solid #e2e8f0',
                      color: '#718096',
                      fontSize: '14px'
                    }}>
                      {index + 1}
                    </td>
                    {fields.map((field) => (
                      <td key={field.id} style={{ 
                        padding: '0', 
                        borderRight: '1px solid #e2e8f0',
                        fontSize: '14px',
                        verticalAlign: 'top'
                      }}>
                        {renderCellContent(record, field)}
                      </td>
                    ))}
                    <td style={{ 
                      padding: '8px 15px', 
                      textAlign: 'center',
                      fontSize: '14px'
                    }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                          onClick={() => onEditRecord(record)}
                    style={{
                            padding: '4px 8px',
                      backgroundColor: '#63b3ed',
                      color: 'white',
                      border: 'none',
                            borderRadius: '4px',
                      cursor: 'pointer',
                            fontSize: '12px',
                    }}
                          title={language === 'zh' ? '编辑' : 'Edit'}
                  >
                          ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    style={{
                            padding: '4px 8px',
                            backgroundColor: '#fc8181',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                          title={language === 'zh' ? '删除' : 'Delete'}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={fields.length + 2} style={{ 
                    padding: '40px', 
                    textAlign: 'center', 
                    color: '#718096',
                    fontSize: '16px'
                  }}>
                    {(language === 'zh' ? '📝 暂无数据，在下方添加新行' : '📝 No data yet, add a new row below')}
                  </td>
                </tr>
              )}
              {/* 始终可见的“添加新行”触发按钮行，点击直接添加空行 */}
              <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{
                  padding: '8px 15px',
                  borderRight: '1px solid #e2e8f0',
                  textAlign: 'center',
                  backgroundColor: '#f7fafc',
                  minWidth: '60px' // Ensure the # column has enough space
                }}>
                  <button
                    onClick={() => onQuickAddRecord({})} // 直接调用 onQuickAddRecord 添加空对象
                    style={{
                      background: 'none',
                      border: '1px dashed #a0aec0',
                      borderRadius: '4px',
                      color: '#4a5568',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '2px 6px',
                      lineHeight: '1',
                      height: '28px',
                      width: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: 'auto', // 居中显示
                    }}
                    title={language === 'zh' ? '点击添加新行' : 'Click to add new row'}
                  >
                    +
                  </button>
                </td>
                {/* 为剩余的列渲染空的单元格，以保持表格结构 */}
                {fields.map((field) => (
                  <td key={`add-row-empty-${field.id}`} style={{
                    padding: '8px 15px',
                    borderRight: '1px solid #e2e8f0',
                    backgroundColor: '#f7fafc',
                    minWidth: '120px' // Match field column min-width
                  }}>
                    {/* Empty */}
                  </td>
                ))}
                <td style={{
                  padding: '8px 15px',
                  textAlign: 'center',
                  backgroundColor: '#f7fafc',
                  minWidth: '100px' // Match action column min-width
                }}>
                  {/* Empty */}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
