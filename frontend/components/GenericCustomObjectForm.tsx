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
  id?: string // Optional for new records
  [key: string]: any
}

interface GenericCustomObjectFormProps {
  entityTypeId: string
  fields: CustomField[]
  initialData?: CustomEntityRecord // Optional, for editing existing records
  onSave: (data: CustomEntityRecord) => void
  onCancel: () => void
  condoUnitOptions?: CustomEntityRecord[]; // 新增：用于房间类型，提供公寓单元选项
}

export default function GenericCustomObjectForm({
  entityTypeId,
  fields,
  initialData,
  onSave,
  onCancel,
  condoUnitOptions // 接收公寓单元选项
}: GenericCustomObjectFormProps) {
  const { t, language } = useLanguage()
  const [formData, setFormData] = useState<CustomEntityRecord>(initialData || {})
  const [errors, setErrors] = useState<{[key: string]: string}>({})

  useEffect(() => {
    // Initialize form data with default values or empty if not provided
    const initialForm: CustomEntityRecord = {}
    fields.forEach(field => {
      if (initialData && initialData[field.fieldKey] !== undefined) {
        initialForm[field.fieldKey] = initialData[field.fieldKey]
      } else if (field.fieldType === 'boolean') {
        initialForm[field.fieldKey] = false
      } else if (field.fieldType === 'multiselect') {
        initialForm[field.fieldKey] = []
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
      if (field.isRequired && (formData[field.fieldKey] === undefined || formData[field.fieldKey] === '' || (Array.isArray(formData[field.fieldKey]) && formData[field.fieldKey].length === 0))) {
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
      onSave(formData)
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
            value={value || ''}
            onChange={(e) => handleChange(field.fieldKey, e.target.value === '' ? '' : Number(e.target.value))}
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
        // 如果是房间的所属单元字段，则渲染公寓单元的选择器
        if (field.fieldKey === 'condo_unit_id' && entityTypeId === 'room' && condoUnitOptions) {
          return (
            <select
              value={value || ''}
              onChange={(e) => handleChange(field.fieldKey, e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
            >
              <option value="">{language === 'zh' ? '请选择公寓单元' : 'Select Condo Unit...'}</option>
              {condoUnitOptions.map(unit => (
                <option key={unit.id} value={unit.id}> {unit.unit_number} ({unit.address}) </option>
              ))}
            </select>
          );
        }
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
