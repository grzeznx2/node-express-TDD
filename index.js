const app = require('./src/app')
const sequelize = require('./src/config/db')
const TokenService = require('./src/auth/TokenService')

// sequelize.sync({ force: true }).then(async () => {
sequelize.sync()

TokenService.scheduleCleanup()

app.listen(3000, () => {
  console.log('App listening on PORT 3000...')
})
