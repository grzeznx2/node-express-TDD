const request = require('supertest')

const fs = require('fs')
const path = require('path')
const config = require('config')
const app = require('../src/app')

const { uploadDir, profileDir } = config
const profileDirectory = path.join('.', uploadDir, profileDir)

describe('Profile Images', () => {
  const copyFile = () => {
    const filePath = path.join('.', '__tests__', 'resources', 'bild.png')
    const storedFileName = 'test-file'
    const targetPath = path.join(profileDirectory, storedFileName)
    fs.copyFileSync(filePath, targetPath)
    return storedFileName
  }

  it('returns 404 when file not found', async () => {
    const res = await request(app).get('/images/123456')
    expect(res.status).toBe(404)
  })
  it('returns 200 when file was found', async () => {
    const storedFileName = copyFile()
    const res = await request(app).get(`/images/${storedFileName}`)
    expect(res.status).toBe(200)
  })
  it('returns cache for 1 year in response', async () => {
    const storedFileName = copyFile()
    const res = await request(app).get(`/images/${storedFileName}`)
    const oneYearInSeconds = 365 * 24 * 60 * 60

    expect(res.header['cache-control']).toContain(`max-age=${oneYearInSeconds}`)
  })
})
