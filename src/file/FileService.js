const fs = require('fs')
const path = require('path')
const config = require('config')
const FileType = require('file-type')
const { randomString } = require('../shared/generator')
const { uploadDir, profileDir } = config
const profileFolder = path.join('.', uploadDir, profileDir)

const createFolders = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir)
  }

  if (!fs.existsSync(profileFolder)) {
    fs.mkdirSync(profileFolder)
  }
}

const saveProfileImage = async base64File => {
  const fileName = randomString(32)
  const filePath = path.join(profileFolder, fileName)
  await fs.promises.writeFile(filePath, base64File, 'base64')

  return fileName
}

const deleteProfileImage = async fileName => {
  const filePath = path.join(profileFolder, fileName)
  await fs.promises.unlink(filePath)
}

const isLessThan2Mb = buffer => buffer.length < 2 * 1024 * 1024

const isSupportedFileType = async buffer => {
  const type = await FileType.fromBuffer(buffer)
  if (!type) return false
  if (type.mime === 'image/png' || type.mime === 'image/jpeg') return true
  return false
}

module.exports = { createFolders, saveProfileImage, deleteProfileImage, isLessThan2Mb, isSupportedFileType }
