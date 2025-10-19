// 格式化时间工具函数 - 使用用戶本地時區
export function formatMessageTime(timestamp: string | Date) {
  // Accept Date or ISO string. Normalize fractional seconds to milliseconds if needed.
  let date: Date
  if (timestamp instanceof Date) {
    date = timestamp
  } else {
    let s = String(timestamp || '')
    // strip timezone Z and normalize fractional seconds to 3 digits
    // handle forms like 2025-09-30T16:21:04.994657Z or without Z
    const tzIndex = s.indexOf('Z')
    const hasTZ = tzIndex !== -1
    if (hasTZ) s = s.slice(0, tzIndex)
    const dotIndex = s.indexOf('.')
    if (dotIndex !== -1) {
      const frac = s.slice(dotIndex + 1)
      // remove any non-digit at end
      const fracDigits = frac.replace(/[^0-9].*$/, '')
      if (fracDigits.length > 3) {
        const truncated = fracDigits.slice(0, 3)
        s = s.slice(0, dotIndex + 1) + truncated
      }
    }
    // reattach Z if originally present
    if (hasTZ) s = s + 'Z'
    date = new Date(s)
  }
  // 使用用戶設備的本地時區
  return date.toLocaleTimeString('zh-TW', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}

export function formatMessageDate(timestamp: string) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // 判断是否是今天（使用本地時區）
  if (date.toDateString() === today.toDateString()) {
    return '今天'
  }
  
  // 判断是否是昨天
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }

  // 一周内显示星期几
  if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekdays[date.getDay()]
  }

  // 其他显示具体日期（使用本地時區）
  return date.toLocaleDateString('zh-TW', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}

// 判断两条消息是否需要显示日期分隔
export function shouldShowDateSeparator(curr: string, prev: string | null) {
  if (!prev) return true
  const currDate = new Date(curr)
  const prevDate = new Date(prev)
  return currDate.toDateString() !== prevDate.toDateString()
}

// 格式化相對時間（用於 Dashboard）
export function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp)
  const now = new Date()
  const timeDiff = now.getTime() - date.getTime()
  
  const seconds = Math.floor(timeDiff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) {
    return `${days}天前`
  } else if (hours > 0) {
    return `${hours}小時前`
  } else if (minutes > 0) {
    return `${minutes}分鐘前`
  } else {
    return '剛剛'
  }
}

// 格式化完整時間（用於日誌詳情）
export function formatFullDateTime(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}

// 格式化客户列表时间显示（类似WhatsApp）
export function formatCustomerListTime(timestamp: string | null) {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  // 今天：显示时间
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-TW', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  }
  
  // 昨天：显示"昨天"
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }
  
  // 一周内：显示星期几
  const daysDiff = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
  if (daysDiff < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weekdays[date.getDay()]
  }
  
  // 超过一周：显示日期
  return date.toLocaleDateString('zh-TW', { 
    month: 'numeric', 
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}
