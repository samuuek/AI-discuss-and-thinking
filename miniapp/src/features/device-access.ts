export async function validateDeviceAccess(token: string, verify: (token: string) => Promise<boolean>) {
  const value = token.trim()
  if (!value) throw new Error('请输入私人访问口令')
  if (!await verify(value)) throw new Error('口令不正确，请重新输入')
  return value
}
