const sequelize = require('../src/config/db')
const Token = require('../src/auth/Token')
const TokenService = require('../src/auth/TokenService')

beforeAll(async () => {
  await sequelize.sync()
})

beforeEach(async () => {
  await Token.destroy({ truncate: true })
})

describe('Scheduled Token Cleanup', () => {
  it('cleans expired tokens with scheduled task', async () => {
    jest.useFakeTimers()
    const token = 'test-token'
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await Token.create({ token, lastUsedAt: eightDaysAgo })
    TokenService.scheduleCleanup()
    jest.advanceTimersByTime(60 * 60 * 1000 + 500)
    const tokenInDb = await Token.findOne({ where: { token } })
    expect(tokenInDb).toBeNull()
  })
})
