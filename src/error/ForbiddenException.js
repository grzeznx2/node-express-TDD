module.exports = function ForbiddenException(message = 'inactive_authentication_failure') {
  this.status = 403
  this.message = message
}
