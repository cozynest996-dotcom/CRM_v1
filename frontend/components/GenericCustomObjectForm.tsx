import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

interface CustomField {
  id: number
  name: string
  fieldKey: string
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'textarea' | 'image_url' | 'reference'
  isRequired: boolean
  options?: string[]
  referenceEntityTypeId?: number // For 'reference' type fields
}

interface CustomEntityRecord {
  id?: number // Optional for new records
  entityTypeId: number // Make entityTypeId required
  data: { [key: string]: any; }
}

interface GenericCustomObjectFormProps {
  entityTypeId: number
  fields: CustomField[]
  initialData?: CustomEntityRecord // Optional, for editing existing records
  onSave: (data: CustomEntityRecord) => void
  onCancel: () => void
  allEntityTypes: any[]; // 新增：传递所有实体类型，用于引用字段的选择
}

export default function GenericCustomObjectForm({
  entityTypeId,
  fields,
  initialData,
  onSave,
  onCancel,
  allEntityTypes // 接收所有实体类型
}: GenericCustomObjectFormProps) {
  const { t, language } = useLanguage()
  const [formData, setFormData] = useState<{ [key: string]: any }>(initialData?.data || {})
  const [errors, setErrors] = useState<{[key: string]: string}>({})

  useEffect(() => {
    // Initialize form data with default values or empty if not provided
    const initialForm: { [key: string]: any } = {}
    fields.forEach(field => {
      if (initialData?.data && initialData.data[field.fieldKey] !== undefined) {
        initialForm[field.fieldKey] = initialData.data[field.fieldKey]
      } else if (field.fieldType === 'boolean') {
        initialForm[field.fieldKey] = false
      } else if (field.fieldType === 'multiselect') {
        initialForm[field.fieldKey] = []
      } else if (field.fieldType === 'number') {
        initialForm[field.fieldKey] = null
      } else {
        initialForm[field.fieldKey] = ''
      }
    })
    setFormData(initialForm)
  }, [entityTypeId, fields, initialData])

  const handleChange = (fieldKey: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }))
    // Clear error for this field when it changes
    setErrors((prev) => { delete prev[fieldKey]; return { ...prev }})
  }

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {}
    fields.forEach(field => {
      if (field.isRequired && (formData[field.fieldKey] === undefined || formData[field.fieldKey] === null || formData[field.fieldKey] === '' || (Array.isArray(formData[field.fieldKey]) && formData[field.fieldKey].length === 0))) {
        newErrors[field.fieldKey] = language === 'zh' ? `${field.name} 是必填项` : `${field.name} is required.`
      }
      // Add more specific validation if needed (e.g., number type, date format)
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      onSave({
        entityTypeId: entityTypeId,
        data: formData,
        ...(initialData && { id: initialData.id }) // Include ID if editing
      })
    }
  }

  const renderFieldInput = (field: CustomField) => {
    const value = formData[field.fieldKey]
    switch (field.fieldType) {
      case 'text':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
        )
      case 'number':
        return (
          <input
            type="number"
            value={value === null ? '' : value}
            onChange={(e) => handleChange(field.fieldKey, e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
        )
      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
        )
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => handleChange(field.fieldKey, e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
        )
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            rows={4}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          ></textarea>
        )
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          >
            <option value="">{language === 'zh' ? '请选择' : 'Select...'}</option>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )
      case 'multiselect':
        return (
          <select
            multiple
            value={value || []}
            onChange={(e) => {
              const selectedOptions = Array.from(e.target.selectedOptions, (option) => option.value)
              handleChange(field.fieldKey, selectedOptions)
            }}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '100px' }}
          >
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )
      case 'image_url':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            placeholder="http://example.com/image.jpg"
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
        )
      case 'reference':
        const referencedEntityType = allEntityTypes.find(et => et.id === field.referenceEntityTypeId);
        if (!referencedEntityType) {
          return <p style={{ color: '#e53e3e' }}>{language === 'zh' ? '引用的实体类型未找到' : 'Referenced entity type not found'}</p>;
        }
        return (
          <select
            value={value === null ? '' : value}
            onChange={(e) => handleChange(field.fieldKey, e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          >
            <option value="">{language === 'zh' ? `请选择 ${referencedEntityType.name}` : `Select ${referencedEntityType.name}...`}</option>
            {/* Assuming we need to fetch records for the referenced entity type. This is a simplification. */}
            {/* In a real app, you'd fetch records for referencedEntityType.id from the backend. */}
            {/* For now, we'll assume `allEntityTypes` might contain a `records` property or similar. */}
            {/* Or, you'd pass a separate prop `referencedEntityRecords` to this component. */}
            {/* For the current context, we'll leave it as a placeholder and assume records are passed or fetched higher up. */}
            {/* If `allEntityTypes` had records, it would look like this: */}
            {/* {referencedEntityType.records?.map((record: any) => (
              <option key={record.id} value={record.id}>{record.data?.name || record.id}</option>
            ))}*/}
            {/* For now, a simple placeholder or a more complex fetch might be needed. */}
          </select>
        );
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
            disabled // Unknown field type, disable input
          />
        )
    }
  }

  return (
    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '600px', margin: '30px auto' }}>
      <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>
        {initialData ? (language === 'zh' ? '编辑记录' : 'Edit Record') : (language === 'zh' ? '新增记录' : 'Add New Record')}
      </h3>
      <form onSubmit={handleSubmit}>
        {fields.map((field) => (
          <div key={field.id} style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              {field.name}{field.isRequired && <span style={{ color: '#e53e3e' }}>*</span>}
            </label>
            {renderFieldInput(field)}
            {errors[field.fieldKey] && (
              <p style={{ color: '#e53e3e', fontSize: '12px', marginTop: '5px' }}>
                {errors[field.fieldKey]}
              </p>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '10px 20px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            type="submit"
            style={{ padding: '10px 20px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
