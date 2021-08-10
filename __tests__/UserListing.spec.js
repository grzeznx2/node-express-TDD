const request = require('supertest')
const bcrypt = require('bcrypt')
const sequelize = require('../src/config/db')
const app = require('../src/app')
const User = require('../src/user/User')

const en = require('../locales/en/translation.json')
const pl = require('../locales/pl/translation.json')

beforeAll(async () => {
  await sequelize.sync()
})

beforeEach(async () => {
  return User.destroy({ truncate: { cascade: true } })
})

const auth = async (options = {}) => {
  let agent = request(app)
  let token

  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth)
    token = response.body.token
  }

  return token
}

const getUsers = (options = {}) => {
  const agent = request(app).get('/api/1.0/users')
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`)
  }

  return agent
}

const addUsers = async (activeUsersCount, inactiveUsersCount = 0) => {
  const hash = await bcrypt.hash('P4ssword', 10)
  for (let i = 0; i < activeUsersCount + inactiveUsersCount; i++) {
    await User.create({ username: `user${i + 1}`, email: `user${i + 1}@mail.com`, inactive: i >= activeUsersCount, password: hash })
  }
}

describe('User listing', () => {
  it('returns 200 when there are no users in database', async () => {
    const res = await getUsers()
    expect(res.status).toBe(200)
  })
  it('returns page object as response body', async () => {
    const res = await getUsers()
    expect(res.body).toEqual({
      content: [],
      page: 0,
      size: 10,
      totalPages: 0,
    })
  })
  it('returns 10 users in page content when there are 11 users in DB', async () => {
    await addUsers(11)

    const res = await getUsers()

    expect(res.body.content.length).toBe(10)
  })
  it('returns 6 users in page content when there are 6 active and 5 inactive users in DB', async () => {
    await addUsers(6, 5)

    const res = await getUsers()

    expect(res.body.content.length).toBe(6)
  })
  it('returns only id, username, email and image for each user', async () => {
    await addUsers(11)

    const res = await getUsers()

    const user = res.body.content[0]

    expect(Object.keys(user)).toEqual(['id', 'username', 'email', 'image'])
  })
  it('returns 2 as totalPages when there are 15 active and 7 inactive users', async () => {
    await addUsers(15, 7)

    const res = await getUsers()

    expect(res.body.totalPages).toBe(2)
  })
  it('returns second page users and page indicator when page is set as 1 in request parameter', async () => {
    await addUsers(11)

    const res = await getUsers().query({ page: 1 })

    expect(res.body.page).toBe(1)
    expect(res.body.content[0].username).toBe('user11')
  })
  it('returns first page when page is set below zero', async () => {
    await addUsers(11)

    const res = await getUsers().query({ page: -1 })

    expect(res.body.page).toBe(0)
  })
  it('returns 5 users and corresponding size indicator when size is set as 5 in req.query', async () => {
    await addUsers(11)

    const res = await getUsers().query({ size: 5 })

    expect(res.body.content.length).toBe(5)
    expect(res.body.size).toBe(5)
  })
  it('returns 10 users and corresponding size indicator when size is set as 1000 in req.query', async () => {
    await addUsers(11)

    const res = await getUsers().query({ size: 1000 })

    expect(res.body.content.length).toBe(10)
    expect(res.body.size).toBe(10)
  })
  it('returns 10 users and corresponding size indicator when size is set as 0 in req.query', async () => {
    await addUsers(11)

    const res = await getUsers().query({ size: 0 })

    expect(res.body.content.length).toBe(10)
    expect(res.body.size).toBe(10)
  })
  it('returns page 0 and size as 10 when non-numeric query params are provided', async () => {
    await addUsers(11)

    const res = await getUsers().query({ size: 'size', page: 'page' })

    expect(res.body.page).toBe(0)
    expect(res.body.size).toBe(10)
  })

  it('returns user page without logged in user when request has valid authorization', async () => {
    await addUsers(11)
    const token = await auth({ auth: { email: 'user1@mail.com', password: 'P4ssword' } })

    const response = await getUsers({ token })
    expect(response.body.totalPages).toBe(1)
  })
})

describe('Get User', () => {
  const getUser = (id = 5) => {
    return request(app).get(`/api/1.0/users/${id}`)
  }

  it('returns 404 when user not found', async () => {
    const res = await getUser()
    expect(res.status).toBe(404)
  })

  it.each`
    language | message
    ${'pl'}  | ${pl.user_not_found}
    ${'en'}  | ${en.user_not_found}
  `('returns $message for unknown user when language is set to $language', async ({ message, language }) => {
    const res = await getUser().set({ 'Accept-language': language })
    expect(res.body.message).toBe(message)
  })

  it('returns proper error body when user not found', async () => {
    const currentTime = new Date().getTime()
    const res = await getUser()
    expect(Object.keys(res.body)).toEqual(['path', 'timestamp', 'message'])
    expect(res.body.path).toBe('/api/1.0/users/5')
    expect(res.body.timestamp).toBeGreaterThan(currentTime)
  })
  it('returns 200 when an active user exists', async () => {
    const user = await User.create({ username: 'user1', email: 'user1@mail.com', inactive: false })
    const res = await getUser(user.id)
    expect(res.status).toBe(200)
  })
  it('returns 404 when an user is inactive', async () => {
    const user = await User.create({ username: 'user1', email: 'user1@mail.com', inactive: true })
    const res = await getUser(user.id)
    expect(res.status).toBe(404)
  })
  it('returns id, username, email and image in response body when an active user exists', async () => {
    const user = await User.create({ username: 'user1', email: 'user1@mail.com', inactive: false })
    const res = await getUser(user.id)
    expect(Object.keys(res.body)).toEqual(['id', 'username', 'email', 'image'])
  })
})
