import type { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { getRuntimeConfig } from './config/runtime'
import './app.scss'

const { cloudEnvId } = getRuntimeConfig({
  TARO_APP_CLOUD_ENV_ID: process.env.TARO_APP_CLOUD_ENV_ID,
})

Taro.cloud.init({
  ...(cloudEnvId ? { env: cloudEnvId } : {}),
  traceUser: true,
})

export default function App({ children }: PropsWithChildren) {
  return children
}
