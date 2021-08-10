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

const login = async (credentials, options = {}) => {
  return await request(app).post('/api/1.0/auth').set(options).send(credentials)
}

const logout = (options = {}) => {
  const agent = request(app).post('/api/1.0/logout').send()
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`)
  }
  return agent.send()
}

describe('Authentication', () => {
  it('returns 200 when credentials are correct', async () => {
    await addUser()
    const { email, password } = validUser
    const res = await login({ email, password })
    expect(res.status).toBe(200)
  })
  it('returns only user id, username, image and token when credentials are correct', async () => {
    const { id, username } = await addUser()
    const { email, password } = validUser
    const res = await login({ email, password })

    expect(res.body.username).toBe(username)
    expect(res.body.id).toBe(id)
    expect(Object.keys(res.body)).toEqual(['id', 'username', 'token', 'image'])
  })
  it('returns 401 when user does not exist', async () => {
    const { email, password } = validUser
    const res = await login({ email, password })
    expect(res.status).toBe(401)
  })
  it('returns proper error body when authentication fails', async () => {
    const currentTime = new Date().getTime()
    const { email, password } = validUser
    const res = await login({ email, password })

    expect(res.body.path).toBe('/api/1.0/auth')
    expect(res.body.timestamp).toBeGreaterThan(currentTime)
    expect(Object.keys(res.body)).toEqual(['path', 'timestamp', 'message'])
  })

  it.each`
    language | message
    ${'pl'}  | ${pl.authentication_failure}
    ${'en'}  | ${en.authentication_failure}
  `('returns $message when authentication fails and language is set as $language', async ({ language, message }) => {
    const { email, password } = validUser
    const res = await login({ email, password }, { 'Accept-Language': language })
    expect(res.body.message).toBe(message)
  })

  it('returns 401 when password is wrong', async () => {
    const { email } = await addUser()
    const res = await login({ email, password: 'incorrect' })
    expect(res.status).toBe(401)
  })
  it('returns 403 when user is inactive', async () => {
    const { email } = await addUser({ ...validUser, inactive: true })
    const res = await login({ email, password: validUser.password })
    expect(res.status).toBe(403)
  })
  it('returns proper error body when inactive user is logging', async () => {
    const currentTime = new Date().getTime()
    await addUser({ ...validUser, inactive: true })
    const { email, password } = validUser
    const res = await login({ email, password })

    expect(res.body.path).toBe('/api/1.0/auth')
    expect(res.body.timestamp).toBeGreaterThan(currentTime)
    expect(Object.keys(res.body)).toEqual(['path', 'timestamp', 'message'])
  })
  it.each`
    language | message
    ${'pl'}  | ${pl.inactive_authentication_failure}
    ${'en'}  | ${en.inactive_authentication_failure}
  `('returns $message when authentication fails for inactive account and language is set as $language', async ({ language, message }) => {
    await addUser({ ...validUser, inactive: true })
    const { email, password } = validUser
    const res = await login({ email, password }, { 'Accept-Language': language })
    expect(res.body.message).toBe(message)
  })

  it('returns 401 when e-mail is not valid', async () => {
    const response = await login({ password })
    expect(response.status).toBe(401)
  })
  it('returns 401 when password is not valid', async () => {
    const response = await login({ email })
    expect(response.status).toBe(401)
  })
  it('returns token in response body when credentials are correct', async () => {
    await addUser()
    const response = await login({ email, password })
    expect(response.body.token).not.toBeUndefined()
  })
})

describe('Logout', () => {
  it('returns 200 when unauthorized request send for logout', async () => {
    const res = await logout()
    expect(res.status).toBe(200)
  })
  it('removes token from DB after logout', async () => {
    await addUser()
    const response = await login({ email, password })
    const token = response.body.token
    await logout({ token })
    const storedToken = await Token.findOne({ where: { token } })
    expect(storedToken).toBeNull()
  })
})

describe('Token Expiration', () => {
  const defaultUpdate = { body: null, id: 5, options: {} }

  const updateUser = ({ body, id, options } = defaultUpdate) => {
    let agent = request(app)

    agent = request(app).put(`/api/1.0/users/${id}`)
    if (options.token) {
      agent.set('Authorization', `Bearer ${options.token}`)
    }

    return agent.send(body)
  }

  it('returns 403 when token is older than 1 week', async () => {
    const { id } = await addUser()

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1)

    const testToken = await Token.create({ token: 'test-token', userId: id, lastUsedAt: oneWeekAgo })
    const res = await updateUser({ body: { username: 'grzes' }, id, options: { token: testToken.token } })
    expect(res.status).toBe(403)
  })
  it('refreshes lastUsedAt when unexpired token is used', async () => {
    const { id } = await addUser()

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)

    const testToken = await Token.create({ token: 'test-token', userId: id, lastUsedAt: fourDaysAgo })
    const rightBeforeSendingRequest = new Date()
    await updateUser({ body: { username: 'grzes' }, id, options: { token: testToken.token } })
    const tokenInDB = await Token.findOne({ where: { token: testToken.token } })
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(rightBeforeSendingRequest.getTime())
  })

  it('refreshes lastUsedAt when unexpired token is used for unautehenticated endpoint', async () => {
    const { id } = await addUser()

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)

    const testToken = await Token.create({ token: 'test-token', userId: id, lastUsedAt: fourDaysAgo })
    const rightBeforeSendingRequest = new Date()
    await request(app).get('/api/1.0/users/5').set('Authorization', `Bearer ${testToken.token}`)
    const tokenInDB = await Token.findOne({ where: { token: testToken.token } })
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(rightBeforeSendingRequest.getTime())
  })
})
