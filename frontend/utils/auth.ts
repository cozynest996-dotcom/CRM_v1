export const getAuthToken = (): string | null => {
  const keys = ['auth_token', 'token', 'jwt_token'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      // 有些地方把整个对象 JSON.stringify(...) 存进去，尝试解析并取 access_token/sub 等
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.access_token || parsed.token || parsed.auth_token || parsed.jwt_token)) {
        return parsed.access_token || parsed.token || parsed.auth_token || parsed.jwt_token;
      }
    } catch {
      // 不是 JSON，直接返回原始字符串
      return raw;
    }
  }
  console.warn('JWT token not found in localStorage. Checked keys:', keys);
  return null;
};
