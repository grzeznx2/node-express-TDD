module.exports = function ForbiddenException(message) {
  this.status = 404
  this.message = message
}
