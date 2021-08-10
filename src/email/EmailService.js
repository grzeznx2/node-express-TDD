const transporter = require('../config/emailTransporter')

const sendActivationToken = async (email, token) => {
  const info = await transporter.sendMail({
    from: 'My App',
    to: email,
    subject: 'Account Activation',
    html: `Token is ${token}`,
  })
}
const sendPasswordReset = async (email, token) => {
  const info = await transporter.sendMail({
    from: 'My App',
    to: email,
    subject: 'Pasword Reset',
    html: `Rest Token is ${token}`,
  })
}

module.exports = { sendActivationToken, sendPasswordReset }
