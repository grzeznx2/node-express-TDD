const request = require('supertest')
const bcrypt = require('bcrypt')
const sequelize = require('../src/config/db')
const app = require('../src/app')
const User = require('../src/user/User')

const en = require('../locales/en/translation.json')
const pl = require('../locales/pl/translation.json')
const Token = require('../src/auth/Token')

beforeAll(async () => {
  await sequelize.sync()
})

beforeEach(() => {
  return User.destroy({ truncate: { cascade: true } })
})

const validUser = {
  username: 'user1',
  email: 'user1@mail.com',
  password: 'P4ssword',
  inactive: false,
}

const { password, email } = validUser

const addUser = async (user = { ...validUser }) => {
  const hash = await bcrypt.hash(user.password, 10)
  user.password = hash
  return await User.create(user)
}

const auth = async (options = {}) => {
  let agent = request(app)
  let token

  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth)
    token = response.body.token
  }

  return token
}

const defaultDelete = { id: 5, options: {} }

const deleteUser = async ({ id, options } = defaultDelete) => {
  const agent = request(app).delete(`/api/1.0/users/${id}`)

  if (options.language) {
    agent.set('Accept-Language', options.language)
  }

  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`)
  }

  return agent.send()
}

describe('User Delete', () => {
  it('returns 403 status code if request sent unauthorized', async () => {
    const response = await deleteUser()
    expect(response.status).toBe(403)
  })

  it.each`
    language | message
    ${'en'}  | ${en.unauthorized_user_delete}
    ${'pl'}  | ${pl.unauthorized_user_delete}
  `('returns error body with $message when request is sent unauthorized and language is $language', async ({ language, message }) => {
    const currentTime = new Date().getTime()
    const response = await deleteUser({ ...defaultDelete, options: { language } })
    expect(response.body.path).toBe('/api/1.0/users/5')
    expect(response.body.timestamp).toBeGreaterThan(currentTime)
    expect(response.body.message).toBe(message)
  })

  it('returns 403 when credentials are correct but for different user', async () => {
    await addUser()
    const userToBeDeleted = await addUser({ ...validUser, username: 'user2', email: 'user2@mail.com' })
    const token = await auth({ auth: { email, password } })
    const res = await deleteUser({ id: userToBeDeleted.id, options: { token } })
    expect(res.status).toBe(403)
  })
  it('returns 403 when token is invalid', async () => {
    const res = await deleteUser({ ...defaultDelete, options: { token: '123' } })

    expect(res.status).toBe(403)
  })
  it('returns 200 when valid delete request sent from authorized user', async () => {
    const { id } = await addUser()
    const token = await auth({ auth: { email, password } })
    const res = await deleteUser({ id, options: { token } })
    expect(res.status).toBe(200)
  })
  it('deletes user when request sent from authorized user', async () => {
    const { id } = await addUser()
    const token = await auth({ auth: { email, password } })
    await deleteUser({ id, options: { token } })
    const user = await User.findOne({ where: { id } })
    expect(user).toBeNull()
  })
  it('deletes token when delete user request sent from authorized user', async () => {
    const { id } = await addUser()
    const token = await auth({ auth: { email, password } })
    await deleteUser({ id, options: { token } })
    const tokenInDB = await Token.findOne({ where: { token } })
    expect(tokenInDB).toBeNull()
  })
  it("deletes all user's token when delete user request sent from authorized user", async () => {
    const { id } = await addUser()
    const token1 = await auth({ auth: { email, password } })
    const token2 = await auth({ auth: { email, password } })
    await deleteUser({ id, options: { token: token1 } })
    const tokenInDB = await Token.findOne({ where: { token: token2 } })
    expect(tokenInDB).toBeNull()
  })
})
