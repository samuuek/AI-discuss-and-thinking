function createCloudRepository(database, { collectionName = 'siyu_state', now = () => new Date() } = {}) {
  if (!database || typeof database.collection !== 'function') throw new TypeError('缺少微信云数据库')
  const collection = database.collection(collectionName)

  async function read(id) {
    const result = await collection.doc(id).get()
    const value = Array.isArray(result?.data) ? result.data[0] : result?.data
    return value && Object.keys(value).length ? value : null
  }

  async function write(id, type, value) {
    await collection.doc(id).set({ data: { type, ...value } })
    return clone(value)
  }

  async function list(type) {
    const result = await collection.where({ type }).limit(1000).get()
    return (result?.data || []).map(stripMetadata)
  }

  return {
    async ensureOwner(openid) {
      if (typeof openid !== 'string' || !openid.trim()) throw new Error('无法识别当前微信账号')
      let owner = await read('owner')
      if (!owner) {
        try {
          await collection.add({
            data: {
              _id: 'owner',
              type: 'owner',
              openid: openid.trim(),
              createdAt: now().toISOString(),
            },
          })
          owner = await read('owner')
        } catch {
          owner = await read('owner')
        }
      }
      if (!owner || owner.openid !== openid.trim()) throw new Error('此微信账号无权访问思屿')
    },

    async listTopics() {
      return (await list('topic')).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    },

    async getTopic(id) {
      const value = await read(`topic-${id}`)
      return value?.type === 'topic' ? stripMetadata(value) : null
    },

    async putTopic(topic) {
      return write(`topic-${topic.id}`, 'topic', topic)
    },

    async getWorkspace(topicId) {
      const value = await read(`workspace-${topicId}`)
      if (value?.type !== 'workspace') return null
      const workspace = stripMetadata(value)
      workspace.messages = [...(workspace.messages || [])].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      return workspace
    },

    async putWorkspace(workspace) {
      return write(`workspace-${workspace.topicId}`, 'workspace', workspace)
    },

    async getWeekly() {
      const value = await read('weekly')
      return value?.type === 'weekly' ? stripMetadata(value) : null
    },

    async putWeekly(snapshot) {
      return write('weekly', 'weekly', snapshot)
    },
  }
}

function stripMetadata(value) {
  const { _id, type, ...data } = value
  return clone(data)
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

module.exports = { createCloudRepository }
