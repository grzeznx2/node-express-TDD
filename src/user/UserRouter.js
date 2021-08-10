const express = require('express')
const UserService = require('./UserService')
const { check, validationResult } = require('express-validator')
const ValidationException = require('../error/ValidationException')
const ForbiddenException = require('../error/ForbiddenException')
const pagination = require('../middleware/pagination')
const tokenAuthentication = require('../middleware/tokenAuthentication')
const TokenService = require('../auth/TokenService')
const NotFoundException = require('../error/NotFoundException')
const User = require('./User')
const FileService = require('../file/FileService')

const router = express.Router()

const checkUsername = check('username').notEmpty().withMessage('username_null').bail().isLength({ min: 4, max: 32 }).withMessage('username_size')

const checkEmail = check('email')
  .notEmpty()
  .withMessage('email_null')
  .bail()
  .isEmail()
  .withMessage('email_invalid')
  .bail()
  .custom(async email => {
    const user = await UserService.findByEmail(email)
    if (user) {
      throw new Error('email_in_use')
    }
  })

const checkPassword = check('password')
  .notEmpty()
  .withMessage('password_null')
  .bail()
  .isLength({ min: 6 })
  .withMessage('password_size')
  .bail()
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
  .withMessage('password_pattern')

router.post('/api/1.0/users/token/:token', async (req, res, next) => {
  const { token } = req.params
  try {
    await UserService.activate(token)
    res.send({ message: req.t('account_activation_success') })
  } catch (error) {
    next(error)
  }
})

router.post('/api/1.0/users/', checkUsername, checkEmail, checkPassword, async (req, res, next) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return next(new ValidationException(errors.array()))
  }

  try {
    await UserService.save(req.body)
    return res.send({
      message: req.t('user_create_success'),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/api/1.0/users/', pagination, async (req, res) => {
  const { authenticatedUser } = req
  const { page, size } = req.pagination
  const users = await UserService.getUsers(page, size, authenticatedUser)
  res.send(users)
})

router.get('/api/1.0/users/:id', async (req, res, next) => {
  const { id } = req.params
  try {
    const user = await UserService.getUser(id)
    return res.send(user)
  } catch (error) {
    next(error)
  }
})

router.put(
  '/api/1.0/users/:id',
  checkUsername,
  check('image').custom(async imageAsBase64String => {
    if (!imageAsBase64String) return true

    const buffer = Buffer.from(imageAsBase64String, 'base64')

    if (!FileService.isLessThan2Mb(buffer)) throw new Error('profile_image_size')

    const supportedType = await FileService.isSupportedFileType(buffer)
    if (!supportedType) throw new Error('unsupported_image_file')

    return true
  }),
  async (req, res, next) => {
    const { authenticatedUser } = req

    if (!authenticatedUser || authenticatedUser.id != req.params.id) {
      return next(new ForbiddenException('unauthorized_user_update'))
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()))
    }

    const user = await UserService.updateUser(req.params.id, req.body)
    return res.send(user)
  }
)

router.delete('/api/1.0/users/:id', async (req, res, next) => {
  const { authenticatedUser } = req

  if (!authenticatedUser || authenticatedUser.id != req.params.id) {
    return next(new ForbiddenException('unauthorized_user_delete'))
  }

  await UserService.deleteUser(req.params.id)

  res.send()
})

router.post('/api/1.0/user/password', check('email').isEmail().withMessage('email_invalid'), async (req, res, next) => {
  const { email } = req.body
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return next(new ValidationException(errors.array()))
  }

  try {
    await UserService.passwordResetRequest(email)
    res.send({ message: req.t('password_reset_request_success') })
  } catch (error) {
    next(error)
  }
})

const passwordResetTokenValidator = async (req, res, next) => {
  const { passwordResetToken } = req.body
  const user = await UserService.findByPasswordResetToken(passwordResetToken)
  if (!user) {
    next(new ForbiddenException('unauthorized_password_reset'))
  }
  next()
}
router.put('/api/1.0/user/password', passwordResetTokenValidator, checkPassword, async (req, res, next) => {
  const { passwordResetToken, password } = req.body
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return next(new ValidationException(errors.array()))
  }

  await UserService.updatePassword({ passwordResetToken, password })

  res.send()
})

module.exports = router
