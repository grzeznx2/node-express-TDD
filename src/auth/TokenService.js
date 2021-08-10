const jwt = require('jsonwebtoken')
const Sequelize = require('sequelize')
const { randomString } = require('../shared/generator')
const Token = require('./Token')

const createToken = async user => {
  const token = randomString(32)
  await Token.create({ token, userId: user.id, lastUsedAt: new Date() })
  return token
}

const verify = async token => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const tokenInDb = await Token.findOne({ where: { token, lastUsedAt: { [Sequelize.Op.gt]: oneWeekAgo } } })
  tokenInDb.lastUsedAt = new Date()
  await tokenInDb.save()
  const userId = tokenInDb.userId
  return { id: userId }
}

const deleteToken = async token => {
  await Token.destroy({ where: { token } })
}

const scheduleCleanup = () => {
  setInterval(async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    await Token.destroy({ where: { lastUsedAt: { [Sequelize.Op.lt]: oneWeekAgo } } })
  }, 60 * 60 * 1000)
}

const clearTokens = async userId => {
  await Token.destroy({ where: { userId } })
}

module.exports = {
  createToken,
  verify,
  deleteToken,
  scheduleCleanup,
  clearTokens,
}
