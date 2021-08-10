const crypto = require('crypto')

const randomString = length => crypto.randomBytes(length).toString('hex').substr(0, length)

module.exports = { randomString }
