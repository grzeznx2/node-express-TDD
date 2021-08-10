const Sequelize = require('sequelize')
const Token = require('../auth/Token')
const sequelize = require('../config/db')

const Model = Sequelize.Model

class User extends Model {}

User.init(
  {
    username: {
      type: Sequelize.STRING,
    },
    email: {
      type: Sequelize.STRING,
      unique: true,
    },
    password: {
      type: Sequelize.STRING,
    },
    activationToken: {
      type: Sequelize.STRING,
    },
    passwordResetToken: {
      type: Sequelize.STRING,
    },
    image: {
      type: Sequelize.STRING,
    },
    inactive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'user',
  }
)

User.hasMany(Token, { onDelete: 'cascade', foreignKey: 'userId' })

module.exports = User
