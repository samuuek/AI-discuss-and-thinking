import Taro from '@tarojs/taro'
import { createApiClient } from './client-core'
import { createCloudTransport } from './cloud-transport'

export { createApiClient } from './client-core'

const transport = createCloudTransport(
  options => Taro.cloud.callFunction(options as never) as unknown as Promise<{ result?: unknown }>,
)

export const api = createApiClient(transport)
