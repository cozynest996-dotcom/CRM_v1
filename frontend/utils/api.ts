const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
}

async function request(endpoint: string, options: RequestOptions = {}) {
  const { skipAuth = false, ...fetchOptions } = options
  
  // 添加认证头
  if (!skipAuth) {
    const token = localStorage.getItem('auth_token')
    console.log('API Request - Token from localStorage:', token); // 添加日志
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Authorization': `Bearer ${token}`
      }
    }
  }

  // 添加默认headers
  fetchOptions.headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...fetchOptions.headers
  }
  
  // 确保 CORS 模式
  fetchOptions.mode = 'cors'
  fetchOptions.credentials = 'include'

  console.log(`发送请求到: ${API_BASE}${endpoint}`, fetchOptions); // 打印请求详情
  
  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
  
  fetchOptions.signal = controller.signal;
  
  const response = await fetch(`${API_BASE}${endpoint}`, fetchOptions);
  clearTimeout(timeoutId);
  
  console.log(`收到响应:`, response.status, response.statusText);
  
  if (!response.ok) {
    // 尝试读取响应体（优先 JSON）以便前端能显示详细错误信息
    const contentType = response.headers.get('content-type') || '';
    let errorBody: any = null;
    try {
      if (contentType.includes('application/json')) {
        errorBody = await response.json();
      } else {
        errorBody = await response.text();
      }
    } catch (e) {
      try {
        errorBody = await response.text();
      } catch (e2) {
        errorBody = null;
      }
    }

    if (response.status === 401) {
      // Token过期或无效，清除token并重定向到登录页
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
      const err = new Error('Unauthorized') as any
      err.status = response.status
      err.body = errorBody
      throw err
    }

    const err = new Error(`API request failed: ${response.status} ${response.statusText}`) as any
    err.status = response.status
    err.body = errorBody
    throw err
  }
  
  // 对于流式响应，直接返回response
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return response
  }

  return response.json()
}

export const api = {
  get: (endpoint: string, options: RequestOptions = {}) => 
    request(endpoint, { ...options, method: 'GET' }),
    
  post: (endpoint: string, data: any, options: RequestOptions = {}) =>
    request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }),
    
  put: (endpoint: string, data: any, options: RequestOptions = {}) =>
    request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    
  patch: (endpoint: string, data: any, options: RequestOptions = {}) =>
    request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    
  delete: (endpoint: string, options: RequestOptions = {}) =>
    request(endpoint, { ...options, method: 'DELETE' })
}

export default api
