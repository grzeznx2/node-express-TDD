const path = require('path')
const fs = require('fs')
const config = require('config')

const { uploadDir, profileDir } = config
const profileDirectory = path.join('.', uploadDir, profileDir)

const files = fs.readdirSync(profileDirectory)
for (let file of files) {
  fs.unlinkSync(path.join(profileDirectory, file))
}
