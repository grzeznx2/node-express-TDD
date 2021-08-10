const request = require('supertest')
const config = require('config')
const sequelize = require('../src/config/db')
const app = require('../src/app')
const User = require('../src/user/User')
const SMTPServer = require('smtp-server').SMTPServer
const en = require('../locales/en/translation.json')
const pl = require('../locales/pl/translation.json')

let lastMail
let server
let simulateSmtpFailure = false

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody

      stream.on('data', data => {
        mailBody += data.toString()
      })
      stream.on('end', () => {
        if (simulateSmtpFailure) {
          const err = new Error('Invalid mailbox')
          err.responseCode = 553
          return callback(err)
        }
        lastMail = mailBody
        callback()
      })
    },
  })

  await server.listen(config.mail.port, 'localhost')

  await sequelize.sync()
})

beforeEach(async () => {
  simulateSmtpFailure = false
  await User.destroy({ truncate: true })
})

afterAll(async () => {
  await server.close()
})

const validUser = {
  username: 'user1',
  email: 'user1@gmail.com',
  password: 'P4ssword',
}

const postUser = (user = validUser, options = {}) => {
  const { language } = options

  const agent = request(app).post('/api/1.0/users')

  if (language) agent.set('Accept-Language', language)

  return agent.send(user)
}
describe('User registration', () => {
  it('returns 200 OK when signup request is valid', async () => {
    const res = await postUser()
    expect(res.status).toBe(200)
  })
  it('returns success message when signup request is valid', async () => {
    const res = await postUser()
    expect(res.body.message).toBe(en.user_create_success)
  })
  it('saves new user to database', async () => {
    await postUser()
    const userList = await User.findAll()
    expect(userList.length).toBe(1)
  })
  it('saves the username and email to database', async () => {
    await postUser()
    const userList = await User.findAll()
    const newUser = userList[0]
    expect(newUser.username).toBe('user1')
    expect(newUser.email).toBe('user1@gmail.com')
  })
  it('hashes the password', async () => {
    await postUser()
    const userList = await User.findAll()
    const newUser = userList[0]
    expect(newUser.password).not.toBe('user1')
  })
  it('returns 400 when username is null', async () => {
    const res = await postUser({ ...validUser, username: null })
    expect(res.status).toBe(400)
  })
  it.each([
    ['username', 'Username cannot be null'],
    ['email', 'E-mail cannot be null'],
    ['password', 'Password cannot be null'],
  ])('when %s is null %s is received', async (field, expectedMessage) => {
    const user = {
      ...validUser,
      [field]: null,
    }
    const res = await postUser(user)
    expect(res.body.validationErrors[field]).toBe(expectedMessage)
  })

  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${en.username_null}
    ${'username'} | ${'use'}           | ${en.username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${en.username_size}
    ${'email'}    | ${null}            | ${en.email_null}
    ${'email'}    | ${'mail.com'}      | ${en.email_invalid}
    ${'email'}    | ${'user.mail.com'} | ${en.email_invalid}
    ${'email'}    | ${'user@mail'}     | ${en.email_invalid}
    ${'password'} | ${null}            | ${en.password_null}
    ${'password'} | ${'P4ssw'}         | ${en.password_size}
    ${'password'} | ${'a'.repeat(6)}   | ${en.password_pattern}
    ${'password'} | ${'A'.repeat(6)}   | ${en.password_pattern}
    ${'password'} | ${'1'.repeat(6)}   | ${en.password_pattern}
    ${'password'} | ${'Aa'.repeat(3)}  | ${en.password_pattern}
    ${'password'} | ${'A1'.repeat(3)}  | ${en.password_pattern}
    ${'password'} | ${'1a'.repeat(3)}  | ${en.password_pattern}
  `('returns $expectedMessage when $field is $value', async ({ field, expectedMessage, value }) => {
    const user = {
      ...validUser,
      [field]: value,
    }
    const res = await postUser(user)
    expect(res.body.validationErrors[field]).toBe(expectedMessage)
  })
  it('returns email and username errors if email and username are null', async () => {
    const res = await postUser({ ...validUser, email: null, username: null })
    expect(Object.keys(res.body.validationErrors)).toEqual(['username', 'email'])
  })
  it(`returns ${en.email_in_use} when same email is already in use`, async () => {
    await User.create(validUser)
    const res = await postUser()
    expect(res.body.validationErrors.email).toBe(en.email_in_use)
  })
  it('returns errors for both username is null and email already in use', async () => {
    await User.create(validUser)
    const res = await postUser({ ...validUser, username: null })
    expect(Object.keys(res.body.validationErrors)).toEqual(['username', 'email'])
  })
  it('creates user in inactive mode', async () => {
    await postUser()
    const users = await User.findAll()
    const savedUser = users[0]
    expect(savedUser.inactive).toBe(true)
  })
  it('creates user in inactive mode even if req body contains inactive:false', async () => {
    await postUser({ ...validUser, inactive: false })
    const users = await User.findAll()
    const savedUser = users[0]
    expect(savedUser.inactive).toBe(true)
  })
  it('creates an activationToken for user', async () => {
    await postUser()
    const users = await User.findAll()
    const savedUser = users[0]
    expect(savedUser.activationToken).toBeTruthy()
  })
  it('sends an account activation email with activationToken', async () => {
    await postUser()
    const users = await User.findAll()
    const savedUser = users[0]
    expect(lastMail).toContain('user1@gmail.com')
    expect(lastMail).toContain(savedUser.activationToken)
  })
  it('returns 502 Bad Gateway when sending email fails', async () => {
    simulateSmtpFailure = true
    const res = await postUser()
    expect(res.status).toBe(502)
  })
  it('returns Email failure message when sending email fails', async () => {
    simulateSmtpFailure = true
    const res = await postUser()
    expect(res.body.message).toBe(en.email_failure)
  })
  it('does not save user to database when sending email fails', async () => {
    simulateSmtpFailure = true
    await postUser()
    const users = await User.findAll()
    expect(users.length).toBe(0)
  })
  it('returns Validation Failure message in error response body when validation fails', async () => {
    const res = await postUser({ ...validUser, username: null })
    expect(res.body.message).toBe(en.validation_failure)
  })
})

describe('Internalization', () => {
  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${pl.username_null}
    ${'username'} | ${'use'}           | ${pl.username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${pl.username_size}
    ${'email'}    | ${null}            | ${pl.email_null}
    ${'email'}    | ${'mail.com'}      | ${pl.email_invalid}
    ${'email'}    | ${'user.mail.com'} | ${pl.email_invalid}
    ${'email'}    | ${'user@mail'}     | ${pl.email_invalid}
    ${'password'} | ${null}            | ${pl.password_null}
    ${'password'} | ${'P4ssw'}         | ${pl.password_size}
    ${'password'} | ${'a'.repeat(6)}   | ${pl.password_pattern}
    ${'password'} | ${'A'.repeat(6)}   | ${pl.password_pattern}
    ${'password'} | ${'1'.repeat(6)}   | ${pl.password_pattern}
    ${'password'} | ${'Aa'.repeat(3)}  | ${pl.password_pattern}
    ${'password'} | ${'A1'.repeat(3)}  | ${pl.password_pattern}
    ${'password'} | ${'1a'.repeat(3)}  | ${pl.password_pattern}
  `('returns $expectedMessage when $field is $value', async ({ field, expectedMessage, value }) => {
    const user = {
      ...validUser,
      [field]: value,
    }
    const res = await postUser(user, { language: 'pl' })
    expect(res.body.validationErrors[field]).toBe(expectedMessage)
  })
  it('returns email and username errors if email and username are null (when language is set to polish)', async () => {
    const res = await postUser({ ...validUser, email: null, username: null }, { language: 'pl' })
    expect(Object.keys(res.body.validationErrors)).toEqual(['username', 'email'])
  })
  it(`returns ${pl.email_in_use} when same email is already in use (when language is set to polish)`, async () => {
    await User.create(validUser)
    const res = await postUser(validUser, { language: 'pl' })
    expect(res.body.validationErrors.email).toBe(pl.email_in_use)
  })
  it('returns errors for both username is null and email already in use (when language is set to polish)', async () => {
    await User.create(validUser)
    const res = await postUser({ ...validUser, username: null }, { language: 'pl' })
    expect(Object.keys(res.body.validationErrors)).toEqual(['username', 'email'])
  })
  it(`returns success message of ${pl.user_create_success} when signup request is valid (when language is set to polish)`, async () => {
    const res = await postUser(validUser, { language: 'pl' })
    expect(res.body.message).toBe(pl.user_create_success)
  })
  it(`returns ${pl.email_failure} message when sending email fails`, async () => {
    simulateSmtpFailure = true
    const res = await postUser(validUser, { language: 'pl' })
    expect(res.body.message).toBe(pl.email_failure)
  })
  it(`returns ${pl.validation_failure} message in error response body when validation fails`, async () => {
    const res = await postUser({ ...validUser, username: null }, { language: 'pl' })
    expect(res.body.message).toBe(pl.validation_failure)
  })
})

describe('Account Aactivation', () => {
  it('acitvates user when correct token is sent', async () => {
    await postUser()
    let users = await User.findAll()
    const token = users[0].activationToken
    await request(app).post(`/api/1.0/users/token/${token}`).send()
    users = await User.findAll()
    expect(users[0].inactive).toBe(false)
  })
  it('removes activationToken after user is activated', async () => {
    await postUser()
    let users = await User.findAll()
    const token = users[0].activationToken
    await request(app).post(`/api/1.0/users/token/${token}`).send()
    users = await User.findAll()
    expect(users[0].activationToken).toBeFalsy()
  })
  it('doest not activate account when token is wrong', async () => {
    await postUser()
    const token = 'some-invalid-token'
    await request(app).post(`/api/1.0/users/token/${token}`).send()
    users = await User.findAll()
    expect(users[0].inactive).toBe(true)
  })
  it('returns bad request when token is wrong', async () => {
    await postUser()
    const token = 'some-invalid-token'
    const res = await request(app).post(`/api/1.0/users/token/${token}`).send()

    expect(res.status).toBe(400)
  })

  it.each`
    language | tokenStatus  | message
    ${'pl'}  | ${'wrong'}   | ${pl.account_activation_failure}
    ${'en'}  | ${'wrong'}   | ${en.account_activation_failure}
    ${'pl'}  | ${'correct'} | ${pl.account_activation_success}
    ${'en'}  | ${'correct'} | ${en.account_activation_success}
  `('returns $message when wrong token is $tokenStatus and language is $language', async ({ language, tokenStatus, message }) => {
    await postUser()
    let token = 'some-invalid-token'

    if (tokenStatus === 'correct') {
      let users = await User.findAll()
      token = users[0].activationToken
    }

    const res = await request(app).post(`/api/1.0/users/token/${token}`).set('Accept-Language', language).send()

    expect(res.body.message).toBe(message)
  })
})

describe('Error Model', () => {
  it('returns path, timestamp, message and validationErrors in response when validation fails', async () => {
    const res = await postUser({ ...validUser, username: null })
    expect(Object.keys(res.body)).toEqual(['path', 'timestamp', 'message', 'validationErrors'])
  })
  it('returns path, timestamp, message in response when request fails other than validation error', async () => {
    let token = 'some-invalid-token'

    const res = await request(app).post(`/api/1.0/users/token/${token}`).send()
    expect(Object.keys(res.body)).toEqual(['path', 'timestamp', 'message'])
  })
  it('returns path in error body', async () => {
    let token = 'some-invalid-token'

    const res = await request(app).post(`/api/1.0/users/token/${token}`).send()
    expect(res.body.path).toBe(`/api/1.0/users/token/${token}`)
  })
  it('returns timestamp in ms within 5s value in error body', async () => {
    const currentTime = new Date().getTime()
    const fiveSecondsLater = currentTime + 5000

    let token = 'some-invalid-token'

    const res = await request(app).post(`/api/1.0/users/token/${token}`).send()
    expect(res.body.timestamp).toBeGreaterThan(currentTime)
    expect(res.body.timestamp).toBeLessThan(fiveSecondsLater)
  })
})
