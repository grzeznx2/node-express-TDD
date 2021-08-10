const express = require('express')
const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const middleware = require('i18next-http-middleware')

const path = require('path')
const config = require('config')
const userRouter = require('./user/UserRouter')
const authRouter = require('./auth/AuthRouter')
const errorHandler = require('./error/ErrorHandler')
const tokenAuthentication = require('./middleware/tokenAuthentication')
const FileService = require('./file/FileService')

const { uploadDir, profileDir } = config
const profileDirectory = path.join('.', uploadDir, profileDir)
const ONE_YEAR_IN_MILISECONDS = 365 * 24 * 60 * 60 * 1000

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    lng: 'en',
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: './locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      lookupHeader: 'accept-language',
    },
  })

FileService.createFolders()

const app = express()

app.use(middleware.handle(i18next))

app.use(express.json({ limit: '3mb' }))

app.use('/images', express.static(profileDirectory, { maxAge: ONE_YEAR_IN_MILISECONDS }))

app.use(tokenAuthentication)
app.use(userRouter)
app.use(authRouter)

app.use(errorHandler)

module.exports = app
