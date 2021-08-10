const request = require('supertest')
const bcrypt = require('bcrypt')
const fs = require('fs')
const path = require('path')
const config = require('config')
const sequelize = require('../src/config/db')
const app = require('../src/app')
const User = require('../src/user/User')

const en = require('../locales/en/translation.json')
const pl = require('../locales/pl/translation.json')

const { uploadDir, profileDir } = config
const profileDirectory = path.join('.', uploadDir, profileDir)

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

const defaultUpdate = { body: null, id: 5, options: {} }

const updateUser = async ({ body, id, options } = defaultUpdate) => {
  let agent = request(app)
  let token

  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth)
    token = response.body.token
  }

  agent = request(app).put(`/api/1.0/users/${id}`)
  if (options.language) {
    agent.set('Accept-Language', options.language)
  }

  if (token) {
    agent.set('Authorization', `Bearer ${token}`)
  }

  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`)
  }

  return await agent.send(body)
}

const readFileAsBase64 = (file = 'bild.png') => {
  const filePath = path.join('.', '__tests__', 'resources', file)
  return fs.readFileSync(filePath, { encoding: 'base64' })
}

describe('User Update', () => {
  it('returns 403 status code if request sent without basic authorization', async () => {
    const response = await updateUser()
    expect(response.status).toBe(403)
  })

  it.each`
    language | message
    ${'en'}  | ${en.unauthorized_user_update}
    ${'pl'}  | ${pl.unauthorized_user_update}
  `('returns error body with $message when request is sent without basic authorization and language is $language', async ({ language, message }) => {
    const currentTime = new Date().getTime()
    const response = await updateUser({ ...defaultUpdate, options: { language } })
    expect(response.body.path).toBe('/api/1.0/users/5')
    expect(response.body.timestamp).toBeGreaterThan(currentTime)
    expect(response.body.message).toBe(message)
  })

  it('returns 403 when request sent with incorrect email', async () => {
    await addUser()
    const res = await updateUser({ ...defaultUpdate, options: { auth: { email: 'incorrect@mail.com', password } } })
    expect(res.status).toBe(403)
  })
  it('returns 403 when request sent with incorrect password', async () => {
    await addUser()
    const res = await updateUser({ ...defaultUpdate, options: { auth: { email, password: 'incorrect' } } })
    expect(res.status).toBe(403)
  })
  it('returns 403 when credentials are correct but for different user', async () => {
    await addUser()
    const userToBeUpdated = await addUser({ ...validUser, username: 'user2', email: 'user2@mail.com' })
    const res = await updateUser({ ...defaultUpdate, id: userToBeUpdated.id, options: { auth: { email, password } } })
    expect(res.status).toBe(403)
  })
  it('returns 403 when credentials are correct but user is inactive', async () => {
    const { id } = await addUser({ ...validUser, inactive: true })
    const res = await updateUser({ ...defaultUpdate, id, options: { auth: { email, password } } })
    expect(res.status).toBe(403)
  })
  it('returns 200 when valid update request sent from authorized user', async () => {
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated' }
    const res = await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    expect(res.status).toBe(200)
  })
  it('updates username when valid update request sent from authorized user', async () => {
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated' }
    await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    const user = await User.findOne({ where: { id } })
    expect(user.username).toBe(validUpdate.username)
  })
  it('returns 403 when token is invalid', async () => {
    const res = await updateUser({ ...defaultUpdate, options: { token: '123' } })

    expect(res.status).toBe(403)
  })

  it('saves the user image when update contains image as base64', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'bild.png')
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' })
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated', image: fileInBase64 }
    await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    const user = await User.findOne({ where: { id } })
    expect(user.image).toBeTruthy()
  })

  it('returns success body having id, username, email and image', async () => {
    const fileInBase64 = readFileAsBase64()
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated', image: fileInBase64 }
    const res = await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })

    expect(Object.keys(res.body)).toEqual(['id', 'username', 'email', 'image'])
  })

  it('saves the user image to upload folder and stores filename in user when update has image', async () => {
    const fileInBase64 = readFileAsBase64()
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated', image: fileInBase64 }
    await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    const user = await User.findOne({ where: { id } })
    const profileImagePath = path.join(profileDirectory, user.image)
    expect(fs.existsSync(profileImagePath)).toBe(true)
  })
  it('removes old image after user upload the new one', async () => {
    const fileInBase64 = readFileAsBase64()
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated', image: fileInBase64 }
    const res = await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    const firstImage = res.body.image
    await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    const profileImagePath = path.join(profileDirectory, firstImage)
    expect(fs.existsSync(profileImagePath)).toBe(false)
  })

  it.each`
    language | value             | message
    ${'en'}  | ${null}           | ${en.username_null}
    ${'en'}  | ${'use'}          | ${en.username_size}
    ${'en'}  | ${'a'.repeat(33)} | ${en.username_size}
    ${'pl'}  | ${null}           | ${pl.username_null}
    ${'pl'}  | ${'use'}          | ${pl.username_size}
    ${'pl'}  | ${'a'.repeat(33)} | ${pl.username_size}
  `('returns bad request with $message when username is updated with $value and lang is $language', async ({ language, value, message }) => {
    const { id } = await addUser()
    const invalidUpdate = { username: value }
    const res = await updateUser({ id, body: invalidUpdate, options: { auth: { email, password }, language } })
    expect(res.status).toBe(400)
    expect(res.body.validationErrors.username).toBe(message)
  })

  it('returns 200 when image size is exactly 2 Mb', async () => {
    const testPng = readFileAsBase64()
    const pngByte = Buffer.from(testPng, 'base64').length
    const twoMb = 1024 * 1024 * 2
    const filling = 'a'.repeat(twoMb - pngByte)
    const fillBase64 = Buffer.from(filling).toString('base64')
    const { id } = await addUser()
    const validUpdate = { username: 'user2', image: testPng + fillBase64 }
    const res = await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })
    expect(res.status).toBe(200)
  })
  it('returns 400 when image size is more than 2 Mb', async () => {
    const fileWithSizeOver2Mb = 'a'.repeat(1024 * 1024 * 2) + 'a'
    const base64 = Buffer.from(fileWithSizeOver2Mb).toString('base64')
    const { id } = await addUser()
    const invalidUpdate = { username: 'user2', image: base64 }
    const res = await updateUser({ id, body: invalidUpdate, options: { auth: { email, password } } })
    expect(res.status).toBe(400)
  })
  it('keeps the old image if user updates only username', async () => {
    const fileInBase64 = readFileAsBase64()
    const { id } = await addUser()
    const validUpdate = { username: 'user1-updated', image: fileInBase64 }

    const res = await updateUser({ id, body: validUpdate, options: { auth: { email, password } } })

    const firstImage = res.body.image

    await updateUser({ id, body: { username: 'user1-updated2' }, options: { auth: { email, password } } })

    const profileImagePath = path.join(profileDirectory, firstImage)
    expect(fs.existsSync(profileImagePath)).toBe(true)

    const userInDb = await User.findOne({ where: { id } })
    expect(userInDb.image).toBe(firstImage)
  })

  it.each`
    language | message
    ${'en'}  | ${en.profile_image_size}
    ${'pl'}  | ${pl.profile_image_size}
  `('returns $message when file size exceeds 2 Mb and lang is $language', async ({ language, message }) => {
    const fileWithSizeOver2Mb = 'a'.repeat(1024 * 1024 * 2) + 'a'
    const base64 = Buffer.from(fileWithSizeOver2Mb).toString('base64')
    const { id } = await addUser()
    const invalidUpdate = { username: 'user2', image: base64 }
    const res = await updateUser({ id, body: invalidUpdate, options: { auth: { email, password }, language } })
    expect(res.body.validationErrors.image).toBe(message)
  })

  it.each`
    file          | status
    ${'bild.gif'} | ${400}
    ${'bild.png'} | ${200}
    ${'bild.jpg'} | ${200}
  `('returns $status when uploading $file as image', async ({ file, status }) => {
    const fileInBase64 = readFileAsBase64(file)
    const { id } = await addUser()
    const update = { username: 'user1-updated', image: fileInBase64 }

    const res = await updateUser({ id, body: update, options: { auth: { email, password } } })
    expect(res.status).toBe(status)
  })
  it.each`
    file          | language | message
    ${'bild.gif'} | ${'en'}  | ${en.unsupported_image_file}
    ${'bild.gif'} | ${'pl'}  | ${pl.unsupported_image_file}
  `('returns $message when uploading $file as image and language is $language', async ({ file, language, message }) => {
    const fileInBase64 = readFileAsBase64(file)
    const { id } = await addUser()
    const update = { username: 'user1-updated', image: fileInBase64 }

    const res = await updateUser({ id, body: update, options: { auth: { email, password }, language } })
    expect(res.body.validationErrors.image).toBe(message)
  })
})
