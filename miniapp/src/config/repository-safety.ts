export function findSensitiveText(value:string){
  const findings:string[]=[]
  if(/postgres(?:ql)?:\/\//i.test(value))findings.push('数据库连接串')
  if(/DATABASE_URL\s*=\s*\S+/i.test(value))findings.push('数据库环境变量')
  if(/SIYU_PRIVATE_ACCESS_TOKEN\s*=\s*\S+/i.test(value))findings.push('私人访问口令')
  if(/Authorization\s*:\s*['"]Bearer\s+[A-Za-z0-9_-]{16,}/i.test(value))findings.push('硬编码访问头')
  return findings
}
