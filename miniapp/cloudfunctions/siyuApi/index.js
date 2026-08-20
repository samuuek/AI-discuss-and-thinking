const cloud = require('wx-server-sdk')
const fetch = require('node-fetch')
const { createProductionHandler } = require('./production.cjs')

const handle = createProductionHandler({ cloud, fetcher: fetch })

exports.main = event => handle(event)
