module.exports = function AuthException() {
  this.status = 401
  this.message = 'authentication_failure'
}
