const bcrypt = require('bcrypt')
const crypto = require('crypto')
const Sequelize = require('sequelize')
const EmailService = require('../email/EmailService')
const EmailException = require('../email/EmailException')
const sequelize = require('../config/db')

const User = require('./User')
const TokenService = require('../auth/TokenService')
const FileService = require('../file/FileService')
const InvalidTokenEexception = require('./InvalidTokenEexception')
const NotFoundException = require('../error/NotFoundException')
const { randomString } = require('../shared/generator')

const save = async body => {
  const { username, email, password } = body
  const hash = await bcrypt.hash(password, 10)
  const user = { username, email, password: hash, activationToken: randomString(16) }

  const transaction = await sequelize.transaction()
  try {
    await User.create(user, { transaction })
    await EmailService.sendActivationToken(email, user.activationToken)
    await transaction.commit()
  } catch (error) {
    await transaction.rollback()
    throw new EmailException()
  }
}

const findByEmail = async email => {
  const user = await User.findOne({ where: { email } })
  return user
}

const activate = async token => {
  const user = await User.findOne({ where: { activationToken: token } })
  if (!user) throw new InvalidTokenEexception()
  user.inactive = false
  user.activationToken = null
  await user.save()
}

const getUsers = async (page, size, authenticatedUser) => {
  const id = authenticatedUser ? authenticatedUser.id : 0
  const usersWithCount = await User.findAndCountAll({
    limit: size,
    where: { inactive: false, id: { [Sequelize.Op.not]: id } },
    attributes: ['id', 'username', 'email', 'image'],
    offset: page * size,
  })

  return {
    content: usersWithCount.rows,
    page,
    size,
    totalPages: Math.ceil(usersWithCount.count / size),
  }
}

const getUser = async id => {
  const user = await User.findOne({ where: { id, inactive: false }, attributes: ['id', 'username', 'email', 'image'] })
  if (!user) throw new NotFoundException('user_not_found')
  return user
}

const updateUser = async (id, body) => {
  const user = await User.findOne({ where: { id } })
  user.username = body.username

  if (body.image) {
    if (user.image) {
      await FileService.deleteProfileImage(user.image)
    }

    user.image = await FileService.saveProfileImage(body.image)
  }

  await user.save()
  return { id, username: user.username, email: user.email, image: user.image }
}

const deleteUser = async id => {
  await User.destroy({ where: { id } })
}

const passwordResetRequest = async email => {
  const user = await findByEmail(email)
  if (!user) {
    throw new NotFoundException('email_not_in_use')
  }
  user.passwordResetToken = randomString(16)
  await user.save()
  try {
    await EmailService.sendPasswordReset(email, user.passwordResetToken)
  } catch (error) {
    throw new EmailException()
  }
}

const findByPasswordResetToken = passwordResetToken => {
  return User.findOne({ where: { passwordResetToken } })
}

const updatePassword = async ({ passwordResetToken, password }) => {
  const user = await findByPasswordResetToken(passwordResetToken)
  const hash = await bcrypt.hash(password, 10)
  user.password = hash
  user.passwordResetToken = null
  user.inactive = false
  user.activationToken = null
  await user.save()
  await TokenService.clearTokens(user.id)
}

module.exports = { save, findByEmail, activate, getUsers, getUser, updateUser, deleteUser, passwordResetRequest, updatePassword, findByPasswordResetToken }
