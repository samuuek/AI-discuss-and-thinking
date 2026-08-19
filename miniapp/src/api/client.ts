import Taro from '@tarojs/taro'
import { getRuntimeConfig } from '../config/runtime'
import { createApiClient, type RequestResult } from './client-core'

export { createApiClient } from './client-core'

const runtime = getRuntimeConfig()
export const api = createApiClient(
  { apiBaseUrl: runtime.apiBaseUrl, getAccessToken: () => String(Taro.getStorageSync('siyu-access-token') || '') },
  options => Taro.request(options as never) as unknown as Promise<RequestResult>,
)
