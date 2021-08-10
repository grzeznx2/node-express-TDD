const express = require('express')
const bcrypt = require('bcrypt')
const UserService = require('../user/UserService')
const AuthException = require('./AuthException')
const ForbiddenException = require('../error/ForbiddenException')
const TokenService = require('../auth/TokenService')
const { check, validationResult } = require('express-validator')

const router = express.Router()

const checkEmail = check('email').isEmail()

router.post('/api/1.0/auth', checkEmail, async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return next(new AuthException())

  const { email, password } = req.body

  const user = await UserService.findByEmail(email)
  if (!user) return next(new AuthException())

  const match = await bcrypt.compare(password, user.password)

  if (!match) return next(new AuthException())

  if (user.inactive) return next(new ForbiddenException())

  const token = await TokenService.createToken(user)

  res.send({ id: user.id, username: user.username, token, image: user.image })
})

router.post('/api/1.0/logout', async (req, res) => {
  const { authorization } = req.headers
  if (authorization) {
    const token = authorization.substring(7)
    await TokenService.deleteToken(token)
  }
  res.send()
})

module.exports = router
