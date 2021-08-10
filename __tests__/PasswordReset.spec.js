const request = require('supertest')
const bcrypt = require('bcrypt')
const config = require('config')
const sequelize = require('../src/config/db')
const app = require('../src/app')
const User = require('../src/user/User')
const SMTPServer = require('smtp-server').SMTPServer
const en = require('../locales/en/translation.json')
const pl = require('../locales/pl/translation.json')
const Token = require('../src/auth/Token')

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
  return User.destroy({ truncate: { cascade: true } })
})

afterAll(async () => {
  await server.close()
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

const postPasswordReset = (email = 'user1@gmail.com', options = {}) => {
  const agent = request(app).post('/api/1.0/user/password')
  if (options.language) {
    agent.set('Accept-Language', options.language)
  }

  return agent.send({ email })
}

const putPasswordUpdate = (body = {}, options = {}) => {
  const agent = request(app).put('/api/1.0/user/password')

  if (options.language) {
    agent.set('Accept-Language', options.language)
  }

  return agent.send(body)
}

describe('Password Reset', () => {
  it('returns 404 when password reset request is sent for unknown e-mail', async () => {
    const res = await postPasswordReset()
    expect(res.status).toBe(404)
  })

  it.each`
    language | message
    ${'en'}  | ${en.email_not_in_use}
    ${'pl'}  | ${pl.email_not_in_use}
  `('returns error body with $message for unknown e-mail password request and language is $language', async ({ language, message }) => {
    const currentTime = new Date().getTime()
    const res = await postPasswordReset('user1@gmail.com', { language })
    expect(res.body.path).toBe('/api/1.0/user/password')
    expect(res.body.timestamp).toBeGreaterThan(currentTime)
    expect(res.body.message).toBe(message)
  })

  it.each`
    language | message
    ${'en'}  | ${en.email_invalid}
    ${'pl'}  | ${pl.email_invalid}
  `('returns 400 with validation error having $message incorrect e-mail is sent and language is $language', async ({ language, message }) => {
    const res = await postPasswordReset(null, { language })
    expect(res.body.validationErrors.email).toBe(message)
    expect(res.status).toBe(400)
  })

  it('returns 200 when a password reset request is sent for known e-mail', async () => {
    await addUser()
    const res = await postPasswordReset(email)
    expect(res.status).toBe(200)
  })

  it.each`
    language | message
    ${'en'}  | ${en.password_reset_request_success}
    ${'pl'}  | ${pl.password_reset_request_success}
  `('returns success response body with $message for known e-mail for password reset request when language is $language', async ({ language, message }) => {
    await addUser()
    const res = await postPasswordReset(email, { language })
    expect(res.body.message).toBe(message)
  })

  it('creates passwordResetToken when a password reset request is sent for knwon e-mail', async () => {
    await addUser()
    await postPasswordReset(email)
    const userInDb = await User.findOne({ where: { email } })
    expect(userInDb.passwordResetToken).toBeTruthy()
  })
  it('sends password reset email with passwordResetToken', async () => {
    await addUser()
    await postPasswordReset(email)
    const userInDb = await User.findOne({ where: { email } })
    const { passwordResetToken } = userInDb
    expect(lastMail).toContain(email)
    expect(lastMail).toContain(passwordResetToken)
  })
  it('returns 502 Bad Gateway when sending email fails', async () => {
    simulateSmtpFailure = true
    await addUser()
    const res = await postPasswordReset(email)

    expect(res.status).toBe(502)
  })

  it.each`
    language | message
    ${'en'}  | ${en.email_failure}
    ${'pl'}  | ${pl.email_failure}
  `('returns $message after password reset request email failure when language is $language', async ({ language, message }) => {
    simulateSmtpFailure = true
    await addUser()
    const res = await postPasswordReset(email, { language })
    expect(res.body.message).toBe(message)
  })
})

describe('Password Update', () => {
  it('returns 403 when password update request does not have valid passwordResetToken', async () => {
    const res = await putPasswordUpdate({
      password: 'P4ssword',
      passwordResetToken: 'abcd',
    })
    expect(res.status).toBe(403)
  })

  it.each`
    language | message
    ${'en'}  | ${en.unauthorized_password_reset}
    ${'pl'}  | ${pl.unauthorized_password_reset}
  `(
    'returns error body with $message when language is set to $language when trying to update with invalid passwordResetToken',
    async ({ language, message }) => {
      const currentTime = new Date().getTime()
      const res = await putPasswordUpdate(
        {
          password: 'P4ssword',
          passwordResetToken: 'abcd',
        },
        { language }
      )
      expect(res.body.path).toBe('/api/1.0/user/password')
      expect(res.body.timestamp).toBeGreaterThan(currentTime)
      expect(res.body.message).toBe(message)
    }
  )

  it('returns 403 when password update request with invalid password pattern and invalid reset token', async () => {
    const res = await putPasswordUpdate({
      password: 'not-valid',
      passwordResetToken: 'abcd',
    })

    expect(res.status).toBe(403)
  })
  it('returns 400 when password update request with invalid password pattern valid reset token', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await user.save()

    const res = await putPasswordUpdate({
      password: 'abcd',
      passwordResetToken: testToken,
    })

    expect(res.status).toBe(400)
  })

  it.each`
    language | value             | message
    ${'en'}  | ${null}           | ${en.password_null}
    ${'en'}  | ${'P4ssw'}        | ${en.password_size}
    ${'en'}  | ${'a'.repeat(6)}  | ${en.password_pattern}
    ${'en'}  | ${'A'.repeat(6)}  | ${en.password_pattern}
    ${'en'}  | ${'1'.repeat(6)}  | ${en.password_pattern}
    ${'en'}  | ${'Aa'.repeat(3)} | ${en.password_pattern}
    ${'en'}  | ${'A1'.repeat(3)} | ${en.password_pattern}
    ${'en'}  | ${'1a'.repeat(3)} | ${en.password_pattern}
    ${'pl'}  | ${null}           | ${pl.password_null}
    ${'pl'}  | ${'P4ssw'}        | ${pl.password_size}
    ${'pl'}  | ${'a'.repeat(6)}  | ${pl.password_pattern}
    ${'pl'}  | ${'A'.repeat(6)}  | ${pl.password_pattern}
    ${'pl'}  | ${'1'.repeat(6)}  | ${pl.password_pattern}
    ${'pl'}  | ${'Aa'.repeat(3)} | ${pl.password_pattern}
    ${'pl'}  | ${'A1'.repeat(3)} | ${pl.password_pattern}
    ${'pl'}  | ${'1a'.repeat(3)} | ${pl.password_pattern}
  `('returns password validation error $message when lang is $language and value is $value', async ({ language, message, value }) => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await user.save()

    const res = await putPasswordUpdate(
      {
        password: value,
        passwordResetToken: testToken,
      },
      { language }
    )

    expect(res.body.validationErrors.password).toBe(message)
  })

  it('returns 200 when valid password is sent with valid reset token', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await user.save()

    const res = await putPasswordUpdate({ password: 'P4ssword', passwordResetToken: testToken })

    expect(res.status).toBe(200)
  })
  it('updates password in DB when valid password is sent with valid reset token', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await user.save()

    await putPasswordUpdate({ password: 'P4ssword', passwordResetToken: testToken })
    const userInDb = await User.findOne({ where: { email } })
    expect(userInDb.password).not.toEqual(user.password)
  })
  it('clears passwordResetToken in DB when valid password is sent with valid reset token', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await user.save()

    await putPasswordUpdate({ password: 'P4ssword', passwordResetToken: testToken })
    const userInDb = await User.findOne({ where: { email } })
    expect(userInDb.passwordResetToken).toBeFalsy()
  })
  it('activates and clears acttivationToken in DB if the account is inactive after valid password reset', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    user.activationToken = 'activation-token'
    user.inactive = true
    await user.save()

    await putPasswordUpdate({ password: 'P4ssword', passwordResetToken: testToken })
    const userInDb = await User.findOne({ where: { email } })
    expect(userInDb.inactive).toBe(false)
    expect(userInDb.activationToken).toBeFalsy()
  })
  it('clears all tokens of user after valid password reset', async () => {
    const testToken = 'test-token'
    const user = await addUser()
    user.passwordResetToken = testToken
    await Token.create({
      toke: 'token-1',
      userId: user.id,
      lastUsedAt: Date.now(),
    })
    await user.save()

    await putPasswordUpdate({ password: 'P4ssword', passwordResetToken: testToken })
    const tokens = await Token.findAll({ where: { userId: user.id } })
    expect(tokens.length).toBe(0)
  })
})
